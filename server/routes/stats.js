/**
 * 生活热力格 API — 站内活动按日聚合（GitHub contributions 风格）
 * 数据源：影视看完(watchedAt) · 待办完成(done 条目的时间戳) · 阅读(lastReadAt)
 * GET /api/stats/heatmap → { days: [{date, count, parts}], total, best }
 */
import { Router } from 'express'
import { collection } from '../db.js'
import { requireOwner } from './auth.js'

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

/* ---------- 年度 Wrapped：一站式聚合当年生活数据 ---------- */
router.get('/wrapped', (req, res) => {
  const year = String(new Date().getFullYear())
  const inYear = (ts) => dayOf(ts).startsWith(year)

  const movies = collection('movies').find()
  const done = movies.filter((m) => m.status === 'done')
  const yearDone = done.filter((m) => inYear(m.watchedAt || m.updatedAt))

  const months = Array.from({ length: 12 }, () => 0)
  for (const m of yearDone) {
    const mo = Number(dayOf(m.watchedAt || m.updatedAt).slice(5, 7))
    if (mo >= 1 && mo <= 12) months[mo - 1]++
  }
  let peakMonth = 0
  months.forEach((n, i) => { if (n > months[peakMonth]) peakMonth = i })

  const rated = yearDone.filter((m) => m.personalRating > 0).sort((a, b) => b.personalRating - a.personalRating)
  const best = rated[0] || null
  const episodes = yearDone.reduce((n, m) => n + (m.airedEps > 0 ? m.watchedEps || 0 : 0), 0)
  const byType = {}
  for (const m of yearDone) {
    const label = { movie: '电影', tv: '剧集', anime: '动漫', doc: '纪录片' }[m.type] || '其他'
    byType[label] = (byType[label] || 0) + 1
  }

  const games = collection('games').find()
  const gameHours = Math.round(games.reduce((n, g) => n + (g.playtime || 0), 0) / 60)
  const gamePlaying = games.filter((g) => g.status === 'playing').length

  const todosAll = collection('todos').find()
  const todosDone = todosAll.filter((t) => t.done && inYear(t.updatedAt || t.createdAt)).length

  const books = collection('books').find()
  const bookChars = books.reduce((n, b) => n + (b.chars || 0), 0)
  const bookDonePct = Math.round(books.reduce((n, b) => n + (b.pct || 0), 0) / Math.max(1, books.length))

  res.json({
    year,
    movies: { count: yearDone.length, episodes, months, peakMonth: peakMonth + 1, best: best ? { title: best.title, rating: best.personalRating, cover: best.cover } : null, byType },
    games: { total: games.length, hours: gameHours, playing: gamePlaying },
    todos: { done: todosDone, open: todosAll.filter((t) => !t.done).length },
    reading: { books: books.length, chars: bookChars, avgPct: bookDonePct },
    want: movies.length - done.length,
  })
})

/* ---------- 数据导出（站主专属）：全量 JSON 备份下载 ---------- */
router.get('/export', requireOwner, (req, res) => {
  const dump = {}
  for (const key of ['movies', 'todos', 'links', 'games', 'events', 'githubRepos', 'books']) {
    dump[key] = collection(key).find()
  }
  dump.exportedAt = new Date().toISOString()
  res.set('Content-Type', 'application/json; charset=utf-8')
  res.set('Content-Disposition', `attachment; filename="lifeos-backup-${dayOf(new Date().toISOString())}.json"`)
  res.send(JSON.stringify(dump, null, 2))
})

/* ---------- 阅读统计：连续天数 + 月度体量（数据源：reader 进度保存时的阅读日志） ---------- */
router.get('/reading', (req, res) => {
  const log = collection('readingLog').find({}, { sort: { date: 1 } })
  const daySet = new Set(log.map((l) => l.date))
  let streak = 0
  const cursor = new Date()
  if (!daySet.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1)
  while (daySet.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  const month = dayOf(new Date().toISOString()).slice(0, 7)
  const monthLogs = log.filter((l) => l.date.startsWith(month))
  res.json({
    streak,
    daysTotal: daySet.size,
    charsMonth: monthLogs.reduce((n, l) => n + (l.chars || 0), 0),
    daysMonth: monthLogs.length,
  })
})
