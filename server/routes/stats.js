/**
 * 生活热力格 API — 站内活动按日聚合（GitHub contributions 风格）
 * 数据源：影视看完(watchedAt) · 待办完成(done 条目的时间戳) · 阅读(lastReadAt)
 * GET /api/stats/heatmap → { days: [{date, count, parts}], total, best }
 */
import { Router } from 'express'
import { collection } from '../db.js'

const router = Router()

/** 时间戳前 10 位统一归日（兼容 ISO 与 'YYYY-MM-DD HH:mm:ss' 两种本地格式） */
const dayOf = (ts) => String(ts || '').slice(0, 10)

router.get('/heatmap', (req, res) => {
  const DAYS = 371
  const map = new Map() // date → { count, parts: { movie, todo, book } }
  const bump = (ts, part) => {
    const d = dayOf(ts)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return
    const cur = map.get(d) || { count: 0, parts: { movie: 0, todo: 0, book: 0 } }
    if (Date.now() - new Date(d + 'T00:00:00Z').getTime() > DAYS * 86400_000 + 86400_000) return
    cur.count++
    cur.parts[part]++
    map.set(d, cur)
  }

  for (const m of collection('movies').find()) if (m.status === 'done') bump(m.watchedAt || m.updatedAt, 'movie')
  for (const t of collection('todos').find()) if (t.done) bump(t.updatedAt || t.createdAt, 'todo')
  for (const b of collection('books').find()) bump(b.lastReadAt, 'book')

  /* 补齐连续日期轴（今天回溯 371 天，周一对齐由前端处理） */
  const days = []
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - (DAYS - 1))
  let total = 0
  let best = { date: '', count: 0 }
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(start.getTime() + i * 86400_000).toISOString().slice(0, 10)
    const hit = map.get(d) || { count: 0, parts: { movie: 0, todo: 0, book: 0 } }
    total += hit.count
    if (hit.count > best.count) best = { date: d, count: hit.count }
    days.push({ date: d, ...hit })
  }
  res.json({ days, total, best })
})

export default router
