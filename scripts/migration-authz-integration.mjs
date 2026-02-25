#!/usr/bin/env node

const baseUrl = process.env.QCLICKER_BASE_URL || 'http://localhost:3001'

function assert(condition, message) {
  if (!condition) throw new Error(message)
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

async function run() {
  try {
    const health = await fetch(`${baseUrl}/health`)
    if (!health.ok) throw new Error(`health check status ${health.status}`)
  } catch {
    throw new Error(`Cannot reach ${baseUrl}. Start the API server first.`)
  }

  const prof = new ApiSession('prof')
  const student = new ApiSession('student')
  const student2 = new ApiSession('student2')
  const admin = new ApiSession('admin')

  await prof.login('prof@gmail.com', '12345678')
  await student.login('student1@gmail.com', '12345678')
  await student2.login('student2@gmail.com', '12345678')
  await admin.login('admin@gmail.com', '12345678')

  const meProf = await prof.request('GET', '/auth/me')
  const meStudent = await student.request('GET', '/auth/me')
  const meStudent2 = await student2.request('GET', '/auth/me')
  assert(meProf?.user?._id, 'Professor user id missing.')
  assert(meStudent?.user?._id, 'Student user id missing.')
  assert(meStudent2?.user?._id, 'Student2 user id missing.')

  const baseCourses = await prof.request('GET', '/courses')
  const seededCourse = baseCourses.find((course) => course.name === 'Migration Test Course')
  assert(seededCourse?._id, 'Seeded course not found (run ./seed-mock-db.sh).')

  // Create isolated temp course for authz checks
  const tempCourse = await prof.request('POST', '/courses', {
    name: `Authz Integration ${Date.now()}`,
    deptCode: 'CISC',
    courseNumber: '302',
    section: '001',
    semester: 'Fall 2026',
  })
  assert(tempCourse._id && tempCourse.enrollmentCode, 'Temp course creation failed.')

  await student.request('POST', '/courses/enroll', { enrollmentCode: tempCourse.enrollmentCode })

  const tempSession = await prof.request('POST', '/sessions', {
    name: 'Authz Session',
    description: 'Authz integration checks',
    courseId: tempCourse._id,
    status: 'hidden',
    quiz: false,
    questions: [],
  })
  assert(tempSession._id, 'Temp session creation failed.')

  const publicQuestion = await prof.request('POST', '/questions', {
    plainText: 'Authz public question',
    type: 0,
    content: 'Authz public question',
    options: [
      { plainText: 'A', answer: 'A', correct: true },
      { plainText: 'B', answer: 'B', correct: false },
    ],
    owner: meProf.user._id,
    courseId: tempCourse._id,
    public: true,
    approved: true,
    tags: [],
  })
  assert(publicQuestion._id, 'Public question creation failed.')

  const studentPublic = await student.request('GET', `/questions?courseId=${tempCourse._id}&library=public`)
  assert(studentPublic.some((q) => q._id === publicQuestion._id), 'Student should see public course questions.')

  const studentCopy = await student.request('POST', `/questions/${publicQuestion._id}/copy`, {})
  assert(studentCopy._id, 'Student copy-to-library should create a question.')
  assert(studentCopy.owner === meStudent.user._id, 'Student copy should be owned by student.')

  await student.request(
    'PUT',
    `/questions/${studentCopy._id}`,
    { plainText: 'Student copy edited text' }
  )
  await student.request(
    'PUT',
    `/questions/${studentCopy._id}`,
    { approved: true },
    { expectStatus: 403 }
  )
  await student.request('DELETE', `/questions/${publicQuestion._id}`, undefined, { expectStatus: 403 })
  await student.request(
    'GET',
    `/questions?courseId=${tempCourse._id}&library=unapprovedFromStudents`,
    undefined,
    { expectStatus: 403 }
  )

  const instructorQueue = await prof.request('GET', `/questions?courseId=${tempCourse._id}&library=unapprovedFromStudents`)
  assert(instructorQueue.some((q) => q._id === studentCopy._id), 'Instructor queue should include unapproved student copy.')

  await student.request(
    'POST',
    `/sessions/${tempSession._id}/questions/${publicQuestion._id}/copy`,
    {},
    { expectStatus: 403 }
  )

  const sessionQuestion = await prof.request(
    'POST',
    `/sessions/${tempSession._id}/questions/${publicQuestion._id}/copy`,
    {}
  )
  assert(sessionQuestion._id, 'Instructor should be able to add question copy to session.')

  await student.request(
    'PUT',
    `/sessions/${tempSession._id}/questions`,
    { questionIds: [sessionQuestion._id] },
    { expectStatus: 403 }
  )

  const reordered = await prof.request('PUT', `/sessions/${tempSession._id}/questions`, {
    questionIds: [sessionQuestion._id],
  })
  assert(Array.isArray(reordered.questions), 'Reorder response should include questions array.')

  // cross-course check for question-to-session copy
  const tempCourse2 = await prof.request('POST', '/courses', {
    name: `Authz Integration 2 ${Date.now()}`,
    deptCode: 'CISC',
    courseNumber: '303',
    section: '001',
    semester: 'Fall 2026',
  })
  const crossQuestion = await prof.request('POST', '/questions', {
    plainText: 'Cross-course question',
    type: 0,
    content: 'Cross-course question',
    options: [
      { plainText: 'A', answer: 'A', correct: true },
      { plainText: 'B', answer: 'B', correct: false },
    ],
    owner: meProf.user._id,
    courseId: tempCourse2._id,
    public: false,
    approved: true,
    tags: [],
  })

  await prof.request(
    'POST',
    `/sessions/${tempSession._id}/questions/${crossQuestion._id}/copy`,
    {},
    { expectStatus: 400 }
  )

  // grade visibility auth check (if hidden seeded grade exists)
  const seededStudent2Grades = await prof.request('GET', `/grades?courseId=${seededCourse._id}&userId=${meStudent2.user._id}`)
  const hiddenGrade = seededStudent2Grades.find((grade) => grade.visibleToStudents === false)
  if (hiddenGrade?._id) {
    await student2.request('GET', `/grades/${hiddenGrade._id}`, undefined, { expectStatus: 403 })
    await prof.request('PUT', `/grades/${hiddenGrade._id}/visible`, { visible: true })
    const nowVisible = await student2.request('GET', `/grades/${hiddenGrade._id}`)
    assert(nowVisible._id === hiddenGrade._id, 'Student should read grade after instructor makes it visible.')
  }

  // cleanup temp resources
  await prof.request('DELETE', `/sessions/${tempSession._id}`)
  await prof.request('DELETE', `/courses/${tempCourse._id}`)
  await prof.request('DELETE', `/courses/${tempCourse2._id}`)

  await student.request('POST', '/auth/logout', {})
  await student2.request('POST', '/auth/logout', {})
  await prof.request('POST', '/auth/logout', {})
  await admin.request('POST', '/auth/logout', {})

  console.log('Migration authz integration checks passed.')
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
