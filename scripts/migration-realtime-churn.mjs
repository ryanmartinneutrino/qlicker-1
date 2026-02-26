#!/usr/bin/env node

import { io } from 'socket.io-client'
import {
  ApiSession,
  assert,
  assertQlickerApiReachable,
  resolveApiBaseUrl,
  resolveRealtimeUrl,
} from './migration-runtime-utils.mjs'

const baseUrl = resolveApiBaseUrl()
const realtimeUrl = resolveRealtimeUrl(baseUrl)
const timeoutMs = Number(process.env.QCLICKER_REALTIME_TIMEOUT_MS || 6000)
const cycles = Number(process.env.QCLICKER_REALTIME_CHURN_CYCLES || 6)
const settleMs = Number(process.env.QCLICKER_REALTIME_CHURN_SETTLE_MS || 120)
const idleWaitMs = Number(process.env.QCLICKER_REALTIME_CHURN_WAIT_MS || 200)
const burstSize = Number(process.env.QCLICKER_REALTIME_CHURN_BURST_SIZE || 5)

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function percentile(values, p) {
  if (values.length < 1) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.floor((p / 100) * (sorted.length - 1))
  return sorted[index]
}

function connectSocket(cookie) {
  const options = {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    timeout: timeoutMs,
    reconnection: false,
  }
  if (cookie) options.extraHeaders = { cookie }
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

function expectNoSubscriptionError(socket, label, action, expectedEvent, waitMs = idleWaitMs) {
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

function expectSubscriptionErrorCode(socket, label, action, expectedEvent, expectedCode) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`[${label}] expected subscription:error event not received`))
    }, timeoutMs)

    const onError = (event) => {
      if (event?.event !== expectedEvent || event?.code !== expectedCode) return
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

async function verifyValidSubscriptions(socket, payloads, labelPrefix) {
  for (const payload of payloads) {
    await expectNoSubscriptionError(
      socket,
      `${labelPrefix}-${payload.event}`,
      () => socket.emit(payload.event, payload.payload),
      payload.event
    )
  }
}

function unsubscribeAll(socket, ids) {
  socket.emit('unsubscribe:responses', { questionId: ids.questionId })
  socket.emit('unsubscribe:questions', { sessionId: ids.sessionId })
  socket.emit('unsubscribe:session', { sessionId: ids.sessionId })
  socket.emit('unsubscribe:questions-course', { courseId: ids.courseId })
  socket.emit('unsubscribe:sessions', { courseId: ids.courseId })
  socket.emit('unsubscribe:grades', { userId: ids.userId })
}

async function runBurst(studentCookie, payloads, burstCount) {
  if (burstCount < 1) return { sockets: 0, subscriptions: 0 }
  const sockets = Array.from({ length: burstCount }, () => connectSocket(studentCookie))
  let successfulSubscriptions = 0
  try {
    await Promise.all(sockets.map((socket, index) => waitForConnect(socket, `burst-${index}`)))
    for (let i = 0; i < sockets.length; i += 1) {
      await verifyValidSubscriptions(sockets[i], payloads, `burst-${i}`)
      successfulSubscriptions += payloads.length
    }
    return { sockets: sockets.length, subscriptions: successfulSubscriptions }
  } finally {
    sockets.forEach((socket) => socket.disconnect())
  }
}

async function run() {
  await assertQlickerApiReachable({ baseUrl, requireFingerprint: true })

  const prof = new ApiSession('prof', baseUrl)
  const student = new ApiSession('student', baseUrl)
  const outsider = new ApiSession('outsider', baseUrl)

  await prof.login('prof@gmail.com', '12345678')
  await student.login('student1@gmail.com', '12345678')
  await outsider.login('student2@gmail.com', '12345678')

  const meProf = await prof.request('GET', '/auth/me')
  const meStudent = await student.request('GET', '/auth/me')
  assert(meProf?.user?._id, 'Professor user id missing.')
  assert(meStudent?.user?._id, 'Student user id missing.')

  const tempCourse = await prof.request('POST', '/courses', {
    name: `Realtime Churn ${Date.now()}`,
    deptCode: 'CISC',
    courseNumber: '303',
    section: '001',
    semester: 'Fall 2026',
  })
  assert(tempCourse?._id && tempCourse?.enrollmentCode, 'Temp course creation failed.')

  await student.request('POST', '/courses/enroll', { enrollmentCode: tempCourse.enrollmentCode })
  const tempSession = await prof.request('POST', '/sessions', {
    name: 'Realtime Churn Session',
    description: 'Reconnect + subscription churn checks',
    courseId: tempCourse._id,
    status: 'hidden',
    quiz: false,
    questions: [],
  })
  assert(tempSession?._id, 'Temp session creation failed.')

  const tempQuestion = await prof.request('POST', '/questions', {
    plainText: 'Realtime churn question',
    type: 0,
    content: 'Realtime churn question',
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

  const validPayloads = [
    { event: 'subscribe:session', payload: { sessionId: tempSession._id } },
    { event: 'subscribe:questions', payload: { sessionId: tempSession._id } },
    { event: 'subscribe:responses', payload: { questionId: tempQuestion._id } },
    { event: 'subscribe:questions-course', payload: { courseId: tempCourse._id } },
    { event: 'subscribe:sessions', payload: { courseId: tempCourse._id } },
    { event: 'subscribe:grades', payload: { userId: meStudent.user._id } },
  ]

  const cycleDurations = []
  const connectDurations = []
  let successfulSubscriptions = 0
  let forbiddenChecks = 0

  try {
    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      const cycleStartedAt = Date.now()
      const studentSocket = connectSocket(student.cookie)
      const outsiderSocket = connectSocket(outsider.cookie)
      const studentConnectStartedAt = Date.now()
      const outsiderConnectStartedAt = Date.now()
      try {
        await waitForConnect(studentSocket, `student-cycle-${cycle}`)
        connectDurations.push(Date.now() - studentConnectStartedAt)
        await waitForConnect(outsiderSocket, `outsider-cycle-${cycle}`)
        connectDurations.push(Date.now() - outsiderConnectStartedAt)

        await verifyValidSubscriptions(studentSocket, validPayloads, `cycle-${cycle}-student`)
        successfulSubscriptions += validPayloads.length

        await expectSubscriptionErrorCode(
          outsiderSocket,
          `cycle-${cycle}-outsider-session`,
          () => outsiderSocket.emit('subscribe:session', { sessionId: tempSession._id }),
          'subscribe:session',
          'forbidden'
        )
        forbiddenChecks += 1

        await expectSubscriptionErrorCode(
          outsiderSocket,
          `cycle-${cycle}-outsider-course`,
          () => outsiderSocket.emit('subscribe:questions-course', { courseId: tempCourse._id }),
          'subscribe:questions-course',
          'forbidden'
        )
        forbiddenChecks += 1

        unsubscribeAll(studentSocket, {
          courseId: tempCourse._id,
          sessionId: tempSession._id,
          questionId: tempQuestion._id,
          userId: meStudent.user._id,
        })
      } finally {
        studentSocket.disconnect()
        outsiderSocket.disconnect()
      }
      cycleDurations.push(Date.now() - cycleStartedAt)
      await delay(settleMs)
    }

    const burstResult = await runBurst(student.cookie, validPayloads, burstSize)
    successfulSubscriptions += burstResult.subscriptions

    const avgConnectMs =
      connectDurations.reduce((sum, value) => sum + value, 0) / Math.max(1, connectDurations.length)
    const avgCycleMs =
      cycleDurations.reduce((sum, value) => sum + value, 0) / Math.max(1, cycleDurations.length)

    console.log(
      `Realtime churn checks passed. cycles=${cycles} burstSockets=${burstResult.sockets} ` +
        `subs=${successfulSubscriptions} forbiddenChecks=${forbiddenChecks} ` +
        `connectAvg=${avgConnectMs.toFixed(1)}ms connectP95=${percentile(connectDurations, 95).toFixed(1)}ms ` +
        `cycleAvg=${avgCycleMs.toFixed(1)}ms cycleP95=${percentile(cycleDurations, 95).toFixed(1)}ms`
    )
  } finally {
    await prof.request('DELETE', `/courses/${tempCourse._id}`).catch(() => undefined)
  }
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
