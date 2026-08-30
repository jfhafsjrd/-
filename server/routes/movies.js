/**
 * 影视 API — TMDB 全品类混搜 + 趋势海报墙 + 本地双池管理 + 预约联动日历
 * 字段契约（camelCase）:
 *   本地库: { id, tmdbId, title, type: movie|tv|anime|doc, cover(path), backdrop(path),
 *            tmdbRating, year, overview, status: want|done, personalRating,
 *            comment, reservationTime: 'YYYY-MM-DD HH:mm'|'', watchedAt }
 *   TMDB 结果: { tmdbId, title, mediaType, poster(path), backdrop(path), tmdbRating,
 *                year, overview, genreIds, typeLabel }
 */
import { Router } from 'express'
import { collection } from '../db.js'
import { fetchJSON } from '../utils.js'
import { pushToTrakt, pushEpisodeHistory, parseProgressMark } from './trakt.js'

const router = Router()
const movies = () => collection('movies')
const events = () => collection('events')

const TMDB_KEY = process.env.TMDB_API_KEY || ''
const TMDB = 'https://api.themoviedb.org/3'
const GENRE_ANIME = 16
const GENRE_DOC = 99

/** genre_ids + media_type → 中文类型标签 */
function typeLabelOf(mediaType, genreIds = []) {
  if (genreIds.includes(GENRE_ANIME)) return '动漫'
  if (genreIds.includes(GENRE_DOC)) return '纪录片'
  return mediaType === 'tv' ? '剧集' : '电影'
}
const typeFromLabel = { 电影: 'movie', 剧集: 'tv', 动漫: 'anime', 纪录片: 'doc' }

/** TMDB 条目 → 统一 camelCase 结构 */
function mapTmdb(r) {
  return {
    tmdbId: r.id,
    title: r.title || r.name || '',
    mediaType: r.media_type || (r.first_air_date ? 'tv' : 'movie'),
    poster: r.poster_path || '',
    backdrop: r.backdrop_path || '',
    tmdbRating: r.vote_average || 0,
    year: String(r.release_date || r.first_air_date || '').slice(0, 4),
    overview: r.overview || '',
    genreIds: r.genre_ids || [],
    typeLabel: typeLabelOf(r.media_type, r.genre_ids),
  }
}

/* ---------- 混合搜索：本地库 + TMDB ---------- */
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (!q) return res.json({ local: [], tmdb: [], tmdbError: '' })
  const local = movies().find({ title: { $like: q } }, { sort: { createdAt: -1 } })

  if (!TMDB_KEY) return res.json({ local, tmdb: [], tmdbError: '未配置 TMDB_API_KEY' })
  try {
    const j = await fetchJSON(
      `${TMDB}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&language=zh-CN&include_adult=false`,
      { timeout: 10000 },
    )
    const tmdb = (j.results || [])
      .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
      .slice(0, 16)
      .map(mapTmdb)
      .filter((r) => r.title && r.poster)
      .filter((r) => !local.some((m) => m.tmdbId === r.tmdbId))
    res.json({ local, tmdb, tmdbError: '' })
  } catch (err) {
    console.warn('[movies] TMDB 搜索失败:', err.message)
    res.json({ local, tmdb: [], tmdbError: err.message })
  }
})

/* ---------- 趋势海报墙：默认随机起点拉 2 页（缓存 5 分钟）；?page=N 分页模式（无限滚动追加，不缓存） ---------- */
let trendingCache = { at: 0, data: null }

router.get('/trending', async (req, res) => {
  const pageParam = Number(req.query.page) || 0
  if (!pageParam && trendingCache.data && Date.now() - trendingCache.at < 5 * 60 * 1000) {
    return res.json(trendingCache.data)
  }
  if (!TMDB_KEY) return res.status(503).json({ error: '未配置 TMDB_API_KEY' })
  const page = pageParam || 1 + Math.floor(Math.random() * 20) // 默认前 20 页随机起点
  if (page > 90) return res.json([]) // TMDB 趋势池边界
  try {
    const [a, b] = await Promise.all([
      fetchJSON(`${TMDB}/trending/all/week?api_key=${TMDB_KEY}&language=zh-CN&page=${page}`, { timeout: 10000 }),
      fetchJSON(`${TMDB}/trending/all/week?api_key=${TMDB_KEY}&language=zh-CN&page=${page + 1}`, { timeout: 10000 }).catch(() => ({ results: [] })),
    ])
    const owned = new Set(movies().find().map((m) => m.tmdbId))
    const seen = new Set()
    const list = [...(a.results || []), ...(b.results || [])]
      .filter((r) => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path && (r.title || r.name))
      .filter((r) => {
        if (seen.has(r.id) || owned.has(r.id)) return false
        seen.add(r.id)
        return true
      })
      .map(mapTmdb)
    if (!pageParam && list.length) trendingCache = { at: Date.now(), data: list }
    res.json(list)
  } catch (err) {
    console.warn('[movies] TMDB 趋势失败:', err.message)
    // 失败但有陈旧缓存（30 分钟内）时降级返回陈旧数据，别让海报墙空转
    if (!pageParam && trendingCache.data && Date.now() - trendingCache.at < 30 * 60 * 1000) {
      return res.json(trendingCache.data)
    }
    res.status(pageParam ? 200 : 502).json([])
  }
})

/* ---------- 年度观看统计 ---------- */
router.get('/stats', (req, res) => {
  const all = movies().find()
  const done = all.filter((m) => m.status === 'done')
  const year = new Date().getFullYear()
  const yearDone = done.filter((m) => String(m.watchedAt || '').startsWith(String(year)))
  const rated = done.filter((m) => m.personalRating > 0)

  const months = Array.from({ length: 12 }, () => 0)
  for (const m of yearDone) {
    const mo = Number(String(m.watchedAt).slice(5, 7))
    if (mo >= 1 && mo <= 12) months[mo - 1]++
  }
  const byType = {}
  for (const m of yearDone) {
    const label = { movie: '电影', tv: '剧集', anime: '动漫', doc: '纪录片' }[m.type] || '其他'
    byType[label] = (byType[label] || 0) + 1
  }

  res.json({
    year,
    yearDoneCount: yearDone.length,
    totalDone: done.length,
    wantCount: all.length - done.length,
    episodes: all.reduce((n, m) => n + (m.airedEps > 0 ? m.watchedEps || 0 : 0), 0),
    avgRating: rated.length ? Number((rated.reduce((n, m) => n + m.personalRating, 0) / rated.length).toFixed(1)) : 0,
    months,
    byType,
  })
})

/* ---------- 本地库 ---------- */
router.get('/', (req, res) => {
  const { status, keyword } = req.query
  const query = {}
  if (status === 'want' || status === 'done') query.status = status
  if (keyword) query.title = { $like: keyword }
  res.json(movies().find(query, { sort: { createdAt: -1 } }))
})

router.post('/', async (req, res) => {
  const { tmdbId = 0, title, type = 'movie', cover = '', backdrop = '', tmdbRating = 0, year = '', overview = '', status = 'want' } = req.body
  if (!String(title || '').trim()) return res.status(400).json({ error: '标题不能为空' })
  if (tmdbId && movies().findOne({ tmdbId: Number(tmdbId) })) {
    return res.status(409).json({ error: '《' + title + '》已在库中' })
  }
  const movie = movies().insert({
    tmdbId: Number(tmdbId) || 0,
    title: String(title).trim(),
    type,
    cover,
    backdrop,
    tmdbRating: Number(tmdbRating) || 0,
    year: String(year || ''),
    overview: String(overview || ''),
    status: status === 'done' ? 'done' : 'want',
    personalRating: 0,
    comment: '',
    reservationTime: '',
    watchedAt: status === 'done' ? new Date().toISOString() : '',
  })
  /* 双向同步：趋势墙"加入已看完"立刻推 Trakt（电影入历史 / 剧集移出待看） */
  let traktPushed = false
  if (movie.status === 'done' && movie.tmdbId > 0) {
    try {
      traktPushed = await pushToTrakt(movie, 0)
    } catch { /* 推送失败不影响入库 */ }
  }
  res.status(201).json({ ...movie, traktPushed })
})

/** 手动设定剧集进度（双向）：{ watched: 累计集数 } 或 { mark: 'S2E7' }，缺失剧集推回 Trakt 历史 */
router.put('/:id/progress', async (req, res) => {
  const movie = movies().findOne({ id: Number(req.params.id) })
  if (!movie) return res.status(404).json({ error: '条目不存在' })
  if (movie.type !== 'tv') return res.status(400).json({ error: '只有剧集支持进度同步' })

  let watched = Number(req.body.watched)
  if (!Number.isFinite(watched) && req.body.mark) {
    watched = await parseProgressMark(movie, req.body.mark)
  }
  if (!Number.isFinite(watched) || watched < 0) return res.status(400).json({ error: '进度格式不对，示例：21 或 S2E7' })

  movies().updateOne(movie.id, {
    watchedEps: watched,
    airedEps: Math.max(watched, movie.airedEps || 0),
    status: 'done',
    watchedAt: movie.watchedAt || new Date().toISOString(),
  })
  let traktPushed = false
  if (watched > (movie.watchedEps || 0) && movie.tmdbId > 0) {
    try {
      traktPushed = await pushEpisodeHistory({ ...movie, watchedEps: watched }, watched)
    } catch { /* 推送失败不影响本地 */ }
  }
  const updated = movies().findOne({ id: movie.id })
  res.json({ ...updated, traktPushed })
})

/** 预约看剧时间 → 日历事件联动 */
function syncReservation(movie) {
  const evs = events()
  const existing = evs.findOne({ source: 'movie', refId: movie.id })
  if (!movie.reservationTime) {
    if (existing) evs.remove({ id: existing.id })
    return
  }
  const [date, time] = movie.reservationTime.split(' ')
  const payload = { title: `🎬 ${movie.title}`, date, time: time || '20:00', source: 'movie', refId: movie.id, note: '预约看剧' }
  if (existing) evs.updateOne(existing.id, payload)
  else evs.insert(payload)
}

router.put('/:id', async (req, res) => {
  const patch = { ...req.body }
  delete patch.id
  delete patch.createdAt
  delete patch.tmdbId
  if (patch.status === 'done' && !patch.watchedAt) patch.watchedAt = new Date().toISOString()
  const updated = movies().updateOne(req.params.id, patch)
  if (!updated) return res.status(404).json({ error: '条目不存在' })
  syncReservation(updated)

  /* 双向同步：标完/评分推回 Trakt（未授权时 pushToTrakt 秒回 false） */
  let traktPushed = false
  const ratingPush = Number(patch.personalRating) || 0
  if ((patch.status === 'done' || ratingPush > 0) && updated.tmdbId > 0) {
    try {
      traktPushed = await pushToTrakt(updated, ratingPush)
    } catch {
      /* 推送失败不影响本地保存 */
    }
    if (traktPushed) console.log(`[trakt] 已推送《${updated.title}》→ ${patch.status === 'done' ? '历史' : ''}${ratingPush > 0 ? ' 评分' : ''}`)
  }
  res.json({ ...updated, traktPushed })
})

router.delete('/:id', (req, res) => {
  const movie = movies().findOne({ id: Number(req.params.id) })
  if (!movie) return res.status(404).json({ error: '条目不存在' })
  movies().remove({ id: movie.id })
  events().remove({ source: 'movie', refId: movie.id })
  res.json({ removed: 1 })
})

export default router
