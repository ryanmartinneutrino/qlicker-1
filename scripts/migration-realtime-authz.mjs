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
  const options = {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    timeout: timeoutMs,
    reconnection: false,
  }
  if (cookie) {
    options.extraHeaders = { cookie }
  }
  return io(realtimeUrl, options)
}

function waitForConnect(socket, label) {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve()
      return
    }

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

function expectSubscriptionErrorCode(
  socket,
  label,
  action,
  expectedEvent,
  expectedCode
) {
  return expectSubscriptionError(
    socket,
    label,
    action,
    (event) => event?.event === expectedEvent && event?.code === expectedCode
  )
}

function expectNoSubscriptionError(socket, label, action, expectedEvent, waitMs = 700) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, waitMs)

    const onError = (event) => {
      if (event?.event !== expectedEvent) return
      cleanup()
      reject(
        new Error(
          `[${label}] unexpected subscription:error for ${expectedEvent}: ${JSON.stringify(event)}`
        )
      )
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
  const anonymous = new ApiSession('anonymous')
  await prof.login('prof@gmail.com', '12345678')
  await student.login('student1@gmail.com', '12345678')
  await outsider.login('student2@gmail.com', '12345678')
  await anonymous.getCsrf()

  const meProf = await prof.request('GET', '/auth/me')
  const meStudent = await student.request('GET', '/auth/me')
  const meOutsider = await outsider.request('GET', '/auth/me')
  assert(meProf?.user?._id, 'Professor user id missing.')
  assert(meStudent?.user?._id, 'Student user id missing.')
  assert(meOutsider?.user?._id, 'Outsider user id missing.')

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
  const missingSessionId = `session_missing_${Date.now()}`
  const missingQuestionId = `question_missing_${Date.now()}`

  const outsiderSocket = connectSocket(outsider.cookie)
  const anonymousSocket = connectSocket(anonymous.cookie)
  const studentSocket = connectSocket(student.cookie)

  try {
    await waitForConnect(outsiderSocket, 'outsider')
    await waitForConnect(anonymousSocket, 'anon')
    await waitForConnect(studentSocket, 'student')

    // Outsider (authenticated but non-member) must be forbidden on all course-scoped channels.
    const outsiderForbiddenChecks = [
      {
        label: 'outsider-session',
        event: 'subscribe:session',
        payload: { sessionId: tempSession._id },
      },
      {
        label: 'outsider-questions',
        event: 'subscribe:questions',
        payload: { sessionId: tempSession._id },
      },
      {
        label: 'outsider-responses',
        event: 'subscribe:responses',
        payload: { questionId: tempQuestion._id },
      },
      {
        label: 'outsider-questions-course',
        event: 'subscribe:questions-course',
        payload: { courseId: tempCourse._id },
      },
      {
        label: 'outsider-sessions',
        event: 'subscribe:sessions',
        payload: { courseId: tempCourse._id },
      },
      {
        label: 'outsider-grades',
        event: 'subscribe:grades',
        payload: { userId: meStudent.user._id },
      },
    ]
    for (const check of outsiderForbiddenChecks) {
      const result = await expectSubscriptionErrorCode(
        outsiderSocket,
        check.label,
        () => outsiderSocket.emit(check.event, check.payload),
        check.event,
        'forbidden'
      )
      assert(result?.message, `[${check.label}] forbidden subscription should return an error message.`)
    }

    // Anonymous socket must be rejected as not_authenticated on all channels.
    const anonymousDeniedChecks = [
      { label: 'anon-session', event: 'subscribe:session', payload: { sessionId: tempSession._id } },
      { label: 'anon-questions', event: 'subscribe:questions', payload: { sessionId: tempSession._id } },
      { label: 'anon-responses', event: 'subscribe:responses', payload: { questionId: tempQuestion._id } },
      {
        label: 'anon-questions-course',
        event: 'subscribe:questions-course',
        payload: { courseId: tempCourse._id },
      },
      { label: 'anon-sessions', event: 'subscribe:sessions', payload: { courseId: tempCourse._id } },
      { label: 'anon-grades', event: 'subscribe:grades', payload: { userId: meOutsider.user._id } },
    ]
    for (const check of anonymousDeniedChecks) {
      const result = await expectSubscriptionErrorCode(
        anonymousSocket,
        check.label,
        () => anonymousSocket.emit(check.event, check.payload),
        check.event,
        'not_authenticated'
      )
      assert(
        result?.message,
        `[${check.label}] unauthenticated subscription should return an error message.`
      )
    }

    // Missing required fields should trigger bad_request.
    const badRequestChecks = [
      { label: 'badreq-session', event: 'subscribe:session' },
      { label: 'badreq-questions', event: 'subscribe:questions' },
      { label: 'badreq-responses', event: 'subscribe:responses' },
      { label: 'badreq-questions-course', event: 'subscribe:questions-course' },
      { label: 'badreq-sessions', event: 'subscribe:sessions' },
      { label: 'badreq-grades', event: 'subscribe:grades' },
    ]
    for (const check of badRequestChecks) {
      const result = await expectSubscriptionErrorCode(
        outsiderSocket,
        check.label,
        () => outsiderSocket.emit(check.event, {}),
        check.event,
        'bad_request'
      )
      assert(result?.message, `[${check.label}] bad_request should include a message.`)
    }

    // Unknown resources should produce not_found where applicable.
    const notFoundSession = await expectSubscriptionErrorCode(
      studentSocket,
      'notfound-session',
      () => studentSocket.emit('subscribe:session', { sessionId: missingSessionId }),
      'subscribe:session',
      'not_found'
    )
    assert(notFoundSession?.message, 'Missing session subscription should include a message.')

    const notFoundQuestions = await expectSubscriptionErrorCode(
      studentSocket,
      'notfound-questions',
      () => studentSocket.emit('subscribe:questions', { sessionId: missingSessionId }),
      'subscribe:questions',
      'not_found'
    )
    assert(notFoundQuestions?.message, 'Missing questions subscription should include a message.')

    const notFoundResponses = await expectSubscriptionErrorCode(
      studentSocket,
      'notfound-responses',
      () => studentSocket.emit('subscribe:responses', { questionId: missingQuestionId }),
      'subscribe:responses',
      'not_found'
    )
    assert(notFoundResponses?.message, 'Missing responses subscription should include a message.')

    // Valid member subscriptions should not emit subscription:error.
    await expectNoSubscriptionError(
      studentSocket,
      'student-session-allowed',
      () => studentSocket.emit('subscribe:session', { sessionId: tempSession._id }),
      'subscribe:session'
    )
    await expectNoSubscriptionError(
      studentSocket,
      'student-questions-allowed',
      () => studentSocket.emit('subscribe:questions', { sessionId: tempSession._id }),
      'subscribe:questions'
    )
    await expectNoSubscriptionError(
      studentSocket,
      'student-responses-allowed',
      () => studentSocket.emit('subscribe:responses', { questionId: tempQuestion._id }),
      'subscribe:responses'
    )
    await expectNoSubscriptionError(
      studentSocket,
      'student-questions-course-allowed',
      () => studentSocket.emit('subscribe:questions-course', { courseId: tempCourse._id }),
      'subscribe:questions-course'
    )
    await expectNoSubscriptionError(
      studentSocket,
      'student-sessions-allowed',
      () => studentSocket.emit('subscribe:sessions', { courseId: tempCourse._id }),
      'subscribe:sessions'
    )
    await expectNoSubscriptionError(
      studentSocket,
      'student-grades-allowed',
      () => studentSocket.emit('subscribe:grades', { userId: meStudent.user._id }),
      'subscribe:grades'
    )

    studentSocket.emit('unsubscribe:responses', { questionId: tempQuestion._id })
    studentSocket.emit('unsubscribe:questions', { sessionId: tempSession._id })
    studentSocket.emit('unsubscribe:session', { sessionId: tempSession._id })
    studentSocket.emit('unsubscribe:questions-course', { courseId: tempCourse._id })
    studentSocket.emit('unsubscribe:sessions', { courseId: tempCourse._id })
    studentSocket.emit('unsubscribe:grades', { userId: meStudent.user._id })
  } finally {
    outsiderSocket.disconnect()
    anonymousSocket.disconnect()
    studentSocket.disconnect()
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
