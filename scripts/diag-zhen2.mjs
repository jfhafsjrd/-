// 枕刀歌 Trakt 进度实时诊断（用后删）
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
const H = { 'trakt-api-version': '2', 'trakt-api-key': cid, Authorization: `Bearer ${findToken(raw)}`, 'User-Agent': 'LifeOS/2.1 diag3', 'Content-Type': 'application/json' }

const p = await fetch('https://api.trakt.tv/shows/209589/progress/watched?hidden=false&specials=false', { headers: H }).then((r) => r.json())
console.log('Trakt 权威进度: completed =', p.completed, '| aired =', p.aired, '| next =', p.next_episode ? `S${p.next_episode.season}E${p.next_episode.number}` : '无')
console.log('各季:', JSON.stringify((p.seasons || []).map((s) => `S${s.number}:${s.completed}/${s.aired}`)))
const last = await fetch('https://api.trakt.tv/users/me/history/shows/209589?limit=3', { headers: H }).then((r) => r.json())
console.log('最近观看历史:', JSON.stringify((last || []).map((h) => `${h.episode?.season}x${h.episode?.number} @ ${h.watched_at}`)))
