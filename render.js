// 用法：
//   node render.js                 渲染完整视频 -> out/video_noaudio.mp4
//   node render.js --stills 5,12   只导出指定秒数的静帧 -> out/still_*.jpg
//   node render.js --serve         仅启动本地预览服务 http://localhost:8123
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8123, FPS = 30, DURATION = 90;
const args = process.argv.slice(2);
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    const idx = path.join(p, 'index.html');
    if (fs.existsSync(idx)) { res.writeHead(200, { 'content-type': 'text/html' }); return fs.createReadStream(idx).pipe(res); }
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));
if (args[0] === '--serve') { console.log(`http://localhost:${PORT}/`); await new Promise(() => {}); }

const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({
  executablePath: exe, headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync', '--hide-scrollbars', '--force-color-profile=srgb'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${PORT}/render.html?render`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
console.log('GL:', await page.evaluate(() => {
  const gl = document.getElementById('gl').getContext('webgl2');
  const d = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
}));

const shot = async (t) => {
  await page.evaluate((tt) => window.renderAt(tt), t);
  return page.screenshot({ type: 'jpeg', quality: 94, optimizeForSpeed: true });
};

if (args[0] === '--stills') {
  for (const t of args[1].split(',').map(Number)) {
    fs.writeFileSync(path.join(OUT, `still_${String(t).replace('.', '_')}.jpg`), await shot(t));
    console.log('still', t);
  }
} else {
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    path.join(OUT, 'video_noaudio.mp4')], { stdio: ['pipe', 'ignore', 'inherit'] });
  const total = FPS * DURATION, t0 = Date.now();
  for (let f = 0; f < total; f++) {
    const buf = await shot(f / FPS);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('done', ((Date.now() - t0) / 1000).toFixed(0), 's');
}
await browser.close();
server.close();
