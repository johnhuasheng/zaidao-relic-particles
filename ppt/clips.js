// PPT 视频片段渲染引擎：与成片视频相同的粒子凝聚 / 旋转效果，可配置粒子数与超采样
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { vertexShader, fragmentShader } from '../particles.js';
import { mulberry32, cong, ding, sword, vase, haze, river, mountains } from '../shapes.js';

const W = 1920, H = 1080, R = (s) => mulberry32(s);
await document.fonts.ready;

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#121a17');
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.5, 0.12);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let N = 0, attrs, uniforms, points, shapes = {}, spec, curSeg = -1;
const gens = {
  haze: (n) => haze(n, R(1)), cong: (n) => cong(n, R(2)), ding: (n) => ding(n, R(3)), sword: (n) => sword(n, R(4)), vase: (n) => vase(n, R(5)),
  lineup: (n) => lineupDyn(n),
  river: (n) => riverRich(n, R(7)), mount: (n) => mountainsFlow(n, R(8)), glyph: (n) => glyphDao(n, R(9)),
};

// ---------- 封面：金色粒子聚成行楷“道”字 ----------
function glyphDao(n, rnd) {
  const S = 640, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.fillStyle = '#fff';
  g.font = `${S * 0.86}px STXingkai, "华文行楷", STKaiti, KaiTi, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('道', S / 2, S * 0.52);
  const d = g.getImageData(0, 0, S, S).data, m = (x, y) => d[(y * S + x) * 4] / 255;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const gold = hex('#f0cf86'), pale = hex('#fff1cf'), jade = hex('#7fc4a8');
  const nG = Math.floor(n * 0.86), H = 5.0, cx = 2.75, cy = 0.15;
  for (let i = 0; i < n; i++) {
    if (i < nG) { // 笔画：按墨色浓淡采样，边缘略亮
      let x, y, v;
      do { x = Math.floor(rnd() * S); y = Math.floor(rnd() * S); v = m(x, y); } while (v < 0.5 || rnd() > v);
      const edge = (m(Math.min(S - 1, x + 3), y) < 0.5 || m(Math.max(0, x - 3), y) < 0.5 || m(x, Math.min(S - 1, y + 3)) < 0.5 || m(x, Math.max(0, y - 3)) < 0.5);
      pos.set([cx + (x / S - 0.5) * H, cy - (y / S - 0.5) * H, (rnd() - 0.5) * 0.25], i * 3);
      const c = edge ? mixc(gold, pale, 0.6) : mixc(gold, jade, rnd() * 0.25);
      col.set(c.map((q) => q * (edge ? 0.9 : 0.32 + rnd() * 0.3)), i * 3);
    } else { // 字周围的游丝与金尘
      const a = rnd() * 2 * Math.PI, r = 1.6 + Math.pow(rnd(), 0.6) * 2.4;
      pos.set([cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.75, (rnd() - 0.5) * 2], i * 3);
      col.set(gold.map((q) => q * (0.06 + Math.pow(rnd(), 3) * 0.5)), i * 3);
    }
  }
  return { pos, nrm, col };
}

// ---------- 千年一脉：三股光河（金 / 玉 / 青花）交织流淌，四件小文物顺流而下 ----------
function riverRich(n, rnd) {
  // 组成：光河 38% · 倒影 10% · 水雾 10% · 升腾的金色光点 6% · 远山 14% · 星尘 4% · 顺流的小文物 18%
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const kind = new Uint8Array(n), a = new Float32Array(n), b = new Float32Array(n), c = new Float32Array(n), g = new Uint8Array(n);
  const strandCol = [[hex('#f3dc9e'), hex('#fff4d6')], [hex('#7fd6ae'), hex('#c8f0dc')], [hex('#7fa6ff'), hex('#dfe8ff')]];
  const cnt = { strand: 0.38, refl: 0.10, spray: 0.10, spark: 0.06, ridge: 0.14, dust: 0.04 };
  const ranges = []; let acc = 0;
  for (const [k, f] of Object.entries(cnt)) { const m = Math.floor(n * f); ranges.push([k, acc, acc + m]); acc += m; }
  const nMini = n - acc, per = Math.floor(nMini / 4), K = 0.36;
  const minis = [cong, ding, sword, vase].map((f, i) => f(i === 3 ? nMini - per * 3 : per, R(70 + i)));
  const RW = 11; // 远山宽度（左右周期衔接）
  const ridgeY = (L, x) => {
    const h = (m) => (2 * Math.PI * m) / (2 * RW);
    const base = L ? 0.55 : 1.15, amp = L ? 0.6 : 0.8;
    return base + amp * (0.5 * Math.sin(h(1) * x + 1.3 + L) + 0.3 * Math.sin(h(3) * x + 2.1 * L) + 0.2 * Math.abs(Math.sin(h(5) * x + 0.7 + L)));
  };
  for (const [k, i0, i1] of ranges) for (let i = i0; i < i1; i++) {
    if (k === 'strand' || k === 'refl') {
      const j = i % 3, gs = (rnd() + rnd() + rnd() - 1.5) / 1.5, hi = Math.pow(1 - Math.abs(gs), 3);
      kind[i] = k === 'strand' ? 0 : 4; g[i] = j; a[i] = rnd(); b[i] = gs; c[i] = rnd() - 0.5;
      const cc = mixc(strandCol[j][0], strandCol[j][1], hi * 0.6);
      col.set(cc.map((v) => v * (k === 'strand' ? 0.5 + 1.0 * hi : 0.08 + 0.16 * hi)), i * 3);
    } else if (k === 'spray') {
      kind[i] = 1; a[i] = rnd(); b[i] = Math.pow(rnd(), 1.6); c[i] = rnd() * 2 * Math.PI; g[i] = Math.floor(rnd() * 3);
      col.set(strandCol[g[i]][1].map((v) => v * (0.14 + rnd() * 0.32)), i * 3);
    } else if (k === 'spark') {
      kind[i] = 5; a[i] = (rnd() - 0.5) * 16; b[i] = rnd(); c[i] = rnd() * 2 * Math.PI;
      col.set(hex('#ffd98a').map((v) => v * (0.35 + rnd() * 0.65)), i * 3);
    } else if (k === 'ridge') { // 远山：两层，粒子集中在山脊，向下渐淡
      const L = rnd() < 0.5 ? 0 : 1, dep = Math.pow(rnd(), 2.2) * 2.2;
      kind[i] = 6; g[i] = L; a[i] = (rnd() - 0.5) * 2 * RW; b[i] = dep; c[i] = (L ? -4.2 : -6.5) + (rnd() - 0.5) * 0.4;
      const base = L ? hex('#2c8a86') : hex('#2b5f9a');
      col.set(mixc(base, hex('#e6c67c'), dep < 0.06 ? 0.5 : 0).map((v) => v * (L ? 1.35 : 1.0) * (1 - Math.min(1, dep / 2.2) * 0.75) * (0.7 + rnd() * 0.5)), i * 3);
    } else { // 星尘
      kind[i] = 2; a[i] = (rnd() - 0.5) * 18; b[i] = (rnd() - 0.5) * 10; c[i] = (rnd() - 0.5) * 6 - 1;
      col.set(hex('#c9c2a0').map((v) => v * (0.05 + Math.pow(rnd(), 4) * 0.5)), i * 3);
    }
  }
  const loc = new Float32Array(nMini * 3), lnrm = new Float32Array(nMini * 3);
  let i = acc;
  minis.forEach((sh, gi) => {
    const m3 = sh.pos.length / 3;
    for (let m = 0; m < m3; m++, i++) {
      const q = i - acc;
      kind[i] = 3; g[i] = gi;
      loc.set([sh.pos[m * 3] * K, sh.pos[m * 3 + 1] * K, sh.pos[m * 3 + 2] * K], q * 3);
      lnrm.set(sh.nrm.subarray(m * 3, m * 3 + 3), q * 3);
      col.set([sh.col[m * 3], sh.col[m * 3 + 1], sh.col[m * 3 + 2]], i * 3);
    }
  });
  const X0 = -8.6, XW = 17.2, MIRROR = -2.75;
  const wrapR = (x) => ((((x + RW) % (2 * RW)) + 2 * RW) % (2 * RW)) - RW;
  const sh = { pos, nrm, col, dynamic: true };
  sh.update = (t) => {
    const Cy = spec.C || 40, bw = (2 * Math.PI) / Cy, P = pos, N = nrm;
    const yc = (x) => -0.62 + 0.72 * Math.sin(0.52 * x + 3 * bw * t) + 0.2 * Math.sin(1.3 * x - 4 * bw * t);
    const zc = (x) => 0.6 * Math.sin(0.35 * x);
    const strand = (i) => {
      const x = X0 + XW * ((a[i] + (2 * t) / Cy) % 1); // 一个循环内流过两轮
      const ph = 0.9 * x + g[i] * 2.0944 + 6 * bw * t, r = 0.34 + 0.08 * Math.sin(0.7 * x + 2 * bw * t);
      const wd = 0.09 + 0.04 * Math.sin(1.7 * x + g[i]);
      return [x, yc(x) + r * Math.sin(ph) + b[i] * wd, zc(x) + r * Math.cos(ph) + c[i] * 0.06];
    };
    for (let i = 0; i < n; i++) {
      const kd = kind[i];
      if (kd === 0) { const p = strand(i); P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2]; }
      else if (kd === 4) { // 倒影：以水面为轴压扁翻转，并轻微荡漾
        const p = strand(i);
        P[i * 3] = p[0]; P[i * 3 + 1] = MIRROR - (p[1] - MIRROR) * 0.22 + 0.03 * Math.sin(3 * p[0] + 8 * bw * t); P[i * 3 + 2] = p[2] + 0.8;
      } else if (kd === 1) {
        const x = X0 + XW * ((a[i] + t / Cy) % 1), ph = c[i] + 5 * bw * t;
        P[i * 3] = x + 0.25 * Math.sin(ph); P[i * 3 + 1] = yc(x) + 0.2 + b[i] * 1.2 + 0.12 * Math.sin(ph * 2); P[i * 3 + 2] = zc(x) + 0.5 * Math.cos(ph);
      } else if (kd === 5) { // 金色光点：从河面缓缓升起
        const u = (b[i] + (3 * t) / Cy) % 1;
        P[i * 3] = a[i] + 0.3 * Math.sin(c[i] + 4 * bw * t); P[i * 3 + 1] = -1.6 + u * 5.2; P[i * 3 + 2] = 0.5 * Math.cos(c[i]);
      } else if (kd === 6) { // 远山：缓慢横移（一个循环一轮）
        const x = wrapR(a[i] + (2 * RW * t) / Cy);
        P[i * 3] = x; P[i * 3 + 1] = ridgeY(g[i], a[i]) - b[i]; P[i * 3 + 2] = c[i];
      } else if (kd === 2) {
        P[i * 3] = a[i] + 0.25 * Math.sin(bw * t + b[i]); P[i * 3 + 1] = b[i] + 0.15 * Math.sin(2 * bw * t + a[i]); P[i * 3 + 2] = c[i];
      } else { // 小文物：等距排在河上，一个循环流过一轮，同时旋转三周
        const q = i - acc, gi = g[i], xm = X0 + XW * ((gi / 4 + t / Cy) % 1), ang = 0.55 + gi + 3 * bw * t;
        const cs = Math.cos(ang), sn = Math.sin(ang), lx = loc[q * 3], ly = loc[q * 3 + 1], lz = loc[q * 3 + 2];
        P[i * 3] = xm + cs * lx + sn * lz; P[i * 3 + 1] = yc(xm) + 0.85 + ly + 0.06 * Math.sin(4 * bw * t + gi); P[i * 3 + 2] = zc(xm) - sn * lx + cs * lz;
        const nx = lnrm[q * 3], nz = lnrm[q * 3 + 2];
        N[i * 3] = cs * nx + sn * nz; N[i * 3 + 1] = lnrm[q * 3 + 1]; N[i * 3 + 2] = -sn * nx + cs * nz;
      }
    }
  };
  sh.update(0);
  return sh;
}

// ---------- 流动的山河：每层山峦像水一样横向流动 + 涌浪起伏，全部按循环周期设计，首尾无缝 ----------
const hex = (h) => { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const FLOW_T = 10 * (2 * Math.PI) / 2.2; // 循环周期（与 render-clips.js 中 ML 一致）
function mountainsFlow(n, rnd) {
  const layers = [
    { z: -5.5, base: 0.1, amp: 0.7, c: hex('#2a64b0'), k: 0.5, seed: 1.3, w: 12, laps: 1, swell: 0.16 },
    { z: -3.6, base: -0.25, amp: 0.95, c: hex('#2a7fa8'), k: 0.65, seed: 2.9, w: 11, laps: 1, swell: 0.2 },
    { z: -1.8, base: -0.95, amp: 0.95, c: hex('#23958a'), k: 0.8, seed: 4.1, w: 10, laps: 2, swell: 0.26 },
    { z: -0.2, base: -1.6, amp: 0.85, c: hex('#2fa576'), k: 0.9, seed: 5.7, w: 9.2, laps: 2, swell: 0.32 },
    { z: 1.4, base: -2.3, amp: 0.6, c: hex('#4cb46a'), k: 1.0, seed: 7.2, w: 8.6, laps: 3, swell: 0.36 },
  ];
  // 周期化的山脊：频率取 2π·m/(2w)，山峰距离按环绕计算，左右边界无缝相接
  const peaks = layers.map((L, li) => {
    const pr = mulberry32(100 + li), arr = [];
    for (let k = 0; k < 9; k++) arr.push({ c: (pr() - 0.5) * L.w * 1.8, h: (0.6 + pr() * 1.2) * L.amp, w: 0.35 + pr() * 0.6 });
    if (li === 1) arr.push({ c: 1.8, h: 2.1, w: 0.75 }, { c: 3.4, h: 1.5, w: 0.6 });
    if (li === 2) arr.push({ c: -2.8, h: 1.6, w: 0.6 }, { c: 0.6, h: 1.3, w: 0.5 });
    return arr;
  });
  const harm = (L, f) => Math.max(1, Math.round((f * 2 * L.w) / (2 * Math.PI))) * (2 * Math.PI) / (2 * L.w);
  const wrap = (x, w) => ((((x + w) % (2 * w)) + 2 * w) % (2 * w)) - w;
  const ridge = (li, x) => {
    const L = layers[li];
    let y = L.base + L.amp * (0.35 * Math.sin(harm(L, 0.33) * x + L.seed) + 0.2 * Math.sin(harm(L, 0.9) * x + L.seed * 2) + 0.07 * Math.sin(harm(L, 2.3) * x + L.seed * 3));
    let m = 0;
    for (const p of peaks[li]) m = Math.max(m, p.h * Math.exp(-Math.abs(wrap(x - p.c, L.w)) / p.w));
    return y + m;
  };
  const gold = hex('#e6c67c'), mist = hex('#a9c4bd');
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const kind = new Uint8Array(n), lay = new Uint8Array(n), x0 = new Float32Array(n), y0 = new Float32Array(n), zz = new Float32Array(n);
  const nr = Math.floor(n * 0.16), nmist = Math.floor(n * 0.08), wts = [0.14, 0.2, 0.22, 0.22, 0.22];
  for (let i = 0; i < n; i++) {
    if (i < nr) { // 谷底的河：哨兵编码，由着色器按时间流动
      const gs = rnd() + rnd() - 1;
      pos.set([2000 + rnd(), gs, rnd() - 0.5], i * 3);
      col.set(mixc(gold, hex('#8fd4c0'), clamp01(Math.abs(gs) * 1.4)).map((v) => v * (0.6 + (1 - Math.abs(gs)) * 0.8)), i * 3);
      kind[i] = 0; continue;
    }
    if (i < nr + nmist) { // 云雾：随所在山层漂移
      const li = Math.floor(rnd() * 4), L = layers[li];
      kind[i] = 2; lay[i] = li; x0[i] = (rnd() - 0.5) * 2 * L.w; y0[i] = L.base - 0.9 + (rnd() - 0.5) * 0.5; zz[i] = L.z + 0.6 + (rnd() - 0.5);
      col.set(mist.map((v) => v * (0.1 + rnd() * 0.14)), i * 3);
      continue;
    }
    let r = rnd(), li = 0; while (r > wts[li] && li < 4) { r -= wts[li]; li++; }
    const L = layers[li], x = (rnd() - 0.5) * L.w * 2, dep = Math.pow(rnd(), 1.8) * 2.8;
    const cun = 0.55 + 0.45 * Math.pow(Math.abs(Math.sin(x * 19 + dep * 3 + Math.sin(x * 2.3) * 4)), 3);
    let c = mixc(L.c, L.c.map((v) => v * 0.55), clamp01(dep / 2.8));
    if (dep < 0.08) c = mixc(c, gold, 0.8 - dep * 6);
    kind[i] = 1; lay[i] = li; x0[i] = x; y0[i] = ridge(li, x) - dep; zz[i] = L.z + (rnd() - 0.5) * 0.5;
    col.set(c.map((v) => v * 2.3 * L.k * cun * (0.8 + rnd() * 0.4) * (1 - clamp01(dep / 2.8) * 0.5)), i * 3);
  }
  const sh = { pos, nrm, col, dynamic: true };
  sh.update = (t) => {
    const P = pos;
    for (let i = nr; i < n; i++) {
      const L = layers[lay[i]];
      // 横向流动：一个循环内流过整层宽度的整数倍（近处更快，形成视差）
      const FT = spec.flowT || FLOW_T;
      const xw = wrap(x0[i] + (L.laps * 2 * L.w * t) / FT, L.w);
      // 涌浪：两组行进波，波数与时间频率均为整数倍，保证循环无缝
      const k1 = (2 * Math.PI * 2) / (2 * L.w), k2 = (2 * Math.PI * 5) / (2 * L.w), w1 = (2 * Math.PI * 3) / FT, w2 = (2 * Math.PI * 7) / FT;
      const sw = L.swell * (Math.sin(k1 * xw - w1 * t + lay[i]) + 0.45 * Math.sin(k2 * xw - w2 * t + lay[i] * 2));
      P[i * 3] = xw;
      P[i * 3 + 1] = y0[i] + sw * (kind[i] === 2 ? 0.6 : 1);
      P[i * 3 + 2] = zz[i] + 0.15 * Math.sin(k1 * xw - w1 * t + 1.3);
    }
  };
  sh.update(0);
  return sh;
}
const shape = (k) => (shapes[k] ||= gens[k](N));

// 四器并列（可旋转版）：保存每件文物的局部坐标，逐帧绕各自中心旋转
function lineupDyn(n) {
  const list = [cong, ding, sword, vase], per = Math.floor(n / 4), k = 0.36;
  const loc = new Float32Array(n * 3), lnrm = new Float32Array(n * 3), col = new Float32Array(n * 3), group = new Float32Array(n), cx = new Float32Array(n);
  list.forEach((g, gi) => {
    const cnt = gi === 3 ? n - per * 3 : per, sh = g(cnt, R(60 + gi)), ox = (gi - 1.5) * 2.35;
    for (let i = 0; i < cnt; i++) {
      const j = per * gi + i;
      loc.set([sh.pos[i * 3] * k, sh.pos[i * 3 + 1] * k, sh.pos[i * 3 + 2] * k], j * 3);
      lnrm.set(sh.nrm.subarray(i * 3, i * 3 + 3), j * 3);
      col.set([sh.col[i * 3] * 1.1, sh.col[i * 3 + 1] * 1.1, sh.col[i * 3 + 2] * 1.1], j * 3);
      group[j] = gi; cx[j] = ox;
    }
  });
  const sh = { loc, lnrm, col, group, cx, pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), dynamic: true };
  sh.update = (a) => {
    const c = Math.cos(a), s = Math.sin(a), P = sh.pos, Q = sh.nrm;
    for (let i = 0; i < n; i++) {
      const x = loc[i * 3], y = loc[i * 3 + 1], z = loc[i * 3 + 2];
      P[i * 3] = c * x + s * z + cx[i]; P[i * 3 + 1] = y + 0.15; P[i * 3 + 2] = -s * x + c * z;
      const nx = lnrm[i * 3], nz = lnrm[i * 3 + 2];
      Q[i * 3] = c * nx + s * nz; Q[i * 3 + 1] = lnrm[i * 3 + 1]; Q[i * 3 + 2] = -s * nx + c * nz;
    }
  };
  sh.update(0.55);
  return sh;
}

function keysFor(name, sh) {
  const k = new Float32Array(N), r = R(99 + name.length * 7 + name.charCodeAt(0)), ys = sh.pos;
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < N; i++) { lo = Math.min(lo, ys[i * 3 + 1]); hi = Math.max(hi, ys[i * 3 + 1]); }
  if (name === 'lineup') for (let i = 0; i < N; i++) k[i] = sh.group[i] * 0.2 + r() * 0.25;
  else if (name === 'river' || name === 'haze') for (let i = 0; i < N; i++) k[i] = r();
  else if (name === 'mount') for (let i = 0; i < N; i++) { const x = ys[i * 3]; k[i] = x > 500 ? r() * 0.3 : 0.5 * r() + 0.5 * Math.min(1, Math.max(0, (x + 9) / 18)); }
  else for (let i = 0; i < N; i++) k[i] = 0.6 * (ys[i * 3 + 1] - lo) / (hi - lo) + 0.4 * r();
  return k;
}

function build(n) {
  if (points) { scene.remove(points); points.geometry.dispose(); }
  N = n; shapes = {};
  const geo = new THREE.BufferGeometry();
  const mk = (sz) => new THREE.BufferAttribute(new Float32Array(N * sz), sz);
  attrs = { aFrom: mk(3), aTo: mk(3), aCF: mk(3), aCT: mk(3), aNF: mk(3), aNT: mk(3), aKey: mk(1), aR: mk(4) };
  for (const [k, a] of Object.entries(attrs)) geo.setAttribute(k, a);
  geo.setAttribute('position', mk(3));
  { const r = R(42); for (let i = 0; i < N * 4; i++) attrs.aR.array[i] = r(); }
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
  uniforms = {
    uP: { value: 1 }, uTime: { value: 0 }, uRotF: { value: 0 }, uRotT: { value: 0 },
    uOffF: { value: new THREE.Vector3() }, uOffT: { value: new THREE.Vector3() },
    uWobF: { value: 0.2 }, uWobT: { value: 0.2 }, uWobW: { value: new THREE.Vector3(0.5, 0.43, 0.47) }, uTurbW: { value: new THREE.Vector3(0.7, 0.6, 0.5) }, uRB: { value: new THREE.Vector2(0.0350141, 2.2) }, uSize: { value: 30 }, uFade: { value: 1 },
  };
  points = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(points);
}

const WOB = { haze: 0.22, lineup: 0.004, river: 0, mount: 0.012 };
const poseOf = (s) => (spec.poses || {})[s] || { off: [0, 0, 0], base: 0, w: 0, wob: WOB[s] ?? 0.004 };

// 镜头：sway = { ax, ay, period } 时做周期性平移（周期等于循环时长，首尾无缝）
function placeCamera(t) {
  const c = spec.cam || {}, w = spec.sway, ph = w ? (2 * Math.PI * t) / w.period : 0;
  camera.position.set((c.x ?? 0) + (w ? w.ax * Math.sin(ph) : 0), (c.y ?? 1.1) + (w ? w.ay * Math.sin(2 * ph) : 0), c.z ?? 11.5);
  camera.lookAt(w ? w.ax * 0.35 * Math.sin(ph) : 0, c.ly ?? 0, 0);
}

// spec: { n, ss, size, fade, bloom, cam:{x,y,z,ly}, segs:[{to,t0,t1}], poses:{name:{off,base,w,wob}} }
window.setup = (s) => {
  spec = s;
  if (N !== s.n) build(s.n);
  const ss = s.ss || 1;
  renderer.setSize(W * ss, H * ss, false);
  composer.setSize(W * ss, H * ss);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const c = s.cam || {};
  placeCamera(0);
  uniforms.uSize.value = (s.size ?? 30) * ss;
  uniforms.uFade.value = s.fade ?? 1;
  uniforms.uWobW.value.set(...(s.wobW || [0.5, 0.43, 0.47]));
  uniforms.uTurbW.value.set(...(s.turbW || [0.7, 0.6, 0.5]));
  uniforms.uRB.value.set(...(s.rb || [0.0350141, 2.2]));
  bloom.strength = s.bloom ?? 0.5;
  curSeg = -1;
  return true;
};

function setSeg(i) {
  if (i === curSeg) return;
  curSeg = i;
  const sg = spec.segs[i], prev = i > 0 ? spec.segs[i - 1].to : sg.to;
  const A = shape(prev), B = shape(sg.to);
  attrs.aFrom.array.set(A.pos); attrs.aCF.array.set(A.col); attrs.aNF.array.set(A.nrm);
  attrs.aTo.array.set(B.pos); attrs.aCT.array.set(B.col); attrs.aNT.array.set(B.nrm);
  if (!B.key) B.key = keysFor(sg.to, B);
  attrs.aKey.array.set(B.key);
  for (const a of Object.values(attrs)) a.needsUpdate = true;
  sg._from = prev;
  sg._dynF = !!A.dynamic; sg._dynT = !!B.dynamic;
}

window.renderAt = (t) => {
  let i = 0;
  while (i + 1 < spec.segs.length && t >= spec.segs[i + 1].t0) i++;
  setSeg(i);
  const sg = spec.segs[i], pf = poseOf(sg._from), pt = poseOf(sg.to);
  uniforms.uP.value = sg.t1 <= sg.t0 ? 1 : Math.min(1, Math.max(0, (t - sg.t0) / (sg.t1 - sg.t0)));
  uniforms.uTime.value = t + (spec.timeOffset || 0);
  uniforms.uRotF.value = pf.base + pf.w * t; uniforms.uRotT.value = pt.base + pt.w * t;
  uniforms.uOffF.value.fromArray(pf.off); uniforms.uOffT.value.fromArray(pt.off);
  uniforms.uWobF.value = pf.wob ?? 0.004; uniforms.uWobT.value = pt.wob ?? 0.004;
  // 动态形状逐帧更新：四器各自旋转 / 山河流动
  const dynArg = (name) => (name === 'lineup' ? (spec.lineupBase ?? 0.55) + (spec.lineupW ?? 0) * t : t);
  if (sg._dynF) { const S = shape(sg._from); S.update(dynArg(sg._from)); attrs.aFrom.array.set(S.pos); attrs.aNF.array.set(S.nrm); attrs.aFrom.needsUpdate = attrs.aNF.needsUpdate = true; }
  if (sg._dynT) { const S = shape(sg.to); S.update(dynArg(sg.to)); attrs.aTo.array.set(S.pos); attrs.aNT.array.set(S.nrm); attrs.aTo.needsUpdate = attrs.aNT.needsUpdate = true; }
  placeCamera(t);
  composer.render();
  return true;
};
window.__ready = true;
