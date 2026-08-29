/**
 * Life OS 后端入口 — Express 单端口统一托管
 *
 * 生产模式：npm run build 后 npm start，3000 端口同时提供 API 与静态页面
 * 开发模式：npm run dev（本文件 :3000 + Vite :5173 代理 /api）
 */
import 'dotenv/config'
import express from 'express'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initProxy, smartFetch } from './utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/* ---- 代理接线：外部请求代理优先、失败自动直连（大陆本机开发用；生产留空直连） ---- */
await initProxy(process.env.HTTPS_PROXY || '')

const app = express()
app.use(compression()) // gzip：JS/CSS/JSON 传输体积约省 70%
app.use(cookieParser())
app.use(express.json({ limit: '8mb' }))
app.disable('x-powered-by')

/* ---- 免鉴权端点（存活监控 + 登录） ---- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()), now: new Date().toISOString() })
})
const { default: authRouter, authMiddleware } = await import('./routes/auth.js')
app.use('/api/auth', authRouter)

/* ---- 鉴权闸门之后的业务路由（.env 未设 ACCESS_CODE 时直接放行） ---- */
app.use('/api', authMiddleware)

const modules = {
  weather: (await import('./routes/weather.js')).default,
  movies: (await import('./routes/movies.js')).default,
  trakt: (await import('./routes/trakt.js')).default,
  steam: (await import('./routes/steam.js')).default,
  games: (await import('./routes/games.js')).default,
  todos: (await import('./routes/todos.js')).default,
  events: (await import('./routes/events.js')).default,
  links: (await import('./routes/links.js')).default,
  github: (await import('./routes/github.js')).default,
  reader: (await import('./routes/reader.js')).default,
  stats: (await import('./routes/stats.js')).default,
}
for (const [name, router] of Object.entries(modules)) {
  app.use(`/api/${name}`, router)
}

/* ---- 图片代理：海报/封面统一走后端，避免前端直连被墙，带长缓存 ---- */
const IMG_HOST_ALLOWLIST = new Set([
  'image.tmdb.org',
  'walter.trakt.tv',
  'cdn.akamai.steamstatic.com',
  'shared.akamai.steamstatic.com',
  'community.akamai.steamstatic.com',
  'avatars.akamai.steamstatic.com',
  'community.cloudflare.steamstatic.com',
  'avatars.cloudflare.steamstatic.com',
  'avatars.steamstatic.com',
  'avatars.githubusercontent.com',
])
app.get('/api/proxy/image', async (req, res) => {
  try {
    const url = String(req.query.url || '')
    const host = new URL(url).host
    if (!IMG_HOST_ALLOWLIST.has(host)) {
      return res.status(403).json({ error: 'host not allowed' })
    }
    const upstream = await smartFetch(url, { timeout: 15000 })
    if (!upstream.ok) return res.status(502).json({ error: `upstream ${upstream.status}` })
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=604800')
    res.send(buf)
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

/* ---- 导航书签真图标：抓目标站 favicon（内存缓存 7 天），失败 404 由前端回退 emoji ---- */
const FAVICON_CACHE = new Map()
app.get('/api/proxy/favicon', async (req, res) => {
  try {
    const domain = String(req.query.d || '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase()
    if (!/^[\w.-]+\.[a-z]{2,}$/i.test(domain)) return res.status(400).end()
    const hit = FAVICON_CACHE.get(domain)
    if (hit && Date.now() - hit.at < 7 * 86400_000) {
      res.set('Content-Type', hit.type)
      res.set('Cache-Control', 'public, max-age=604800')
      return res.send(hit.buf)
    }
    const upstream = await smartFetch(`https://${domain}/favicon.ico`, { timeout: 6000 })
    if (!upstream.ok) return res.status(404).end()
    const buf = Buffer.from(await upstream.arrayBuffer())
    if (!buf.length || buf.length > 300_000) return res.status(404).end()
    const type = upstream.headers.get('content-type') || 'image/x-icon'
    FAVICON_CACHE.set(domain, { buf, type, at: Date.now() })
    res.set('Content-Type', type)
    res.set('Cache-Control', 'public, max-age=604800')
    res.send(buf)
  } catch {
    res.status(404).end()
  }
})

/* ---- 静态托管 + SPA 兜底 ---- */
const DIST = path.join(__dirname, '..', 'dist')
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST))
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')))
} else {
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.status(200).send(
      `<!DOCTYPE html><meta charset="utf-8"><body style="background:#0a0b10;color:#e8eaf2;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">` +
        `<div style="text-align:center"><h2>⚡ Life OS API 服务运行中</h2>` +
        `<p>前端尚未构建。开发模式请访问 <a style="color:#a855f7" href="http://localhost:5173">http://localhost:5173</a></p>` +
        `<p>生产模式请先执行 <code style="background:#1a1b26;padding:2px 6px;border-radius:4px">npm run build</code></p></div></body>`,
    )
  })
}

/* ---- 全局错误处理：任何路由抛错都返回 JSON，进程不崩 ---- */
app.use((err, req, res, next) => {
  console.error(`[api] ${req.method} ${req.path} 错误:`, err.message)
  if (res.headersSent) return next(err)
  res.status(500).json({ error: err.message || 'internal error' })
})

const PORT = Number(process.env.PORT) || 3000
const server = app.listen(PORT, () => {
  console.log(`[boot] Life OS 后端已启动 → http://localhost:${PORT}`)
})

/* ---- 定时任务（可选加载，失败不影响服务） ---- */
try {
  const { startScheduler } = await import('./scheduler.js')
  startScheduler()
} catch (err) {
  console.warn('[scheduler] 定时任务启动失败（不影响服务）:', err.message)
}

export default server
