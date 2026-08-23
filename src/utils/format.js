/** 通用格式化工具（全用原生 API，零依赖） */

/** 本地日期 → YYYY-MM-DD（修 v2 的 toISOString 时区 off-by-one） */
export function ymd(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** ISO/任意日期 → 人话（今天 / 明天 / 3天前 / 07-20） */
export function friendlyDate(str) {
  if (!str) return ''
  const date = new Date(str.length <= 10 ? `${str}T00:00:00` : str)
  if (Number.isNaN(date.getTime())) return str
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((date - today) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === -1) return '昨天'
  if (diff > 1 && diff < 7) return `${diff} 天后`
  if (diff < -1 && diff > -30) return `${-diff} 天前`
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** 分钟 → 「128 小时」「3.5 小时」「45 分钟」 */
export function hours(minutes) {
  const m = Number(minutes) || 0
  if (m < 60) return `${m} 分钟`
  const h = m / 60
  return `${h >= 100 ? Math.round(h) : Math.round(h * 10) / 10} 小时`
}

/** 字节数 → 「24.6 MB」 */
export function fileSize(bytes) {
  const b = Number(bytes) || 0
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

/** 数字 → 千分位缩写（1.2k / 15.6k / 2.1M） */
export function compactNum(n) {
  const v = Number(n) || 0
  if (v < 1000) return String(v)
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k`
  return `${(v / 1_000_000).toFixed(1)}M`
}

/** 按时间段问候 */
export function greeting() {
  const h = new Date().getHours()
  if (h < 5) return '夜深了，注意休息'
  if (h < 9) return '早上好，新的一天'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  if (h < 23) return '晚上好'
  return '夜深了'
}

/** 星级 → 数字评分显示（TMDB 7.8 | 个人 8.5 风格） */
export function ratingText(v) {
  const n = Number(v) || 0
  return n ? n.toFixed(1) : '—'
}

/** 防抖 */
export function debounce(fn, ms = 300) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}
