// 程序化生成文物粒子点云：每个函数返回 { pos, nrm, col, key }，长度均为 n
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
export const hex = (h) => {
  const v = parseInt(h.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const fract = (x) => x - Math.floor(x);
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
// 平滑伪噪声 0..1
const n3 = (x, y, z) =>
  0.5 + 0.25 * Math.sin(x * 1.7 + Math.sin(y * 2.3) * 1.2 + z * 1.3) + 0.25 * Math.sin(y * 1.9 + Math.sin(z * 1.1 + x) * 1.5 - x * 0.7);

// ---------- 表面采样器 ----------
class Surf {
  constructor(rnd) { this.rnd = rnd; this.parts = []; }
  add(area, fn) { if (area > 1e-6) this.parts.push({ area, fn }); }
  // 平面四边形：o + U*u + V*v，colorFn(uLen, vLen, rnd) => [r,g,b,disp]
  quad(o, U, V, colorFn, areaMul = 1) {
    const lu = len(U), lv = len(V);
    const N = norm([U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]]);
    this.add(lu * lv * areaMul, (r) => {
      const u = r(), v = r();
      const c = colorFn(u * lu, v * lv, r);
      const p = add(add(o, scl(U, u)), scl(V, v));
      return { p: add(p, scl(N, c[3] || 0)), n: N, c };
    });
  }
  // 旋转体：prof = [[r,y],...] 自下而上，colorFn(theta, y, r, rnd)
  lathe(prof, colorFn, cx = 0, cz = 0, areaMul = 1) {
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
      const dr = r1 - r0, dy = y1 - y0, sl = Math.hypot(dr, dy);
      if (sl < 1e-6) continue;
      const nr = dy / sl, ny = -dr / sl;
      this.add(Math.PI * (r0 + r1) * sl * areaMul, (r) => {
        const t = r(), rad = r0 + dr * t, y = y0 + dy * t, th = r() * TAU;
        const c = colorFn(th, y, rad, r);
        const d = c[3] || 0, ct = Math.cos(th), st = Math.sin(th);
        return { p: [cx + (rad + nr * d) * ct, y + ny * d, cz + (rad + nr * d) * st], n: [nr * ct, ny, nr * st], c };
      });
    }
  }
  // 有向长方体：c 中心，hx/hy/hz 半轴向量
  obox(c, hx, hy, hz, colorFn, areaMul = 1) {
    const faces = [[hx, hy, hz], [scl(hx, -1), hz, hy], [hy, hz, hx], [scl(hy, -1), hx, hz], [hz, hx, hy], [scl(hz, -1), hy, hx]];
    for (const [a, b, d] of faces) {
      const o = add(add(add(c, a), scl(b, -1)), scl(d, -1));
      this.quad(o, scl(b, 2), scl(d, 2), colorFn, areaMul);
    }
  }
  ellipsoid(c, rx, ry, rz, colorFn, areaMul = 1) {
    const p = 1.6075;
    const area = 4 * Math.PI * Math.pow((Math.pow(rx * ry, p) + Math.pow(rx * rz, p) + Math.pow(ry * rz, p)) / 3, 1 / p);
    this.add(area * areaMul, (r) => {
      const z = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - z * z);
      const d = [s * Math.cos(a), z, s * Math.sin(a)];
      const col = colorFn(d, r);
      return { p: [c[0] + d[0] * rx, c[1] + d[1] * ry, c[2] + d[2] * rz], n: norm([d[0] / rx, d[1] / ry, d[2] / rz]), c: col };
    });
  }
  sample(n) {
    const total = this.parts.reduce((s, p) => s + p.area, 0);
    const cum = []; let acc = 0;
    for (const p of this.parts) { acc += p.area / total; cum.push(acc); }
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const r = this.rnd;
    for (let i = 0; i < n; i++) {
      const x = r(); let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; }
      const o = this.parts[lo].fn(r);
      pos.set(o.p, i * 3); nrm.set(o.n, i * 3); col.set([o.c[0], o.c[1], o.c[2]], i * 3);
    }
    return { pos, nrm, col };
  }
}

// 在物体周围撒一层稀薄的星尘
function withHalo(shape, n, haloFrac, rnd, radius, tint, gain = 1) {
  const nh = Math.floor(n * haloFrac);
  const main = shape(n - nh);
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  pos.set(main.pos); nrm.set(main.nrm); for (let i = 0; i < main.col.length; i++) col[i] = main.col[i] * gain;
  for (let i = n - nh; i < n; i++) {
    const z = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - z * z), rr = radius * (0.55 + Math.pow(rnd(), 0.7) * 0.9);
    pos.set([s * Math.cos(a) * rr * 0.8, z * rr, s * Math.sin(a) * rr * 0.8], i * 3);
    col.set(mul(tint, 0.12 + rnd() * 0.25), i * 3);
  }
  return { pos, nrm, col };
}

// 用画布把文字变成可采样的遮罩
function textMask(lines, w, h, font) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff';
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  const cols = lines.length;
  lines.forEach((line, ci) => {
    const chars = [...line];
    chars.forEach((ch, k) => g.fillText(ch, (w * (ci + 0.5)) / cols, (h * (k + 0.5)) / chars.length));
  });
  const d = g.getImageData(0, 0, w, h).data;
  return (u, v) => { // u,v in 0..1, v=0 顶部
    const x = clamp(Math.floor(u * w), 0, w - 1), y = clamp(Math.floor(v * h), 0, h - 1);
    return d[(y * w + x) * 4] / 255;
  };
}

// ================= 01 良渚玉琮 =================
export function cong(n, rnd) {
  const jade = hex('#8cc4a0'), bone = hex('#dfe8d2'), qin = hex('#b08d58'), deep = hex('#4f8a6c');
  const jadeCol = (x, y, z, r, k) => {
    const nz = n3(x * 2.2, y * 1.6, z * 2.2);
    let c = mix(deep, jade, clamp(nz * 1.3 - 0.1));
    if (n3(x * 5 + 3, y * 4, z * 5) > 0.78) c = mix(c, bone, 0.7);
    if (n3(x * 1.3 - 4, y * 2.5 + 1, z * 1.3) < 0.22) c = mix(c, qin, 0.6);
    return mul(c, k * (0.85 + r() * 0.3));
  };
  const s = new Surf(rnd);
  const H = 1.45, tiers = 4, gap = 0.07, groove = 0.07;
  const half = (y) => 0.76 + (y + H) / (2 * H) * 0.07; // 上宽下窄
  const tierH = (2 * H) / tiers;
  // 四个外立面，按高度切片以跟随收分
  const slices = 40;
  for (let f = 0; f < 4; f++) {
    const ang = (f * Math.PI) / 2;
    for (let k = 0; k < slices; k++) {
      const ya = -H + (2 * H * k) / slices, yb = ya + (2 * H) / slices;
      const hw = half((ya + yb) / 2);
      const R = [Math.cos(ang), 0, -Math.sin(ang)], F = [Math.sin(ang), 0, Math.cos(ang)];
      const o = add(add(scl(F, hw), scl(R, -hw)), [0, ya, 0]);
      s.quad(o, scl(R, 2 * hw), [0, yb - ya, 0], (u, v, r) => {
        const y = ya + v, xl = u - hw; // xl：距面中线
        const c = Math.abs(Math.abs(xl) - hw); // 距角
        const tv = (y + H) / tierH, ti = Math.floor(tv), lv = tv - ti; // 节内 0..1
        const px = o[0] + R[0] * u, pz = o[2] + R[2] * u;
        let k = c < 0.55 ? 0.5 + 0.2 * Math.sin(lv * 90) : 0.22, d = c < 0.55 ? 0.015 : 0;
        if (lv < gap / tierH || lv > 1 - gap / tierH) { k = 0.22; d = -0.03; } // 节间凹槽
        else if (Math.abs(xl) < groove) { k = 0.25; d = -0.035; } // 直槽
        else {
          // 神人兽面纹（以角为中轴，两面合成一张脸）
          const ex = c - 0.27, ey = lv - 0.46, er = Math.hypot(ex, ey * tierH);
          if (er < 0.04) { k = 2.0; d = 0.02; }
          else if (er > 0.065 && er < 0.105) { k = 1.8; d = 0.025; }
          else if (er < 0.14) { k = 0.12; }
          if (lv > 0.66 && lv < 0.93 && c < 0.55) { // 羽冠弦纹
            const b = fract((lv - 0.66) / 0.27 * 3);
            if (b < 0.32) { k = 1.6; d = 0.03; } else k = 0.45 + 0.25 * Math.sin(c * 160);
          }
          if (Math.abs(lv - 0.2) < 0.045 && c < 0.2) { k = 1.8; d = 0.025; } // 口鼻
          if (c < 0.02) k *= 1.3;
        }
        return [...jadeCol(px, y, pz, r, k), d];
      });
    }
  }
  // 顶/底肩面（方环）
  for (const [yy, sgn] of [[H, 1], [-H, -1]]) {
    const hw = half(yy);
    s.quad([-hw, yy, sgn > 0 ? hw : -hw], [2 * hw, 0, 0], [0, 0, sgn > 0 ? -2 * hw : 2 * hw], (u, v, r) => {
      const x = u - hw, z = v - hw;
      if (Math.hypot(x, z) < 0.6) return [0, 0, 0, -0.5]; // 被射口挡住
      return [...jadeCol(x, yy, z, r, 0.5), 0];
    }, 0.6);
  }
  // 射口与孔壁
  const jf = (k) => (th, y, rad, r) => [...jadeCol(Math.cos(th) * rad, y, Math.sin(th) * rad, r, k), 0];
  s.lathe([[0.6, H], [0.6, H + 0.2], [0.42, H + 0.2]], jf(0.75));
  s.lathe([[0.42, -H - 0.2], [0.57, -H - 0.2], [0.57, -H]], jf(0.6));
  s.lathe([[0.42, H + 0.2], [0.42, -H - 0.2]], jf(0.28), 0, 0, 0.35);
  return withHalo((m) => s.sample(m), n, 0.08, rnd, 2.4, jade, 0.85);
}

// ================= 02 后母戊鼎 =================
export function ding(n, rnd) {
  const teal = hex('#6fae95'), gold = hex('#dcbc72'), dark = hex('#3f6656');
  const bz = (x, y, z, r, k) => {
    const t = n3(x * 1.4, y * 1.4, z * 1.4);
    return mul(mix(mix(dark, teal, clamp(t * 1.6)), gold, clamp((t - 0.55) * 2.2)), k * (0.85 + r() * 0.3));
  };
  const s = new Surf(rnd);
  const W = 1.3, D = 0.9, y0 = -0.4, y1 = 1.05, H = y1 - y0;
  const faceFn = (W2, o, U) => (u, v, r) => {
    const px = o[0] + U[0] * (u / W2), pz = o[2] + U[2] * (u / W2), y = y0 + v;
    const b = 0.3, bt = 0.36;
    const inner = u > b && u < W2 - b && v > b && v < H - bt;
    let k = 0.2, d = 0;
    if (!inner) {
      const cs = 0.1, fu = fract(u / cs) - 0.5, fv = fract(v / cs) - 0.5;
      const ring = Math.max(Math.abs(fu), Math.abs(fv));
      if (fract(ring * 4) < 0.5) { k = 1.25; d = 0.018; } else k = 0.4;
      // 饕餮双目
      const ex = Math.abs(u - W2 / 2) - 0.3, ey = v - (H - bt / 2);
      const er = Math.hypot(ex / 1.4, ey);
      if (er < 0.11) { k = er < 0.045 ? 1.6 : er > 0.075 ? 1.35 : 0.3; d = 0.04; }
      if (Math.abs(u - W2 / 2) < 0.05 && v > H - bt) { k = 1.2; d = 0.05; }
    } else {
      const edge = Math.min(u - b, W2 - b - u, v - b, H - bt - v);
      if (edge < 0.025) { k = 1.05; d = 0.01; }
    }
    if (v > H - 0.05) { k = 1.2; d = 0.03; } // 口沿
    return [...bz(px, y, pz, r, k), d];
  };
  const faces = [
    [[-W, y0, D], [2 * W, 0, 0]], [[W, y0, -D], [-2 * W, 0, 0]],
    [[W, y0, D], [0, 0, -2 * D]], [[-W, y0, -D], [0, 0, 2 * D]],
  ];
  for (const [o, U] of faces) { const W2 = len(U); s.quad(o, U, [0, H, 0], faceFn(W2, o, U)); }
  // 口沿顶面
  const t = 0.09, rimF = (u, v, r) => [...bz(u, y1, v, r, 1.0), 0];
  s.quad([-W, y1, D], [2 * W, 0, 0], [0, 0, -t], rimF);
  s.quad([-W, y1, -D + t], [2 * W, 0, 0], [0, 0, -t], rimF);
  s.quad([-W, y1, D - t], [t, 0, 0], [0, 0, -2 * D + 2 * t], rimF);
  s.quad([W - t, y1, D - t], [t, 0, 0], [0, 0, -2 * D + 2 * t], rimF);
  // 内壁与底
  const inF = (u, v, r) => [...bz(u, v, 0, r, 0.28), 0];
  s.quad([-W + t, y1, -D + t], [2 * W - 2 * t, 0, 0], [0, -H + 0.2, 0], inF, 0.4);
  s.quad([W - t, y1, D - t], [-2 * W + 2 * t, 0, 0], [0, -H + 0.2, 0], inF, 0.4);
  s.quad([-W, y0, -D], [2 * W, 0, 0], [0, 0, 2 * D], inF, 0.5);
  // 扉棱：四角 + 各面中部
  const finF = (u, v, r) => { const k = fract(v * 9) < 0.62 ? 1.25 : 0.55; return [...bz(u, v, 0, r, k), 0]; };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const dg = norm([sx, 0, sz]), pp = norm([-sz, 0, sx]);
    s.obox([sx * W + dg[0] * 0.07, y0 + H / 2, sz * D + dg[2] * 0.07], scl(dg, 0.07), [0, H / 2, 0], scl(pp, 0.018), finF);
  }
  for (const [c, nv, pv] of [[[0, 0, D], [0, 0, 1], [1, 0, 0]], [[0, 0, -D], [0, 0, -1], [1, 0, 0]], [[W, 0, 0], [1, 0, 0], [0, 0, 1]], [[-W, 0, 0], [-1, 0, 0], [0, 0, 1]]]) {
    s.obox(add(add(c, scl(nv, 0.06)), [0, y1 - 0.2, 0]), scl(nv, 0.06), [0, 0.17, 0], scl(pv, 0.018), finF);
    s.obox(add(add(c, scl(nv, 0.05)), [0, y0 + 0.16, 0]), scl(nv, 0.05), [0, 0.13, 0], scl(pv, 0.018), finF);
  }
  // 四足
  const leg = [[0.2, -1.42], [0.23, -1.37], [0.215, -1.3], [0.18, -1.08], [0.185, -0.88], [0.24, -0.7], [0.265, -0.52], [0.24, -0.4]];
  const legF = (lx, lz) => (th, y, rad, r) => {
    let k = 0.55, d = 0;
    if (y > -0.9) {
      const rib = Math.pow(Math.abs(Math.cos(2 * th)), 14);
      k = 0.6 + 0.8 * rib; d = rib * 0.05;
      const ey = y + 0.66, ea = Math.abs(fract((th / TAU) * 4 + 0.125) - 0.5) - 0.2;
      const er = Math.hypot(ea * 1.3, ey);
      if (er < 0.07) { k = er < 0.03 ? 1.5 : 1.2; d = 0.03; }
    }
    if (y < -1.32) k = 0.9;
    return [...bz(lx + Math.cos(th) * rad, y, lz + Math.sin(th) * rad, r, k), d];
  };
  for (const lx of [-0.95, 0.95]) for (const lz of [-0.52, 0.52]) {
    s.lathe(leg, legF(lx, lz), lx, lz);
    s.lathe([[0, -1.42], [0.2, -1.42]], legF(lx, lz), lx, lz, 0.5);
  }
  // 立耳（虎噬人首）
  const earF = (u, v, r) => { const k = (u < 0.03 || v < 0.03) ? 1.2 : 0.75; return [...bz(u, v, 0, r, k), 0]; };
  const eh = 0.72;
  for (const ex of [-1.2, 1.2]) {
    for (const ez of [-0.42, 0.42]) s.obox([ex, y1 + eh / 2, ez], [0.045, 0, 0], [0, eh / 2, 0], [0, 0, 0.075], earF);
    s.obox([ex, y1 + eh - 0.07, 0], [0.045, 0, 0], [0, 0.07, 0], [0, 0, 0.5], earF);
    const tig = (dd, r) => [...bz(dd[0], dd[1], dd[2], r, 1.05 + 0.4 * Math.pow(Math.abs(dd[1]), 3)), 0];
    for (const ez of [-1, 1]) {
      s.ellipsoid([ex, y1 + 0.34, ez * 0.56], 0.05, 0.26, 0.06, tig);
      s.ellipsoid([ex, y1 + eh + 0.02, ez * 0.3], 0.055, 0.07, 0.15, tig);
    }
    s.ellipsoid([ex, y1 + eh + 0.07, 0], 0.06, 0.1, 0.085, tig);
  }
  const res = withHalo((m) => s.sample(m), n, 0.07, rnd, 2.8, teal, 0.85);
  for (let i = 1; i < res.pos.length; i += 3) res.pos[i] -= 0.2;
  return res;
}

// ================= 03 越王勾践剑 =================
export function sword(n, rnd) {
  const gold = hex('#d2b26a'), dark = hex('#6e5a34'), pale = hex('#efe0b0'), cyan = hex('#3fc4cc'), blue = hex('#4a78e6');
  const s = new Surf(rnd);
  const yb = -1.2, yt = 2.25, L = yt - yb;
  const hw = (t) => {
    let w = 0.172 - 0.03 * Math.sin(Math.PI * Math.min(t / 0.8, 1));
    if (t > 0.86) w *= Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.86) / 0.14, 2)));
    return w;
  };
  const inscr = textMask(['越王鳩淺', '自乍用劍'], 96, 256, '56px STKaiti, KaiTi, serif');
  // 剑身：按长度分片
  const segs = 60;
  for (let k = 0; k < segs; k++) {
    const ta = k / segs, tb = (k + 1) / segs, w = (hw(ta) + hw(tb)) / 2;
    for (const side of [1, -1]) {
      s.add(2 * w * (tb - ta) * L, (r) => {
        const t = ta + (tb - ta) * r(), u = r() * 2 - 1, wt = hw(t), y = yb + t * L, x = u * wt;
        const th = 0.034 * Math.min(1, (1 - t) * 6 + 0.25);
        const z = side * (th * (1 - Math.abs(u)) + 0.003);
        // 菱形暗格纹
        const a = y * 5.5 + x * 11, b = y * 5.5 - x * 11;
        const dl = Math.min(Math.abs(fract(a) - 0.5), Math.abs(fract(b) - 0.5));
        const par = (Math.floor(a) + Math.floor(b)) & 1;
        let c = par ? mix(dark, gold, 0.55) : mix(dark, gold, 0.25), k2 = 0.8;
        if (dl < 0.07) { c = gold; k2 = 1.15; }
        if (Math.abs(u) < 0.035) { c = pale; k2 = 1.3; } // 中脊
        if (Math.abs(u) > 0.93) { c = pale; k2 = 1.25; } // 刃
        if (side > 0 && y > -1.12 && y < -0.2 && Math.abs(x) < 0.13) { // 鸟篆铭文
          const m = inscr((x + 0.13) / 0.26, (-0.2 - y) / 0.92);
          if (m > 0.4) { c = pale; k2 = 1.6; } else if (m <= 0.4) { c = mix(dark, gold, 0.1); k2 = 0.6; }
        }
        return { p: [x, y, z], n: norm([Math.sign(u) * side * 0.0 + u * 0.3, 0, side]), c: mul(c, k2 * (0.85 + r() * 0.3)) };
      });
    }
  }
  // 剑格：蓝琉璃 + 绿松石
  const guardF = (u, v, r) => {
    const cell = (Math.floor(u / 0.065) + Math.floor(v / 0.04)) % 3;
    let c = gold, k = 1.0;
    if (v > 0.025 && v < 0.105) c = cell === 0 ? blue : cell === 1 ? cyan : mul(gold, 0.8), k = cell < 2 ? 1.5 : 0.9;
    return [...mul(c, k * (0.85 + r() * 0.3)), 0];
  };
  s.obox([0, yb - 0.065, 0], [0.24, 0, 0], [0, 0.065, 0], [0, 0, 0.09], guardF);
  // 剑茎、双箍、剑首同心圆
  const gripF = (th, y, rad, r) => {
    const sp = fract(th / TAU * 3 + y * 9) < 0.5;
    return [...mul(mix(dark, gold, sp ? 0.5 : 0.2), 0.8 * (0.85 + r() * 0.3)), 0];
  };
  s.lathe([[0.058, -2.18], [0.058, yb - 0.13]], gripF);
  for (const yy of [-1.88, -1.58]) s.lathe([[0.058, yy - 0.03], [0.082, yy - 0.02], [0.082, yy + 0.02], [0.058, yy + 0.03]], (th, y, rad, r) => [...mul(gold, 1.2 * (0.85 + r() * 0.3)), 0]);
  const pomF = (th, y, rad, r) => { const ring = fract(rad / 0.2 * 11) < 0.45; return [...mul(ring ? pale : dark, ring ? 1.4 : 0.6), 0]; };
  s.lathe([[0, -2.24], [0.2, -2.24], [0.2, -2.18], [0.058, -2.18]], pomF);
  return withHalo((m) => s.sample(m), n, 0.3, rnd, 2.6, gold, 0.3);
}

// ================= 04 元青花梅瓶 =================
function catmull(pts, per) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
export function vase(n, rnd) {
  const white = hex('#eef3f5'), blue = hex('#3f70e8'), deep = hex('#2a4fb8'), grey = hex('#b9c6d4');
  const s = new Surf(rnd);
  const prof = catmull([[0.5, -1.72], [0.52, -1.62], [0.49, -1.45], [0.6, -1.0], [0.77, -0.4], [0.92, 0.2], [1.0, 0.68], [0.97, 0.98], [0.82, 1.2], [0.55, 1.38], [0.3, 1.47], [0.2, 1.52], [0.19, 1.62], [0.25, 1.66], [0.25, 1.72], [0.17, 1.74]], 8);
  const dragonY = (th) => 0.05 + 0.33 * Math.sin(th * 2 + 0.6) + 0.08 * Math.sin(th * 5);
  const pat = (th, y) => {
    // 返回 0 白地，1 青花，0.6 淡描
    const u = th / TAU;
    for (const yl of [0.84, 0.8, -0.72, -0.76, -1.28, -1.32]) if (Math.abs(y - yl) < 0.012) return 1;
    if (y > 0.84 && y < 1.45) { // 云肩
      const lob = Math.abs(fract(u * 4) - 0.5) * 2; // 0 中心 1 边
      const edge = 0.9 + 0.38 * Math.pow(1 - lob, 0.7) + 0.05 * Math.sin(lob * 18);
      if (Math.abs(y - edge) < 0.02) return 1;
      if (y > edge) return fract(u * 60 + y * 8) < 0.35 ? 0.9 : 0.35;
      if (y < edge && Math.hypot((fract(u * 8) - 0.5) * 2.2, (y - 0.93) * 5) < 0.18) return 1; // 垂珠
      return 0;
    }
    if (y > 1.45) return y > 1.6 && y < 1.64 ? 1 : 0;
    if (y > -0.72 && y < 0.8) { // 云龙
      const dy = y - dragonY(th), dw = 0.1 + 0.03 * Math.sin(th * 3);
      if (Math.abs(dy) < dw) {
        const sc = fract(u * 70 + dy * 6);
        return Math.abs(dy) > dw - 0.02 ? 1 : sc < 0.55 ? 0.95 : 0.45;
      }
      if (dy > dw && dy < dw + 0.08 && fract(u * 30) < 0.4) return 0.9; // 背鳍
      for (let k = 0; k < 7; k++) { // 如意云
        const cu = fract(k * 0.137 + 0.05), cy = k % 2 ? 0.52 : -0.42;
        const du = (fract(u - cu + 0.5) - 0.5) * 6.2, dv = y - cy - 0.06 * Math.sin(k);
        const rr = Math.hypot(du, dv * 1.3);
        if (rr < 0.17 && Math.abs(fract(rr * 18 + Math.atan2(dv, du) / TAU) - 0.5) < 0.18) return 0.9;
      }
      return 0;
    }
    if (y > -1.28 && y < -0.76) { // 变形莲瓣
      const pu = (fract(u * 8) - 0.5) * 2, top = -1.28 + 0.46 * Math.pow(Math.cos(pu * Math.PI / 2), 0.7);
      if (Math.abs(y - top) < 0.018 || Math.abs(y - (top - 0.07)) < 0.012) return 1;
      if (y < top - 0.1 && Math.abs(pu) < 0.12) return 0.8;
      return 0;
    }
    return 0;
  };
  s.lathe(prof, (th, y, rad, r) => {
    const p = pat(th, y);
    const c = p > 0 ? mul(mix(deep, blue, r()), 1.1 + 0.9 * p) : mul(mix(white, grey, r() * 0.35), 0.42);
    return [...mul(c, 0.9 + r() * 0.2), 0];
  });
  s.lathe([[0.17, 1.74], [0.14, 1.6]], () => [...mul(grey, 0.3), 0], 0, 0, 0.4);
  s.lathe([[0, -1.72], [0.5, -1.72]], () => [...mul(grey, 0.35), 0], 0, 0, 0.4);
  return withHalo((m) => s.sample(m), n, 0.08, rnd, 2.5, grey, 0.75);
}

// ================= 过场状态 =================
export function haze(n, rnd, tint = hex('#b5a57a')) {
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = (rnd() - 0.5) * 18, y = (rnd() - 0.5) * 11 * Math.pow(rnd(), 0.4), z = (rnd() - 0.5) * 8 - 1;
    pos.set([x, y, z], i * 3);
    const k = 0.05 + Math.pow(rnd(), 3) * 0.35;
    col.set(mul(mix(tint, hex('#6fa58f'), rnd()), k), i * 3);
  }
  return { pos, nrm, col };
}

// 物体消散后的烟：基于物体的世界坐标
export function smoke(src, n, rnd, rot, off, drift = [0, 1, 0]) {
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const c = Math.cos(rot), sn = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const x = src.pos[i * 3], y = src.pos[i * 3 + 1], z = src.pos[i * 3 + 2];
    const wx = c * x + sn * z + off[0], wz = -sn * x + c * z + off[2], wy = y + off[1];
    const up = Math.pow(rnd(), 1.5);
    pos.set([
      wx * 1.15 + (rnd() - 0.5) * 2.6 + drift[0] * up * 3,
      wy * 1.1 + 0.6 + up * 2.8 * drift[1] + (rnd() - 0.5) * 1.2,
      wz + (rnd() - 0.5) * 2.5 + drift[2],
    ], i * 3);
    const k = 0.18 + rnd() * 0.18;
    col.set([src.col[i * 3] * k + 0.02, src.col[i * 3 + 1] * k + 0.02, src.col[i * 3 + 2] * k + 0.02], i * 3);
  }
  return { pos, nrm, col };
}

// 四器并列（缩小版）
export function lineup(n, rnd, gens) {
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), group = new Float32Array(n);
  const per = Math.floor(n / gens.length);
  gens.forEach((g, gi) => {
    const cnt = gi === gens.length - 1 ? n - per * gi : per;
    const sh = g(cnt, rnd);
    const ox = (gi - (gens.length - 1) / 2) * 2.35, a = 0.55, c = Math.cos(a), s = Math.sin(a), k = 0.36;
    for (let i = 0; i < cnt; i++) {
      const j = per * gi + i;
      let x = sh.pos[i * 3], y = sh.pos[i * 3 + 1], z = sh.pos[i * 3 + 2];
      pos.set([(c * x + s * z) * k + ox, y * k + 0.15, (-s * x + c * z) * k], j * 3);
      const nx = sh.nrm[i * 3], nz = sh.nrm[i * 3 + 2];
      nrm.set([c * nx + s * nz, sh.nrm[i * 3 + 1], -s * nx + c * nz], j * 3);
      col.set([sh.col[i * 3] * 1.1, sh.col[i * 3 + 1] * 1.1, sh.col[i * 3 + 2] * 1.1], j * 3);
      group[j] = gi;
    }
  });
  return { pos, nrm, col, group };
}

// 光河：以哨兵值 1000 编码，由着色器按时间计算流动位置
export function river(n, rnd) {
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const g = hex('#f0dca0'), t = hex('#7fcab4');
  for (let i = 0; i < n; i++) {
    const gs = (rnd() + rnd() + rnd() - 1.5) / 1.5;
    pos.set([1000 + rnd(), gs, (rnd() + rnd() - 1)], i * 3);
    col.set(mul(mix(g, t, clamp(Math.abs(gs) * 1.3 + (rnd() - 0.5) * 0.3)), 0.35 + (1 - Math.abs(gs)) * 0.55), i * 3);
  }
  return { pos, nrm, col };
}

// 千里江山：层叠山峦 + 谷底流动的河
export function mountains(n, rnd) {
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const layers = [
    { z: -5.5, base: 0.1, amp: 0.7, c: hex('#2a64b0'), k: 0.5, seed: 1.3, w: 12 },
    { z: -3.6, base: -0.25, amp: 0.95, c: hex('#2a7fa8'), k: 0.65, seed: 2.9, w: 11 },
    { z: -1.8, base: -0.95, amp: 0.95, c: hex('#23958a'), k: 0.8, seed: 4.1, w: 10 },
    { z: -0.2, base: -1.6, amp: 0.85, c: hex('#2fa576'), k: 0.9, seed: 5.7, w: 9.2 },
    { z: 1.4, base: -2.3, amp: 0.6, c: hex('#4cb46a'), k: 1.0, seed: 7.2, w: 8.6 },
  ];
  const peaks = layers.map((L, li) => {
    const pr = mulberry32(100 + li), arr = [];
    for (let k = 0; k < 9; k++) arr.push({ c: (pr() - 0.5) * L.w * 1.8, h: (0.6 + pr() * 1.2) * L.amp, w: 0.35 + pr() * 0.6 });
    if (li === 1) arr.push({ c: 1.8, h: 2.8, w: 0.75 }), arr.push({ c: 3.4, h: 1.9, w: 0.6 });
    if (li === 2) arr.push({ c: -2.8, h: 1.6, w: 0.6 }), arr.push({ c: 0.6, h: 1.3, w: 0.5 });
    return arr;
  });
  const ridge = (li, x) => {
    const L = layers[li];
    let y = L.base + L.amp * (0.35 * Math.sin(0.33 * x + L.seed) + 0.2 * Math.sin(0.9 * x + L.seed * 2) + 0.07 * Math.sin(2.3 * x + L.seed * 3));
    let m = 0;
    for (const p of peaks[li]) m = Math.max(m, p.h * Math.exp(-Math.abs(x - p.c) / p.w));
    return y + m;
  };
  const gold = hex('#e6c67c'), mist = hex('#a9c4bd');
  const nr = Math.floor(n * 0.16), nmist = Math.floor(n * 0.08);
  const wts = [0.14, 0.2, 0.22, 0.22, 0.22];
  for (let i = 0; i < n; i++) {
    if (i < nr) { // 河
      const gs = (rnd() + rnd() - 1);
      pos.set([2000 + rnd(), gs, rnd() - 0.5], i * 3);
      col.set(mul(mix(gold, hex('#8fd4c0'), clamp(Math.abs(gs) * 1.4)), 0.6 + (1 - Math.abs(gs)) * 0.8), i * 3);
      continue;
    }
    if (i < nr + nmist) { // 云雾
      const x = (rnd() - 0.5) * 20, li = Math.floor(rnd() * 4);
      pos.set([x, layers[li].base - 0.9 + (rnd() - 0.5) * 0.5, layers[li].z + 0.6 + (rnd() - 0.5)], i * 3);
      col.set(mul(mist, 0.1 + rnd() * 0.14), i * 3);
      continue;
    }
    let r = rnd(), li = 0; while (r > wts[li] && li < 4) { r -= wts[li]; li++; }
    const L = layers[li], x = (rnd() - 0.5) * L.w * 2, top = ridge(li, x);
    const dep = Math.pow(rnd(), 1.8) * 2.8;
    const y = top - dep;
    // 皴法：沿坡面的纵向纹理
    const cun = 0.55 + 0.45 * Math.pow(Math.abs(Math.sin(x * 19 + dep * 3 + Math.sin(x * 2.3) * 4)), 3);
    let c = mix(L.c, mul(L.c, 0.55), clamp(dep / 2.8));
    if (dep < 0.08) c = mix(c, gold, 0.8 - dep * 6);
    pos.set([x, y, L.z + (rnd() - 0.5) * 0.5], i * 3);
    col.set(mul(c, 2.3 * L.k * cun * (0.8 + rnd() * 0.4) * (1 - clamp(dep / 2.8) * 0.5)), i * 3);
  }
  return { pos, nrm, col };
}
