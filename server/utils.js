/**
 * 后端共享工具：智能外部请求 + JSON fetch
 *
 * 大陆本机开发现实：代理软件可能在线也可能挂，部分域名直连可达。
 * 策略：配置了 HTTPS_PROXY 时先走代理，网络级失败自动回退直连；
 *       代理对某个域名不通但直连通（GitHub/Steam 常见）也能正常工作。
 */
let undici = null
let proxyAgent = null
let proxyUrl = ''
let proxyFailedAt = 0 // 熔断时间戳：代理挂掉后 20s 内跳过代理，避免每个请求都白等一次超时
const PROXY_COOLDOWN = 20 * 1000

export async function initProxy(url) {
  if (!url) return
  proxyUrl = url
  undici = await import('undici')
  proxyAgent = new undici.ProxyAgent(url)
  console.log(`[proxy] 外部请求代理就绪 → ${url}（失败自动直连 + 重建连接）`)
}

/** 丢弃可能持有死连接的旧代理实例（代理软件重启后旧 CONNECT 隧道会失效） */
function rebuildProxy() {
  try {
    proxyAgent?.close?.()
  } catch {
    /* 忽略关闭错误 */
  }
  proxyAgent = new undici.ProxyAgent(proxyUrl)
}

/** 智能 fetch：代理优先（带熔断），网络级失败回退直连；失败后重建代理连接池 */
export async function smartFetch(url, { timeout = 12000, headers = {}, method = 'GET', body } = {}) {
  const base = { method, body, signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'LifeOS/5.0', ...headers } }

  const proxyHealthy = Date.now() - proxyFailedAt > PROXY_COOLDOWN
  if (proxyAgent && undici && proxyHealthy) {
    try {
      return await undici.fetch(url, { ...base, dispatcher: proxyAgent })
    } catch (err) {
      // 代理链路失败（连接拒绝/超时/隧道损坏）→ 熔断 + 重建连接池 + 直连重试
      proxyFailedAt = Date.now()
      rebuildProxy()
      console.warn(`[proxy] 经代理请求失败，20s 内直连: ${url.slice(0, 90)} (${err.message})`)
    }
  }
  return globalThis.fetch(url, base)
}

export async function fetchJSON(url, opts = {}) {
  const res = await smartFetch(url, opts)
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url.slice(0, 120)}`)
  return res.json()
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
