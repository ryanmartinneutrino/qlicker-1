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
  try {
    const health = await fetch(`${baseUrl}/health`)
    if (!health.ok) {
      throw new Error(`health check status ${health.status}`)
    }
  } catch (err) {
    throw new Error(
      `Cannot reach ${baseUrl}. Start the Express server first (for example: npm run dev:server).`
    )
  }

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

  const createdCourse = await prof.request('POST', '/courses', {
    name: `Smoke Course ${Date.now()}`,
    deptCode: 'CISC',
    courseNumber: '101',
    section: '001',
    semester: 'Fall 2026',
  })
  if (!createdCourse._id || !createdCourse.enrollmentCode) {
    throw new Error('Create-course response missing _id or enrollmentCode.')
  }
  if (createdCourse.deptCode !== 'cisc' || createdCourse.courseNumber !== '101' || createdCourse.semester !== 'fall 2026') {
    throw new Error('Create-course normalization did not match expected legacy behavior.')
  }

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
  const beforeGrades = await student.request('GET', `/grades?courseId=${course._id}`)
  const beforePoints = beforeGrades.reduce((sum, grade) => sum + Number(grade.points || 0), 0)
  await student.request('POST', '/responses', {
    attempt: 1,
    questionId: q1._id,
    answer: '4',
  })

  const studentGrades = await student.request('GET', `/grades?courseId=${course._id}`)
  if (studentGrades.length === 0) throw new Error('Student should have at least one grade row.')
  const afterPoints = studentGrades.reduce((sum, grade) => sum + Number(grade.points || 0), 0)
  if (afterPoints < beforePoints) throw new Error('Auto-grading should not reduce total points for a correct answer submission.')

  const users = await admin.request('GET', '/users')
  if (users.length < 3) throw new Error('Admin should be able to list users.')

  const videoConfig = await prof.request('GET', `/courses/${course._id}/video-chat-config`)
  if (!Object.prototype.hasOwnProperty.call(videoConfig, 'enabled')) {
    throw new Error('Video config endpoint missing expected shape.')
  }

  const verifyResponse = await student.request('POST', '/users/verify-email', {})
  if (!Object.prototype.hasOwnProperty.call(verifyResponse, 'success')) {
    throw new Error('Verify-email endpoint missing expected response shape.')
  }

  const forgot = await admin.request('POST', '/auth/forgot-password', { email: 'student2@gmail.com' })
  if (!forgot.success) throw new Error('Forgot-password endpoint did not report success.')
  if (!forgot.debugResetToken) throw new Error('Forgot-password debug token missing in non-production mode.')
  const reset = await admin.request('POST', '/auth/reset-password', {
    token: forgot.debugResetToken,
    password: '12345678',
  })
  if (!reset.success) throw new Error('Reset-password endpoint did not report success.')

  const enrolledCourse = await student.request('POST', '/courses/enroll', {
    enrollmentCode: createdCourse.enrollmentCode.toUpperCase(),
  })
  if (enrolledCourse._id !== createdCourse._id) {
    throw new Error('Enrollment by code should return the enrolled course.')
  }
  const studentCourses = await student.request('GET', '/courses')
  if (!studentCourses.some((c) => c._id === createdCourse._id)) {
    throw new Error('Enrolled course was not visible in student course list.')
  }

  console.log('Migration smoke checks passed.')
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
