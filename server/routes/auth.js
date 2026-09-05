/**
 * 鉴权 — 「公开浏览 + 静默保护写操作」
 *
 * 哲学：影视/游戏/书架本来就是展示给家人朋友看的，浏览零门槛、无任何登录框；
 * 但增删改（POST/PUT/DELETE）需要站主令牌——防止陌生人清空数据。
 * 站主设备用一次专属链接（/?auth=访问码）解锁，令牌种在浏览器里 10 年有效。
 * .env 配 ACCESS_CODE 即启用；删掉它 = 全站完全公开连写也放开（不推荐）。
 */
import { Router } from 'express'
import crypto from 'node:crypto'
import { fetchJSON } from '../utils.js'

const router = Router()

const OAUTH_ID = () => process.env.GITHUB_OAUTH_CLIENT_ID || ''
const OAUTH_SECRET = () => process.env.GITHUB_OAUTH_CLIENT_SECRET || ''
const CODE = () => process.env.ACCESS_CODE || ''

/** 会话令牌：由站主密钥派生（无状态，重启不失效，换密钥即全员下线） */
export function deriveToken() {
  const secret = OAUTH_SECRET() || CODE()
  if (!secret) return ''
  return crypto.createHmac('sha256', secret).update('lifeos-auth-v2').digest('hex')
}

const tokenOf = (req) => req.get('x-auth-token') || req.cookies?.auth_token || ''

/** 站主专属：即使浏览公开，这类端点也必须持有令牌（数据导出等） */
export function requireOwner(req, res, next) {
  if (!deriveToken()) return next()
  if (tokenOf(req) && tokenOf(req) === deriveToken()) return next()
  res.status(403).json({ error: '访客只读：此操作需站主身份' })
}

/** 鉴权中间件：GET/HEAD 浏览全放行；写操作校验站主令牌（访客 403 只读） */
export function authMiddleware(req, res, next) {
  if (!deriveToken()) return next()
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (tokenOf(req) && tokenOf(req) === deriveToken()) return next()
  res.status(403).json({ error: '访客只读：修改需站主身份' })
}

router.get('/status', (req, res) => {
  res.json({
    readOnlyForVisitor: Boolean(deriveToken()),
    authorized: !deriveToken() || tokenOf(req) === deriveToken(),
  })
})

/* ---------- 站主解锁：访问码换长效令牌（专属链接 /?auth=访问码 自动调用） ---------- */
router.post('/login', (req, res) => {
  if (!CODE() && !(OAUTH_ID() && OAUTH_SECRET())) return res.status(400).json({ error: '本站未启用写保护' })
  const secret = OAUTH_SECRET() ? String(req.body.code || '') === OAUTH_SECRET() : String(req.body.code || '') === CODE()
  if (!secret) return res.status(403).json({ error: '口令不正确' })
  res.cookie('auth_token', deriveToken(), { httpOnly: true, sameSite: 'lax', maxAge: 3650 * 86400_000, path: '/' })
  res.json({ token: deriveToken() })
})

router.post('/logout', (req, res) => {
  res.clearCookie('auth_token')
  res.json({ ok: true })
})

export default router
