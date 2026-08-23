/**
 * 游戏 API — 手动游戏 CRUD + Steam 同步数据查询 + 统计/荣誉墙
 * 字段: { id, name, steamAppId, cover, playtime(分钟), playtime2weeks,
 *         achEarned, achTotal, status: playing|done|dropped|want, platform, notes }
 */
import { Router } from 'express'
import { collection } from '../db.js'

const router = Router()
const games = () => collection('games')

const STATUS = new Set(['playing', 'done', 'dropped', 'want'])

router.get('/', (req, res) => {
  const { status, keyword, platform } = req.query
  const query = {}
  if (status && STATUS.has(status)) query.status = status
  if (platform) query.platform = platform
  if (keyword) query.name = { $like: keyword }
  res.json(games().find(query, { sort: { playtime: -1 } }))
})

router.get('/stats', (req, res) => {
  const all = games().find()
  const totalMinutes = all.reduce((s, g) => s + (Number(g.playtime) || 0), 0)
  const perfect = all.filter((g) => g.achTotal > 0 && g.achEarned === g.achTotal)
  res.json({
    total: all.length,
    steamCount: all.filter((g) => g.steamAppId).length,
    totalHours: Math.round(totalMinutes / 60),
    perfectCount: perfect.length,
    statusDist: {
      playing: all.filter((g) => g.status === 'playing').length,
      done: all.filter((g) => g.status === 'done').length,
      dropped: all.filter((g) => g.status === 'dropped').length,
      want: all.filter((g) => g.status === 'want').length,
    },
  })
})

/** 🏆 100% 满成就荣誉墙 —— 过滤条件焊死 earned === total（v2 的教训：放宽就会塞爆容器） */
router.get('/honors', (req, res) => {
  const perfect = games().find().filter((g) => g.achTotal > 0 && g.achEarned === g.achTotal)
  perfect.sort((a, b) => (b.playtime || 0) - (a.playtime || 0))
  res.json(perfect)
})

router.post('/', (req, res) => {
  const { name, platform = 'pc', status = 'want', notes = '', cover = '' } = req.body
  if (!String(name || '').trim()) return res.status(400).json({ error: '游戏名不能为空' })
  const game = games().insert({ name: String(name).trim(), steamAppId: 0, cover, playtime: 0, playtime2weeks: 0, achEarned: 0, achTotal: 0, platform, status, notes })
  res.status(201).json(game)
})

router.put('/:id', (req, res) => {
  const patch = { ...req.body }
  delete patch.id
  delete patch.createdAt
  delete patch.steamAppId // Steam 归属不可手动改，防止破坏去重键
  const updated = games().updateOne(req.params.id, patch)
  if (!updated) return res.status(404).json({ error: '游戏不存在' })
  res.json(updated)
})

router.delete('/:id', (req, res) => {
  const game = games().findOne({ id: Number(req.params.id) })
  if (!game) return res.status(404).json({ error: '游戏不存在' })
  games().remove({ id: game.id })
  res.json({ removed: 1 })
})

export default router
