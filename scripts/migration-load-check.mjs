#!/usr/bin/env node

import {
  ApiSession,
  assert,
  assertQlickerApiReachable,
  resolveApiBaseUrl,
} from './migration-runtime-utils.mjs'

const baseUrl = resolveApiBaseUrl()
const durationSec = Number(process.env.QCLICKER_LOAD_DURATION_SEC || 20)
const concurrency = Number(process.env.QCLICKER_LOAD_CONCURRENCY || 20)
const requestIntervalMs = Number(process.env.QCLICKER_LOAD_REQUEST_INTERVAL_MS || 150)
const maxErrorRate = Number(process.env.QCLICKER_LOAD_MAX_ERROR_RATE || 0.02)
const maxP95Ms = Number(process.env.QCLICKER_LOAD_MAX_P95_MS || 1200)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function percentile(values, p) {
  if (values.length < 1) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

async function runScenario(name, session, path) {
  const startedAt = Date.now()
  const deadline = startedAt + durationSec * 1000
  let requests = 0
  let errors = 0
  const latencies = []
  const errorStatusCounts = new Map()

  async function worker() {
    while (Date.now() < deadline) {
      const started = Date.now()
      try {
        await session.request('GET', path)
        latencies.push(Date.now() - started)
      } catch (err) {
        errors += 1
        const status = Number(err?.status)
        const key = Number.isFinite(status) ? String(status) : 'network'
        errorStatusCounts.set(key, (errorStatusCounts.get(key) || 0) + 1)
      } finally {
        requests += 1
      }
      if (requestIntervalMs > 0) {
        const elapsed = Date.now() - started
        const delay = Math.max(0, requestIntervalMs - elapsed)
        if (delay > 0) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(delay)
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const success = Math.max(0, requests - errors)
  const errorRate = requests > 0 ? errors / requests : 1
  const avgMs = latencies.length > 0 ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0
  const p95Ms = percentile(latencies, 95)

  return {
    name,
    requests,
    success,
    errors,
    errorRate,
    avgMs,
    p95Ms,
    errorStatusCounts: Object.fromEntries([...errorStatusCounts.entries()].sort()),
  }
}

async function run() {
  await assertQlickerApiReachable({ baseUrl, requireFingerprint: true })

  const prof = new ApiSession('prof', baseUrl)
  const student = new ApiSession('student', baseUrl)

  await prof.login('prof@gmail.com', '12345678')
  await student.login('student1@gmail.com', '12345678')

  const courses = await prof.request('GET', '/courses')
  const seededCourse = courses.find((course) => course.name === 'Migration Test Course')
  assert(seededCourse?._id, 'Seeded course not found. Run ./seed-mock-db.sh first.')

  const sessionRows = await prof.request('GET', `/sessions?courseId=${seededCourse._id}`)
  const interactiveSession = sessionRows.find((row) => row.quiz === false) || sessionRows[0]
  assert(interactiveSession?._id, 'No session found in seeded course.')

  const questionRows = await prof.request('GET', `/questions?sessionId=${interactiveSession._id}`)
  const sampleQuestion = questionRows[0]
  assert(sampleQuestion?._id, 'No question found in sampled session.')

  const scenarios = [
    ['prof_sessions_course', prof, `/sessions?courseId=${seededCourse._id}`],
    ['prof_questions_session', prof, `/questions?sessionId=${interactiveSession._id}`],
    ['student_questions_session', student, `/questions?sessionId=${interactiveSession._id}`],
    ['prof_responses_question', prof, `/responses?questionId=${sampleQuestion._id}`],
    ['student_responses_question', student, `/responses?questionId=${sampleQuestion._id}`],
  ]

  const results = []
  for (const [name, sess, path] of scenarios) {
    // sequential scenarios avoid cross-scenario amplification and keep output interpretable
    // eslint-disable-next-line no-await-in-loop
    const summary = await runScenario(name, sess, path)
    results.push(summary)
    const errPct = (summary.errorRate * 100).toFixed(2)
    const statusSummary = Object.entries(summary.errorStatusCounts)
      .map(([status, count]) => `${status}:${count}`)
      .join(',')
    console.log(
      `${summary.name}: req=${summary.requests} ok=${summary.success} err=${summary.errors} err%=${errPct} avg=${summary.avgMs.toFixed(1)}ms p95=${summary.p95Ms.toFixed(1)}ms` +
        (statusSummary ? ` statuses=[${statusSummary}]` : '')
    )
  }

  const failed = results.filter((row) => row.errorRate > maxErrorRate || row.p95Ms > maxP95Ms)
  if (failed.length > 0) {
    const details = failed
      .map((row) => `${row.name}(err%=${(row.errorRate * 100).toFixed(2)},p95=${row.p95Ms.toFixed(1)}ms)`)
      .join(', ')
    throw new Error(`Load thresholds exceeded: ${details}`)
  }

  console.log(`Load checks passed. thresholds: err<=${(maxErrorRate * 100).toFixed(2)}% p95<=${maxP95Ms}ms`) 
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
