/**
 * 待办 API — 含「截止日自动上日历」联动
 * 字段契约（全链路 camelCase）:
 *   { id, title, note, category: work|study|life|health, priority: 0普通|1重要|2紧急,
 *     dueDate: 'YYYY-MM-DD HH:mm'|'YYYY-MM-DD'|null, done: bool, recurring: none|daily|weekly }
 */
import { Router } from 'express'
import { collection } from '../db.js'

const router = Router()
const todos = () => collection('todos')
const events = () => collection('events')

/** 待办 ↔ 日历事件联动：有截止日就同步一条 source=todo 的事件 */
function syncEvent(todo) {
  const evs = events()
  const existing = evs.findOne({ source: 'todo', refId: todo.id })
  if (!todo.dueDate) {
    if (existing) evs.remove({ id: existing.id })
    return
  }
  const [date, time] = todo.dueDate.split(' ')
  const payload = {
    title: todo.title,
    date,
    time: time && time !== '00:00' ? time : '',
    source: 'todo',
    refId: todo.id,
    note: todo.note || '',
  }
  if (existing) evs.updateOne(existing.id, payload)
  else evs.insert(payload)
}

router.get('/', (req, res) => {
  const { category, done, date } = req.query
  const query = {}
  if (category) query.category = category
  if (done !== undefined && done !== '') query.done = done === '1' || done === 'true'
  if (date) query.dueDate = { $like: date }
  res.json(todos().find(query, { sort: { done: 1, priority: -1, createdAt: -1 } }))
})

router.post('/', (req, res) => {
  const { title, note = '', category = 'life', priority = 0, dueDate = '', recurring = 'none' } = req.body
  if (!String(title || '').trim()) return res.status(400).json({ error: '标题不能为空' })
  const todo = todos().insert({
    title: String(title).trim(),
    note: String(note),
    category,
    priority: Number(priority) || 0,
    dueDate: dueDate || '',
    done: false,
    recurring,
  })
  syncEvent(todo)
  res.status(201).json(todo)
})

router.put('/:id', (req, res) => {
  const patch = { ...req.body }
  delete patch.id
  delete patch.createdAt
  const updated = todos().updateOne(req.params.id, patch)
  if (!updated) return res.status(404).json({ error: '待办不存在' })
  syncEvent(updated)
  res.json(updated)
})

router.put('/:id/toggle', (req, res) => {
  const todo = todos().findOne({ id: Number(req.params.id) })
  if (!todo) return res.status(404).json({ error: '待办不存在' })
  const updated = todos().updateOne(todo.id, { done: !todo.done })
  syncEvent(updated)

  /* 循环任务：完成时自动生成下一次（daily +1 天 / weekly +7 天） */
  let spawned = null
  if (updated.done && todo.recurring && todo.recurring !== 'none') {
    const step = todo.recurring === 'weekly' ? 7 : 1
    const base = todo.dueDate ? new Date(todo.dueDate.replace(' ', 'T')) : new Date()
    if (!Number.isNaN(base.getTime())) {
      base.setDate(base.getDate() + step)
      const pad = (n) => String(n).padStart(2, '0')
      const nextDue = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}` +
        (todo.dueDate?.includes(' ') ? ' ' + todo.dueDate.split(' ')[1] : '')
      spawned = todos().insert({
        title: todo.title,
        note: todo.note || '',
        category: todo.category || 'life',
        priority: todo.priority || 0,
        dueDate: nextDue,
        recurring: todo.recurring,
      })
      syncEvent(spawned)
    }
  }
  res.json({ ...updated, spawned })
})

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id)
  const removed = todos().remove({ id })
  if (!removed) return res.status(404).json({ error: '待办不存在' })
  events().remove({ source: 'todo', refId: id }) // 清理联动事件（v1 删不掉的老 bug）
  res.json({ removed })
})

export default router
