#!/usr/bin/env node

const DEFAULT_API_BASE_URL = 'http://localhost:3001'
const DEFAULT_CLIENT_BASE_URL = 'http://localhost:3000'
const DEFAULT_HEALTH_TIMEOUT_MS = 8000

function readEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  return ''
}

function toPositiveInt(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return null
  return Math.floor(parsed)
}

export function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function resolveApiBaseUrl() {
  return readEnv('API_BASE_URL', 'QCLICKER_API_BASE_URL', 'QCLICKER_BASE_URL') || DEFAULT_API_BASE_URL
}

export function resolveClientBaseUrl() {
  return (
    readEnv('CLIENT_BASE_URL', 'QCLICKER_CLIENT_BASE_URL', 'QCLICKER_CLIENT_URL', 'CLIENT_URL') ||
    DEFAULT_CLIENT_BASE_URL
  )
}

export function resolveRealtimeUrl(baseUrl = resolveApiBaseUrl()) {
  return readEnv('REALTIME_URL', 'QCLICKER_REALTIME_URL') || baseUrl
}

export function resolveMongoPort() {
  const port = readEnv('MONGO_PORT', 'QCLICKER_MONGO_PORT')
  const parsed = toPositiveInt(port)
  return parsed || null
}

export function resolveMongoUrl() {
  const explicit = readEnv('MONGO_URL', 'QCLICKER_MONGO_URL')
  if (explicit) return explicit
  const port = resolveMongoPort()
  if (!port) return ''
  return `mongodb://localhost:${port}/qlicker?directConnection=true`
}

function describeHealthPayload(payload) {
  if (!payload || typeof payload !== 'object') return String(payload)
  const status = payload.status
  const app = payload.app
  const service = payload.service
  return JSON.stringify({ status, app, service })
}

export async function parseResponseBody(res) {
  const raw = await res.text()
  if (!raw) return null
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export async function assertQlickerApiReachable(options = {}) {
  const baseUrl = options.baseUrl || resolveApiBaseUrl()
  const requireFingerprint = options.requireFingerprint !== false
  const timeoutMs = toPositiveInt(options.timeoutMs) || DEFAULT_HEALTH_TIMEOUT_MS

  let timer = null
  const controller = new AbortController()
  try {
    timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })

    const payload = await parseResponseBody(res)
    if (!res.ok) {
      throw new Error(
        `Health check failed at ${baseUrl}/health with status ${res.status}. payload=${describeHealthPayload(payload)}`
      )
    }

    const headerFingerprint = (res.headers.get('x-qlicker-api') || '').trim() === '1'
    const payloadFingerprint =
      Boolean(payload && typeof payload === 'object' && payload.app === 'qlicker') ||
      Boolean(payload && typeof payload === 'object' && payload.service === 'qlicker-api') ||
      Boolean(payload && typeof payload === 'object' && payload.fingerprint === 'qlicker-api')

    if (requireFingerprint && !headerFingerprint && !payloadFingerprint) {
      throw new Error(
        `Service at ${baseUrl} responded to /health but is not identified as Qlicker API. payload=${describeHealthPayload(payload)}`
      )
    }

    return {
      baseUrl,
      payload,
      headerFingerprint,
      payloadFingerprint,
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Timed out reaching ${baseUrl}/health after ${timeoutMs}ms.`)
    }
    throw new Error(
      `Cannot validate Qlicker API at ${baseUrl}. Set API_BASE_URL (or QCLICKER_BASE_URL) to the running Qlicker server. ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export class ApiSession {
  constructor(label, apiBaseUrl = resolveApiBaseUrl()) {
    this.label = label || 'session'
    this.apiBaseUrl = apiBaseUrl
    this.cookie = ''
    this.csrf = ''
    this.cookies = new Map()
  }

  captureCookie(res) {
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : (() => {
            const single = res.headers.get('set-cookie')
            return single ? [single] : []
          })()

    if (!Array.isArray(setCookies) || setCookies.length < 1) return
    for (const rawCookie of setCookies) {
      if (!rawCookie) continue
      const firstPart = rawCookie.split(';')[0]?.trim()
      if (!firstPart) continue
      const separator = firstPart.indexOf('=')
      if (separator < 1) continue
      const name = firstPart.slice(0, separator).trim()
      this.cookies.set(name, firstPart)
    }
    this.cookie = [...this.cookies.values()].join('; ')
  }

  async getCsrf() {
    const res = await fetch(`${this.apiBaseUrl}/api/csrf-token`, {
      method: 'GET',
      headers: this.cookie ? { cookie: this.cookie } : {},
    })
    this.captureCookie(res)
    const body = await parseResponseBody(res)
    if (!body || typeof body !== 'object' || !body.csrfToken) {
      throw new Error(`[${this.label}] could not retrieve CSRF token`)
    }
    this.csrf = body.csrfToken
  }

  async request(method, path, body, options = {}) {
    const { expectStatus } = options
    if (method !== 'GET' && !this.csrf) {
      await this.getCsrf()
    }

    const headers = {}
    if (this.cookie) headers.cookie = this.cookie
    if (method !== 'GET') headers['x-csrf-token'] = this.csrf
    if (body !== undefined) headers['content-type'] = 'application/json'

    const res = await fetch(`${this.apiBaseUrl}/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    this.captureCookie(res)
    const parsedBody = await parseResponseBody(res)

    if (expectStatus !== undefined) {
      if (res.status !== expectStatus) {
        const error = new Error(
          `[${this.label}] ${method} ${path} expected ${expectStatus}, got ${res.status}: ${JSON.stringify(parsedBody)}`
        )
        error.status = res.status
        throw error
      }
      return parsedBody
    }

    if (!res.ok) {
      const error = new Error(
        `[${this.label}] ${method} ${path} failed (${res.status}): ${JSON.stringify(parsedBody)}`
      )
      error.status = res.status
      throw error
    }
    return parsedBody
  }

  async upload(path, formData, options = {}) {
    const { expectStatus } = options
    if (!this.csrf) {
      await this.getCsrf()
    }

    const headers = {
      'x-csrf-token': this.csrf,
    }
    if (this.cookie) headers.cookie = this.cookie

    const res = await fetch(`${this.apiBaseUrl}/api${path}`, {
      method: 'POST',
      headers,
      body: formData,
    })
    this.captureCookie(res)
    const parsedBody = await parseResponseBody(res)

    if (expectStatus !== undefined) {
      if (res.status !== expectStatus) {
        const error = new Error(
          `[${this.label}] POST ${path} expected ${expectStatus}, got ${res.status}: ${JSON.stringify(parsedBody)}`
        )
        error.status = res.status
        throw error
      }
      return parsedBody
    }

    if (!res.ok) {
      const error = new Error(
        `[${this.label}] POST ${path} failed (${res.status}): ${JSON.stringify(parsedBody)}`
      )
      error.status = res.status
      throw error
    }
    return parsedBody
  }

  login(email, password) {
    return this.request('POST', '/auth/login', { email, password })
  }
}
