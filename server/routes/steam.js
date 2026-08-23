/**
 * Steam API — 静默同步 + 缓存
 *
 * 架构（沿用 v1 验证过的设计，但数据写入全新实现）：
 *   - games 集合（data.json）: 游戏主数据，按 steamAppId 去重 upsert —— v1 在这一步把数据写烂，本版直接方法调用不存在错位
 *   - steam_cache.json: 成就明细（点开弹窗才拉）+ 玩家档案 + 同步水位
 *   - 同步全程 250ms 限流，后台静默执行，接口零阻塞
 */
import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collection } from '../db.js'
import { fetchJSON, sleep } from '../utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.join(__dirname, '..', 'steam_cache.json')

const router = Router()
const games = () => collection('games')

const STEAM_KEY = process.env.STEAM_API_KEY || ''
const STEAM_ID = process.env.STEAM_ID || ''
const COVER = (appId) => `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`

/* ---------- 缓存读写 ---------- */
let cache = { lastUpdate: 0, profile: null, achievements: {} }
try {
  if (fs.existsSync(CACHE_FILE)) cache = { ...cache, ...JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) }
} catch (err) {
  console.warn('[steam] 缓存文件损坏，重置:', err.message)
}
function saveCache() {
  try {
    const tmp = CACHE_FILE + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(cache), 'utf-8')
    fs.renameSync(tmp, CACHE_FILE)
  } catch (err) {
    console.error('[steam] 缓存写入失败:', err.message)
  }
}

/* ---------- 同步状态 ---------- */
const syncState = { running: false, done: 0, total: 0, lastError: '', startedAt: '' }

/** 状态推断：满成就→done，两周内有时长→playing，有时长→dropped，其余→want */
function inferStatus(playtime, playtime2w, achEarned, achTotal) {
  if (achTotal > 0 && achEarned === achTotal) return 'done'
  if (playtime2w > 0) return 'playing'
  if (playtime > 0) return 'dropped'
  return 'want'
}

/** 后台静默同步主流程 */
async function runSync() {
  if (syncState.running) return
  if (!STEAM_KEY || !STEAM_ID) {
    syncState.lastError = '未配置 STEAM_API_KEY / STEAM_ID'
    return
  }
  syncState.running = true
  syncState.done = 0
  syncState.total = 0
  syncState.lastError = ''
  syncState.startedAt = new Date().toISOString()
  console.log('[steam] 开始后台同步…')
  try {
    // 1. 拉游戏库
    const owned = await fetchJSON(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_KEY}&steamid=${STEAM_ID}&include_appinfo=1&include_played_free_games=1&format=json`,
      { timeout: 20000 },
    )
    const list = owned.response?.games || []
    syncState.total = list.length
    console.log(`[steam] 拉到 ${list.length} 款游戏，开始逐个同步成就`)

    // 2. upsert 游戏主数据 + 3. 逐个拉成就（250ms 限流）
    for (const g of list) {
      let achEarned = 0
      let achTotal = 0
      try {
        const ach = await fetchJSON(
          `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${g.appid}&key=${STEAM_KEY}&steamid=${STEAM_ID}&l=zh-cn`,
          { timeout: 12000 },
        )
        const stats = ach.playerstats?.achievements || []
        achTotal = stats.length
        achEarned = stats.filter((a) => a.achieved === 1).length
        cache.achievements[g.appid] = { ...(cache.achievements[g.appid] || {}), earned: achEarned, total: achTotal }
      } catch {
        /* 无成就的游戏会报错，属正常，保持 0/0 */
      }
      const playtime = g.playtime_forever || 0
      const playtime2w = g.playtime_2weeks || 0
      games().upsert(
        { steamAppId: g.appid },
        {
          steamAppId: g.appid,
          name: g.name,
          cover: COVER(g.appid),
          playtime,
          playtime2weeks: playtime2w,
          achEarned,
          achTotal,
          status: inferStatus(playtime, playtime2w, achEarned, achTotal),
          platform: 'steam',
        },
      )
      syncState.done++
      if (syncState.done % 10 === 0) console.log(`[steam] 同步进度 ${syncState.done}/${syncState.total}`)
      await sleep(250)
    }

    cache.lastUpdate = Date.now()
    saveCache()
    console.log(`[steam] 同步完成：${syncState.done} 款`)
  } catch (err) {
    syncState.lastError = err.message
    console.error('[steam] 同步失败:', err.message)
  } finally {
    syncState.running = false
  }
}

/** 供 scheduler 调用：缓存过期才同步（2 小时） */
export function steamSyncIfStale() {
  if (Date.now() - (cache.lastUpdate || 0) < 2 * 3600 * 1000) return false
  runSync()
  return true
}

/* ---------- 路由 ---------- */
router.get('/sync/status', (req, res) => {
  res.json({
    ...syncState,
    lastUpdate: cache.lastUpdate || 0,
    configured: Boolean(STEAM_KEY && STEAM_ID),
    cachedGames: Object.keys(cache.achievements).length,
  })
})

router.post('/sync', (req, res) => {
  if (!STEAM_KEY || !STEAM_ID) return res.status(503).json({ error: '未配置 STEAM_API_KEY / STEAM_ID' })
  if (syncState.running) return res.status(409).json({ error: '同步进行中', state: syncState })
  runSync() // 后台执行，立即返回
  res.json({ started: true })
})

router.get('/profile', async (req, res) => {
  try {
    if (cache.profile && Date.now() - (cache.profile.at || 0) < 30 * 60 * 1000) {
      return res.json(cache.profile.data)
    }
    if (!STEAM_KEY || !STEAM_ID) return res.json({ personaName: '未配置', avatar: '', state: 0 })
    const j = await fetchJSON(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_KEY}&steamids=${STEAM_ID}`,
      { timeout: 10000 },
    )
    const p = j.response?.players?.[0] || {}
    const data = { personaName: p.personaname || '探索者', avatar: p.avatarfull || '', state: p.personastate || 0, steamId: p.steamid || STEAM_ID }
    cache.profile = { at: Date.now(), data }
    saveCache()
    res.json(data)
  } catch (err) {
    if (cache.profile) return res.json(cache.profile.data)
    res.status(502).json({ error: `Steam 档案获取失败（${err.message}）` })
  }
})

/** 成就明细：缓存命中直接返回，否则现场拉 schema（含中文名）后回写缓存 */
router.get('/achievements/:appId', async (req, res) => {
  const appId = Number(req.params.appId)
  const cached = cache.achievements[appId]
  if (cached?.items?.length) return res.json({ appId, ...cached, fromCache: true })
  if (!STEAM_KEY || !STEAM_ID) return res.status(503).json({ error: '未配置 Steam 密钥' })
  try {
    const [ach, schema] = await Promise.all([
      fetchJSON(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appId}&key=${STEAM_KEY}&steamid=${STEAM_ID}&l=zh-cn`, { timeout: 12000 }),
      fetchJSON(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?appid=${appId}&key=${STEAM_KEY}&l=zh-cn`, { timeout: 12000 }).catch(() => null),
    ])
    const progress = ach.playerstats?.achievements || []
    const meta = new Map(
      (schema?.game?.availableGameStats?.achievements || []).map((s) => [s.name, { displayName: s.displayName, icon: s.icon, description: s.description || '' }]),
    )
    const items = progress.map((a) => {
      const m = meta.get(a.apiname) || {}
      return {
        apiName: a.apiname,
        name: m.displayName || a.apiname,
        icon: m.icon || '',
        description: m.description || '',
        achieved: a.achieved === 1,
        unlockTime: a.unlocktime ? new Date(a.unlocktime * 1000).toISOString() : '',
      }
    })
    const entry = { earned: items.filter((i) => i.achieved).length, total: items.length, items }
    cache.achievements[appId] = entry
    saveCache()
    res.json({ appId, ...entry, fromCache: false })
  } catch (err) {
    res.status(502).json({ error: `成就获取失败（${err.message}）` })
  }
})

export default router
