/**
 * GitHub 追更仓 API — 仓库追踪 + Release 安装包解析 + 极客雷达
 * 字段契约（camelCase，前后端一字不差）:
 *   追踪项: { id, owner, repo, category: ios|android|pc|selfhost, note }
 *   Release: { tag, name, publishedAt, notes, assets: [{ name, url, size, platform }] }
 */
import { Router } from 'express'
import { collection } from '../db.js'
import { fetchJSON } from '../utils.js'

const router = Router()
const repos = () => collection('githubRepos')

const GH = 'https://api.github.com'
const ghHeaders = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'LifeOS/5.0',
}
if (process.env.GITHUB_TOKEN) ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

/** 极客雷达精选池 — 高质量开源项目 + 大白话中文简介 */
const RADAR_POOL = [
  { owner: 'Aidoku', repo: 'Aidoku', name: 'Aidoku', category: 'ios', desc: '苹果手机漫画阅读器，支持全网图源扩展' },
  { owner: 'clash-verge-rev', repo: 'clash-verge-rev', name: 'Clash Verge Rev', category: 'pc', desc: '网络代理工具，界面现代好看，多平台通用' },
  { owner: 'localsend', repo: 'localsend', name: 'LocalSend', category: 'pc', desc: '局域网文件互传神器，手机电脑互发文件不用数据线' },
  { owner: '2dust', repo: 'v2rayN', name: 'v2rayN', category: 'pc', desc: 'Windows 老牌网络代理客户端' },
  { owner: 'Stirling-Tools', repo: 'Stirling-PDF', name: 'Stirling PDF', category: 'selfhost', desc: '自部署 PDF 工具箱，合并拆分加水印加密样样都有' },
  { owner: 'immich-app', repo: 'immich', name: 'Immich', category: 'selfhost', desc: '自建谷歌相册，手机照片自动备份，支持人像搜索' },
  { owner: 'jellyfin', repo: 'jellyfin', name: 'Jellyfin', category: 'selfhost', desc: '自建影视库服务器，自动刮削海报，全家设备同步观看' },
  { owner: 'navidrome', repo: 'navidrome', name: 'Navidrome', category: 'selfhost', desc: '自建音乐服务器，网页听歌，手机也有 App' },
  { owner: 'alist-org', repo: 'alist', name: 'AList', category: 'selfhost', desc: '网盘聚合器，把各大网盘挂载成一个网页文件管理器' },
  { owner: 'bitwarden', repo: 'clients', name: 'Bitwarden', category: 'pc', desc: '开源密码管理器，全平台同步，告别记事本存密码' },
  { owner: 'home-assistant', repo: 'core', name: 'Home Assistant', category: 'selfhost', desc: '智能家居中枢，各品牌设备统一到一个界面控制' },
  { owner: 'nextcloud', repo: 'server', name: 'Nextcloud', category: 'selfhost', desc: '自建私有云盘，文件同步、日历、联系人一整套' },
  { owner: 'pot-app', repo: 'pot', name: 'Pot', category: 'pc', desc: '划词翻译工具，选中文字即翻译，支持多家引擎' },
  { owner: 'flameshot-org', repo: 'flameshot', name: 'Flameshot', category: 'pc', desc: '截图标注工具，截完直接画箭头打马赛克' },
  { owner: 'agalwood', repo: 'Motrix', name: 'Motrix', category: 'pc', desc: '全能下载工具，界面漂亮，支持 BT 和磁力链' },
]

/** 文件名 → 平台标签 */
function platformOf(name) {
  const n = String(name).toLowerCase()
  if (n.endsWith('.ipa')) return 'iOS'
  if (n.endsWith('.apk')) return 'Android'
  if (n.endsWith('.exe') || n.endsWith('.msi')) return 'Windows'
  if (n.endsWith('.dmg') || n.endsWith('.pkg')) return 'macOS'
  if (n.endsWith('.deb') || n.endsWith('.appimage') || n.endsWith('.rpm')) return 'Linux'
  return '压缩包'
}

/** Release → 统一结构 */
function mapRelease(r) {
  return {
    tag: r.tag_name || '',
    name: r.name || r.tag_name || '',
    publishedAt: r.published_at || '',
    notes: String(r.body || '').slice(0, 1200),
    assets: (r.assets || [])
      .filter((a) => !a.name.endsWith('.blockmap') && !a.name.endsWith('.txt') && !a.name.endsWith('.zsync') && a.state === 'uploaded')
      .map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size, platform: platformOf(a.name) })),
  }
}

/* ---------- GitHub 元信息缓存（10 分钟，防限流） ---------- */
const metaCache = new Map()
const META_TTL = 10 * 60 * 1000

async function ghMeta(owner, repo) {
  const key = `${owner}/${repo}`
  const hit = metaCache.get(key)
  if (hit && Date.now() - hit.at < META_TTL) return hit.data
  try {
    const [info, rels] = await Promise.all([
      fetchJSON(`${GH}/repos/${key}`, { timeout: 12000, headers: ghHeaders }),
      fetchJSON(`${GH}/repos/${key}/releases?per_page=3`, { timeout: 12000, headers: ghHeaders }).catch(() => []),
    ])
    const latest = Array.isArray(rels) && rels.length ? mapRelease(rels[0]) : null
    const data = {
      stars: info.stargazers_count ?? 0,
      forks: info.forks_count ?? 0,
      openIssues: info.open_issues_count ?? 0,
      description: info.description || '',
      language: info.language || '',
      homepage: info.homepage || '',
      pushedAt: info.pushed_at || '',
      latestRelease: latest,
      error: '',
    }
    metaCache.set(key, { at: Date.now(), data })
    return data
  } catch (err) {
    const data = { stars: 0, forks: 0, openIssues: 0, description: '', language: '', homepage: '', pushedAt: '', latestRelease: null, error: err.message }
    metaCache.set(key, { at: Date.now(), data })
    return data
  }
}

/* ---------- 路由 ---------- */
router.get('/repos', async (req, res) => {
  const list = repos().find({}, { sort: { createdAt: -1 } })
  const enriched = await Promise.all(
    list.map(async (r) => {
      const meta = await ghMeta(r.owner, r.repo)
      return { ...r, info: meta }
    }),
  )
  res.json(enriched)
})

/** URL 或 owner/repo → 提取归一化 */
function parseInput(input) {
  const s = String(input || '').trim().replace(/\.git$/, '')
  const m = s.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/) || s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  return m ? { owner: m[1], repo: m[2] } : null
}

router.post('/repos', async (req, res) => {
  const { input, category = 'pc', note = '' } = req.body
  const parsed = parseInput(input)
  if (!parsed) return res.status(400).json({ error: '无法识别仓库地址，请粘贴 GitHub 链接或输入 owner/repo' })
  const { owner, repo } = parsed
  if (repos().findOne({ owner, repo })) return res.status(409).json({ error: `${owner}/${repo} 已在追踪列表` })
  try {
    const info = await fetchJSON(`${GH}/repos/${owner}/${repo}`, { timeout: 12000, headers: ghHeaders })
    if (info.id === undefined) throw new Error('仓库不存在')
    const row = repos().insert({ owner, repo, category, note })
    res.status(201).json({ ...row, info: await ghMeta(owner, repo) })
  } catch (err) {
    res.status(502).json({ error: `仓库校验失败（${err.message}）` })
  }
})

router.put('/:id', (req, res) => {
  const patch = { ...req.body }
  delete patch.id
  delete patch.createdAt
  delete patch.owner
  delete patch.repo
  const updated = repos().updateOne(req.params.id, patch)
  if (!updated) return res.status(404).json({ error: '追踪项不存在' })
  res.json(updated)
})

router.delete('/repos/:id', (req, res) => {
  const removed = repos().remove({ id: Number(req.params.id) })
  if (!removed) return res.status(404).json({ error: '追踪项不存在' })
  res.json({ removed })
})

router.delete('/:id', (req, res) => {
  const removed = repos().remove({ id: Number(req.params.id) })
  if (!removed) return res.status(404).json({ error: '追踪项不存在' })
  res.json({ removed })
})

/** 某仓库的近 3 个 Release 明细 */
router.get('/repos/:owner/:repo/releases', async (req, res) => {
  const { owner, repo } = req.params
  try {
    const rels = await fetchJSON(`${GH}/repos/${owner}/${repo}/releases?per_page=3`, { timeout: 12000, headers: ghHeaders })
    if (!Array.isArray(rels)) return res.json([])
    res.json(rels.map(mapRelease))
  } catch (err) {
    res.status(502).json({ error: `Release 获取失败（${err.message}）` })
  }
})

/** 🎲 极客雷达：排除已追踪，随机推荐 */
router.get('/radar', (req, res) => {
  const count = Math.min(Math.max(Number(req.query.count) || 3, 1), 6)
  const tracked = new Set(repos().find().map((r) => `${r.owner}/${r.repo}`))
  const pool = RADAR_POOL.filter((p) => !tracked.has(`${p.owner}/${p.repo}`))
  const picked = pool.sort(() => Math.random() - 0.5).slice(0, count)
  res.json(picked)
})

/* ---------- 发现/探索：GitHub 仓库搜索（语言/Stars/趋势/topic 筛选），10 分钟缓存防限流 ---------- */
const discoverCache = new Map()
const DISCOVER_TTL = 10 * 60 * 1000

router.get('/discover', async (req, res) => {
  const { q = '', language = '', minStars = '0', sort = 'stars', range = '', topic = '', refresh = '' } = req.query
  const cacheKey = JSON.stringify({ q, language, minStars, sort, range, topic })
  const hit = discoverCache.get(cacheKey)
  if (!refresh && hit && Date.now() - hit.at < DISCOVER_TTL) {
    return res.json({ ...hit.data, cached: true })
  }

  const quals = []
  if (language) quals.push(`language:${language}`)
  if (topic) quals.push(`topic:${topic}`)
  if (Number(minStars) > 0) quals.push(`stars:>=${Number(minStars)}`)
  const daysAgo = { day: 1, week: 7, month: 30 }[range]
  if (daysAgo) quals.push(`pushed:>${new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)}`)
  const query = [String(q).trim() || 'stars:>5000', ...quals].join(' ')
  const sortKey = { stars: 'stars', forks: 'forks', updated: 'updated' }[sort] || 'stars'

  try {
    // refresh 模式随机翻页，保证「换一批」能看到不同项目
    const page = refresh ? 1 + Math.floor(Math.random() * 3) : 1
    const j = await fetchJSON(
      `${GH}/search/repositories?q=${encodeURIComponent(query)}&sort=${sortKey}&order=desc&per_page=24&page=${page}`,
      { timeout: 12000, headers: ghHeaders },
    )
    const repos = (j.items || []).map(mapRepo)
    const data = { repos, total: j.total_count ?? repos.length, cached: false }
    discoverCache.set(cacheKey, { at: Date.now(), data })
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: `GitHub 搜索失败（${err.message}）${process.env.GITHUB_TOKEN ? '' : ' —— 建议配置 GITHUB_TOKEN 提升限额'}` })
  }
})

/* ---------- 每日推荐：以日期为种子随机选题库 + 页码，缓存 24 小时 ---------- */
const DAILY_POOLS = [
  { topic: 'self-hosted', min: 2000, name: '自托管神器' },
  { topic: 'cli', min: 3000, name: '命令行利器' },
  { q: 'awesome', min: 10000, name: '精选清单' },
  { topic: 'developer-tools', min: 2000, name: '开发工具' },
  { topic: 'ai', min: 5000, name: 'AI 前沿' },
  { topic: 'privacy', min: 1000, name: '隐私守护' },
  { topic: 'music', min: 1000, name: '音乐相关' },
  { q: 'terminal file manager', min: 2000, name: '终端美学' },
  { topic: 'homepage', min: 1000, name: '仪表盘/主页' },
  { topic: 'automation', min: 2000, name: '自动化' },
]
let dailyCache = { at: 0, data: null }

router.get('/daily', async (req, res) => {
  if (dailyCache.data && Date.now() - dailyCache.at < 24 * 3600 * 1000) {
    return res.json({ ...dailyCache.data, cached: true })
  }
  const today = new Date()
  const seed = Number(`${today.getFullYear()}${today.getMonth() + 1}${today.getDate()}`)
  const pool = DAILY_POOLS[seed % DAILY_POOLS.length]
  const page = (seed % 3) + 1
  try {
    const quals = [`stars:>=${pool.min}`]
    if (pool.topic) quals.push(`topic:${pool.topic}`)
    const query = [pool.q || 'stars:>5000', ...quals].join(' ')
    const j = await fetchJSON(
      `${GH}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=15&page=${page}`,
      { timeout: 12000, headers: ghHeaders },
    )
    // 种子洗牌：每天顺序不同
    const repos = (j.items || []).map(mapRepo)
    const s = seed
    for (let i = repos.length - 1; i > 0; i--) {
      const j2 = (s * (i + 7)) % (i + 1)
      ;[repos[i], repos[j2]] = [repos[j2], repos[i]]
    }
    const data = { theme: pool.name, repos: repos.slice(0, 12), cached: false }
    dailyCache = { at: Date.now(), data }
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: `每日推荐获取失败（${err.message}）` })
  }
})

/** GitHub repo 对象 → 统一 camelCase */
function mapRepo(r) {
  return {
    fullName: r.full_name,
    owner: r.owner?.login || '',
    repo: r.name,
    description: r.description || '',
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? 0,
    language: r.language || '',
    topics: (r.topics || []).slice(0, 4),
    updatedAt: r.pushed_at || '',
    avatar: r.owner?.avatar_url || '',
    homepage: r.homepage || '',
  }
}

export default router
