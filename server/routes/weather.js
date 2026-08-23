/**
 * 天气 API — wttr.in 免费接口（无需密钥）
 * 修复 v2 的缓存 bug：缓存按城市分 key，30 分钟 TTL
 */
import { Router } from 'express'
import { fetchJSON } from '../utils.js'

const router = Router()

/** WMO 天气码 → { emoji, 中文描述 } */
const WMO = {
  0: ['☀️', '晴'], 1: ['🌤️', '多云转晴'], 2: ['⛅', '多云'], 3: ['☁️', '阴'],
  45: ['🌫️', '雾'], 48: ['🌫️', '雾凇'],
  51: ['🌦️', '小毛毛雨'], 53: ['🌦️', '毛毛雨'], 55: ['🌧️', '大毛毛雨'],
  56: ['🌧️', '冻毛毛雨'], 57: ['🌧️', '强冻毛毛雨'],
  61: ['🌦️', '小雨'], 63: ['🌧️', '中雨'], 65: ['🌧️', '大雨'],
  66: ['🌧️', '冻雨'], 67: ['🌧️', '强冻雨'],
  71: ['🌨️', '小雪'], 73: ['🌨️', '中雪'], 75: ['❄️', '大雪'], 77: ['🌨️', '雪粒'],
  80: ['🌦️', '小阵雨'], 81: ['🌧️', '阵雨'], 82: ['⛈️', '强阵雨'],
  85: ['🌨️', '小阵雪'], 86: ['❄️', '阵雪'],
  95: ['⛈️', '雷阵雨'], 96: ['⛈️', '雷暴冰雹'], 99: ['⛈️', '强雷暴'],
}
const wmo = (code) => WMO[code] || ['🌡️', '未知']

/** 主题判定：按解析出的中文描述 + 气温 */
function themeOf(desc, tempC) {
  if (/雨|雷/.test(desc)) return 'rain'
  if (/雪/.test(desc)) return 'snow'
  if (tempC >= 33) return 'hot'
  if (tempC <= 3) return 'cold'
  return 'normal'
}

const cache = new Map() // key: city → { at, data }
const TTL = 30 * 60 * 1000

/**
 * 天气描述解析：wttr.in 用扩展 WMO 码（含 3xx 系列），码表覆盖不全时按英文描述关键词兜底
 */
const KEYWORD_MAP = [
  [/thunder|storm/i, ['⛈️', '雷阵雨']],
  [/snow|ice pellet|blizzard/i, ['🌨️', '雪']],
  [/drizzle/i, ['🌦️', '毛毛雨']],
  [/shower/i, ['🌦️', '阵雨']],
  [/rain/i, ['🌧️', '雨']],
  [/fog|mist| haze/i, ['🌫️', '雾']],
  [/overcast/i, ['☁️', '阴']],
  [/partly|cloudy/i, ['⛅', '多云']],
  [/clear|sunny/i, ['☀️', '晴']],
]
function parseDesc(code, enDesc) {
  if (WMO[code]) return WMO[code]
  const s = String(enDesc || '')
  for (const [re, val] of KEYWORD_MAP) if (re.test(s)) return val
  return ['🌡️', s || '未知']
}

async function loadWeather(city) {
  const hit = cache.get(city)
  if (hit && Date.now() - hit.at < TTL) return hit.data

  const j = await fetchJSON(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 12000 })
  const cur = j.current_condition?.[0] || {}
  const astro = j.weather?.[0]?.astronomy?.[0] || {}
  const code = Number(cur.weatherCode)
  const enDesc = cur.weatherDesc?.[0]?.value || ''

  const data = {
    city: j.nearest_area?.[0]?.areaName?.[0]?.value || city,
    tempC: Number(cur.temp_C),
    feelsLikeC: Number(cur.FeelsLikeC),
    code,
    emoji: parseDesc(code, enDesc)[0],
    desc: parseDesc(code, enDesc)[1],
    humidity: Number(cur.humidity),
    windKmph: Number(cur.windspeedKmph),
    visibilityKm: Number(cur.visibility),
    uvIndex: Number(cur.uvIndex || 0),
    sunrise: astro.sunrise || '',
    sunset: astro.sunset || '',
    moonPhase: astro.moon_phase || '',
    theme: themeOf(parseDesc(code, enDesc)[1], Number(cur.temp_C)),
    forecast: (j.weather || []).slice(0, 3).map((d) => ({
      date: d.date,
      maxC: Number(d.maxtempC),
      minC: Number(d.mintempC),
      emoji: parseDesc(Number(d.hourly?.[4]?.weatherCode || 0), d.hourly?.[4]?.weatherDesc?.[0]?.value)[0],
      desc: parseDesc(Number(d.hourly?.[4]?.weatherCode || 0), d.hourly?.[4]?.weatherDesc?.[0]?.value)[1],
    })),
    updatedAt: new Date().toISOString(),
  }
  cache.set(city, { at: Date.now(), data })
  return data
}

router.get('/', async (req, res) => {
  const city = String(req.query.city || process.env.WEATHER_CITY || 'Shenzhen').trim() || 'Shenzhen'
  try {
    res.json(await loadWeather(city))
  } catch (err) {
    console.warn(`[weather] ${city} 获取失败:`, err.message)
    res.status(502).json({ error: `天气服务暂不可用（${err.message}）` })
  }
})

export default router
