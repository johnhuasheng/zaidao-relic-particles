// 载道 · 交互演示：点击翻页，粒子实时消散 / 凝聚
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { vertexShader, fragmentShader } from '../particles.js';
import { mulberry32, cong, ding, sword, vase, haze, smoke, lineup, river, mountains } from '../shapes.js';

const N = 90000, W = 1920, H = 1080;
const $ = (id) => document.getElementById(id);
const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const R = (s) => mulberry32(s);

// ---------------- 幻灯片 ----------------
const slides = [
  { state: 'haze', hint: '点击  ·  空格  ·  →   翻到下一页' },
  { state: 'cong', hint: '按住拖动可旋转文物' },
  { state: 'ding' },
  { state: 'sword' },
  { state: 'vase' },
  { state: 'lineup', hint: '点击器物名称可回看' },
  { state: 'river' },
  { state: 'mount', cam: { py: 1.4, pz: 10.7, ly: -0.2, size: 43.5, bloom: 0.65 } },
];
const defaultCam = { py: 1.1, pz: 11.5, ly: 0, size: 30, bloom: 0.5 };

// 物体姿态（旋转随真实时间推进，可被拖动叠加）
const pose = {
  cong: { off: [2.45, 0.05, 0], base: 0.5, w: 0.32, drift: [-0.6, 1, 0] },
  ding: { off: [-2.5, 0, 0], base: -0.35, w: 0.26, drift: [0.6, 1, 0] },
  sword: { off: [2.55, 0, 0], base: 0.2, w: 0.42, drift: [-0.6, 1, 0] },
  vase: { off: [-2.5, 0, 0], base: 0.8, w: 0.3, drift: [0.6, 1, 0] },
};
const isObj = (s) => s in pose;
const dragOff = { cong: 0, ding: 0, sword: 0, vase: 0 };
const wobOf = (s) => (isObj(s) ? 0.004 : s.startsWith('smoke') ? 0.3 : { haze: 0.22, lineup: 0.004, river: 0, mount: 0.012 }[s] ?? 0.2);
const rotOf = (s, t) => (isObj(s) ? pose[s].base + pose[s].w * t + dragOff[s] : 0);
const offOf = (s) => (isObj(s) ? pose[s].off : [0, 0, 0]);

// ---------------- 渲染器 ----------------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#121a17');
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.5, 0.12);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let quality = 1;
function resize() {
  // 窗口较小时降低内部分辨率，保证流畅
  quality = Math.max(0.5, Math.min(1, (window.__scale || 1) * (devicePixelRatio || 1)));
  renderer.setSize(Math.round(W * quality), Math.round(H * quality), false);
  composer.setSize(Math.round(W * quality), Math.round(H * quality));
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
}
addEventListener('resize', resize);

// ---------------- 粒子 ----------------
await document.fonts.ready;
await new Promise((r) => setTimeout(r, 30)); // 让“加载中”先显示出来
const shapes = {
  haze: haze(N, R(1)), cong: cong(N, R(2)), ding: ding(N, R(3)), sword: sword(N, R(4)), vase: vase(N, R(5)),
  lineup: lineup(N, R(6), [(n, r) => cong(n, r), (n, r) => ding(n, r), (n, r) => sword(n, r), (n, r) => vase(n, r)]),
  river: river(N, R(7)), mount: mountains(N, R(8)),
};

function keysFor(name, sh) {
  const k = new Float32Array(N), r = R(99 + name.length * 7 + name.charCodeAt(0)), ys = sh.pos;
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < N; i++) { lo = Math.min(lo, ys[i * 3 + 1]); hi = Math.max(hi, ys[i * 3 + 1]); }
  if (name.startsWith('smoke')) for (let i = 0; i < N; i++) k[i] = 0.55 * (1 - (ys[i * 3 + 1] - lo) / (hi - lo)) + 0.45 * r();
  else if (name === 'lineup') for (let i = 0; i < N; i++) k[i] = sh.group[i] * 0.2 + r() * 0.25;
  else if (name === 'river' || name === 'haze') for (let i = 0; i < N; i++) k[i] = r();
  else if (name === 'mount') for (let i = 0; i < N; i++) { const x = ys[i * 3]; k[i] = x > 500 ? r() * 0.3 : 0.5 * r() + 0.5 * Math.min(1, Math.max(0, (x + 9) / 18)); }
  else for (let i = 0; i < N; i++) k[i] = 0.6 * (ys[i * 3 + 1] - lo) / (hi - lo) + 0.4 * r();
  return k;
}

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
  uWobF: { value: 0.2 }, uWobT: { value: 0.2 }, uWobW: { value: new THREE.Vector3(0.5, 0.43, 0.47) }, uTurbW: { value: new THREE.Vector3(0.7, 0.6, 0.5) }, uRB: { value: new THREE.Vector2(0.02, 2.0) }, uSize: { value: 30 }, uFade: { value: 0 },
};
scene.add(new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

function load(from, to) {
  const A = shapes[from], B = shapes[to];
  attrs.aFrom.array.set(A.pos); attrs.aCF.array.set(A.col); attrs.aNF.array.set(A.nrm);
  attrs.aTo.array.set(B.pos); attrs.aCT.array.set(B.col); attrs.aNT.array.set(B.nrm);
  if (!B.key) B.key = keysFor(to, B);
  attrs.aKey.array.set(B.key);
  for (const a of Object.values(attrs)) a.needsUpdate = true;
}

// ---------------- 音效（Web Audio 实时合成）----------------
const sfx = {
  on: true, ctx: null, out: null, verb: null, bgm: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.out = ctx.createGain(); this.out.gain.value = this.on ? 1 : 0; this.out.connect(ctx.destination);
    // 合成混响
    const len = ctx.sampleRate * 3, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / ctx.sampleRate * 2.2); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.45; this.verb.connect(wet).connect(this.out);
    const src = window.__BGM || '../out/bgm.mp3';
    this.bgm = new Audio(src); this.bgm.loop = true; this.bgm.volume = 0.45;
    if (this.on) this.bgm.play().catch(() => {});
  },
  toggle() {
    this.on = !this.on;
    if (this.ctx) this.out.gain.setTargetAtTime(this.on ? 1 : 0, this.ctx.currentTime, 0.1);
    if (this.bgm) this.on ? this.bgm.play().catch(() => {}) : this.bgm.pause();
    $('bSound').textContent = this.on ? '声音 开' : '声音 关';
    $('bSound').classList.toggle('off', !this.on);
  },
  dest(node) { node.connect(this.out); node.connect(this.verb); },
  whoosh(dur, level = 0.3) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, k = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, k, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < k; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(1600, t + dur * 0.5); f.frequency.exponentialRampToValueAtTime(300, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g); this.dest(g); s.start(t); s.stop(t + dur);
  },
  bell(midi, delay = 0, level = 0.16) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ctx.createGain(); g.gain.value = level; this.dest(g);
    for (const [r, a, dec] of [[0.5, 0.6, 0.5], [1, 1, 0.8], [1.183, 0.45, 1.1], [1.506, 0.35, 1.4], [2, 0.3, 1.8], [2.74, 0.25, 2.6], [4.07, 0.15, 4]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.value = f0 * r;
      og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(a, t + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, t + 5 / dec);
      o.connect(og).connect(g); o.start(t); o.stop(t + 5 / dec + 0.1);
    }
  },
};
const bellNote = { cong: 62, ding: 55, sword: 57, vase: 53, haze: 50, river: 69, mount: 50 };

// ---------------- 文字卡片 ----------------
const cards = [...document.querySelectorAll('.card')].map((el) => ({
  el, slide: +el.dataset.slide, enterAt: null, leaveAt: null,
  items: [...el.querySelectorAll('[data-d]')].map((x) => ({ x, d: +x.dataset.d })),
  typer: el.querySelector('.typer'), line: el.querySelector('.gline'),
}));
for (const c of cards) if (c.typer) { c.full = c.typer.textContent.trim(); c.typer.textContent = ''; }
function cardsEnter(i, at) { for (const c of cards) if (c.slide === i) { c.enterAt = at; c.leaveAt = null; } }
function cardsLeave(now) {
  for (const c of cards) {
    if (c.enterAt == null || c.leaveAt != null) continue;
    if (now < c.enterAt) c.enterAt = null; else c.leaveAt = now;
  }
}
function updateText(now) {
  for (const c of cards) {
    const vis = c.enterAt != null && now > c.enterAt - 0.05 && (c.leaveAt == null || now < c.leaveAt + 0.7);
    c.el.style.display = vis ? 'block' : 'none';
    if (!vis) { if (c.leaveAt != null && now >= c.leaveAt + 0.7) c.enterAt = c.leaveAt = null; continue; }
    const out = c.leaveAt == null ? 1 : 1 - ease((now - c.leaveAt) / 0.6);
    for (const { x, d } of c.items) {
      const o = ease((now - c.enterAt - d) / 0.8), k = o * out;
      x.style.opacity = k.toFixed(3);
      x.style.transform = `translateY(${((1 - o) * 16 - (1 - out) * 10).toFixed(2)}px)`;
      x.style.filter = k < 0.99 ? `blur(${((1 - k) * 6).toFixed(2)}px)` : 'none';
    }
    if (c.typer) {
      const tt = c.enterAt + +c.typer.dataset.d + 0.4;
      const nch = Math.max(0, Math.min(c.full.length, Math.floor((now - tt) * 30)));
      const caret = nch < c.full.length || Math.floor(now * 2) % 2 === 0;
      const html = c.full.slice(0, nch) + (caret && now > tt ? '<i class="caret"></i>' : '');
      if (html !== c._html) { c.typer.innerHTML = html; c._html = html; }
    }
    if (c.line) c.line.style.transform = `scaleX(${(ease((now - c.enterAt - 1.0) / 1.6) * out).toFixed(3)})`;
  }
}

// ---------------- 翻页引擎 ----------------
let now = 0, curState = 'haze', shownIdx = 0, targetIdx = 0, active = null, queue = [], speed = 1, smokeSeq = 0;
const durFor = (to, from) => ({ haze: 2.2, lineup: 3.4, river: 3.0, mount: 3.8 }[to] ?? (from === 'haze' ? 3.0 : 2.6));

function makeSmoke(name) {
  const id = 'smoke' + (++smokeSeq);
  shapes[id] = smoke(shapes[name], N, R(500 + smokeSeq), rotOf(name, now + 0.6), pose[name].off, pose[name].drift);
  delete shapes['smoke' + (smokeSeq - 3)];
  return id;
}
function begin(from, to, dur) {
  load(from, to);
  if (isObj(to)) dragOff[to] = 0;
  active = { from, to, dur, p: 0 };
  if (to.startsWith('smoke')) sfx.whoosh(dur / speed + 0.4, 0.22);
  else { sfx.whoosh(dur / speed, 0.16); if (bellNote[to]) sfx.bell(bellNote[to], (dur * 0.62) / speed); }
}
function nextPhase() {
  const ph = queue.shift();
  if (ph) return begin(...ph);
  active = null; speed = 1;
  if (targetIdx !== shownIdx) plan();
}
function plan() {
  const to = slides[targetIdx].state;
  queue = [];
  if (isObj(curState)) { const sm = makeSmoke(curState); queue.push([curState, sm, 1.4], [sm, to, durFor(to, sm)]); }
  else queue.push([curState, to, durFor(to, curState)]);
  const last = queue[queue.length - 1][2], total = queue.reduce((s, q) => s + q[2], 0);
  cardsLeave(now);
  cardsEnter(targetIdx, now + (total - last * 0.5) / speed);
  shownIdx = targetIdx;
  updateHud();
  nextPhase();
}
function goTo(i) {
  i = Math.max(0, Math.min(slides.length - 1, i));
  sfx.init();
  if (i === targetIdx) return;
  targetIdx = i;
  if (!active) return plan();
  if (active.to.startsWith('smoke')) { // 正在消散：直接改为凝聚成新目标
    const sm = active.to;
    queue = [[sm, slides[i].state, durFor(slides[i].state, sm)]];
    cardsLeave(now);
    cardsEnter(i, now + (1 - active.p) * active.dur + queue[0][2] * 0.5);
    shownIdx = i; updateHud();
  } else speed = 3; // 正在凝聚：加速完成后再继续
}
const next = () => goTo(targetIdx + 1), prev = () => goTo(targetIdx - 1);

// ---------------- HUD 与交互 ----------------
const ticks = $('ticks');
slides.forEach((_, i) => {
  const s = document.createElement('span'); s.style.left = (i / (slides.length - 1)) * 100 + '%';
  s.title = `第 ${i + 1} 页`; s.onclick = (e) => { e.stopPropagation(); goTo(i); }; ticks.appendChild(s);
});
function updateHud() {
  $('chap').innerHTML = `<b>${String(shownIdx + 1).padStart(2, '0')}</b> / ${String(slides.length).padStart(2, '0')}`;
  $('prog').style.transform = `scaleX(${shownIdx / (slides.length - 1)})`;
  [...ticks.children].forEach((s, i) => s.classList.toggle('on', i <= shownIdx));
  const h = $('hint'); h.style.opacity = 0;
  clearTimeout(updateHud.t);
  updateHud.t = setTimeout(() => { h.textContent = slides[shownIdx].hint || ''; h.style.opacity = 1; }, 1800);
}
$('bPrev').onclick = (e) => { e.stopPropagation(); prev(); };
$('bNext').onclick = (e) => { e.stopPropagation(); next(); };
$('bSound').onclick = (e) => { e.stopPropagation(); sfx.init(); sfx.toggle(); };
const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
$('bFull').onclick = (e) => { e.stopPropagation(); fullscreen(); };
for (const lab of document.querySelectorAll('.lab')) lab.addEventListener('pointerup', (e) => { e.stopPropagation(); goTo(+lab.dataset.go); });

const stage = $('stage');
let drag = null, mouse = { x: 0, y: 0 };
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button, .lab, .ticks')) return;
  drag = { x: e.clientX, moved: 0 }; stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', (e) => {
  const s = window.__scale || 1;
  mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = (e.clientY / innerHeight) * 2 - 1;
  if (!drag) return;
  const dx = (e.clientX - drag.x) / s; drag.x = e.clientX; drag.moved += Math.abs(dx);
  if (drag.moved > 8) {
    stage.classList.add('dragging');
    const obj = isObj(curState) ? curState : active && isObj(active.to) ? active.to : null;
    if (obj) dragOff[obj] += dx * 0.008;
  }
});
stage.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const clicked = drag.moved <= 8; drag = null; stage.classList.remove('dragging');
  if (clicked && !e.target.closest('button, .lab, .ticks')) next();
});
addEventListener('keydown', (e) => {
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); next(); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); prev(); }
  else if (e.key === 'Home') goTo(0);
  else if (e.key === 'End') goTo(slides.length - 1);
  else if (e.key === 'f' || e.key === 'F') fullscreen();
  else if (e.key === 'm' || e.key === 'M') { sfx.init(); sfx.toggle(); }
});
let wheelLock = 0;
addEventListener('wheel', (e) => {
  if (performance.now() < wheelLock || Math.abs(e.deltaY) < 20) return;
  wheelLock = performance.now() + 900; e.deltaY > 0 ? next() : prev();
}, { passive: true });

// ---------------- 主循环 ----------------
const cam = { ...defaultCam, px: 0 };
let last = performance.now() / 1000;
const t0 = last;
function frame() {
  const tn = performance.now() / 1000, dt = Math.min(0.1, tn - last); last = tn; now = tn - t0;
  if (active) {
    active.p += (dt * speed) / active.dur;
    if (active.p >= 1) { curState = active.to; active.p = 1; nextPhase(); }
  }
  const from = active ? active.from : curState, to = active ? active.to : curState;
  uniforms.uP.value = active ? active.p : 1;
  uniforms.uTime.value = now;
  uniforms.uRotF.value = rotOf(from, now); uniforms.uRotT.value = rotOf(to, now);
  uniforms.uOffF.value.fromArray(offOf(from)); uniforms.uOffT.value.fromArray(offOf(to));
  uniforms.uWobF.value = wobOf(from); uniforms.uWobT.value = wobOf(to);
  uniforms.uFade.value = ease(now / 1.5);
  // 镜头缓动 + 鼠标视差
  const tc = slides[shownIdx].cam || defaultCam, k = 1 - Math.exp(-dt * 1.3);
  for (const key of ['py', 'pz', 'ly', 'size', 'bloom']) cam[key] += (tc[key] - cam[key]) * k;
  cam.px += (mouse.x * 0.35 - cam.px) * k;
  camera.position.set(cam.px + 0.2 * Math.sin(now * 0.13), cam.py - mouse.y * 0.15 + 0.12 * Math.sin(now * 0.09), cam.pz - 0.3 * Math.sin(now * 0.05));
  camera.lookAt(0, cam.ly, 0);
  uniforms.uSize.value = cam.size * quality;
  bloom.strength = cam.bloom;
  composer.render();
  updateText(now);
  requestAnimationFrame(frame);
}
resize();
cardsEnter(0, 0.6);
updateHud();
frame();
$('loading').style.opacity = 0;
setTimeout(() => $('loading').remove(), 1100);
window.__ppt = { goTo, get idx() { return shownIdx; } };
