# ⚡ Life OS · 探索者仪表盘

暗黑极客风的个人数字生活操作系统 —— 影视、游戏、日历待办、GitHub 追更、导航书签，一个入口全搞定。

![tech](https://img.shields.io/badge/Vue-3-42b883) ![tech](https://img.shields.io/badge/Vite-5-646cff) ![tech](https://img.shields.io/badge/Express-4-000) ![deps](https://img.shields.io/badge/运行时CDN依赖-0-success)

## 功能总览

| 模块 | 功能 |
|---|---|
| 🏠 首页 | 问候语、天气卡（wttr.in 免密钥）、各模块统计、今日待办、近期日程、快捷入口 |
| 🎬 影视 | TMDB 全品类中文混搜、无缝滚动趋势海报墙、待看/已看完双池、`TMDB 7.8 \| 个人 8.5` 数字评分、预约看剧自动上日历、**Trakt.tv 一键同步观看记录** |
| 🎮 游戏 | Steam 静默同步（每 2 小时 + 250ms 限流）、🏆 100% 满成就荣誉墙（流光边框 + 3D 倾斜）、成就明细弹窗（中文名）、手动游戏管理 |
| 📅 日历待办 | 自绘月/周日历、三色事件来源（待办紫 / 影视蓝 / 日程绿）、待办截止自动上日历、分类快速添加 |
| 🐙 GitHub | 仓库追踪、最新 + 历史 Release、多平台安装包直连下载（.ipa/.apk/.exe/.dmg…）、🎲 极客雷达随机推荐（大白话中文简介） |
| 🔗 导航 | 分类网格书签、别名拼音搜索、哨兵存活检测（失效标红） |

**跨模块联动**：影视预约 → 日历事件；待办截止 → 日历事件；首页聚合一切。

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
| `TMDB_API_KEY` | [themoviedb.org](https://www.themoviedb.org/settings/api) 免费申请 |
| `STEAM_API_KEY` / `STEAM_ID` | [Steam Web API](https://steamcommunity.com/dev/apikey) + 你的 SteamID64 |
| `GITHUB_TOKEN` | 可选，[生成](https://github.com/settings/tokens/new?scopes=public_repo)后限额 60→5000 次/小时 |
| `TRAKT_CLIENT_ID` / `TRAKT_CLIENT_SECRET` | 可选，Trakt 同步用，见下方教程 |
| `WEATHER_CITY` | 天气城市英文名，默认 Shenzhen |
| `HTTPS_PROXY` | 大陆本机开发填本地代理；海外部署留空 |

### Trakt.tv 同步（可选）

Trakt 已把 API 应用创建设为 VIP 专属，本项目的免费方案是 **zip 导出同步**：

1. 打开 [trakt.tv/users/me/settings/data](https://trakt.tv/users/me/settings/data) → 导出数据（免费账号可用）得到 zip
2. Life OS 影视页 → 「📥 导入 Trakt 记录」→ 把 zip 拖进上传框
3. 自动解析出待看/已看/评分/观看日期，通过 TMDB ID 精确反查中文标题与海报后入库

**持续同步**：以后每次想同步，重复"导出 zip → 拖进来"两个动作即可（约 30 秒），已在库中的条目自动跳过、缺海报的自动补全，不会重复。

弹窗里还提供「方式二 · 网页抓取」：在 Trakt 的历史/待看页面按 F12 运行内置脚本，复制结果粘贴导入（适合不方便导出的场景）。

若你拥有 VIP 并配置了 `TRAKT_CLIENT_ID/SECRET`（[创建应用](https://trakt.tv/oauth/applications)），页头会出现「Trakt 同步」按钮，走官方 API 一键授权同步 —— 三种方式并存，按需选用。

## 部署（阿里云马来西亚 / 任意海外服务器）

```bash
# 服务器上（Node ≥ 20）
git clone <你的仓库> && cd life-os
npm install --omit=dev
npm run build
npm start                  # http://服务器IP:3000

# PM2 守护（推荐）
pm2 start server/app.js --name life-os && pm2 save
```

记得在安全组放行 3000 端口。海外节点直连 TMDB/GitHub/Steam，全部功能满血。

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
