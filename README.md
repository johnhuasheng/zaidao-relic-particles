# 载道 · 文物粒子

以数十万粒子重现四件中国国宝：良渚玉琮、后母戊鼎、越王勾践剑、元青花梅瓶。

**在线观看：https://johnhuasheng.github.io/zaidao-relic-particles/**

| 内容 | 说明 |
|---|---|
| [成片视频](载道_文物粒子_分享版.mp4) | 90 秒，1080p，含配乐 |
| [交互式网页演示](https://johnhuasheng.github.io/zaidao-relic-particles/载道_交互演示.html) | 浏览器实时渲染；点击 / 空格 / 方向键翻页，拖动旋转文物，F 全屏 |
| [可编辑 PPT](载道_文物粒子.pptx) | 8 页，文字与动画可编辑，粒子背景为循环视频（PowerPoint 2013+） |

## 文件结构

| 文件 | 作用 |
|---|---|
| `shapes.js` | 程序化生成文物、光河、山河等粒子点云 |
| `particles.js` | 粒子着色器（视频、PPT 素材、网页演示共用） |
| `render.html` + `main.js` | 成片视频的 90 秒时间轴 |
| `render.js` | 无头浏览器逐帧渲染成片 → `out/video_noaudio.mp4` |
| `music.py` | 合成配乐（`--bgm` 为网页演示用的背景音乐） |
| `ppt/clips.html` + `ppt/clips.js` | PPT 用粒子片段的渲染引擎 |
| `render-clips.js` | 渲染 PPT 的循环视频片段 → `ppt/clips/` |
| `build-pptx.js` | 生成可编辑 PPT |
| `ppt/ppt.html` + `ppt/ppt.js` | 交互式网页演示源码 |
| `build-ppt.js` | 把网页演示打包成单个 HTML |

## 本地重新生成

```bash
npm install
node render.js            # 成片视频画面（另需 python music.py 与 ffmpeg 合成音轨）
node render-clips.js      # PPT 粒子片段
node build-pptx.js        # PPT
node build-ppt.js         # 交互式网页演示
```

需要 Node.js、ffmpeg、Python（numpy），以及 Chrome 或 Edge。

> 文物造型为程序化的艺术近似，并非实物扫描数据。
