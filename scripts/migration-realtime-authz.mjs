#!/usr/bin/env node

import { io } from 'socket.io-client'

const baseUrl = process.env.QCLICKER_BASE_URL || 'http://localhost:3001'
const realtimeUrl = process.env.QCLICKER_REALTIME_URL || baseUrl
const timeoutMs = Number(process.env.QCLICKER_REALTIME_TIMEOUT_MS || 6000)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class ApiSession {
  constructor(label) {
    this.label = label
    this.cookie = ''
    this.csrf = ''
  }

  captureCookie(res) {
    const setCookie = res.headers.get('set-cookie')
    if (!setCookie) return
    this.cookie = setCookie.split(';')[0]
  }

  async parseBody(res) {
    const raw = await res.text()
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  async getCsrf() {
    const res = await fetch(`${baseUrl}/api/csrf-token`, {
      method: 'GET',
      headers: this.cookie ? { cookie: this.cookie } : {},
    })
    this.captureCookie(res)
    const body = await this.parseBody(res)
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

    const res = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    this.captureCookie(res)
    const json = await this.parseBody(res)

    if (expectStatus !== undefined) {
      if (res.status !== expectStatus) {
        throw new Error(
          `[${this.label}] ${method} ${path} expected ${expectStatus}, got ${res.status}: ${JSON.stringify(json)}`
        )
      }
      return json
    }

    if (!res.ok) {
      throw new Error(`[${this.label}] ${method} ${path} failed (${res.status}): ${JSON.stringify(json)}`)
    }
    return json
  }

  login(email, password) {
    return this.request('POST', '/auth/login', { email, password })
  }
}

function connectSocket(cookie) {
  return io(realtimeUrl, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    extraHeaders: cookie ? { cookie } : {},
  })
}

function waitForConnect(socket, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`[${label}] socket connect timeout`)), timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve()
    })
    socket.once('connect_error', (err) => {
      clearTimeout(timer)
      reject(new Error(`[${label}] socket connect error: ${err.message}`))
    })
  })
}

function expectSubscriptionError(socket, label, action, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`[${label}] expected subscription:error event not received`))
    }, timeoutMs)

    const onError = (event) => {
      if (!predicate(event)) return
      cleanup()
      resolve(event)
    }

    const cleanup = () => {
      clearTimeout(timer)
      socket.off('subscription:error', onError)
    }

    socket.on('subscription:error', onError)
    action()
  })
}

async function run() {
  try {
    const health = await fetch(`${baseUrl}/health`)
    if (!health.ok) throw new Error(`health check status ${health.status}`)
  } catch {
    throw new Error(`Cannot reach ${baseUrl}. Start the API server first.`)
  }

  const prof = new ApiSession('prof')
  const student = new ApiSession('student')
  const outsider = new ApiSession('outsider')
  await prof.login('prof@gmail.com', '12345678')
  await student.login('student1@gmail.com', '12345678')
  await outsider.login('student2@gmail.com', '12345678')

  const meProf = await prof.request('GET', '/auth/me')
  assert(meProf?.user?._id, 'Professor user id missing.')

  const tempCourse = await prof.request('POST', '/courses', {
    name: `Realtime Authz ${Date.now()}`,
    deptCode: 'CISC',
    courseNumber: '302',
    section: '001',
    semester: 'Fall 2026',
  })
  assert(tempCourse?._id && tempCourse?.enrollmentCode, 'Temp course creation failed.')

  await student.request('POST', '/courses/enroll', { enrollmentCode: tempCourse.enrollmentCode })
  const tempSession = await prof.request('POST', '/sessions', {
    name: 'Realtime Authz Session',
    description: 'Realtime authz checks',
    courseId: tempCourse._id,
    status: 'hidden',
    quiz: false,
    questions: [],
  })
  assert(tempSession?._id, 'Temp session creation failed.')

  const tempQuestion = await prof.request('POST', '/questions', {
    plainText: 'Realtime authz question',
    type: 0,
    content: 'Realtime authz question',
    options: [
      { plainText: 'A', answer: 'A', correct: true },
      { plainText: 'B', answer: 'B', correct: false },
    ],
    owner: meProf.user._id,
    sessionId: tempSession._id,
    courseId: tempCourse._id,
    public: false,
    approved: true,
    tags: [],
  })
  assert(tempQuestion?._id, 'Temp question creation failed.')

  const outsiderSocket = connectSocket(outsider.cookie)
  const anonymousSocket = connectSocket('')

  try {
    await waitForConnect(outsiderSocket, 'outsider')
    await waitForConnect(anonymousSocket, 'anon')

    const sessionForbidden = await expectSubscriptionError(
      outsiderSocket,
      'outsider-session',
      () => outsiderSocket.emit('subscribe:session', { sessionId: tempSession._id }),
      (event) => event?.event === 'subscribe:session' && event?.code === 'forbidden'
    )
    assert(sessionForbidden?.message, 'Forbidden session subscription should return an error message.')

    const responseForbidden = await expectSubscriptionError(
      outsiderSocket,
      'outsider-responses',
      () => outsiderSocket.emit('subscribe:responses', { questionId: tempQuestion._id }),
      (event) => event?.event === 'subscribe:responses' && event?.code === 'forbidden'
    )
    assert(responseForbidden?.message, 'Forbidden response subscription should return an error message.')

    const anonDenied = await expectSubscriptionError(
      anonymousSocket,
      'anon-responses',
      () => anonymousSocket.emit('subscribe:responses', { questionId: tempQuestion._id }),
      (event) => event?.event === 'subscribe:responses' && event?.code === 'not_authenticated'
    )
    assert(anonDenied?.message, 'Unauthenticated response subscription should return an error message.')
  } finally {
    outsiderSocket.disconnect()
    anonymousSocket.disconnect()
  }

  await prof.request('DELETE', `/sessions/${tempSession._id}`)
  await prof.request('DELETE', `/courses/${tempCourse._id}`)
  await student.request('POST', '/auth/logout', {})
  await outsider.request('POST', '/auth/logout', {})
  await prof.request('POST', '/auth/logout', {})

  // Give sockets a brief chance to close before process exit.
  await delay(100)
  console.log('Migration realtime authz checks passed.')
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
