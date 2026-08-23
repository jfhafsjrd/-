/**
 * Trakt.tv 集成 — 设备码(PIN)授权 + watchlist/watched/ratings 同步
 *
 * 数据流：Trakt（个人观看记录 + 评分）→ 本地 movies 集合；封面用 Trakt 的 TMDB 图片 CDN。
 * 授权一次永久有效（access_token 3 个月，到期用 refresh_token 自动续）。
 *
 * 前置配置（.env）：
 *   TRAKT_CLIENT_ID / TRAKT_CLIENT_SECRET
 *   创建地址：https://trakt.tv/oauth/applications （随便填名字，redirect 填 127.0.0.1 即可）
 */
import { Router } from 'express'
import { unzipSync } from 'fflate'
import { collection } from '../db.js'
import { fetchJSON } from '../utils.js'

const router = Router()
const movies = () => collection('movies')

const CLIENT_ID = process.env.TRAKT_CLIENT_ID || ''
const CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET || ''
const API = 'https://api.trakt.tv'

/** 单行授权记录：{ id:1, accessToken, refreshToken, expiresAt, syncedAt } */
const authStore = () => collection('traktAuth')

const traktHeaders = (token) => ({
  'Content-Type': 'application/json',
  'trakt-api-version': '2',
  'trakt-api-key': CLIENT_ID,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

/** 当前 access_token（带自动刷新） */
async function getAccessToken() {
  const rec = authStore().findOne({ id: 1 })
  if (!rec) return null
  if (Date.now() < (rec.expiresAt || 0) - 3600_000) return rec.accessToken

  // 刷新令牌
  try {
    const tok = await fetchJSON(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: rec.refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: 'http://127.0.0.1',
      }),
    })
    authStore().updateOne(1, {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: Date.now() + tok.expires_in * 1000,
    })
    return tok.access_token
  } catch (err) {
    console.warn('[trakt] 令牌刷新失败:', err.message)
    return rec.accessToken // 尽力而为，失败由上游 401 暴露
  }
}

/* ---------- 设备码授权 ---------- */
let deviceSession = null // { deviceCode, userCode, verificationUrl, interval, expiresAt }

router.get('/status', async (req, res) => {
  const token = await getAccessToken()
  const rec = authStore().findOne({ id: 1 })
  res.json({
    configured: Boolean(CLIENT_ID && CLIENT_SECRET),
    authorized: Boolean(token),
    syncedAt: rec?.syncedAt || '',
  })
})

router.post('/device/start', async (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(503).json({ error: '未配置 TRAKT_CLIENT_ID / TRAKT_CLIENT_SECRET（见 README）' })
  try {
    const code = await fetchJSON(`${API}/oauth/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID }),
    })
    deviceSession = {
      deviceCode: code.device_code,
      userCode: code.user_code,
      verificationUrl: code.verification_url,
      interval: (code.interval || 5) * 1000,
      expiresAt: Date.now() + code.expires_in * 1000,
    }
    res.json({ userCode: code.user_code, verificationUrl: code.verification_url, expiresIn: code.expires_in })
  } catch (err) {
    res.status(502).json({ error: `发起授权失败（${err.message}）` })
  }
})

router.post('/device/poll', async (req, res) => {
  if (!deviceSession) return res.status(400).json({ error: '尚未发起授权' })
  if (Date.now() > deviceSession.expiresAt) {
    deviceSession = null
    return res.json({ status: 'expired' })
  }
  try {
    const tok = await fetchJSON(`${API}/oauth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: deviceSession.deviceCode,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    })
    authStore().upsert({ id: 1 }, {
      id: 1,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: Date.now() + tok.expires_in * 1000,
    })
    deviceSession = null
    res.json({ status: 'ok' })
  } catch (err) {
    // AuthorizationPending = 用户还没输码，属正常轮询
    if (String(err.message).includes('400')) return res.json({ status: 'pending' })
    res.status(502).json({ error: err.message })
  }
})

router.post('/disconnect', (req, res) => {
  authStore().remove({ id: 1 })
  res.json({ removed: 1 })
})

/* ---------- 同步 ---------- */

const TMDB_KEY = process.env.TMDB_API_KEY || ''
const TMDB = 'https://api.themoviedb.org/3'

/** Trakt 条目 → 本地 movie 字段（cover 存完整 URL，与 TMDB path 并存，前端按前缀区分） */
function mapTraktItem(entry, type, personalRating, extra = {}) {
  const img = entry.images?.poster?.full || ''
  return {
    tmdbId: entry.ids?.tmdb || 0,
    title: entry.title || '',
    type, // movie | tv
    cover: img,
    tmdbRating: entry.rating || 0, // Trakt 全站 10 分制评分
    year: String(entry.year || ''),
    overview: entry.overview || '',
    personalRating: personalRating || 0,
    ...extra,
  }
}

/**
 * 追剧进度：watched/shows 只有 plays 汇总、watched/episodes 不带剧归属，
 * 逐剧调 /shows/{id}/progress/watched 拿每季 aired/completed + 下一集。
 * shows 传 watched/watchlist 两个列表的 show 对象数组，失败不阻断主同步。
 */
async function fetchProgress(h, shows) {
  const byTmdb = new Map()
  const seen = new Set()
  for (const show of shows) {
    const traktId = show?.ids?.trakt
    const tmdbId = show?.ids?.tmdb
    if (!traktId || !tmdbId || seen.has(traktId)) continue
    seen.add(traktId)
    try {
      const p = await fetchJSON(`${API}/shows/${traktId}/progress/watched`, h)
      if (!p?.seasons) continue
      const watchedEps = p.seasons.reduce((n, s) => n + (s.completed || 0), 0)
      if (watchedEps <= 0) continue
      const rec = {
        watchedEps,
        airedEps: p.seasons.reduce((n, s) => n + (s.aired || 0), 0),
        lastWatchedAt: p.last_watched_at || '',
      }
      if (p.next_episode?.season && p.next_episode?.number) {
        rec.nextEpisode = `S${p.next_episode.season}E${p.next_episode.number}`
      }
      byTmdb.set(tmdbId, rec)
    } catch {
      /* 单剧失败跳过，不影响其余 */
    }
  }
  return byTmdb
}

/**
 * TMDB 中文反查：新增条目按 tmdbId 精确拉 zh-CN 标题/海报/简介，
 * 失败或未命中保持 Trakt 英文数据兜底。每批 5 个并发，几百条也在半分钟内。
 */
async function enrichByTmdb(items) {
  if (!TMDB_KEY) return
  for (let i = 0; i < items.length; i += 5) {
    await Promise.all(items.slice(i, i + 5).map(async (it) => {
      if (!it.mapped.tmdbId) return
      try {
        const kind = it.mapped.type === 'tv' ? 'tv' : 'movie'
        const hit = await fetchJSON(`${TMDB}/${kind}/${it.mapped.tmdbId}?api_key=${TMDB_KEY}&language=zh-CN`, { timeout: 8000 })
        if (!hit || hit.id === undefined) return
        if (hit.title || hit.name) it.mapped.title = hit.title || hit.name
        if (hit.poster_path) it.mapped.cover = hit.poster_path
        if (hit.overview) it.mapped.overview = hit.overview
        if (hit.vote_average) it.mapped.tmdbRating = hit.vote_average
        const d = hit.release_date || hit.first_air_date || ''
        if (d) it.mapped.year = String(d).slice(0, 4)
      } catch {
        /* 单条失败不影响整批 */
      }
    }))
  }
}

/** 同步主体：拉 watchlist/watched/ratings → 合并入本地库。路由与定时任务共用。 */
async function runSync() {
  const token = await getAccessToken()
  if (!token) throw Object.assign(new Error('尚未授权 Trakt'), { status: 401 })
  if (!CLIENT_ID) throw Object.assign(new Error('未配置 TRAKT_CLIENT_ID'), { status: 503 })

  const h = { headers: traktHeaders(token) }
  const [wlMovies, wlShows, wdMovies, wdShows, rtMovies, rtShows] = await Promise.all([
    fetchJSON(`${API}/users/me/watchlist/movies?extended=full,images`, h),
    fetchJSON(`${API}/users/me/watchlist/shows?extended=full,images`, h),
    fetchJSON(`${API}/users/me/watched/movies?extended=full,images`, h),
    fetchJSON(`${API}/users/me/watched/shows?extended=full,images`, h),
    fetchJSON(`${API}/users/me/ratings/movies`, h),
    fetchJSON(`${API}/users/me/ratings/shows`, h),
  ])

  const ratingByTmdb = new Map()
  for (const r of [...rtMovies, ...rtShows]) {
    const id = r[r.type]?.ids?.tmdb || r.movie?.ids?.tmdb || r.show?.ids?.tmdb
    if (id) ratingByTmdb.set(id, r.rating)
  }

  /* 追剧进度（剧集在看/已看均可能带进度） */
  const progressByTmdb = await fetchProgress(h, [...wlShows, ...wdShows].map((e) => e.show))
  const prog = (id) => {
    const p = progressByTmdb.get(id)
    return p && p.watchedEps > 0 ? p : {}
  }

  /* 第一遍：全部条目映射 + 分流「已存在（只补评分）」和「新增（待中文反查）」 */
  const result = { wantAdded: 0, doneAdded: 0, skipped: 0, rated: 0, enriched: 0 }
  const fresh = []

  const stage = (mapped, status) => {
    if (!mapped.title) return
    const existing = mapped.tmdbId ? movies().findOne({ tmdbId: mapped.tmdbId }) : movies().findOne({ title: { $like: mapped.title } })
    if (existing) {
      const patch = {}
      if (!existing.personalRating && mapped.personalRating) {
        patch.personalRating = mapped.personalRating
        result.rated++
      }
      if (!existing.cover && mapped.cover) patch.cover = mapped.cover
      /* 追剧进度：仅 Trakt 维护的字段，有变化才写 */
      if (mapped.watchedEps !== undefined && (existing.watchedEps !== mapped.watchedEps || existing.airedEps !== mapped.airedEps)) {
        patch.watchedEps = mapped.watchedEps
        patch.airedEps = mapped.airedEps
        if (mapped.lastWatchedAt) patch.lastWatchedAt = mapped.lastWatchedAt
        patch.nextEpisode = mapped.nextEpisode || ''
      }
      if (Object.keys(patch).length) movies().updateOne(existing.id, patch)
      result.skipped++
      return
    }
    fresh.push({ mapped, status })
  }

  for (const item of wlMovies) stage(mapTraktItem(item.movie || item, 'movie', ratingByTmdb.get(item.movie?.ids?.tmdb) || 0), 'want')
  for (const item of wlShows) stage(mapTraktItem(item.show || item, 'tv', ratingByTmdb.get(item.show?.ids?.tmdb) || 0, prog(item.show?.ids?.tmdb)), 'want')
  for (const item of wdMovies) stage(mapTraktItem(item.movie || item, 'movie', ratingByTmdb.get(item.movie?.ids?.tmdb) || 0), 'done')
  for (const item of wdShows) stage(mapTraktItem(item.show || item, 'tv', ratingByTmdb.get(item.show?.ids?.tmdb) || 0, prog(item.show?.ids?.tmdb)), 'done')

  /* 第二遍：新增条目统一中文反查后入库 */
  await enrichByTmdb(fresh)
  result.enriched = fresh.length
  for (const { mapped, status } of fresh) {
    movies().insert({ ...mapped, comment: '', reservationTime: '', watchedAt: status === 'done' ? new Date().toISOString() : '' })
    if (status === 'want') result.wantAdded++
    else result.doneAdded++
  }

  authStore().updateOne(1, { syncedAt: new Date().toISOString() })
  return result
}

/** 定时任务入口：每天自动同步（scheduler 调用），带完整日志 */
export async function traktAutoSync() {
  const rec = authStore().findOne({ id: 1 })
  if (!rec || !CLIENT_ID) return false
  try {
    const r = await runSync()
    console.log(`[cron] Trakt 自动同步：待看 +${r.wantAdded} · 已看 +${r.doneAdded} · 补评 ${r.rated} · 跳过 ${r.skipped}`)
    return true
  } catch (err) {
    console.warn('[cron] Trakt 自动同步失败:', err.message)
    return false
  }
}

router.post('/sync', async (req, res) => {
  try {
    res.json(await runSync())
  } catch (err) {
    const unauthorized = String(err.message).includes('尚未授权') || String(err.message).includes('401')
    res.status(unauthorized ? 401 : 502).json({ error: `同步失败（${err.message}）${unauthorized ? '，请重新授权' : ''}` })
  }
})

/* ---------- 追剧日历：Trakt 我的剧集播出表 → 日历模块联动 ---------- */

const pad2 = (n) => String(n).padStart(2, '0')

router.get('/calendar', async (req, res) => {
  const token = await getAccessToken()
  if (!token) return res.json({ authorized: false, episodes: [] })

  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.start || '')) ? req.query.start : ymdLocal(new Date())
  const days = Math.min(33, Math.max(1, Number(req.query.days) || 14))
  try {
    const eps = await fetchJSON(`${API}/calendars/my/shows/${start}/${days}`, { headers: traktHeaders(token) })
    const episodes = (Array.isArray(eps) ? eps : []).map((e) => {
      const when = e.first_aired ? new Date(e.first_aired) : null
      const s = e.episode?.season ?? 0
      const n = e.episode?.number ?? 0
      return {
        id: `trakt-${e.show?.ids?.tmdb || e.show?.ids?.trakt}-${s}-${n}-${start}`,
        date: when ? ymdLocal(when) : start,
        time: when ? `${pad2(when.getHours())}:${pad2(when.getMinutes())}` : '',
        title: `${e.show?.title || '未知剧集'} S${s}E${n}`,
        source: 'trakt',
        note: e.episode?.title || '',
      }
    })
    res.json({ authorized: true, episodes })
  } catch (err) {
    console.warn('[trakt] 日历获取失败:', err.message)
    res.json({ authorized: true, episodes: [] })
  }
})

function ymdLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/* ---------- 网页抓取导入（绕过 API 会员墙的免费通道） ----------
 * 用户在自己登录的 trakt.tv 列表页运行前端提供的 console 脚本，
 * 把抓到的条目列表粘贴回 Life OS 导入。此处按 slug 反查 TMDB 拿中文标题+海报。
 */

/** 通用 CSV 解析（带引号/逗号转义处理），返回对象数组 */
function parseCSV(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) rows.push(row)

  if (!rows.length) return []
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s_]+/g, ''))
  return rows.slice(1).map((r) => {
    const obj = {}
    header.forEach((h, i) => (obj[h] = (r[i] || '').trim()))
    return obj
  })
}

const slugify = (title, year) =>
  String(title || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '') + (year ? `-${year}` : '')

/**
 * 上传 Trakt 导出的 zip → 解析合并为待导入条目列表（不做网络请求，秒回）
 * 前端拿到列表后走 /import 分批导入管道。
 * body: { data: base64(zip) }
 *
 * 兼容两种导出格式：
 *   新版（实测）：watched-movies/shows.json + lists-watchlist.json + ratings-*.json
 *   旧版（CSV）：watchlist/history/ratings.csv
 */
router.post('/import-zip-parse', (req, res) => {
  try {
    const b64 = String(req.body.data || '')
    if (!b64) return res.status(400).json({ error: 'zip 内容为空' })
    const buf = Buffer.from(b64, 'base64')
    let files
    try {
      files = unzipSync(new Uint8Array(buf))
    } catch {
      return res.status(400).json({ error: '无法解压 zip 文件' })
    }

    /* 聚合：key = tmdbId 或 type+title */
    const map = new Map()
    const keyOf = (type, title, tmdbId) => (tmdbId ? `id:${tmdbId}` : `t:${type}:${String(title).toLowerCase()}`)
    const touch = (type, title, year, tmdbId) => {
      if ((type !== 'movie' && type !== 'show') || !title) return null
      const key = keyOf(type, title, tmdbId)
      if (!map.has(key)) map.set(key, { type, title, year: String(year || '').slice(0, 4), tmdbId: tmdbId || 0, rating: 0, watchedAt: '', want: false })
      return map.get(key)
    }

    const text = (name) => Buffer.from(files[name]).toString('utf-8')
    const jsonOf = (name) => {
      try {
        return JSON.parse(text(name))
      } catch {
        return null
      }
    }

    /* ---------- 新版 JSON 格式 ---------- */
    // 已看：watched-movies.json / watched-shows.json
    for (const [name, kind] of [['watched-movies.json', 'movie'], ['watched-shows.json', 'show']]) {
      const arr = jsonOf(name)
      if (!Array.isArray(arr)) continue
      for (const row of arr) {
        const item = row.movie || row.show
        const entry = touch(kind, item?.title, item?.year, item?.ids?.tmdb)
        if (entry && String(row.last_watched_at || '') > entry.watchedAt) entry.watchedAt = row.last_watched_at
      }
    }
    // 待看：lists-watchlist.json
    const wl = jsonOf('lists-watchlist.json')
    if (Array.isArray(wl)) {
      for (const row of wl) {
        const kind = row.type === 'movie' ? 'movie' : 'show'
        const item = row[kind]
        const entry = touch(kind, item?.title, item?.year, item?.ids?.tmdb)
        if (entry) {
          entry.want = true
          if (Number(row.my_rating) > 0) entry.rating = Number(row.my_rating)
        }
      }
    }
    // 评分：ratings-movies.json / ratings-shows.json
    for (const [name, kind] of [['ratings-movies.json', 'movie'], ['ratings-shows.json', 'show']]) {
      const arr = jsonOf(name)
      if (!Array.isArray(arr)) continue
      for (const row of arr) {
        const item = row[kind]
        const entry = touch(kind, item?.title, item?.year, item?.ids?.tmdb)
        if (entry && Number(row.rating) >= 1 && Number(row.rating) <= 10) entry.rating = Number(row.rating)
      }
    }

    /* ---------- 旧版 CSV 兼容 ---------- */
    const csvRows = (name) => (name.toLowerCase().endsWith('.csv') ? parseCSV(text(name)) : [])
    for (const name of Object.keys(files)) {
      const lower = name.toLowerCase()
      if (lower.includes('watchlist')) {
        for (const row of csvRows(name)) {
          const entry = touch(['show', 'series', 'tv', 'season', 'episode'].includes((row.type || '').toLowerCase()) ? 'show' : 'movie', row.title || row.name, row.year, Number(row.tmdbid || 0))
          if (entry) entry.want = true
        }
      } else if (lower.includes('history') || lower.includes('watched')) {
        for (const row of csvRows(name)) {
          const entry = touch(['show', 'series', 'tv', 'season', 'episode'].includes((row.type || '').toLowerCase()) ? 'show' : 'movie', row.title || row.name, row.year, Number(row.tmdbid || 0))
          const at = row.watchedat || row.watched || row.date || ''
          if (entry && at > entry.watchedAt) entry.watchedAt = at
        }
      } else if (lower.includes('rating')) {
        for (const row of csvRows(name)) {
          const entry = touch(['show', 'series', 'tv', 'season', 'episode'].includes((row.type || '').toLowerCase()) ? 'show' : 'movie', row.title || row.name, row.year, Number(row.tmdbid || 0))
          const r = Number(row.rating || row.yourrating || 0)
          if (entry && r >= 1 && r <= 10) entry.rating = r
        }
      }
    }

    // 生成 slug（供 /import 复用），统计预览
    const items = [...map.values()].map((e) => ({
      type: e.type === 'show' ? 'shows' : 'movies',
      slug: slugify(e.title, e.year),
      title: e.title,
      year: e.year,
      tmdbId: e.tmdbId,
      rating: e.rating,
      watchedAt: e.watchedAt,
      status: e.want && !e.watchedAt ? 'want' : 'done',
    }))

    const preview = {
      want: items.filter((i) => i.status === 'want').length,
      done: items.filter((i) => i.status === 'done').length,
      rated: items.filter((i) => i.rating > 0).length,
      withTmdbId: items.filter((i) => i.tmdbId > 0).length,
    }
    res.json({ items, preview })
  } catch (err) {
    res.status(500).json({ error: `解析失败（${err.message}）` })
  }
})

router.post('/import', async (req, res) => {
  const { items = [], status = 'done' } = req.body
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: '导入列表为空' })
  if (items.length > 30) return res.status(400).json({ error: '单批最多 30 条，前端会自动分批' })

  const TMDB_KEY = process.env.TMDB_API_KEY || ''
  const result = { imported: 0, skipped: 0, enhanced: 0, failed: [], importedTitles: [] }

  for (const item of items) {
    try {
      const type = item.type === 'shows' ? 'show' : item.type === 'movies' ? 'movie' : item.type
      if (type !== 'movie' && type !== 'show') continue

      // slug → 英文标题（slug 形如 interstellar-2014），降级时首字母大写保证观感
      const title = String(item.slug || '')
        .replace(/-(19\d{2}|20\d{2})$/, '')
        .replace(/-/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase())
      if (!title) continue

      // TMDB 反查：有 tmdbId 走精确详情端点（zip 导出场景，100% 命中），否则按标题搜索（网页抓取场景）
      let mapped = null
      if (TMDB_KEY) {
        try {
          let hit = null
          if (Number(item.tmdbId) > 0) {
            const kind = type === 'show' ? 'tv' : 'movie'
            const j = await fetchJSON(`https://api.themoviedb.org/3/${kind}/${Number(item.tmdbId)}?api_key=${TMDB_KEY}&language=zh-CN`, { timeout: 8000 })
            hit = j.id !== undefined ? j : null
          } else {
            const q = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_KEY}` +
              `&query=${encodeURIComponent(title)}&include_adult=false&language=zh-CN` +
              (item.year ? `&${type === 'movie' ? 'year' : 'first_air_date_year'}=${item.year}` : '')
            const j = await fetchJSON(q, { timeout: 8000 })
            hit = (j.results || []).find((r) => (r.release_date || r.first_air_date || '').startsWith(String(item.year || ''))) || (j.results || [])[0]
          }
          if (hit) {
            mapped = {
              tmdbId: hit.id,
              title: hit.title || hit.name || title,
              cover: hit.poster_path || '',
              tmdbRating: hit.vote_average || 0,
              year: String((hit.release_date || hit.first_air_date || item.year || '')).slice(0, 4),
              overview: hit.overview || '',
            }
          }
        } catch {
          /* TMDB 不可达时降级为裸标题入库 */
        }
      }

      // 本地已存在：若当时降级入库（缺 tmdbId/封面）而本次 TMDB 命中，则自动补全；评分只补空缺
      const existing = movies().findOne({ title: { $like: title } })
      if (existing) {
        const patch = {}
        if (mapped && (!existing.tmdbId || !existing.cover)) {
          Object.assign(patch, {
            tmdbId: mapped.tmdbId,
            title: mapped.title,
            cover: mapped.cover,
            tmdbRating: mapped.tmdbRating,
            year: mapped.year,
            overview: mapped.overview,
          })
          result.enhanced++
        }
        if (Number(item.rating) > 0 && !existing.personalRating) patch.personalRating = Number(item.rating)
        if (item.watchedAt && !existing.watchedAt) patch.watchedAt = item.watchedAt
        if (Object.keys(patch).length) movies().updateOne(existing.id, patch)
        result.skipped++
        continue
      }

      movies().insert({
        tmdbId: mapped?.tmdbId || 0,
        title: mapped?.title || title,
        type: type === 'show' ? 'tv' : 'movie',
        cover: mapped?.cover || '',
        backdrop: '',
        tmdbRating: mapped?.tmdbRating || 0,
        year: mapped?.year || item.year || '',
        overview: mapped?.overview || '',
        status: item.status === 'want' || status === 'want' ? 'want' : 'done',
        personalRating: Number(item.rating) > 0 ? Number(item.rating) : 0,
        comment: '',
        reservationTime: '',
        watchedAt: item.watchedAt || (item.status === 'want' || status === 'want' ? '' : new Date().toISOString()),
        traktSlug: item.slug || '',
      })
      result.imported++
      result.importedTitles.push(mapped?.title || title)
    } catch (err) {
      result.failed.push({ slug: item.slug, error: err.message })
    }
  }

  res.json(result)
})

export default router
