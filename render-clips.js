// 渲染 PPT 用的 MP4 片段 -> ppt/clips/，封面背景 -> ppt/assets/cover.jpg
//   node render-clips.js                    全部
//   node render-clips.js cong vase ...      指定片段
//   node render-clips.js --still cong_loop 2 [n] [size] [ss]   导出静帧做对比
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'ppt/clips');
fs.mkdirSync(OUT, { recursive: true });
const FPS = 30;

// 细致度：更多、更小的粒子 + 2 倍超采样
const FINE = { n: 260000, size: 19, ss: 2, fade: 0.95 };
const TW = 2 * Math.PI / 2.2;           // 粒子闪烁周期
const T = 5 * TW;                        // 旋转一周的时长（闪烁周期整数倍 → 循环无缝）
const W = (2 * Math.PI) / T;             // 角速度
// 每页只用一段视频（翻页时只需初始化一个解码器）：尘埃凝聚 → 旋转 / 流动 → 消散 → 再凝聚……
// 视频从“凝聚已开始 S 秒”处开始，第一帧粒子就在飞，翻页无需等待；
// 所有随时间变化的量（旋转、闪烁、漂动、湍流、河流、镜头）周期都整除 C，第 S+C 秒与第 S 秒完全相同，可无缝循环。
const C = 15 * TW;                        // 一个循环 ≈ 42.8 秒（= 文物旋转 3 圈）
const B = (2 * Math.PI) / C;              // 基础角频率
const S = 0.45;                           // 视频起点（凝聚开始后 0.45 秒，第一帧粒子已在飞）
const W3 = 3 * B;                         // 文物一个循环转 3 圈，每圈 ≈14.3 秒（与原速度相同）
const RATES = { C, wobW: [3 * B, 3 * B, 3 * B], turbW: [5 * B, 4 * B, 3 * B], rb: [2 / C, 2.2], flowT: C / 2 };
// 只加快开头的凝聚（原 3.7 秒 → 约 2.2 秒），之后的旋转、消散节奏不变
const cycle = (to, extra = {}) => {
  const inEnd = extra.inEnd ?? 2.35;
  return {
    ...FINE, ...RATES, from: S, to: S + C, crf: 30, ...extra,
    segs: [{ to: 'haze', t0: -1, t1: 0 }, { to, t0: 0.15, t1: inEnd }, { to: 'haze', t0: C - 3.4, t1: C - 0.3 }, { to, t0: C + 0.15, t1: C + inEnd }],
  };
};

const objects = {
  cong: { off: [2.45, 0.05, 0], base: 0.5 },
  ding: { off: [-2.5, 0, 0], base: -0.6 },
  sword: { off: [2.55, 0, 0], base: 0.1 },
  vase: { off: [-2.5, 0, 0], base: 0.8 },
};
const clips = {};
for (const [k, o] of Object.entries(objects)) clips[k] = cycle(k, { poses: { [k]: { off: o.off, base: o.base, w: W3, wob: 0.004 } } });
clips.lineup = cycle('lineup', { inEnd: 3.0, lineupBase: 0.55, lineupW: W3 });  // 四器依次凝聚，各自旋转
clips.river = cycle('river', { inEnd: 2.8, crf: 31 });
clips.mount = cycle('mount', { inEnd: 3.2, crf: 31, size: 28, bloom: 0.65, cam: { y: 1.4, z: 10.7, ly: 1.0 }, sway: { ax: 0.55, ay: 0.08, period: C },
  poses: { mount: { off: [0, 0, 0], base: 0, w: 0, wob: 0 } } });

// 只出静帧的画面（封面背景）
// 封面不用视频（放映中第一次停掉正在播放的视频会额外卡约 1.5 秒），用“道”字成形后的静帧 + PowerPoint 原生动画
const stills = { cover: { ...FINE, ...RATES, poses: { glyph: { off: [0, 0, 0], base: 0, w: 0, wob: 0.012 } }, segs: [{ to: 'haze', t0: -1, t1: 0 }, { to: 'glyph', t0: 0.15, t1: 3.4 }] } };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript' }[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(8125, r));
const browser = await puppeteer.launch({
  executablePath: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p)), headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force-color-profile=srgb'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:8125/ppt/clips.html');
await page.waitForFunction('window.__ready === true', { timeout: 120000 });

const args = process.argv.slice(2);
if (args[0] === '--still') {
  const [, name, t, n, size, ss] = args;
  const c = { ...(clips[name] || stills[name]) };
  if (n) c.n = +n; if (size) c.size = +size; if (ss) c.ss = +ss;
  await page.evaluate((s) => window.setup(s), c);
  await page.evaluate((tt) => window.renderAt(tt), +t);
  const f = path.join(ROOT, 'out', `clip_${name}_${c.n}_${c.size}_${c.ss}.jpg`);
  await page.screenshot({ path: f, type: 'jpeg', quality: 95 });
  console.log(f);
} else {
  for (const [name, c] of Object.entries(clips)) {
    if (args.length && !args.includes(name)) continue;
    await page.evaluate((s) => window.setup(s), c);
    const frames = Math.round((c.to - c.from) * FPS), t0 = Date.now();
    const out = path.join(OUT, `${name}.mp4`);
    // BT.709 + 有限范围，并写入色彩标记，保证 PowerPoint 解码后底色与幻灯片一致
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(c.crf || 27), '-profile:v', 'high', '-level', '4.1',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-g', '60', '-movflags', '+faststart', '-an', out], { stdio: ['pipe', 'ignore', 'inherit'] });
    for (let f = 0; f < frames; f++) {
      await page.evaluate((tt) => window.renderAt(tt), c.from + f / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 95, optimizeForSpeed: true });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    // 封面帧（PPT 中视频未播放时显示）：取第一帧
    await page.evaluate((tt) => window.renderAt(tt), c.from);
    await page.screenshot({ path: path.join(OUT, `${name}_poster.jpg`), type: 'jpeg', quality: 92 });
    console.log(name, frames, 'frames', ((Date.now() - t0) / 1000).toFixed(0) + 's', (fs.statSync(out).size / 1e6).toFixed(1) + 'MB');
  }
  // 封面背景（静态图）
  if (!args.length || args.includes('cover')) {
    fs.mkdirSync(path.join(ROOT, 'ppt/assets'), { recursive: true });
    await page.evaluate((s) => window.setup(s), stills.cover);
    await page.evaluate(() => window.renderAt(8));
    await page.screenshot({ path: path.join(ROOT, 'ppt/assets/cover.jpg'), type: 'jpeg', quality: 93 });
    console.log('cover');
  }
}
await browser.close();
server.close();
