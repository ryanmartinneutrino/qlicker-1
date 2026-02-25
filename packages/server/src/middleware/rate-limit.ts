import rateLimit from 'express-rate-limit'
import type { Request } from 'express'

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.floor(parsed)
}

function userIdFromRequest(req: Request): string | null {
  const user = req.user as { _id?: unknown } | undefined
  if (!user || typeof user._id !== 'string') return null
  const userId = user._id.trim()
  return userId.length > 0 ? userId : null
}

function requestIdentityKey(req: Request): string {
  const userId = userIdFromRequest(req)
  if (userId) return `user:${userId}`
  return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`
}

const generalWindowMs = toInt(process.env.QCLICKER_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
const generalMaxAnonymous = toInt(process.env.QCLICKER_RATE_LIMIT_ANON_MAX, 500)
const generalMaxAuthenticated = toInt(process.env.QCLICKER_RATE_LIMIT_AUTH_MAX, 20_000)
const responseWindowMs = toInt(process.env.QCLICKER_RESPONSE_RATE_LIMIT_WINDOW_MS, 60 * 1000)
const responseMax = toInt(process.env.QCLICKER_RESPONSE_RATE_LIMIT_MAX, 30)
const authWindowMs = toInt(process.env.QCLICKER_AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
const authMax = toInt(process.env.QCLICKER_AUTH_RATE_LIMIT_MAX, 20)

/** General API rate limiter */
export const generalLimiter = rateLimit({
  windowMs: generalWindowMs,
  max: (req) => (userIdFromRequest(req) ? generalMaxAuthenticated : generalMaxAnonymous),
  keyGenerator: requestIdentityKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

/** Strict limiter for response submissions (students answering questions) */
export const responseLimiter = rateLimit({
  windowMs: responseWindowMs,
  max: responseMax,
  keyGenerator: requestIdentityKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many response submissions, please slow down.' },
})

/** Auth endpoint limiter */
export const authLimiter = rateLimit({
  windowMs: authWindowMs,
  max: authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
})
