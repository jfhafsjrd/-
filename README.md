# ⚡ Life OS · 探索者仪表盘

暗黑极客风的个人数字生活操作系统 —— 影视、游戏、日历待办、GitHub 追更、导航书签，一个入口全搞定。

![tech](https://img.shields.io/badge/Vue-3-42b883) ![tech](https://img.shields.io/badge/Vite-5-646cff) ![tech](https://img.shields.io/badge/Express-4-000) ![deps](https://img.shields.io/badge/运行时CDN依赖-0-success)

## 功能总览

| 模块 | 功能 |
|---|---|
| 🏠 首页 | 问候语、天气卡（wttr.in 免密钥）、各模块统计、今日待办、近期日程、快捷入口 |
| 🎬 影视 | TMDB 全品类中文混搜、无缝滚动趋势海报墙、待看/已看完双池、`TMDB 7.8 \| 个人 8.5` 数字评分、预约看剧自动上日历、**Trakt.tv 官方 API 同步**（设备码授权 · 每日自动同步 · TMDB 中文反查 · 追剧播出日历联动） |
| 🎮 游戏 | Steam 静默同步（每 2 小时 + 250ms 限流）、🏆 100% 满成就荣誉墙（流光边框 + 3D 倾斜）、成就明细弹窗（中文名）、手动游戏管理 |
| 📅 日历待办 | 自绘月/周日历、四色事件来源（待办紫 / 影视蓝 / 日程绿 / Trakt 追剧金）、待办截止自动上日历、分类快速添加 |
| 🐙 GitHub | 仓库追踪、最新 + 历史 Release、多平台安装包直连下载（.ipa/.apk/.exe/.dmg…）、🎲 极客雷达随机推荐（大白话中文简介） |
| 📖 阅读 | TXT / EPUB 小说 + CBZ/ZIP 漫画导入（EPUB 元数据书名/作者/封面/nav·NCX 目录解析，TXT GBK/UTF-8 自动识别）、章节目录 + 全文搜索、书签、自动翻页、中文排版缩进、电子书式分栏翻页、字号/行距/字体/纸张·护眼·夜间主题、漫画单页/双页/条漫三模式 + RTL 日漫方向、进度自动记忆 |
| 🔗 导航 | 分类网格书签、别名拼音搜索、哨兵存活检测（失效标红） |

**跨模块联动**：影视预约 → 日历事件；待办截止 → 日历事件；Trakt 追剧播出表 → 日历事件；首页聚合一切。

**安全**：`.env` 设 `ACCESS_CODE` 即启用全站访问码登录（令牌 HMAC 派生、90 天免输、改码全员下线）。

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 开发模式：后端 :3000 + 前端热更新 :5173
npm run build      # 生产构建 → dist/
npm start          # 生产模式：单端口 :3000 托管全部
```

大陆本机开发：在 `.env` 里设 `HTTPS_PROXY=http://127.0.0.1:7897`（改成你的代理端口）。后端对海外 API **代理优先、失败自动直连、带 60 秒熔断**——代理挂了 GitHub/Steam/天气依然直连可用，仅 TMDB API 会优雅降级（本地库和已缓存海报不受影响）。

部署到海外服务器时 `HTTPS_PROXY` 留空即可，一切直连。

## 环境变量（.env）

复制 `.env.example` 为 `.env` 按需填写，**全部可留空，服务不会崩**：

| 变量 | 说明 |
|---|---|
| `ACCESS_CODE` | 全站访问码（留空不启用；生产强烈建议设置） |
| `TMDB_API_KEY` | [themoviedb.org](https://www.themoviedb.org/settings/api) 免费申请 |
| `STEAM_API_KEY` / `STEAM_ID` | [Steam Web API](https://steamcommunity.com/dev/apikey) + 你的 SteamID64 |
| `GITHUB_TOKEN` | 可选，[生成](https://github.com/settings/tokens/new?scopes=public_repo)后限额 60→5000 次/小时 |
| `TRAKT_CLIENT_ID` / `TRAKT_CLIENT_SECRET` | 可选，Trakt 同步用，见下方教程 |
| `WEATHER_CITY` | 天气城市英文名，默认 Shenzhen |
| `HTTPS_PROXY` | 大陆本机开发填本地代理；海外部署留空 |

### Trakt.tv 同步（VIP 官方 API 通道）

Trakt 把 API 应用创建设为 VIP 专属。有 VIP 后两步开通：

1. [trakt.tv/oauth/applications](https://trakt.tv/oauth/applications) 创建应用（Name 随意，Redirect URI 填 `http://127.0.0.1`），把 Client ID/Secret 填进 `.env`
2. 站内影视页 → 「Trakt 同步」→ 设备码授权一次（永久有效，令牌自动续期）

开通后：**每日 07:17 自动同步**待看/已看/评分，新增条目自动 TMDB 中文反查标题海报，
日历页金色「Trakt 追剧」事件显示追的剧哪天更新。

**免 VIP 备选**：zip 导出同步 + 网页抓取导入仍保留 —— 打开 [trakt.tv/users/me/settings/data](https://trakt.tv/users/me/settings/data) 导出 zip，影视页「📥 导入 Trakt 记录」拖进去即可，三种方式并存。

## 部署（阿里云马来西亚 / 任意海外服务器）

首次部署：

```bash
# 服务器上（Node ≥ 20）
git clone <你的仓库> && cd life-os
npm install --omit=dev && npm run build
pm2 start server/app.js --name life-os && pm2 save  # pm2 开机自启见 pm2 startup
```

日常更新（本地一条命令：构建 → 上传 → 装依赖 → pm2 重启 → 健康检查）：

```bash
npm run deploy        # scripts/deploy.sh，只覆盖代码不动服务器 .env / data.json
```

线上（life.xuuhc.cc.cd / cinema.xuuhc.cc.cd）已配置：Let's Encrypt 双域证书（acme.sh 自动续期）、
pm2 守护 + systemd 开机自启、每日 04:30 自动备份（/www/backup/sites，保留 7 天）。
记得在安全组放行 80/443 端口。

> 单端口铁律：生产只跑 `npm start`，不要用 `npm run dev`（那是开发用的双进程）。Express 是唯一入口：`/api/*` 走接口，其余全部回落到 SPA 页面。

## 如何添加一个新模块

1. `src/components/<模块名>/` 下新建 `XxxView.vue`
2. `src/router/modules.js` 注册表加一行：

```js
{ path: '/music', name: 'music', label: '音乐', icon: '💿',
  view: () => import('@/components/music/MusicView.vue'), desc: '一句话描述' }
```

3.（需要数据时）`server/routes/music.js` 写路由，在 `server/app.js` 的 `modules` 表加一行 `music: (await import('./routes/music.js')).default`

侧边栏、移动端菜单、路由、页面标题全部由注册表自动驱动，不用改任何其他文件。

## 数据与备份

- `server/data.json` — 全部业务数据（防抖 1.5s 原子落盘，退出兜底）
- `server/steam_cache.json` — Steam 成就明细与档案缓存

备份这两个文件即备份全部。数据层为自研 JSON 集合存储（Mongo 风格 `$gt/$like` 查询），无外部数据库依赖。

## 目录结构

```
life-os/
├── server/               # 后端
│   ├── app.js            # Express 单端口入口（静态托管 + SPA 兜底 + 图片代理）
│   ├── db.js             # JSON 集合存储（$gt/$lt/$like 操作符 + 原子落盘）
│   ├── scheduler.js      # node-cron：Steam 每 2h · 链接哨兵每 30min
│   ├── utils.js          # 智能外部请求（代理优先/直连回退/熔断）
│   └── routes/           # movies · trakt · steam · games · todos · events · links · github · weather
└── src/                  # 前端（Vue 3 + Pinia 风格组合式 API）
    ├── router/modules.js # ★ 模块注册表（扩展入口）
    ├── api/index.js      # 全站唯一请求出口（字段契约与后端一字不差）
    ├── styles/           # 设计系统：变量 / 基础 / 组件库（霓虹紫 + 毛玻璃）
    ├── composables/      # useToast · useConfetti
    ├── components/
    │   ├── layout/       # 侧边栏 · 移动抽屉 · Canvas 低多边形背景
    │   ├── common/       # Modal · StateShell三态壳 · CountUp · IconSvg · Toast
    │   └── <模块>/       # 每模块一个目录
    └── utils/format.js   # 日期（无时区坑）/ 时长 / 数字格式化
```
