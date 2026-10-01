// 把交互演示打包成单个 HTML（脚本、three.js、背景音乐全部内嵌），双击即可打开
//   node build-ppt.js  ->  载道_交互演示.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const res = await build({
  entryPoints: [path.join(ROOT, 'ppt/ppt.js')], bundle: true, format: 'esm', minify: true,
  write: false, target: 'es2022', legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const mp3 = path.join(ROOT, 'out/bgm.mp3');
const bgm = fs.existsSync(mp3) ? `<script>window.__BGM="data:audio/mpeg;base64,${fs.readFileSync(mp3).toString('base64')}"</script>\n` : '';
const html = fs.readFileSync(path.join(ROOT, 'ppt/ppt.html'), 'utf8')
  .replace('<!--APP-->', () => `${bgm}<script type="module">\n${js}\n</script>`);
const out = path.join(ROOT, '载道_交互演示.html');
fs.writeFileSync(out, html);
console.log('ok', out, (html.length / 1024 / 1024).toFixed(2) + ' MB');
