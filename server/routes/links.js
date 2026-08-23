/**
 * 导航链接 API — CRUD + 存活检测（哨兵定时巡检在 scheduler.js）
 * 字段: { id, title, url, icon(emoji), category, note, alive: up|down|unknown, lastCheck }
 */
import { Router } from 'express'
import { collection } from '../db.js'

const router = Router()
const links = () => collection('links')

const URL_RE = /^https?:\/\/.+\..+/

/** 探测单个 URL 存活（3s 超时，2xx/3xx 算活） */
async function probe(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'Mozilla/5.0 LifeOS-Sentinel/5.0' },
    })
    return res.status < 400 ? 'up' : 'down'
  } catch {
    return 'down'
  }
}

router.get('/', (req, res) => {
  res.json(links().find({}, { sort: { category: 1, createdAt: 1 } }))
})

router.post('/', (req, res) => {
  const { title, url, icon = '🔗', category = '工具', note = '', alias = '' } = req.body
  if (!String(title || '').trim()) return res.status(400).json({ error: '名称不能为空' })
  if (!URL_RE.test(String(url || ''))) return res.status(400).json({ error: 'URL 格式不正确' })
  const link = links().insert({ title: String(title).trim(), url: url.trim(), icon, category, note, alias: String(alias || ''), alive: 'unknown', lastCheck: '' })
  res.status(201).json(link)
})

router.put('/:id', (req, res) => {
  const patch = { ...req.body }
  delete patch.id
  delete patch.createdAt
  if (patch.url && !URL_RE.test(patch.url)) return res.status(400).json({ error: 'URL 格式不正确' })
  const updated = links().updateOne(req.params.id, patch)
  if (!updated) return res.status(404).json({ error: '链接不存在' })
  res.json(updated)
})

router.delete('/:id', (req, res) => {
  const removed = links().remove({ id: Number(req.params.id) })
  if (!removed) return res.status(404).json({ error: '链接不存在' })
  res.json({ removed })
})

/** 手动全量巡检（哨兵定时任务之外，前端也可主动触发） */
router.post('/check', async (req, res) => {
  const all = links().find()
  const results = await Promise.all(
    all.map(async (l) => {
      const alive = await probe(l.url)
      links().updateOne(l.id, { alive, lastCheck: new Date().toISOString() })
      return { id: l.id, alive }
    }),
  )
  res.json(results)
})

/** 节流版：只巡检状态为 unknown 或超过 6 小时未检的 */
export async function sentinelSweep() {
  const threshold = Date.now() - 6 * 3600 * 1000
  const stale = links().find().filter((l) => l.alive === 'unknown' || !l.lastCheck || new Date(l.lastCheck).getTime() < threshold)
  await Promise.all(
    stale.map(async (l) => {
      const alive = await probe(l.url)
      links().updateOne(l.id, { alive, lastCheck: new Date().toISOString() })
    }),
  )
  return stale.length
}

export default router
