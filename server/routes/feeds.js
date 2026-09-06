/**
 * 资讯订阅 — RSS 拉取与解析（内存缓存 30 分钟）
 * GET /api/feeds?feed=sspai|ruanyifeng → { feed, items: [{title, link, date}] }
 */
import { Router } from 'express'
import { smartFetch } from '../utils.js'

const router = Router()

const FEEDS = {
  sspai: { name: '少数派', url: 'https://sspai.com/feed' },
  ruanyifeng: { name: '阮一峰周刊', url: 'https://www.ruanyifeng.com/blog/atom.xml' },
}

const entDecode = (s) =>
  String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? entDecode(m[1]).trim() : ''
}

const cache = new Map() // key → { at, items }

function parseFeed(xml) {
  const items = []
  /* RSS 2.0 */
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const block = m[0]
    const title = tag(block, 'title')
    const link = tag(block, 'link')
    const date = tag(block, 'pubDate')
    if (title && link) items.push({ title, link, date: date ? new Date(date).toISOString().slice(0, 10) : '' })
  }
  if (items.length) return items.slice(0, 12)
  /* Atom */
  for (const m of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const block = m[0]
    const title = tag(block, 'title')
    const linkM = block.match(/<link[^>]*href\s*=\s*["']([^"']+)["']/i)
    const date = tag(block, 'updated') || tag(block, 'published')
    if (title && linkM) items.push({ title, link: entDecode(linkM[1]), date: date ? date.slice(0, 10) : '' })
  }
  return items.slice(0, 12)
}

router.get('/', async (req, res) => {
  const key = String(req.query.feed || 'sspai')
  const feed = FEEDS[key]
  if (!feed) return res.status(400).json({ error: '未知订阅源' })
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) {
    return res.json({ feed: key, name: feed.name, items: hit.items })
  }
  try {
    const upstream = await smartFetch(feed.url, { timeout: 12000 })
    if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`)
    const xml = await upstream.text()
    const items = parseFeed(xml)
    if (!items.length) throw new Error('没有解析到条目')
    cache.set(key, { at: Date.now(), items })
    res.json({ feed: key, name: feed.name, items })
  } catch (err) {
    console.error(`[feeds] ${key} 拉取失败:`, err.message)
    res.status(502).json({ error: `订阅源拉取失败（${err.message}）` })
  }
})

export default router
