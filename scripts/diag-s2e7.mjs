// 调试 S2E7 换算 + 分集推送链路（用后删）
import fs from 'node:fs'

const env = fs.readFileSync('/www/wwwroot/dashboard/.env', 'utf8')
const cid = env.match(/TRAKT_CLIENT_ID=(.*)/)[1].trim()
const raw = JSON.parse(fs.readFileSync('/www/wwwroot/dashboard/server/data.json', 'utf8'))
function findToken(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return null
  if (obj.accessToken) return obj.accessToken
  for (const v of Object.values(obj)) { const t = findToken(v, depth + 1); if (t) return t }
  return null
}
const H = { 'trakt-api-version': '2', 'trakt-api-key': cid, Authorization: `Bearer ${findToken(raw)}`, 'User-Agent': 'LifeOS/2.1 diag4', 'Content-Type': 'application/json' }

const found = await fetch('https://api.trakt.tv/search/tmdb/118651?type=show', { headers: H }).then((r) => r.json())
console.log('search/tmdb 返回类型:', Array.isArray(found) ? 'array len=' + found.length : typeof found)
const first = Array.isArray(found) ? found[0] : found
console.log('first keys:', Object.keys(first || {}))
console.log('first.show:', first?.show ? JSON.stringify(first.show.ids) : '无')
console.log('first.ids:', first?.ids ? JSON.stringify(first.ids) : '无')

const traktId = first?.show?.ids?.trakt || first?.ids?.trakt
console.log('解析 traktId:', traktId)

const seasons = await fetch(`https://api.trakt.tv/shows/${traktId}/seasons`, { headers: H }).then((r) => r.json())
console.log('seasons:', JSON.stringify(seasons.map((s) => ({ n: s.number, ec: s.episode_count }))))
