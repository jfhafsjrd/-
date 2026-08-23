/**
 * Life OS 数据层 — JSON 集合存储
 *
 * 设计原则（吸取 v1/v2 教训）：
 * 1. 直接方法调用，绝不解析 SQL 字符串 —— v1 的数据污染根源
 * 2. 全链路 camelCase，数据库里存的字段名与 API 返回、前端使用完全一致
 * 3. 防抖落盘 + 退出兜底，写入原子（先写临时文件再 rename）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, 'data.json')

/* ---------------- 查询操作符 ---------------- */
function matchCondition(item, query) {
  for (const key in query) {
    const cond = query[key]
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const val = item[key]
      if (cond.$gt !== undefined && !(val > cond.$gt)) return false
      if (cond.$gte !== undefined && !(val >= cond.$gte)) return false
      if (cond.$lt !== undefined && !(val < cond.$lt)) return false
      if (cond.$lte !== undefined && !(val <= cond.$lte)) return false
      if (cond.$ne !== undefined && val === cond.$ne) return false
      if (cond.$in !== undefined && !cond.$in.includes(val)) return false
      if (cond.$like !== undefined) {
        const hay = String(val ?? '').toLowerCase()
        if (!hay.includes(String(cond.$like).toLowerCase())) return false
      }
      if (cond.$regex !== undefined && !new RegExp(cond.$regex, 'i').test(String(val ?? ''))) return false
    } else if (item[key] !== cond) {
      return false
    }
  }
  return true
}

/* ---------------- Collection ---------------- */
class Collection {
  constructor(name, rows, persist) {
    this.name = name
    this.rows = Array.isArray(rows) ? rows : []
    this._persist = persist
    this._nextId = this.rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)
  }

  find(query = {}, opts = {}) {
    let out = this.rows.filter((r) => matchCondition(r, query))
    if (opts.sort) {
      const [field, dir] = Object.entries(opts.sort)[0]
      out = out.slice().sort((a, b) => {
        const av = a[field] ?? ''
        const bv = b[field] ?? ''
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'zh-CN')
        return dir === -1 || dir === 'desc' ? -cmp : cmp
      })
    }
    if (opts.skip) out = out.slice(opts.skip)
    if (opts.limit) out = out.slice(0, opts.limit)
    return out
  }

  findOne(query) {
    return this.rows.find((r) => matchCondition(r, query)) || null
  }

  count(query = {}) {
    return query && Object.keys(query).length ? this.find(query).length : this.rows.length
  }

  insert(doc) {
    const row = {
      id: ++this._nextId,
      createdAt: new Date().toISOString(),
      ...doc,
    }
    this.rows.push(row)
    this._persist()
    return row
  }

  /** 按 id 或任意唯一条件 upsert */
  upsert(match, doc) {
    const existing = this.findOne(match)
    if (existing) {
      Object.assign(existing, doc, { id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() })
      this._persist()
      return existing
    }
    return this.insert(doc)
  }

  updateOne(id, patch) {
    const row = this.rows.find((r) => r.id === Number(id))
    if (!row) return null
    const safe = { ...patch }
    delete safe.id
    delete safe.createdAt
    Object.assign(row, safe, { updatedAt: new Date().toISOString() })
    this._persist()
    return row
  }

  remove(query) {
    const before = this.rows.length
    this.rows = this.rows.filter((r) => !matchCondition(r, query))
    const removed = before - this.rows.length
    if (removed) this._persist()
    return removed
  }
}

/* ---------------- 持久化 ---------------- */
function atomicWrite(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
}

const state = { collections: {}, raw: {} }
let saveTimer = null

/** 快照：以磁盘原始数据为底，合并已加载集合 —— 防止未加载的集合被意外清掉 */
function snapshot() {
  return { ...state.raw, ...Object.fromEntries(Object.entries(state.collections).map(([n, c]) => [n, c.rows])) }
}

function scheduleSave() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      atomicWrite(DATA_FILE, snapshot())
    } catch (err) {
      console.error('[db] 落盘失败:', err.message)
    }
  }, 1500)
}

function flushSync() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  // 没有任何集合被使用过时绝不写盘（防止启动即崩的场景清空数据文件）
  if (!Object.keys(state.collections).length) return
  try {
    atomicWrite(DATA_FILE, snapshot())
  } catch {
    /* 退出时尽力而为 */
  }
}

/* ---------------- 初始化 ---------------- */
function load() {
  let raw = {}
  if (fs.existsSync(DATA_FILE)) {
    try {
      raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
    } catch (err) {
      console.error('[db] data.json 损坏，已备份并重置:', err.message)
      fs.copyFileSync(DATA_FILE, DATA_FILE + '.corrupted')
      raw = {}
    }
  }
  state.raw = raw
}

load()

/** 获取（或创建）一个集合 */
export function collection(name, seed = []) {
  if (!state.collections[name]) {
    state.collections[name] = new Collection(name, state.raw[name] ?? seed, scheduleSave)
  }
  return state.collections[name]
}

/* 退出兜底落盘 */
process.on('exit', flushSync)
process.on('SIGINT', () => {
  flushSync()
  process.exit(0)
})
process.on('SIGTERM', () => {
  flushSync()
  process.exit(0)
})

export { flushSync }
