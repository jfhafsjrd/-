# Life OS v5 — 实施计划（权限恢复重发，内容与之前批准的版本一致）

## 已完成进度
- Phase 0 ✅：脚手架 + 依赖安装 + API 可达性实测（本机 7897 代理，TMDB/GitHub/Steam/天气全可达，Node 24 原生 fetch 代理方案验证通过）
- Phase 1 部分完成 ✅：package.json / .env / .env.example / .gitignore / vite.config.js / index.html / favicon.svg / server/db.js（全新 Mongo 风格数据层）/ server/app.js（Express 入口）/ server/routes/todos.js / server/routes/events.js

## 剩余工作
1. **后端剩余路由**：links.js（CRUD+存活检测）、games.js（游戏库+荣誉墙）、weather.js（wttr.in+按城市缓存）、movies.js（TMDB 搜索/趋势/CRUD/预约联动）、steam.js（静默同步+成就缓存）、github.js（追踪+Release 解析+极客雷达）、scheduler.js（node-cron 定时任务）
2. **数据迁移**：从 v1 项目迁移 movies(7)/todos(3)/links(6) + steam_cache.json(152 款游戏真实数据)
3. **前端全套**：设计系统 CSS（暗黑霓虹紫+毛玻璃+低多边形 Canvas 背景）、布局（侧边栏+移动头）、模块注册表路由、API 客户端、公共组件（玻璃卡/霓虹按钮/Modal/骨架屏/Toast/三态壳）、六大模块视图（首页聚合、影视海报墙+双池、游戏荣誉墙、日历+待办、GitHub 追更+雷达、导航网格）
4. **浏览器端到端实测**：6 模块逐个点击验证 + 控制台零报错 + 移动端视口检查
5. **README**：开发/构建/马来西亚部署步骤、如何添加新模块、环境变量说明

## 关键技术决策（已定）
- Vue 3 + Vite + Pinia + Vue Router 前端；Express 单端口 3000 后端；零 CDN 运行时依赖
- 全链路 camelCase 契约；JSON 集合存储（$gt/$like 操作符）；自绘 CSS Grid 日历；待办并入日历模块；初版纯暗色
- TMDB 图片走后端 /api/proxy/image 代理 + 渐变占位兜底；Steam 成就数据独立缓存文件

## 质量保障
- 每个模块完成后浏览器实测（杜绝"后端存在前端没 UI"的假完成）
- 全局错误处理 + 外部 API 超时降级 + .env 缺失不崩溃
- 零 alert/confirm、零内联事件、零 !important