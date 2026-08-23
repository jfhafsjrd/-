/**
 * 一次性迁移脚本：v1 dashboard-final 数据 → Life OS v5 格式
 * 用法: node scripts/migrate.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SRC = 'C:/Users/22164/WorkBuddy/2026-06-10-00-04-10/dashboard-final'

const old = JSON.parse(fs.readFileSync(path.join(SRC, 'data.json'), 'utf-8'))
const oldSteam = JSON.parse(fs.readFileSync(path.join(SRC, 'steam_cache.json'), 'utf-8'))

const now = new Date().toISOString()

/* ---- movies: v1 rating 为 5 星制，换算回 10 分制；cover 提取为 path ---- */
const movies = (old.movies || []).map((m) => {
  const coverPath = String(m.cover || '').match(/\/w500\/(.+\.jpg)$/)?.[1] || ''
  return {
    id: m.id,
    tmdbId: 0,
    title: m.title,
    type: ['movie', 'tv', 'anime', 'doc'].includes(m.type) ? m.type : 'movie',
    cover: coverPath,
    backdrop: '',
    tmdbRating: Math.round((m.rating || 0) * 2 * 10) / 10,
    year: String(m.watched_at || m.created_at || '').slice(0, 4),
    overview: '',
    status: m.status === 'done' ? 'done' : 'want',
    personalRating: 0,
    comment: m.personal_review || m.comment || '',
    reservationTime: '',
    watchedAt: m.watched_at || '',
    createdAt: m.created_at || now,
  }
})

/* ---- todos ---- */
const todos = (old.todos || []).map((t) => ({
  id: t.id,
  title: t.title,
  note: t.notes || '',
  category: ['work', 'study', 'life', 'health'].includes(t.category) ? t.category : 'life',
  priority: 0,
  dueDate: t.due_date || '',
  done: t.status === 1,
  recurring: ['none', 'daily', 'weekly'].includes(t.recurring) ? t.recurring : 'none',
  createdAt: t.created_at || now,
}))

/* ---- links ---- */
const links = (old.links || []).map((l) => ({
  id: l.id,
  title: l.title,
  url: l.url,
  icon: l.icon || '🔗',
  category: l.category || '工具',
  note: l.note || '',
  alive: l.alive ? 'up' : 'unknown',
  lastCheck: '',
  createdAt: l.created_at || now,
}))

/* ---- steam games: 152 款游戏主数据入 games 集合（id 从 1 开始重排） ---- */
const steamGames = Object.entries(oldSteam.games || {})
let gid = 0
const games = steamGames.map(([appId, g]) => ({
  id: ++gid,
  steamAppId: Number(appId),
  name: g.name,
  cover: g.cover,
  playtime: g.playtime || 0,
  playtime2weeks: g.playtime2weeks || 0,
  achEarned: g.unlocked || 0,
  achTotal: g.total || 0,
  status: ['playing', 'done', 'dropped', 'want'].includes(g.status) ? g.status : 'want',
  platform: 'steam',
  notes: '',
  createdAt: now,
}))

/* ---- 新 steam_cache: 只保留成就摘要，明细按需再拉 ---- */
const achievements = {}
for (const [appId, g] of steamGames) {
  achievements[appId] = { earned: g.unlocked || 0, total: g.total || 0 }
}
const newSteamCache = { lastUpdate: oldSteam.lastUpdate || 0, profile: null, achievements }

/* ---- 写出 ---- */
const dataFile = path.join(ROOT, 'server', 'data.json')
const steamFile = path.join(ROOT, 'server', 'steam_cache.json')
const dump = { movies, todos, links, games, events: [], githubRepos: [] }
fs.writeFileSync(dataFile, JSON.stringify(dump, null, 2), 'utf-8')
fs.writeFileSync(steamFile, JSON.stringify(newSteamCache), 'utf-8')

console.log(`迁移完成 → server/data.json`)
console.log(`  movies: ${movies.length} 条, todos: ${todos.length} 条, links: ${links.length} 条`)
console.log(`  games: ${games.length} 条（来自 Steam 缓存）`)
console.log(`  steam_cache.json: ${Object.keys(achievements).length} 款成就摘要`)
const perfect = games.filter((g) => g.achTotal > 0 && g.achEarned === g.achTotal)
console.log(`  满成就游戏: ${perfect.length} 款 → ${perfect.slice(0, 5).map((g) => g.name).join('、')}${perfect.length > 5 ? ' 等' : ''}`)
