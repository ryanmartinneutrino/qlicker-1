#!/usr/bin/env node

const baseUrl = process.env.QCLICKER_BASE_URL || 'http://localhost:3001'

class ApiSession {
  constructor() {
    this.cookie = ''
    this.csrf = ''
  }

  async getCsrf() {
    const res = await fetch(`${baseUrl}/api/csrf-token`, {
      method: 'GET',
      headers: this.cookie ? { cookie: this.cookie } : {},
    })
    this.captureCookie(res)
    const body = await res.json()
    this.csrf = body.csrfToken
  }

  captureCookie(res) {
    const setCookie = res.headers.get('set-cookie')
    if (!setCookie) return
    this.cookie = setCookie.split(';')[0]
  }

  async request(method, path, body) {
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
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(json)}`)
    }
    return json
  }

  login(email, password) {
    return this.request('POST', '/auth/login', { email, password })
  }
}

async function run() {
  const prof = new ApiSession()
  const student = new ApiSession()
  const admin = new ApiSession()

  await prof.login('prof@gmail.com', '12345678')
  await student.login('student1@gmail.com', '12345678')
  await admin.login('admin@gmail.com', '12345678')

  const courses = await prof.request('GET', '/courses')
  const course = courses.find((c) => c.name === 'Migration Test Course')
  if (!course) throw new Error('Migration Test Course not found. Run ./seed-mock-db.sh first.')

  const sessions = await prof.request('GET', `/sessions?courseId=${course._id}`)
  if (sessions.length < 2) throw new Error('Expected seeded sessions to exist.')

  const questions = await prof.request('GET', `/questions?courseId=${course._id}`)
  if (questions.length < 3) throw new Error('Expected seeded questions to exist.')

  const quizSession = sessions.find((s) => s.quiz)
  if (!quizSession) throw new Error('Seeded quiz session not found.')
  await prof.request('PUT', `/sessions/${quizSession._id}`, {
    quizExtensions: [
      {
        userId: 'student_seed_check',
        quizStart: new Date().toISOString(),
        quizEnd: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
    ],
  })

  const q1 = questions.find((q) => q.type === 0)
  if (!q1) throw new Error('Expected one MC question in seeded dataset.')
  await student.request('POST', '/responses', {
    attempt: 1,
    questionId: q1._id,
    answer: '4',
  })

  const studentGrades = await student.request('GET', `/grades?courseId=${course._id}`)
  if (studentGrades.length === 0) throw new Error('Student should have at least one grade row.')

  const users = await admin.request('GET', '/users')
  if (users.length < 3) throw new Error('Admin should be able to list users.')

  const videoConfig = await prof.request('GET', `/courses/${course._id}/video-chat-config`)
  if (!Object.prototype.hasOwnProperty.call(videoConfig, 'enabled')) {
    throw new Error('Video config endpoint missing expected shape.')
  }

  console.log('Migration smoke checks passed.')
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
