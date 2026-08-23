/**
 * 访问码鉴权 — 全站 API 登录闸门
 *
 * .env 设 ACCESS_CODE 即启用（留空 = 完全开放，本机开发用）。
 * 令牌由访问码 HMAC 派生：无状态、重启不失效，改码即全员下线。
 * 双通道携带：axios 走 X-Auth-Token 头，<img> 等标签请求靠 cookie。
 */
import { Router } from 'express'
import crypto from 'node:crypto'

const router = Router()

const CODE = () => process.env.ACCESS_CODE || ''

/** 由访问码派生固定令牌 */
export const deriveToken = () =>
  CODE() ? crypto.createHmac('sha256', CODE()).update('lifeos-auth-v1').digest('hex') : ''

const tokenOf = (req) => req.get('x-auth-token') || req.cookies?.auth_token || ''

/** 鉴权中间件：挂在 /api/health 与 /api/auth 之后，其余 /api/* 全拦 */
export function authMiddleware(req, res, next) {
  if (!CODE()) return next()
  if (tokenOf(req) === deriveToken()) return next()
  res.status(401).json({ error: '未登录或访问码已变更' })
}

router.get('/status', (req, res) => {
  const required = Boolean(CODE())
  res.json({ required, authorized: !required || tokenOf(req) === deriveToken() })
})

router.post('/login', (req, res) => {
  if (!CODE()) return res.status(400).json({ error: '本站未启用访问码' })
  if (String(req.body.code || '') !== CODE()) return res.status(401).json({ error: '访问码不正确' })
  res.cookie('auth_token', deriveToken(), { httpOnly: true, sameSite: 'lax', maxAge: 90 * 86400_000, path: '/' })
  res.json({ token: deriveToken() })
})

router.post('/logout', (req, res) => {
  res.clearCookie('auth_token')
  res.json({ ok: true })
})

export default router
