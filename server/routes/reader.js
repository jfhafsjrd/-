/**
 * 阅读板块 API — 小说(TXT) + 漫画(CBZ/ZIP) 导入与阅读
 *
 * 书籍元数据存 books 集合，文件存 server/books/{id}.{txt} 或 {id}/p{n}.jpg
 * 字段: { id, title, type: txt|cbz, size, chars?, pages?, chapterCount?, chapters?, progress }
 */
import { Router } from 'express'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import { collection } from '../db.js'

const router = Router()
const books = () => collection('books')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BOOK_DIR = path.join(__dirname, '..', 'books')
fs.mkdirSync(BOOK_DIR, { recursive: true })

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)$/i
const CHAPTER_RE = /^[ \t]*((?:第[0-9一二三四五六七八九十百千万零两]{1,12}[章节卷回部集话幕]|序章?|楔子|引子|尾声|终章|番外篇?)[ \t]?[^\n]{0,50})$/gm

/* ---------- EPUB 解析（z-library 主流格式） ---------- */

/** HTML 实体解码 */
function entDecode(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/** XHTML → 纯文本段落（按块级标签断行，剥全部标签，天然免疫脚本注入） */
function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br[^>]*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => entDecode(l.trim()))
    .filter(Boolean)
    .join('\n')
}

/** POSIX 相对路径解析 */
function resolvePath(base, rel) {
  const parts = String(rel).split('/')
  const out = base ? base.split('/').slice(0, -1) : []
  for (const seg of parts) {
    if (!seg || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(decodeURIComponentSafe(seg))
  }
  return out.join('/')
}

function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

const xmlAttr = (xml, name) => {
  const m = String(xml).match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))
  return m ? entDecode(m[1]) : ''
}

/**
 * 解析 EPUB zip → { title, chapters, texts, coverBuf, coverMime }
 * 路线：container.xml → OPF → manifest/spine → 逐文档提纯文本；
 * 标题优先取 EPUB3 nav / EPUB2 NCX 目录，缺失回退文档内标题。
 */
export function importEpub(files) {
  const fileAt = (p) => {
    if (files[p] !== undefined) return files[p]
    const lower = Object.keys(files).find((k) => k.toLowerCase() === p.toLowerCase())
    if (lower !== undefined) return files[lower]
    return files[decodeURIComponentSafe(p)]
  }
  const containerKey = Object.keys(files).find((k) => /container\.xml$/i.test(k))
  if (!containerKey) throw new Error('不是有效的 EPUB（缺 container.xml）')
  /* full-path 是从 zip 根出发的绝对路径，直接使用（不再拼 container 所在目录） */
  const opfPath = decodeURIComponentSafe(xmlAttr(Buffer.from(files[containerKey]).toString('utf-8'), 'full-path'))
  const opfXml = Buffer.from(fileAt(opfPath) || '').toString('utf-8')
  if (!opfXml) throw new Error('EPUB 缺 OPF 清单')

  /* manifest */
  const items = new Map()
  for (const m of opfXml.matchAll(/<item\b[^>]*>/gi)) {
    const id = xmlAttr(m[0], 'id')
    const href = xmlAttr(m[0], 'href')
    if (id && href) items.set(id, { href: resolvePath(opfPath, href), mt: xmlAttr(m[0], 'media-type'), props: xmlAttr(m[0], 'properties') })
  }
  /* spine（缺省回退：全部 xhtml 文档按名排序） */
  let docs = [...opfXml.matchAll(/<itemref\b[^>]*idref\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map((m) => items.get(m[1])?.href)
    .filter(Boolean)
  if (!docs.length) {
    docs = [...items.values()].filter((it) => /\.x?html?$/i.test(it.href)).map((it) => it.href).sort()
  }
  docs = [...new Set(docs)]

  /* 元数据 */
  const metaTitle = entDecode((opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i) || [])[1] || '').trim()
  const metaCreator = entDecode((opfXml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i) || [])[1] || '').trim()

  /* 目录标题：EPUB3 nav → EPUB2 NCX → 文档内标题 */
  const toc = []
  const navItem = [...items.values()].find((it) => /\bnav\b/.test(it.props))
  const ncxItem = [...items.values()].find((it) => /dtbncx/i.test(it.mt))
  if (navItem && fileAt(navItem.href)) {
    const navXml = Buffer.from(fileAt(navItem.href)).toString('utf-8')
    for (const m of navXml.matchAll(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const file = resolvePath(navItem.href, m[1].split('#')[0])
      const text = entDecode(String(m[2]).replace(/<[^>]+>/g, '')).trim()
      if (file && text) toc.push({ file, title: text.slice(0, 60) })
    }
  } else if (ncxItem && fileAt(ncxItem.href)) {
    const ncxXml = Buffer.from(fileAt(ncxItem.href)).toString('utf-8')
    for (const m of ncxXml.matchAll(/<navPoint\b[\s\S]*?<\/navPoint>/gi)) {
      const src = xmlAttr((m[0].match(/<content\b[^>]*>/i) || [''])[0], 'src')
      const text = entDecode((m[0].match(/<text[^>]*>([\s\S]*?)<\/text>/i) || [])[1] || '').trim()
      if (src && text) toc.push({ file: resolvePath(ncxItem.href, src.split('#')[0]), title: text.slice(0, 60) })
    }
  }

  /* 逐文档提纯文本 + 定标题 */
  const chapters = []
  const texts = []
  let chars = 0
  docs.forEach((file, i) => {
    const raw = fileAt(file)
    if (raw === undefined) return
    const html = Buffer.from(raw).toString('utf-8')
    const text = htmlToText(html)
    if (!text) return
    const tocHit = toc.find((t) => t.file === file)
    const docTitle = entDecode(
      (html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) || [])[1] || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '',
    )
      .replace(/<[^>]+>/g, '')
      .trim()
    chapters.push({ title: (tocHit?.title || docTitle || `第 ${i + 1} 节`).slice(0, 60) })
    texts.push(text)
    chars += text.length
  })

  /* 封面：properties=cover-image → meta name=cover → 文件名含 cover 的图片 */
  let coverBuf = null
  let coverMime = 'image/jpeg'
  const coverItem = [...items.values()].find((it) => /cover-image/.test(it.props))
    || [...items.values()].find((it) => /image/i.test(it.mt) && /cover/i.test(it.href))
  const coverMetaId = (opfXml.match(/<meta[^>]*name\s*=\s*["']cover["'][^>]*content\s*=\s*["']([^"']+)["']/i) || [])[1]
  const coverRef = coverItem || (coverMetaId ? items.get(coverMetaId) : null)
  if (coverRef && fileAt(coverRef.href)) {
    coverBuf = Buffer.from(fileAt(coverRef.href))
    coverMime = coverRef.mt || (/\.png$/i.test(coverRef.href) ? 'image/png' : 'image/jpeg')
  }

  if (!chapters.length) throw new Error('EPUB 里没有可读正文')
  return {
    title: [metaTitle, metaCreator].filter(Boolean).join(' · ') || '',
    chapters,
    texts,
    chars,
    coverBuf,
    coverMime,
  }
}

/* ---------- 编码检测：中文小说常见 GBK，优先 UTF-8 失败回退 ---------- */
function decodeText(buf) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  const bad = (utf8.match(/\uFFFD/g) || []).length
  if (bad <= buf.length * 0.0005) return utf8
  try {
    return new TextDecoder('gbk').decode(buf)
  } catch {
    return utf8
  }
}

/* ---------- TXT 章节解析：按"第X章/序章/楔子…"切分 ---------- */
function parseChapters(text) {
  const chapters = []
  let m
  CHAPTER_RE.lastIndex = 0
  while ((m = CHAPTER_RE.exec(text))) {
    const title = m[1].trim().slice(0, 50)
    if (m[0].length > 60) continue // 段落里碰巧以"第…"开头，跳过
    if (!chapters.length || m.index > chapters[chapters.length - 1].start) {
      chapters.push({ title, start: m.index })
    }
  }
  if (chapters.length < 3) return [{ title: '全文', start: 0 }]
  return chapters.map((c, i, arr) => ({
    title: c.title,
    start: c.start,
    end: i + 1 < arr.length ? arr[i + 1].start : text.length,
  }))
}

/* ---------- 书籍列表 ---------- */
router.get('/', (req, res) => {
  const list = books().find({}, { sort: { lastReadAt: -1, createdAt: -1 } })
  res.json(list.map(({ chapters, ...b }) => ({ ...b, chapterCount: chapters?.length || 0 })))
})

/* ---------- 上传导入：raw body + ?name=文件名 ---------- */
router.post('/upload', express.raw({ type: '*/*', limit: '300mb' }), (req, res) => {
  try {
    const rawName = String(req.query.name || '未命名')
    const safeName = rawName.replace(/[\\/:*?"<>|]/g, '_')
    const ext = path.extname(safeName).toLowerCase()
    const title = safeName.replace(/\.(txt|cbz|zip|epub)$/i, '')
    const buf = Buffer.from(req.body)
    if (!buf.length) return res.status(400).json({ error: '文件内容为空' })

    if (ext === '.epub') {
      let parsed
      try {
        parsed = importEpub(unzipSync(new Uint8Array(buf)))
      } catch (e) {
        return res.status(400).json({ error: `EPUB 解析失败：${e.message}` })
      }
      const book = books().insert({
        title: parsed.title || title,
        type: 'epub',
        size: buf.length,
        chars: parsed.chars,
        chapters: parsed.chapters,
        coverMime: parsed.coverMime,
        progress: { chapter: 0, offset: 0, pct: 0 },
        lastReadAt: '',
      })
      const dir = path.join(BOOK_DIR, String(book.id))
      fs.mkdirSync(dir, { recursive: true })
      parsed.texts.forEach((t, i) => fs.writeFileSync(path.join(dir, `chap${i}.txt`), t, 'utf-8'))
      if (parsed.coverBuf) fs.writeFileSync(path.join(dir, 'cover.img'), parsed.coverBuf)
      return res.status(201).json({ ...book, chapters: undefined, chapterCount: parsed.chapters.length })
    }

    if (ext === '.txt') {
      const text = decodeText(buf).replace(/\r\n?/g, '\n')
      const chapters = parseChapters(text)
      const book = books().insert({
        title,
        type: 'txt',
        size: buf.length,
        chars: text.length,
        chapters,
        progress: { chapter: 0, offset: 0, pct: 0 },
        lastReadAt: '',
      })
      fs.writeFileSync(path.join(BOOK_DIR, `${book.id}.txt`), text, 'utf-8')
      return res.status(201).json({ ...book, chapters: undefined, chapterCount: chapters.length })
    }

    if (ext === '.cbz' || ext === '.zip') {
      let files
      try {
        files = unzipSync(new Uint8Array(buf))
      } catch {
        return res.status(400).json({ error: '无法解压 zip/cbz 文件' })
      }
      const names = Object.keys(files)
        .filter((n) => IMG_EXT.test(n) && !n.startsWith('__MACOSX'))
        .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }))
      if (!names.length) return res.status(400).json({ error: '压缩包里没有图片' })

      const book = books().insert({
        title,
        type: 'cbz',
        size: buf.length,
        pages: names.length,
        progress: { page: 0, pct: 0 },
        lastReadAt: '',
      })
      const dir = path.join(BOOK_DIR, String(book.id))
      fs.mkdirSync(dir, { recursive: true })
      names.forEach((n, i) => {
        fs.writeFileSync(path.join(dir, `p${i}${path.extname(n).toLowerCase()}`), Buffer.from(files[n]))
      })
      return res.status(201).json({ ...book, chapterCount: 0 })
    }

    return res.status(400).json({ error: '仅支持 .txt / .epub（小说）和 .cbz/.zip（漫画）' })
  } catch (err) {
    res.status(500).json({ error: `导入失败（${err.message}）` })
  }
})

const getBook = (id) => books().findOne({ id: Number(id) })

/* ---------- TXT/EPUB：目录 ---------- */
router.get('/:id/chapters', (req, res) => {
  const book = getBook(req.params.id)
  if (!book) return res.status(404).json({ error: '书籍不存在' })
  res.json((book.chapters || []).map((c, i) => ({ index: i, title: c.title })))
})

/* ---------- TXT/EPUB：章节正文（前端分栏分页） ---------- */
router.get('/:id/text', (req, res) => {
  const book = getBook(req.params.id)
  if (!book || (book.type !== 'txt' && book.type !== 'epub')) return res.status(404).json({ error: '书籍不存在' })
  const idx = Math.max(0, Math.min(Number(req.query.chapter) || 0, book.chapters.length - 1))
  let text = ''
  if (book.type === 'epub') {
    const file = path.join(BOOK_DIR, String(book.id), `chap${idx}.txt`)
    if (!fs.existsSync(file)) return res.status(410).json({ error: '章节文件已丢失，请重新导入' })
    text = fs.readFileSync(file, 'utf-8')
  } else {
    const file = path.join(BOOK_DIR, `${book.id}.txt`)
    if (!fs.existsSync(file)) return res.status(410).json({ error: '文件已丢失，请重新导入' })
    const ch = book.chapters[idx]
    text = fs.readFileSync(file, 'utf-8').slice(ch.start, ch.end).trim()
  }
  res.json({ index: idx, title: book.chapters[idx].title, text, total: book.chapters.length })
})

/* ---------- 漫画/EPUB：封面 / 漫画单页 ---------- */
router.get('/:id/cover', (req, res) => {
  const book = getBook(req.params.id)
  if (!book) return res.status(404).end()
  if (book.type === 'epub') {
    const file = path.join(BOOK_DIR, String(book.id), 'cover.img')
    if (!fs.existsSync(file)) return res.status(404).end()
    res.set('Cache-Control', 'public, max-age=86400')
    res.set('Content-Type', book.coverMime || 'image/jpeg')
    return res.sendFile(path.join(String(book.id), 'cover.img'), root)
  }
  if (book.type !== 'cbz') return res.status(404).end()
  res.set('Cache-Control', 'public, max-age=86400')
  res.sendFile(pageFile(book.id, 0), root)
})
router.get('/:id/page/:n', (req, res) => {
  const book = getBook(req.params.id)
  if (!book || book.type !== 'cbz') return res.status(404).end()
  const n = Number(req.params.n)
  if (n < 0 || n >= book.pages) return res.status(404).end()
  res.set('Cache-Control', 'public, max-age=604800, immutable')
  res.sendFile(pageFile(book.id, n), root)
})

const root = { root: BOOK_DIR }
function pageFile(id, n) {
  const dir = path.join(BOOK_DIR, String(id))
  const hit = fs.readdirSync(dir).find((f) => f.startsWith(`p${n}.`))
  return hit ? path.join(String(id), hit) : ''
}

/* ---------- 进度 ---------- */
router.put('/:id/progress', (req, res) => {
  const book = getBook(req.params.id)
  if (!book) return res.status(404).json({ error: '书籍不存在' })
  const { progress = {}, pct = 0 } = req.body
  books().updateOne(book.id, { progress: { ...book.progress, ...progress }, pct, lastReadAt: new Date().toISOString() })
  res.json({ ok: true })
})

/* ---------- 书签：添加 / 列表随书返回 / 删除 ---------- */
router.post('/:id/bookmarks', (req, res) => {
  const book = getBook(req.params.id)
  if (!book) return res.status(404).json({ error: '书籍不存在' })
  const { chapter = 0, page = 0, pct = 0, label = '' } = req.body
  const marks = book.bookmarks || []
  marks.push({ chapter: Number(chapter) || 0, page: Number(page) || 0, pct: Number(pct) || 0, label: String(label).slice(0, 60), at: new Date().toISOString() })
  books().updateOne(book.id, { bookmarks: marks })
  res.status(201).json({ bookmarks: marks })
})

router.delete('/:id/bookmarks/:idx', (req, res) => {
  const book = getBook(req.params.id)
  if (!book) return res.status(404).json({ error: '书籍不存在' })
  const marks = book.bookmarks || []
  marks.splice(Number(req.params.idx), 1)
  books().updateOne(book.id, { bookmarks: marks })
  res.json({ bookmarks: marks })
})

/* ---------- TXT 全文搜索：返回命中章节 + 摘录 ---------- */
router.get('/:id/search', (req, res) => {
  const book = getBook(req.params.id)
  if (!book || book.type !== 'txt') return res.status(404).json({ error: '书籍不存在' })
  const q = String(req.query.q || '').trim()
  if (!q) return res.json({ hits: [] })
  const file = path.join(BOOK_DIR, `${book.id}.txt`)
  if (!fs.existsSync(file)) return res.status(410).json({ error: '文件已丢失' })
  const text = fs.readFileSync(file, 'utf-8')
  const hits = []
  for (let i = 0; i < book.chapters.length && hits.length < 30; i++) {
    const ch = book.chapters[i]
    const body = text.slice(ch.start, ch.end)
    const first = body.indexOf(q)
    if (first === -1) continue
    const count = body.split(q).length - 1
    hits.push({
      index: i,
      title: ch.title,
      count,
      excerpt: body.slice(Math.max(0, first - 20), first + q.length + 40).replace(/\s+/g, ' ').trim(),
    })
  }
  res.json({ hits })
})

/* ---------- 删除 ---------- */
router.delete('/:id', (req, res) => {
  const book = getBook(req.params.id)
  if (!book) return res.status(404).json({ error: '书籍不存在' })
  books().remove({ id: book.id })
  if (book.type === 'txt') fs.rmSync(path.join(BOOK_DIR, `${book.id}.txt`), { force: true })
  else fs.rmSync(path.join(BOOK_DIR, String(book.id)), { recursive: true, force: true })
  res.json({ removed: 1 })
})

export default router
