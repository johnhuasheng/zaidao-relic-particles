// 生成可编辑的 PowerPoint：载道_文物粒子.pptx
//   node render-clips.js    （先渲染粒子视频片段 -> ppt/clips/）
//   node build-pptx.js
// 每页背景是全屏粒子视频（凝聚片段播一次 → 循环片段无缝接上一直旋转）；
// 文字为原生可编辑文本框；转场与文字动画为 PowerPoint 原生效果，可在“切换”“动画”选项卡中修改。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const C = (f) => path.join(process.env.CLIPS_DIR || path.join(ROOT, 'ppt/clips'), f);
const A = (f) => path.join(ROOT, 'ppt/assets', f);
const OUT = process.env.PPTX_OUT || path.join(ROOT, '载道_文物粒子.pptx');

const BG = '121A17', GOLD = 'D8B36A', GOLD2 = 'B8964F', INK = 'EFE9DA', DIM = '8D978F', BODY = 'AEB5AC';
const SERIF = 'Noto Serif SC', SANS = 'Segoe UI', LATIN = 'Georgia';
const FULL = { x: 0, y: 0, w: 13.333, h: 7.5 };
// 每页一段循环视频（凝聚 → 旋转/流动 → 消散），时长与 render-clips.js 中的 C 一致
const CYCLE_MS = Math.round(((15 * 2 * Math.PI) / 2.2) * 1000);
// 不用 PowerPoint 转场：转场期间 PowerPoint 还要加载视频，会掉帧。每段视频第一帧粒子就在飞，本身就是转场效果。
const TRANS = 0;
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mMQEVH4DwABaQE5fjQmZwAAAABJRU5ErkJggg==';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.title = '载道 · 文物粒子';
pres.theme = { headFontFace: SERIF, bodyFontFace: SERIF };

// 每页：转场、动画、视频（播放计划）、封面帧
const plan = [];
let cur;
function newSlide(transition) {
  const s = pres.addSlide();
  s.background = { color: BG };
  cur = { anims: [], media: [], covers: [], transition };
  plan.push(cur);
  return s;
}
const anim = (name, fx, delay, dur = 800) => cur.anims.push({ name, fx, delay, dur });
// 全屏视频：start 毫秒后开始播放；loop 为真则循环；appear 为真则播放前隐藏（用于循环段接在凝聚段之后）
function video(s, name, file, { start = 0, dur, loop = false, appear = false, box = FULL }) {
  s.addMedia({ type: 'video', path: C(`${file}.mp4`), ...box, cover: TINY_PNG, objectName: name });
  cur.media.push({ name, start, dur, loop, appear });
  cur.covers.push(C(`${file}_poster.jpg`));
}
function text(s, str, o) {
  s.addText(str, {
    isTextBox: true, margin: 0, valign: 'top', fontFace: o.font || SERIF, fontSize: o.size, color: o.color || INK,
    bold: !!o.bold, charSpacing: o.cs, align: o.align || 'left', lineSpacingMultiple: o.lsm,
    x: o.x, y: o.y, w: o.w, h: o.h, objectName: o.name, fit: 'none',
  });
}

// ---------------- 1 封面 ----------------
{
  const s = newSlide({ dur: TRANS });
  // 封面不放视频：放映中第一次停掉正在播放的视频会额外卡约 1.5 秒。
  // 用“道”字成形后的静帧，以“溶解”方式进入。
  // 注意：第一页不能放持续运行的动画/视频，否则第一次点击会被用来结束动画，翻页要卡约 1.7 秒
  s.addImage({ path: A('cover.jpg'), ...FULL, objectName: 'bg_dust' });
  s.addShape(pres.shapes.RECTANGLE, { x: 1.4, y: 2.1, w: 0.64, h: 0.64, fill: { color: 'B8432F', transparency: 92 }, line: { color: 'B8432F', width: 2.25 }, objectName: 'seal_box' });
  text(s, '國\n寶', { x: 1.4, y: 2.14, w: 0.64, h: 0.58, size: 17, bold: true, color: 'C9513A', align: 'center', lsm: 0.95, name: 'seal_text' });
  text(s, 'VESSELS OF THE WAY', { x: 2.29, y: 1.62, w: 5, h: 0.3, size: 13, font: SANS, color: GOLD, cs: 5, name: 'kicker' });
  text(s, '载道', { x: 2.22, y: 1.9, w: 6, h: 1.45, size: 80, bold: true, color: GOLD, cs: 12, name: 'title' });
  text(s, '器以载道。五千年的光，在尘埃里重新聚拢。', { x: 2.29, y: 3.5, w: 7, h: 0.35, size: 14, color: 'B9BDB2', cs: 2, name: 'subtitle' });
  s.addShape(pres.shapes.LINE, { x: 2.29, y: 4.08, w: 2.9, h: 0, line: { color: GOLD, width: 0.75 }, objectName: 'gold_line' });
  s.addShape(pres.shapes.OVAL, { x: 2.29, y: 4.66, w: 0.07, h: 0.07, fill: { color: GOLD }, line: { type: 'none' }, objectName: 'start_dot' });
  text(s, '中国文物 · 粒子特展', { x: 2.5, y: 4.6, w: 4, h: 0.22, size: 10, color: '9AA196', cs: 6, name: 'start_text' });
  s.addNotes('封面。右侧金色粒子聚成“道”字。点击翻页，每一页的文物都会从尘埃中凝聚成形并持续旋转。');
  anim('bg_dust', 'dissolve', 0, 1800);
  anim('kicker', 'float', 400, 800);
  anim('title', 'zoom', 600, 1200);
  anim('seal_box', 'zoom', 1300, 600); anim('seal_text', 'zoom', 1300, 600);
  anim('subtitle', 'float', 1500, 900);
  anim('gold_line', 'wipe', 1900, 1200);
  anim('start_dot', 'fade', 2600, 600); anim('start_text', 'fade', 2600, 600);
}

// ---------------- 2–5 文物页 ----------------
const relics = [
  {
    key: 'cong', side: 'right', idx: '01', kicker: 'NEOLITHIC RITUAL JADE', title: '良渚玉琮', en: 'LIANGZHU JADE CONG', meta: '良渚文化 · 距今约五千年', sub: '外方内圆，以琮礼地',
    desc: '良渚先民礼地的神器。外方而内圆，节节相叠，四角以细如发丝的阴线琢出神人兽面——在没有金属工具的年代，一线一刻，皆是时间。',
    notes: '良渚玉琮，新石器时代良渚文化的玉礼器。重点讲“外方内圆”的形制和四角的神人兽面纹。',
  },
  {
    key: 'ding', side: 'left', idx: '02', kicker: 'BRONZE RITUAL CAULDRON', title: '后母戊鼎', en: 'HOUMUWU DING', meta: '商代晚期 · 中国国家博物馆', sub: '鼎立千年，国之重器',
    desc: '商王为祭祀母亲“戊”而铸，通高133厘米，重832.84千克，是已知最重的中国古代青铜器。四壁饕餮盘踞，双耳猛虎衔首——一器之重，即一国之重。',
    notes: '后母戊鼎，通高133厘米、重832.84千克。可以讲陶范合铸工艺与“鼎”作为国家权力象征的意义。',
  },
  {
    key: 'sword', side: 'right', idx: '03', kicker: 'BRONZE SWORD OF YUE', title: '越王勾践剑', en: 'SWORD OF GOUJIAN', meta: '春秋晚期 · 湖北省博物馆', sub: '卧薪尝胆，锋芒未老',
    desc: '1965年出土于湖北江陵，长55.7厘米。剑身满布菱形暗格纹，剑格嵌蓝色琉璃与绿松石，近格处八字鸟篆：“越王鸠浅，自乍用剑”。沉睡两千余年，出鞘依旧寒光逼人。',
    notes: '越王勾践剑，1965年湖北江陵出土。讲菱形暗格纹、鸟篆铭文，以及“卧薪尝胆”的故事。',
  },
  {
    key: 'vase', side: 'left', idx: '04', kicker: 'BLUE-AND-WHITE PORCELAIN', title: '元青花梅瓶', en: 'YUAN DYNASTY MEIPING', meta: '元代 · 景德镇窑', sub: '青花一笔，白地生云',
    desc: '小口、丰肩、瘦底，口小仅容梅之瘦骨，故名梅瓶。元代景德镇以进口钴料绘云龙、云肩与莲瓣，发色浓艳，白地如玉，开一代青花之风。',
    notes: '元青花梅瓶，景德镇窑。讲梅瓶名称的由来与元青花的钴料发色。',
  },
];
for (const r of relics) {
  const s = newSlide({ dur: TRANS });
  video(s, 'bg', r.key, { dur: CYCLE_MS, loop: true });
  // 文字区：竖向居中
  const x0 = r.side === 'right' ? 1.04 : 7.57, y0 = 2.0;
  text(s, r.kicker, { x: x0, y: y0, w: 4.8, h: 0.28, size: 11, font: SANS, color: GOLD, cs: 3, name: 'kicker' });
  text(s, r.title, { x: x0, y: y0 + 0.3, w: 4.8, h: 0.72, size: 34, bold: true, color: GOLD, cs: 2, name: 'title' });
  text(s, r.en, { x: x0, y: y0 + 1.04, w: 4.8, h: 0.26, size: 11, font: LATIN, color: 'CFC9B8', cs: 4, name: 'en' });
  s.addShape(pres.shapes.LINE, { x: x0, y: y0 + 1.53, w: 0.18, h: 0, line: { color: GOLD2, width: 0.75 }, objectName: 'meta_line' });
  text(s, r.meta, { x: x0 + 0.28, y: y0 + 1.43, w: 4.4, h: 0.22, size: 9.5, color: DIM, cs: 2, name: 'meta' });
  text(s, r.sub, { x: x0, y: y0 + 1.82, w: 4.8, h: 0.42, size: 18, color: INK, cs: 1.5, name: 'sub' });
  text(s, r.desc, { x: x0, y: y0 + 2.42, w: 4.55, h: 1.5, size: 11.5, color: BODY, lsm: 1.5, name: 'desc' });
  s.addNotes(r.notes);
  anim('kicker', 'float', 2100, 700);
  anim('title', 'float', 2250, 800);
  anim('en', 'fade', 2500, 700);
  anim('meta_line', 'wipe', 2650, 500); anim('meta', 'fade', 2650, 700);
  anim('sub', 'float', 2800, 800);
  anim('desc', 'wipe', 3200, 1800);
}

// ---------------- 6 四器并列 ----------------
{
  const s = newSlide({ dur: TRANS });
  video(s, 'bg', 'lineup', { dur: CYCLE_MS, loop: true });
  text(s, 'FIVE THOUSAND YEARS · FOUR RELICS', { x: 0, y: 1.0, w: 13.333, h: 0.28, size: 11, font: SANS, color: GOLD, cs: 4, align: 'center', name: 'kicker' });
  text(s, '五千年 · 四件器', { x: 0, y: 1.32, w: 13.333, h: 0.55, size: 24, color: GOLD, cs: 12, align: 'center', name: 'title' });
  [['良渚玉琮', '新石器时代'], ['后母戊鼎', '商'], ['越王勾践剑', '春秋'], ['元青花梅瓶', '元']].forEach(([name, era], i) => {
    const cx = [-3.525, -1.175, 1.175, 3.525][i] * 149 / 144 + 6.667; // 世界坐标 → 英寸
    s.addShape(pres.shapes.LINE, { x: cx, y: 5.08, w: 0, h: 0.2, line: { color: GOLD2, width: 0.75 }, objectName: `tick${i}` });
    text(s, name, { x: cx - 1, y: 5.38, w: 2, h: 0.3, size: 12, color: 'E6DCC0', cs: 2, align: 'center', name: `lab${i}` });
    text(s, era, { x: cx - 1, y: 5.7, w: 2, h: 0.22, size: 8.5, color: DIM, cs: 4, align: 'center', name: `era${i}` });
  });
  s.addNotes('四件文物按年代并列：新石器、商、春秋、元，跨越约五千年。');
  anim('kicker', 'float', 600, 700); anim('title', 'float', 750, 800);
  for (let i = 0; i < 4; i++) { anim(`tick${i}`, 'wipe', 2000 + i * 450, 400); anim(`lab${i}`, 'float', 2100 + i * 450, 600); anim(`era${i}`, 'fade', 2250 + i * 450, 600); }
}

// ---------------- 7 光河 ----------------
{
  const s = newSlide({ dur: TRANS });
  video(s, 'bg', 'river', { dur: CYCLE_MS, loop: true });
  text(s, 'ONE CONTINUOUS RIVER', { x: 0, y: 1.0, w: 13.333, h: 0.28, size: 11, font: SANS, color: GOLD, cs: 4, align: 'center', name: 'kicker' });
  text(s, '千年一脉', { x: 0, y: 1.32, w: 13.333, h: 0.55, size: 26, color: GOLD, cs: 14, align: 'center', name: 'title' });
  text(s, '从玉到铜，从剑到瓷——器物如河，奔流不息。', { x: 0, y: 2.0, w: 13.333, h: 0.32, size: 13, color: 'B7BCB0', cs: 2, align: 'center', name: 'sub' });
  // 底部时间轴：四件文物的年代
  const tl = [['良渚 · 新石器时代', '约公元前 3300 年'], ['殷商', '约公元前 1200 年'], ['春秋 · 越国', '约公元前 500 年'], ['元', '约公元 1300 年']];
  const tx0 = 2.4, tx1 = 10.93, ty = 6.18;
  s.addShape(pres.shapes.LINE, { x: tx0, y: ty, w: tx1 - tx0, h: 0, line: { color: '4A5650', width: 0.75 }, objectName: 'tl_line' });
  tl.forEach(([era, year], i) => {
    const cx = tx0 + ((tx1 - tx0) * i) / 3;
    s.addShape(pres.shapes.OVAL, { x: cx - 0.06, y: ty - 0.06, w: 0.12, h: 0.12, fill: { color: GOLD }, line: { color: '121A17', width: 1.5 }, objectName: `tl_dot${i}` });
    text(s, era, { x: cx - 1.2, y: ty + 0.16, w: 2.4, h: 0.26, size: 11, color: 'E6DCC0', cs: 2, align: 'center', name: `tl_era${i}` });
    text(s, year, { x: cx - 1.2, y: ty + 0.44, w: 2.4, h: 0.2, size: 8.5, color: DIM, cs: 2, align: 'center', name: `tl_year${i}` });
  });
  s.addNotes('过渡页：玉、铜、瓷三股光河交织，四件文物顺流而下，象征五千年文明一脉相承。底部时间轴标出四件文物的年代。');
  anim('kicker', 'float', 2400, 700); anim('title', 'float', 2600, 900); anim('sub', 'float', 3000, 900);
  anim('tl_line', 'wipe', 3400, 1600);
  for (let i = 0; i < 4; i++) { anim(`tl_dot${i}`, 'zoom', 3500 + i * 420, 500); anim(`tl_era${i}`, 'float', 3600 + i * 420, 600); anim(`tl_year${i}`, 'fade', 3750 + i * 420, 600); }
}

// ---------------- 8 山河 ----------------
{
  const s = newSlide({ dur: TRANS });
  video(s, 'bg', 'mount', { dur: CYCLE_MS, loop: true });
  text(s, 'FOUR RELICS, ONE LANDSCAPE', { x: 1.04, y: 0.78, w: 6, h: 0.26, size: 10, font: LATIN, color: GOLD, cs: 6, name: 'kicker' });
  text(s, '器以载道，万点成山河', { x: 1.04, y: 1.08, w: 8, h: 0.8, size: 36, color: 'F1EAD8', cs: 4, name: 'title' });
  text(s, '文物不语，自有山河万里。', { x: 1.04, y: 1.98, w: 6, h: 0.32, size: 13, color: 'B7BCB0', cs: 2, name: 'sub' });
  text(s, '— 载道 · 完 —', { x: 1.04, y: 2.55, w: 4, h: 0.24, size: 9, color: GOLD2, cs: 10, name: 'end' });
  s.addNotes('结尾：万点粒子聚成青绿山水。可停留在这一页进行总结。');
  anim('kicker', 'float', 3200, 700); anim('title', 'float', 3400, 1000); anim('sub', 'float', 4000, 900); anim('end', 'fade', 4800, 900);
}

// ---------------- 原生转场与动画 ----------------
const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const NS_P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main';
const transitionXml = (t) => !t.dur ? '' :
  `<mc:AlternateContent xmlns:mc="${NS_MC}"><mc:Choice xmlns:p14="${NS_P14}" Requires="p14"><p:transition spd="slow" p14:dur="${t.dur}"><p:fade/></p:transition></mc:Choice>` +
  `<mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`;

let id;
const tgt = (spid) => `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`;
const setVis = (spid) => `<p:set><p:cBhvr><p:cTn id="${id++}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${tgt(spid)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
const fadeFx = (spid, dur) => `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${id++}" dur="${dur}"/>${tgt(spid)}</p:cBhvr></p:animEffect>`;
const prop = (spid, dur, attr, from, to) => `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${id++}" dur="${dur}" fill="hold" decel="100000"/>${tgt(spid)}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`;
const FX = {
  appear: { cls: 'entr', preset: 1, sub: 0, body: (s) => setVis(s) },
  play: { cls: 'mediacall', preset: 1, sub: 0, body: (s, d) => `<p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="${id++}" dur="${d}" fill="hold"/>${tgt(s)}</p:cBhvr></p:cmd>` },
  fade: { cls: 'entr', preset: 10, sub: 0, body: (s, d) => setVis(s) + fadeFx(s, d) },
  float: { cls: 'entr', preset: 42, sub: 0, body: (s, d) => setVis(s) + fadeFx(s, d) + prop(s, d, 'ppt_x', '#ppt_x', '#ppt_x') + prop(s, d, 'ppt_y', '#ppt_y+.04', '#ppt_y') },
  zoom: { cls: 'entr', preset: 53, sub: 16, body: (s, d) => setVis(s) + prop(s, d, 'ppt_w', '#ppt_w*0.6', '#ppt_w') + prop(s, d, 'ppt_h', '#ppt_h*0.6', '#ppt_h') + fadeFx(s, d) },
  wipe: { cls: 'entr', preset: 22, sub: 8, body: (s, d) => setVis(s) + `<p:animEffect transition="in" filter="wipe(left)"><p:cBhvr><p:cTn id="${id++}" dur="${d}"/>${tgt(s)}</p:cBhvr></p:animEffect>` },
  dissolve: { cls: 'entr', preset: 9, sub: 0, body: (s, d) => setVis(s) + `<p:animEffect transition="in" filter="dissolve"><p:cBhvr><p:cTn id="${id++}" dur="${d}"/>${tgt(s)}</p:cBhvr></p:animEffect>` },
  letters: { cls: 'entr', preset: 10, sub: 0, iterate: '<p:iterate type="lt"><p:tmPct val="7500"/></p:iterate>', body: (s, d) => setVis(s) + fadeFx(s, d) },
};
function timingXml(pl, ids, kinds) {
  id = 5;
  // 视频：凝聚段 t=0 播放；循环段在凝聚段结束前出现并播放。
  // 视频命令必须排在文字动画之前——排在“按字母”动画后面时，PowerPoint 会等文字播完才开始播放循环段。
  const mediaItems = [];
  for (const m of pl.media) {
    if (m.appear) mediaItems.push({ name: m.name, fx: 'appear', delay: m.start, dur: 1 });
    mediaItems.push({ name: m.name, fx: 'play', delay: m.start, dur: m.dur });
  }
  const items = [...mediaItems, ...[...pl.anims].sort((a, b) => a.delay - b.delay)];
  const effects = items.map((a, i) => {
    const spid = ids[a.name];
    if (!spid) throw new Error('找不到对象 ' + a.name);
    const f = FX[a.fx], ctn = id++;
    return `<p:par><p:cTn id="${ctn}" presetID="${f.preset}" presetClass="${f.cls}" presetSubtype="${f.sub}" fill="hold"${f.cls === 'entr' || f.cls === 'emph' ? ' grpId="0"' : ''} nodeType="${i === 0 ? 'afterEffect' : 'withEffect'}"><p:stCondLst><p:cond delay="${a.delay}"/></p:stCondLst>${f.iterate || ''}<p:childTnLst>${f.body(spid, a.dur)}</p:childTnLst></p:cTn></p:par>`;
  }).join('');
  const media = pl.media.map((m) =>
    `<p:video><p:cMediaNode vol="80000"><p:cTn id="${id++}"${m.loop ? ' repeatCount="indefinite"' : ''} fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn>${tgt(ids[m.name])}</p:cMediaNode></p:video>`).join('');
  const bld = [...new Set(pl.anims.map((a) => a.name))].filter((n) => kinds[n] === 'sp')
    .map((n) => `<p:bldP spid="${ids[n]}" grpId="0"${pl.anims.find((a) => a.name === n).fx === 'letters' ? '' : ' animBg="1"'}/>`).join('');
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>` +
    `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>` +
    `<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>` +
    `<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par>` +
    `</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn>` +
    `<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>` +
    `<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>` +
    `${media}</p:childTnLst></p:cTn></p:par></p:tnLst>${bld ? `<p:bldLst>${bld}</p:bldLst>` : ''}</p:timing>`;
}

const buf = await pres.write({ outputType: 'nodebuffer' });
const zip = await JSZip.loadAsync(buf);
for (let i = 0; i < plan.length; i++) {
  const f = `ppt/slides/slide${i + 1}.xml`, rf = `ppt/slides/_rels/slide${i + 1}.xml.rels`;
  let xml = await zip.file(f).async('string');
  // 对象 id 重新编号，避免 pptxgenjs 视频 id 与其他对象冲突
  let nid = 2;
  xml = xml.replace(/<p:cNvPr id="\d+"/g, () => `<p:cNvPr id="${nid++}"`);
  // 去掉视频的“点击播放/暂停”，放映时点击画面直接翻页
  xml = xml.replace(/<a:hlinkClick r:id="" action="ppaction:\/\/media"\/>/g, '');
  const ids = {}, kinds = {};
  for (const m of xml.matchAll(/<p:(sp|pic|cxnSp)>\s*<p:nv\w+>\s*<p:cNvPr id="(\d+)" name="([^"]*)"/g)) { ids[m[3]] = m[2]; kinds[m[3]] = m[1]; }
  xml = xml.replace('</p:clrMapOvr>', '</p:clrMapOvr>' + transitionXml(plan[i].transition) + timingXml(plan[i], ids, kinds));
  zip.file(f, xml);
  // 视频封面帧：把占位 PNG 换成真实的第一帧（JPEG，体积小）
  if (plan[i].covers.length) {
    let rels = await zip.file(rf).async('string');
    const pngs = [...rels.matchAll(/Id="rId(\d+)"[^>]*Target="\.\.\/media\/(image-[\d-]+)\.png"/g)].sort((a, b) => a[1] - b[1]);
    if (pngs.length !== plan[i].covers.length) throw new Error(`第 ${i + 1} 页封面数量不符`);
    pngs.forEach(([, , base], k) => {
      zip.remove(`ppt/media/${base}.png`);
      zip.file(`ppt/media/${base}.jpg`, fs.readFileSync(plan[i].covers[k]));
      rels = rels.replace(`../media/${base}.png`, `../media/${base}.jpg`);
    });
    zip.file(rf, rels);
  }
}
// 放映时不显示视频播放控制条（幻灯片放映 → 设置 → 显示媒体控件：关）
const P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main';
zip.file('ppt/presProps.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:showPr showNarration="1"><p:present/><p:sldAll/><p:penClr><a:prstClr val="red"/></p:penClr><p:extLst><p:ext uri="{2FDB2607-1784-4EEB-B798-7EB5836EED8A}"><p14:showMediaCtrls xmlns:p14="${P14}" val="0"/></p:ext></p:extLst></p:showPr></p:presentationPr>`);
let ct = await zip.file('[Content_Types].xml').async('string');
if (!/Extension="jpg"/i.test(ct)) ct = ct.replace('<Default ', '<Default Extension="jpg" ContentType="image/jpeg"/><Default ');
zip.file('[Content_Types].xml', ct);
// 视频与图片不压缩、直接存放（与 PowerPoint 自身保存方式一致）：放映时可直接读取，避免每次翻页先解压整段视频
for (const name of Object.keys(zip.files)) {
  if (/^ppt\/media\//.test(name) && !zip.files[name].dir) zip.file(name, await zip.file(name).async('nodebuffer'), { compression: 'STORE' });
}
fs.writeFileSync(OUT, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('ok', OUT, (fs.statSync(OUT).size / 1e6).toFixed(1) + 'MB');
