import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { vertexShader, fragmentShader } from './particles.js';
import { mulberry32, cong, ding, sword, vase, haze, smoke, lineup, river, mountains } from './shapes.js';

const RENDER = new URLSearchParams(location.search).has('render');
const N = 90000;
const DURATION = 90;
const W = 1920, H = 1080;

// ---------------- 场景 ----------------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#121a17');
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.5, 0.12);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------- 形状 ----------------
const R = (s) => mulberry32(s);
const shapes = {
  haze: haze(N, R(1)),
  cong: cong(N, R(2)),
  ding: ding(N, R(3)),
  sword: sword(N, R(4)),
  vase: vase(N, R(5)),
  lineup: lineup(N, R(6), [(n, r) => cong(n, r), (n, r) => ding(n, r), (n, r) => sword(n, r), (n, r) => vase(n, r)]),
  river: river(N, R(7)),
  mount: mountains(N, R(8)),
};

// 物体姿态：旋转随时间推进
const pose = {
  cong: { off: [2.45, 0.05, 0], rot: (t) => 0.5 + (t - 36) * 0.32, wob: 0.004 },
  ding: { off: [-2.5, 0.0, 0], rot: (t) => -0.35 + (t - 20) * 0.26, wob: 0.004 },
  sword: { off: [2.55, 0.0, 0], rot: (t) => 0.2 + (t - 34) * 0.42, wob: 0.003 },
  vase: { off: [-2.5, 0.0, 0], rot: (t) => 0.8 + (t - 50) * 0.3, wob: 0.003 },
};
const still = { off: [0, 0, 0], rot: () => 0, wob: 0 };
const P = (name) => pose[name] || { ...still, wob: { haze: 0.22, smoke: 0.3, lineup: 0.004, river: 0.0, mount: 0.012 }[name.replace(/\d/, '')] ?? 0.2 };

// 时间轴：每一段是从上一个状态到 to 的过渡
const seq = [
  { to: 'haze', t0: -1, t1: 0 },
  { to: 'cong', t0: 5.0, t1: 8.8 },
  { to: 'smoke1', from: 'cong', t0: 19.2, t1: 21.2, drift: [-0.6, 1, 0] },
  { to: 'ding', t0: 21.2, t1: 24.6 },
  { to: 'smoke2', from: 'ding', t0: 34.6, t1: 36.6, drift: [0.6, 1, 0] },
  { to: 'sword', t0: 36.6, t1: 40.0 },
  { to: 'smoke3', from: 'sword', t0: 50.0, t1: 52.0, drift: [-0.6, 1, 0] },
  { to: 'vase', t0: 52.0, t1: 55.4 },
  { to: 'smoke4', from: 'vase', t0: 65.6, t1: 67.6, drift: [0.3, 0.6, -1] },
  { to: 'lineup', t0: 67.6, t1: 72.0 },
  { to: 'river', t0: 74.8, t1: 79.0 },
  { to: 'mount', t0: 80.6, t1: 85.4 },
];
// 烟雾状态由物体消散瞬间的世界姿态派生
for (const s of seq) {
  if (s.from) {
    const p = pose[s.from];
    shapes[s.to] = smoke(shapes[s.from], N, R(s.t0 * 10), p.rot(s.t0 + 0.8), p.off, s.drift);
  }
}

// 每个状态的“出现顺序”键：决定粒子先后到达
function keysFor(name, sh) {
  const k = new Float32Array(N), r = R(99 + name.length * 7 + name.charCodeAt(0));
  const ys = sh.pos;
  if (name.startsWith('smoke')) { // 自上而下消散
    let lo = 1e9, hi = -1e9; for (let i = 0; i < N; i++) { lo = Math.min(lo, ys[i * 3 + 1]); hi = Math.max(hi, ys[i * 3 + 1]); }
    for (let i = 0; i < N; i++) k[i] = 0.55 * (1 - (ys[i * 3 + 1] - lo) / (hi - lo)) + 0.45 * r();
  } else if (name === 'lineup') {
    for (let i = 0; i < N; i++) k[i] = sh.group[i] * 0.2 + r() * 0.25;
  } else if (name === 'river' || name === 'haze') {
    for (let i = 0; i < N; i++) k[i] = r();
  } else if (name === 'mount') {
    for (let i = 0; i < N; i++) { const x = ys[i * 3]; k[i] = x > 500 ? r() * 0.3 : 0.5 * r() + 0.5 * Math.min(1, Math.max(0, (x + 9) / 18)); }
  } else { // 自下而上凝聚
    let lo = 1e9, hi = -1e9; for (let i = 0; i < N; i++) { lo = Math.min(lo, ys[i * 3 + 1]); hi = Math.max(hi, ys[i * 3 + 1]); }
    for (let i = 0; i < N; i++) k[i] = 0.6 * (ys[i * 3 + 1] - lo) / (hi - lo) + 0.4 * r();
  }
  return k;
}

// ---------------- 粒子材质 ----------------
const geo = new THREE.BufferGeometry();
const mk = (sz) => new THREE.BufferAttribute(new Float32Array(N * sz), sz);
const attrs = { aFrom: mk(3), aTo: mk(3), aCF: mk(3), aCT: mk(3), aNF: mk(3), aNT: mk(3), aKey: mk(1), aR: mk(4) };
for (const [k, a] of Object.entries(attrs)) geo.setAttribute(k, a);
geo.setAttribute('position', mk(3));
{ const r = R(42); for (let i = 0; i < N * 4; i++) attrs.aR.array[i] = r(); }
geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);

const uniforms = {
  uP: { value: 1 }, uTime: { value: 0 }, uRotF: { value: 0 }, uRotT: { value: 0 },
  uOffF: { value: new THREE.Vector3() }, uOffT: { value: new THREE.Vector3() },
  uWobF: { value: 0.2 }, uWobT: { value: 0.2 }, uWobW: { value: new THREE.Vector3(0.5, 0.43, 0.47) }, uTurbW: { value: new THREE.Vector3(0.7, 0.6, 0.5) }, uRB: { value: new THREE.Vector2(0.02, 2.0) }, uSize: { value: 30 }, uFade: { value: 1 },
};
const mat = new THREE.ShaderMaterial({
  uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader,
  fragmentShader,
});
scene.add(new THREE.Points(geo, mat));

// ---------------- 状态切换 ----------------
let curSeg = -1;
function setSeg(i) {
  if (i === curSeg) return;
  curSeg = i;
  const s = seq[i], prev = i > 0 ? seq[i - 1].to : s.to;
  const A = shapes[prev], B = shapes[s.to];
  attrs.aFrom.array.set(A.pos); attrs.aCF.array.set(A.col); attrs.aNF.array.set(A.nrm);
  attrs.aTo.array.set(B.pos); attrs.aCT.array.set(B.col); attrs.aNT.array.set(B.nrm);
  if (!B.key) B.key = keysFor(s.to, B);
  attrs.aKey.array.set(B.key);
  for (const a of Object.values(attrs)) a.needsUpdate = true;
  s._from = prev;
}

const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// ---------------- 文字层 ----------------
const $ = (id) => document.getElementById(id);
const cards = [...document.querySelectorAll('.card')].map((el) => ({
  el, tIn: +el.dataset.in, tOut: +el.dataset.out,
  items: [...el.querySelectorAll('[data-d]')].map((x) => ({ x, d: +x.dataset.d })),
  typer: el.querySelector('.typer'),
}));
for (const c of cards) if (c.typer) { c.full = c.typer.textContent.trim(); c.typer.textContent = ''; }

function updateText(t) {
  for (const c of cards) {
    const vis = t > c.tIn - 0.1 && t < c.tOut + 0.1;
    c.el.style.display = vis ? '' : 'none';
    if (!vis) continue;
    const out = 1 - ease((t - (c.tOut - 0.9)) / 0.9);
    for (const { x, d } of c.items) {
      const o = ease((t - c.tIn - d) / 0.8);
      const k = o * out;
      x.style.opacity = k.toFixed(3);
      x.style.transform = `translateY(${((1 - o) * 16 - (1 - out) * 8).toFixed(2)}px)`;
      x.style.filter = k < 0.99 ? `blur(${((1 - k) * 6).toFixed(2)}px)` : 'none';
    }
    if (c.typer) {
      const tt = c.tIn + +c.typer.dataset.d + 0.4;
      const nch = Math.max(0, Math.min(c.full.length, Math.floor((t - tt) * 26)));
      const caret = nch < c.full.length || Math.floor(t * 2) % 2 === 0;
      c.typer.innerHTML = c.full.slice(0, nch) + (caret && t > tt ? '<i class="caret"></i>' : '');
    }
    const line = c.el.querySelector('.gline');
    if (line) line.style.transform = `scaleX(${(ease((t - c.tIn - 1.0) / 1.6) * out).toFixed(3)})`;
  }
  // 底部进度
  $('prog').style.transform = `scaleX(${(t / DURATION).toFixed(4)})`;
  const chap = t < 8 ? '00' : t < 21.2 ? '01' : t < 36.6 ? '02' : t < 52 ? '03' : t < 67.6 ? '04' : '∞';
  $('chap').textContent = chap;
  $('hud').style.opacity = (ease((t - 0.3) / 1.2) * (1 - ease((t - 88.6) / 1.2))).toFixed(3);
}

// ---------------- 每帧 ----------------
function renderAt(t) {
  let i = 0;
  while (i + 1 < seq.length && t >= seq[i + 1].t0) i++;
  setSeg(i);
  const s = seq[i];
  const pf = P(s._from), pt = P(s.to);
  uniforms.uP.value = s.t1 <= s.t0 ? 1 : Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0)));
  uniforms.uTime.value = t;
  uniforms.uRotF.value = pf.rot(t); uniforms.uRotT.value = pt.rot(t);
  uniforms.uOffF.value.fromArray(pf.off); uniforms.uOffT.value.fromArray(pt.off);
  uniforms.uWobF.value = pf.wob; uniforms.uWobT.value = pt.wob;
  uniforms.uFade.value = ease(t / 1.5) * (1 - ease((t - 88.4) / 1.6));
  // 镜头：缓慢呼吸，结尾推近山河
  const fin = ease((t - 80) / 10);
  camera.position.set(0.25 * Math.sin(t * 0.13), 1.1 + 0.15 * Math.sin(t * 0.09) + fin * 0.3, 11.5 - 0.35 * Math.sin(t * 0.05) - fin * 0.8);
  camera.lookAt(0, fin * -0.2, 0);
  bloom.strength = 0.5 + 0.15 * fin;
  uniforms.uSize.value = 30 * (1 + 0.45 * fin);
  composer.render();
  updateText(t);
}
window.renderAt = renderAt;

await document.fonts.ready;
window.__ready = true;

if (!RENDER) {
  let start = performance.now();
  $('replay').onclick = () => (start = performance.now());
  const loop = () => {
    const t = ((performance.now() - start) / 1000) % DURATION;
    renderAt(t);
    requestAnimationFrame(loop);
  };
  loop();
} else {
  document.body.classList.add('rendering');
  renderAt(0);
}
