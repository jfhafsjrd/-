/**
 * 统一 API 客户端 — 全站唯一请求出口
 * 后端字段契约见各路由文件头部注释，前后端字段名一字不差（v2 的教训）
 */
import axios from 'axios'

const http = axios.create({ baseURL: '/api', timeout: 30000 })

/** 访问码登录令牌：请求头统一携带（img 标签请求走 cookie 通道） */
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('lifeos_token')
  if (token) config.headers['X-Auth-Token'] = token
  return config
})

/** 错误归一化：任何失败都抛出带 message 的 Error；401 广播全局下线事件 */
http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) window.dispatchEvent(new CustomEvent('lifeos:401'))
    const msg =
      err.response?.data?.error ||
      (err.code === 'ECONNABORTED' ? '请求超时，请稍后重试' : '') ||
      err.message ||
      '网络异常'
    return Promise.reject(new Error(msg))
  },
)

/** TMDB/Steam 图片统一走后端代理（防墙 + 长缓存） */
export const img = (url) => (url ? `/api/proxy/image?url=${encodeURIComponent(url)}` : '')
export const tmdbPoster = (path, size = 'w500') => (path ? img(`https://image.tmdb.org/t/p/${size}${path}`) : '')
export const steamCover = (url) => (url ? img(url) : '')

/* ---------- 各模块 API ---------- */
export const api = {
  health: () => http.get('/health'),

  /* 访问码鉴权 */
  auth: {
    status: () => http.get('/auth/status'),
    login: (code) => http.post('/auth/login', { code }),
    logout: () => http.post('/auth/logout'),
  },

  /* 影视 */
  movies: {
    list: (params) => http.get('/movies', { params }),
    stats: () => http.get('/movies/stats'),
    search: (q) => http.get('/movies/search', { params: { q } }),
    trending: () => http.get('/movies/trending'),
    add: (data) => http.post('/movies', data),
    update: (id, data) => http.put(`/movies/${id}`, data),
    remove: (id) => http.delete(`/movies/${id}`),
  },

  /* Trakt 同步 */
  trakt: {
    status: () => http.get('/trakt/status'),
    deviceStart: () => http.post('/trakt/device/start'),
    devicePoll: () => http.post('/trakt/device/poll'),
    sync: () => http.post('/trakt/sync', {}, { timeout: 120000 }),
    disconnect: () => http.post('/trakt/disconnect'),
    calendar: (start, days) => http.get('/trakt/calendar', { params: { start, days } }),
    import: (items, status) => http.post('/trakt/import', { items, status }, { timeout: 120000 }),
    importZipParse: (base64) => http.post('/trakt/import-zip-parse', { data: base64 }, { timeout: 30000 }),
  },

  /* 游戏 */
  games: {
    list: (params) => http.get('/games', { params }),
    stats: () => http.get('/games/stats'),
    honors: () => http.get('/games/honors'),
    add: (data) => http.post('/games', data),
    update: (id, data) => http.put(`/games/${id}`, data),
    remove: (id) => http.delete(`/games/${id}`),
  },

  /* Steam */
  steam: {
    profile: () => http.get('/steam/profile'),
    syncStatus: () => http.get('/steam/sync/status'),
    triggerSync: () => http.post('/steam/sync'),
    achievements: (appId) => http.get(`/steam/achievements/${appId}`),
  },

  /* 待办 */
  todos: {
    list: (params) => http.get('/todos', { params }),
    add: (data) => http.post('/todos', data),
    update: (id, data) => http.put(`/todos/${id}`, data),
    toggle: (id) => http.put(`/todos/${id}/toggle`),
    remove: (id) => http.delete(`/todos/${id}`),
  },

  /* 日历事件 */
  events: {
    list: (params) => http.get('/events', { params }),
    add: (data) => http.post('/events', data),
    update: (id, data) => http.put(`/events/${id}`, data),
    remove: (id) => http.delete(`/events/${id}`),
  },

  /* 导航 */
  links: {
    list: () => http.get('/links'),
    add: (data) => http.post('/links', data),
    update: (id, data) => http.put(`/links/${id}`, data),
    remove: (id) => http.delete(`/links/${id}`),
    checkAll: () => http.post('/links/check'),
  },

  /* GitHub */
  github: {
    repos: () => http.get('/github/repos'),
    addRepo: (input, category, note) => http.post('/github/repos', { input, category, note }),
    updateRepo: (id, data) => http.put(`/github/${id}`, data),
    removeRepo: (id) => http.delete(`/github/repos/${id}`),
    releases: (owner, repo) => http.get(`/github/repos/${owner}/${repo}/releases`),
    radar: (count = 3) => http.get('/github/radar', { params: { count } }),
    discover: (params) => http.get('/github/discover', { params, timeout: 20000 }),
    daily: () => http.get('/github/daily', { timeout: 20000 }),
  },

  /* 天气 */
  weather: (city) => http.get('/weather', { params: city ? { city } : {} }),
}

export default api
