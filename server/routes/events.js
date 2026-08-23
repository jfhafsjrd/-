/**
 * 日历事件 API — 支持日期范围过滤（v1 的 db 层完全忽略范围过滤，这次做对）
 * 字段: { id, title, date: 'YYYY-MM-DD', time: 'HH:mm'|'', source: manual|todo|movie, refId, note }
 */
import { Router } from 'express'
import { collection } from '../db.js'

const router = Router()
const events = () => collection('events')

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

router.get('/', (req, res) => {
  const { from, to, source } = req.query
  const query = {}
  if (from && DATE_RE.test(from)) query.date = { ...(query.date || {}), $gte: from }
  if (to && DATE_RE.test(to)) query.date = { ...(query.date || {}), $lte: to }
  if (source) query.source = source
  res.json(events().find(query, { sort: { date: 1, time: 1 } }))
})

router.post('/', (req, res) => {
  const { title, date, time = '', note = '' } = req.body
  if (!String(title || '').trim()) return res.status(400).json({ error: '标题不能为空' })
  if (!DATE_RE.test(String(date || ''))) return res.status(400).json({ error: '日期格式应为 YYYY-MM-DD' })
  const ev = events().insert({ title: String(title).trim(), date, time, source: 'manual', refId: 0, note })
  res.status(201).json(ev)
})

router.put('/:id', (req, res) => {
  const patch = { ...req.body }
  delete patch.id
  delete patch.createdAt
  delete patch.source
  delete patch.refId
  const updated = events().updateOne(req.params.id, patch)
  if (!updated) return res.status(404).json({ error: '事件不存在' })
  res.json(updated)
})

router.delete('/:id', (req, res) => {
  const removed = events().remove({ id: Number(req.params.id) })
  if (!removed) return res.status(404).json({ error: '事件不存在' })
  res.json({ removed })
})

export default router
