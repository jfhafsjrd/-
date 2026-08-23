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
    const title = safeName.replace(/\.(txt|cbz|zip)$/i, '')
    const buf = Buffer.from(req.body)
    if (!buf.length) return res.status(400).json({ error: '文件内容为空' })

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

    return res.status(400).json({ error: '仅支持 .txt（小说）和 .cbz/.zip（漫画）' })
  } catch (err) {
    res.status(500).json({ error: `导入失败（${err.message}）` })
  }
})

const getBook = (id) => books().findOne({ id: Number(id) })

/* ---------- TXT：目录 ---------- */
router.get('/:id/chapters', (req, res) => {
  const book = getBook(req.params.id)
  if (!book) return res.status(404).json({ error: '书籍不存在' })
  res.json((book.chapters || []).map((c, i) => ({ index: i, title: c.title })))
})

/* ---------- TXT：章节正文（前端分栏分页） ---------- */
router.get('/:id/text', (req, res) => {
  const book = getBook(req.params.id)
  if (!book || book.type !== 'txt') return res.status(404).json({ error: '书籍不存在' })
  const file = path.join(BOOK_DIR, `${book.id}.txt`)
  if (!fs.existsSync(file)) return res.status(410).json({ error: '文件已丢失，请重新导入' })
  const idx = Math.max(0, Math.min(Number(req.query.chapter) || 0, book.chapters.length - 1))
  const ch = book.chapters[idx]
  const text = fs.readFileSync(file, 'utf-8').slice(ch.start, ch.end).trim()
  res.json({ index: idx, title: ch.title, text, total: book.chapters.length })
})

/* ---------- 漫画：封面 / 单页 ---------- */
router.get('/:id/cover', (req, res) => {
  const book = getBook(req.params.id)
  if (!book || book.type !== 'cbz') return res.status(404).end()
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
