#!/usr/bin/env node

const baseUrl = process.env.QCLICKER_BASE_URL || 'http://localhost:3001'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

class ApiSession {
  constructor() {
    this.cookie = ''
    this.csrf = ''
    this.cookies = new Map()
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
    const json = await res.json().catch(() => ({}))
    if (expectStatus !== undefined) {
      if (res.status !== expectStatus) {
        throw new Error(
          `${method} ${path} expected status ${expectStatus}, got ${res.status}: ${JSON.stringify(json)}`
        )
      }
      return json
    }
    if (!res.ok) {
      throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(json)}`)
    }
    return json
  }

  async requestMultipart(path, formData) {
    if (!this.csrf) {
      await this.getCsrf()
    }
    const headers = { 'x-csrf-token': this.csrf }
    if (this.cookie) headers.cookie = this.cookie

    const res = await fetch(`${baseUrl}/api${path}`, {
      method: 'POST',
      headers,
      body: formData,
    })
    this.captureCookie(res)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(`POST ${path} (multipart) failed (${res.status}): ${JSON.stringify(json)}`)
    }
    return json
  }

  login(email, password) {
    return this.request('POST', '/auth/login', { email, password })
  }
}

async function verifyRole(session, expectedRole, label) {
  const me = await session.request('GET', '/auth/me')
  const roles = me?.user?.profile?.roles || []
  assert(roles.includes(expectedRole), `${label} should include role '${expectedRole}', got ${JSON.stringify(roles)}`)
  return me.user
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
  const student2 = new ApiSession()
  const admin = new ApiSession()

  await prof.login('prof@gmail.com', '12345678')
  await student.login('student1@gmail.com', '12345678')
  await student2.login('student2@gmail.com', '12345678')
  await admin.login('admin@gmail.com', '12345678')

  const profUser = await verifyRole(prof, 'professor', 'Professor login')
  const studentUser = await verifyRole(student, 'student', 'Student login')
  const student2User = await verifyRole(student2, 'student', 'Student2 login')
  await verifyRole(admin, 'admin', 'Admin login')

  const courses = await prof.request('GET', '/courses')
  const course = courses.find((c) => c.name === 'Migration Test Course')
  if (!course) throw new Error('Migration Test Course not found. Run ./seed-mock-db.sh first.')

  const sessions = await prof.request('GET', `/sessions?courseId=${course._id}`)
  if (sessions.length < 3) throw new Error('Expected seeded sessions to exist.')

  const questions = await prof.request('GET', `/questions?courseId=${course._id}`)
  if (questions.length < 5) throw new Error('Expected seeded questions to exist.')

  const studentLibrary = await student.request('GET', `/questions?courseId=${course._id}&library=library`)
  assert(Array.isArray(studentLibrary), 'Student library query should return a list.')
  const seededPublicQuestion =
    questions.find((q) => !q.sessionId && q.public && q.approved) ||
    (await prof.request('POST', '/questions', {
      plainText: `Smoke public question ${Date.now()}`,
      type: 0,
      content: 'Smoke public question',
      options: [
        { plainText: 'True', answer: 'True', correct: true },
        { plainText: 'False', answer: 'False', correct: false },
      ],
      owner: profUser._id,
      courseId: course._id,
      public: true,
      approved: true,
      tags: [],
    }))

  const studentPublic = await student.request('GET', `/questions?courseId=${course._id}&library=public`)
  assert(
    studentPublic.some((question) => question._id === seededPublicQuestion._id),
    'Student public query should include approved public questions.'
  )

  const copiedPublic = await student.request(
    'POST',
    `/questions/${seededPublicQuestion._id}/copy`,
    {}
  )
  assert(copiedPublic.owner === studentUser._id, 'Copied question should belong to the student.')
  assert(copiedPublic.approved === false, 'Student copy should be unapproved.')
  assert(copiedPublic.public === false, 'Student copy should not be public.')

  await student.request(
    'PUT',
    `/questions/${copiedPublic._id}`,
    { approved: true, public: true },
    { expectStatus: 403 }
  )

  const instructorStudentQueue = await prof.request(
    'GET',
    `/questions?courseId=${course._id}&library=unapprovedFromStudents`
  )
  assert(
    instructorStudentQueue.some((question) => question._id === copiedPublic._id),
    'Instructor queue should include newly copied student question.'
  )

  const groupManageBefore = await prof.request('GET', `/courses/${course._id}/groups/manage`)
  assert(Array.isArray(groupManageBefore.students), 'Group management endpoint should return students array.')
  const groupCategoryName = `SmokeCategory_${Date.now()}`
  const addedCategoryResponse = await prof.request('POST', `/courses/${course._id}/groups/categories`, {
    categoryName: groupCategoryName,
    nGroups: 2,
  })
  const addedCategory = (addedCategoryResponse.groupCategories || []).find(
    (entry) => entry.categoryName === groupCategoryName
  )
  assert(addedCategory, 'Expected newly created category in response.')
  assert((addedCategory.groups || []).length >= 2, 'Expected category to contain created groups.')
  const firstGroup = (addedCategory.groups || [])[0]
  assert(firstGroup?.groupNumber, 'Expected first group number in created category.')
  await prof.request(
    'POST',
    `/courses/${course._id}/groups/categories/${addedCategory.categoryNumber}/groups/${firstGroup.groupNumber}/students/${studentUser._id}/toggle`,
    {}
  )
  const groupManageAfter = await prof.request('GET', `/courses/${course._id}/groups/manage`)
  const categoryAfterToggle = (groupManageAfter.groupCategories || []).find(
    (entry) => entry.categoryName === groupCategoryName
  )
  const toggledGroup = (categoryAfterToggle?.groups || []).find(
    (entry) => Number(entry.groupNumber) === Number(firstGroup.groupNumber)
  )
  assert(
    (toggledGroup?.students || []).includes(studentUser._id),
    'Expected toggled student to be in selected group.'
  )
  await prof.request(
    'DELETE',
    `/courses/${course._id}/groups/categories/${addedCategory.categoryNumber}`
  )

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

  const editedCourse = await prof.request('PUT', `/courses/${createdCourse._id}`, {
    name: 'Smoke Course Edited',
    section: '002',
    allowStudentQuestions: false,
  })
  assert(editedCourse.name === 'Smoke Course Edited', 'Updated course name mismatch.')
  assert(editedCourse.section === '002', 'Updated course section mismatch.')
  assert(editedCourse.allowStudentQuestions === false, 'Updated course allowStudentQuestions mismatch.')
  await student.request('GET', `/courses/${createdCourse._id}`, undefined, { expectStatus: 403 })
  await student.request('GET', `/sessions?courseId=${createdCourse._id}`, undefined, { expectStatus: 403 })

  const createdSession = await prof.request('POST', '/sessions', {
    name: 'Smoke Managed Session',
    description: 'Session lifecycle parity check',
    courseId: createdCourse._id,
    status: 'hidden',
    quiz: false,
    questions: [],
  })
  assert(createdSession._id, 'Created session missing _id.')
  await student.request('POST', `/sessions/${createdSession._id}/join`, {}, { expectStatus: 403 })

  const visibleSession = await prof.request('PUT', `/sessions/${createdSession._id}/status`, { status: 'visible' })
  assert(visibleSession.status === 'visible', 'Session status update failed.')

  const lifecycleLibraryQuestion = await prof.request('POST', '/questions', {
    plainText: 'Smoke lifecycle question',
    type: 0,
    content: 'Smoke lifecycle question',
    options: [
      { plainText: 'Yes', answer: 'Yes', correct: true },
      { plainText: 'No', answer: 'No', correct: false },
    ],
    owner: profUser._id,
    courseId: createdCourse._id,
    public: false,
    approved: true,
    tags: [],
  })
  assert(lifecycleLibraryQuestion._id, 'Created library question missing _id.')

  const lifecycleLibraryQuestion2 = await prof.request('POST', '/questions', {
    plainText: 'Smoke lifecycle question 2',
    type: 1,
    content: 'Smoke lifecycle question 2',
    options: [
      { plainText: 'True', answer: 'True', correct: true },
      { plainText: 'False', answer: 'False', correct: false },
    ],
    owner: profUser._id,
    courseId: createdCourse._id,
    public: false,
    approved: true,
    tags: [],
  })
  assert(lifecycleLibraryQuestion2._id, 'Created secondary library question missing _id.')

  const copiedQuestionA = await prof.request(
    'POST',
    `/sessions/${createdSession._id}/questions/${lifecycleLibraryQuestion._id}/copy`,
    {}
  )
  const copiedQuestionB = await prof.request(
    'POST',
    `/sessions/${createdSession._id}/questions/${lifecycleLibraryQuestion2._id}/copy`,
    {}
  )
  assert(copiedQuestionA._id && copiedQuestionB._id, 'Expected copied session questions to be created.')

  const sessionAfterCopy = await prof.request('GET', `/sessions/${createdSession._id}`)
  assert(
    (sessionAfterCopy.questions || []).includes(copiedQuestionA._id) &&
      (sessionAfterCopy.questions || []).includes(copiedQuestionB._id),
    'Copied questions were not attached to the session.'
  )

  const reorderedIds = [copiedQuestionB._id, copiedQuestionA._id]
  const reorderedSession = await prof.request('PUT', `/sessions/${createdSession._id}/questions`, {
    questionIds: reorderedIds,
  })
  assert(
    JSON.stringify(reorderedSession.questions || []) === JSON.stringify(reorderedIds),
    'Session question order update did not persist.'
  )

  await student.request('GET', `/questions/${copiedQuestionA._id}`, undefined, { expectStatus: 403 })
  await student.request(
    'POST',
    '/responses',
    {
      attempt: 1,
      questionId: copiedQuestionA._id,
      answer: 'Yes',
    },
    { expectStatus: 403 }
  )
  const updatedQuestion = await prof.request('PUT', `/questions/${copiedQuestionA._id}`, {
    plainText: 'Smoke lifecycle question (edited)',
  })
  assert(updatedQuestion.plainText === 'Smoke lifecycle question (edited)', 'Question update did not persist.')
  const fetchedQuestion = await prof.request('GET', `/questions/${copiedQuestionA._id}`)
  assert(fetchedQuestion._id === copiedQuestionA._id, 'Question fetch by id mismatch.')
  const sessionAfterRemove = await prof.request(
    'DELETE',
    `/sessions/${createdSession._id}/questions/${copiedQuestionA._id}`
  )
  assert(
    !(sessionAfterRemove.questions || []).includes(copiedQuestionA._id),
    'Session question delete endpoint did not remove question.'
  )
  const createdCourseQuestions = await prof.request('GET', `/questions?courseId=${createdCourse._id}`)
  assert(!createdCourseQuestions.some((q) => q._id === copiedQuestionA._id), 'Deleted session copy still appears in course list.')

  const runningSession = sessions.find((entry) => !entry.quiz && entry.status === 'running')
  if (!runningSession) throw new Error('Expected seeded running interactive session.')
  const visibilityProbeQuestion = await prof.request('POST', '/questions', {
    plainText: 'Smoke visibility probe',
    type: 0,
    content: 'Smoke visibility probe',
    options: [
      { plainText: 'A', answer: 'A', correct: true },
      { plainText: 'B', answer: 'B', correct: false },
    ],
    owner: profUser._id,
    sessionId: runningSession._id,
    courseId: course._id,
    public: false,
    approved: true,
    tags: [],
    sessionOptions: {
      hidden: false,
      stats: false,
      correct: false,
      points: 1,
      maxAttempts: 1,
      attemptWeights: [1],
      attempts: [{ number: 1, closed: false }],
    },
  })
  const studentSessionQuestionsHidden = await student.request(
    'GET',
    `/questions?sessionId=${runningSession._id}`
  )
  const hiddenVersion = studentSessionQuestionsHidden.find(
    (entry) => entry._id === visibilityProbeQuestion._id
  )
  assert(hiddenVersion, 'Student should receive session question payload.')
  assert(
    (hiddenVersion.options || []).every(
      (option) => !Object.prototype.hasOwnProperty.call(option, 'correct')
    ),
    'Student session payload should hide option.correct when not visible.'
  )
  assert(
    !Object.prototype.hasOwnProperty.call(hiddenVersion, 'correctNumerical'),
    'Student session payload should hide correctNumerical when not visible.'
  )

  await prof.request('PUT', `/questions/${visibilityProbeQuestion._id}`, {
    sessionOptions: {
      hidden: false,
      stats: false,
      correct: true,
      points: 1,
      maxAttempts: 1,
      attemptWeights: [1],
      attempts: [{ number: 1, closed: false }],
    },
  })

  const studentSessionQuestionsVisible = await student.request(
    'GET',
    `/questions?sessionId=${runningSession._id}`
  )
  const visibleVersion = studentSessionQuestionsVisible.find(
    (entry) => entry._id === visibilityProbeQuestion._id
  )
  assert(
    Boolean(
      visibleVersion &&
        (visibleVersion.options || []).some((option) =>
          Object.prototype.hasOwnProperty.call(option, 'correct')
        )
    ),
    'Student session payload should include option.correct when instructor enables visibility.'
  )
  await prof.request('DELETE', `/questions/${visibilityProbeQuestion._id}`)

  // Authorization regression: non-members cannot read/mutate outsider course/session/question paths.
  await student.request('GET', `/courses/${createdCourse._id}`, undefined, { expectStatus: 403 })
  await student.request('GET', `/sessions/${createdSession._id}`, undefined, { expectStatus: 403 })

  const outsiderQuestion = await prof.request('POST', '/questions', {
    plainText: 'Authz outsider question',
    type: 0,
    content: 'Authz outsider question',
    options: [
      { plainText: 'A', answer: 'A', correct: true },
      { plainText: 'B', answer: 'B', correct: false },
    ],
    owner: profUser._id,
    sessionId: createdSession._id,
    courseId: createdCourse._id,
    public: false,
    approved: true,
    tags: [],
  })
  await student.request('GET', `/questions/${outsiderQuestion._id}`, undefined, { expectStatus: 403 })
  await student.request(
    'PUT',
    `/questions/${outsiderQuestion._id}`,
    { plainText: 'student should not edit outsider question' },
    { expectStatus: 403 }
  )
  await student.request('DELETE', `/questions/${outsiderQuestion._id}`, undefined, { expectStatus: 403 })
  await student.request(
    'POST',
    '/responses',
    {
      attempt: 1,
      questionId: outsiderQuestion._id,
      answer: 'A',
    },
    { expectStatus: 403 }
  )
  await student.request(
    'POST',
    '/questions',
    {
      plainText: 'student outsider create should fail',
      type: 0,
      content: 'student outsider create should fail',
      options: [
        { plainText: 'A', answer: 'A', correct: true },
        { plainText: 'B', answer: 'B', correct: false },
      ],
      owner: studentUser._id,
      sessionId: createdSession._id,
      courseId: createdCourse._id,
      public: false,
      approved: true,
      tags: [],
    },
    { expectStatus: 403 }
  )
  await student.request(
    'GET',
    `/responses?questionId=${outsiderQuestion._id}`,
    undefined,
    { expectStatus: 403 }
  )
  await prof.request('DELETE', `/questions/${outsiderQuestion._id}`)
  const deletedSession = await prof.request('DELETE', `/sessions/${createdSession._id}`)
  assert(deletedSession.success === true, 'Session delete endpoint did not report success.')
  const createdCourseSessionsAfterDelete = await prof.request('GET', `/sessions?courseId=${createdCourse._id}`)
  assert(
    !createdCourseSessionsAfterDelete.some((entry) => entry._id === createdSession._id),
    'Deleted session still appears in course session list.'
  )
  const createdCourseDocAfterDelete = await prof.request('GET', `/courses/${createdCourse._id}`)
  assert(
    !(createdCourseDocAfterDelete.sessions || []).includes(createdSession._id),
    'Deleted session id still appears in course.sessions.'
  )

  const quizSession = sessions.find((s) => s.quiz)
  if (!quizSession) throw new Error('Seeded quiz session not found.')
  await prof.request('PUT', `/sessions/${quizSession._id}`, {
    quizExtensions: [
      {
        userId: studentUser._id,
        quizStart: new Date().toISOString(),
        quizEnd: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
    ],
  })

  const q1 = questions.find((q) => q.type === 0)
  if (!q1) throw new Error('Expected one MC question in seeded dataset.')
  const beforeGrades = await student.request('GET', `/grades?courseId=${course._id}`)
  const beforePoints = beforeGrades.reduce((sum, grade) => sum + Number(grade.points || 0), 0)
  try {
    await student.request('POST', '/responses', {
      attempt: 1,
      questionId: q1._id,
      answer: '4',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.includes('already submitted for this attempt')) throw err
  }

  const studentGrades = await student.request('GET', `/grades?courseId=${course._id}`)
  if (studentGrades.length === 0) throw new Error('Student should have at least one grade row.')
  const afterPoints = studentGrades.reduce((sum, grade) => sum + Number(grade.points || 0), 0)
  if (afterPoints < beforePoints) throw new Error('Auto-grading should not reduce total points for a correct answer submission.')

  const studentResponses = await student.request('GET', `/responses?questionId=${q1._id}`)
  assert(studentResponses.some((response) => response.studentUserId === studentUser._id), 'Student should see own response with studentUserId.')
  assert(studentResponses.some((response) => !Object.prototype.hasOwnProperty.call(response, 'studentUserId')), 'Student should see anonymized peer responses when stats are enabled.')

  await student.request('POST', `/sessions/${quizSession._id}/join`, {})
  const submitQuiz = await student.request('POST', `/sessions/${quizSession._id}/submit`, {})
  assert(submitQuiz.success === true, 'Quiz submit endpoint did not report success.')

  const seededStudent2Grades = await prof.request('GET', `/grades?courseId=${course._id}&userId=${student2User._id}`)
  let hiddenGrade = seededStudent2Grades.find(
    (grade) => grade.sessionId && grade.visibleToStudents === false
  )
  if (!hiddenGrade?._id) {
    const fallbackGrade = seededStudent2Grades.find((grade) => grade._id && grade.sessionId)
    assert(fallbackGrade?._id, 'Expected at least one seeded grade for student2.')
    await prof.request('PUT', `/grades/${fallbackGrade._id}/visible`, { visible: false })
    const refreshedGrades = await prof.request(
      'GET',
      `/grades?courseId=${course._id}&userId=${student2User._id}`
    )
    hiddenGrade = refreshedGrades.find((grade) => grade._id === fallbackGrade._id) || fallbackGrade
  }
  assert(hiddenGrade?._id, 'Expected a hidden grade for student2 after visibility setup.')

  const student2Before = await student2.request('GET', `/grades?courseId=${course._id}`)
  assert(!student2Before.some((grade) => grade._id === hiddenGrade._id), 'Hidden grade should not be visible to student.')
  await prof.request('PUT', `/grades/${hiddenGrade._id}/visible`, { visible: true })
  const student2After = await student2.request('GET', `/grades?courseId=${course._id}`)
  assert(student2After.some((grade) => grade._id === hiddenGrade._id), 'Visible grade should appear in student list after toggle.')

  const reviewableSession = await prof.request('POST', '/sessions', {
    name: `Smoke Reviewable ${Date.now()}`,
    description: 'Reviewability parity check',
    courseId: course._id,
    status: 'hidden',
    quiz: false,
    questions: [],
    reviewable: false,
  })
  assert(reviewableSession?._id, 'Reviewability parity session creation failed.')
  const reviewableSourceQuestion =
    questions.find((question) => question.courseId === course._id && !question.sessionId) ||
    questions.find((question) => question.courseId === course._id) ||
    q1
  assert(reviewableSourceQuestion?._id, 'Reviewability parity source question missing.')
  const reviewableQuestion = await prof.request(
    'POST',
    `/sessions/${reviewableSession._id}/questions/${reviewableSourceQuestion._id}/copy`,
    {}
  )
  assert(reviewableQuestion?._id, 'Reviewability parity question copy failed.')

  await prof.request('PUT', `/sessions/${reviewableSession._id}/status`, { status: 'running' })
  await student.request('POST', `/sessions/${reviewableSession._id}/join`, {})
  const reviewAnswer =
    reviewableQuestion.options?.[0]?.answer ||
    reviewableQuestion.options?.[0]?.plainText ||
    reviewableQuestion.options?.[0]?.content ||
    'A'
  await student.request('POST', '/responses', {
    attempt: 1,
    questionId: reviewableQuestion._id,
    answer: reviewAnswer,
  })
  await prof.request('PUT', `/sessions/${reviewableSession._id}/status`, { status: 'done' })

  const reviewableEnabled = await prof.request(
    'PUT',
    `/sessions/${reviewableSession._id}/reviewable`,
    { reviewable: true }
  )
  assert(
    reviewableEnabled?.session?.reviewable === true,
    'Session reviewable toggle-on should set reviewable=true.'
  )
  assert(
    Number(reviewableEnabled?.gradesUpdated || 0) >= 1,
    'Session reviewable toggle-on should recalculate at least one student grade.'
  )

  const reviewableGrades = await prof.request(
    'GET',
    `/grades?sessionId=${reviewableSession._id}&userId=${studentUser._id}`
  )
  const reviewableGrade = reviewableGrades.find((grade) => grade.userId === studentUser._id)
  assert(reviewableGrade?._id, 'Reviewability parity should create a student grade record.')
  assert(
    reviewableGrade.visibleToStudents === true,
    'Reviewable session grade should be visible to students.'
  )
  const reviewableVisibleToStudent = await student.request('GET', `/grades?sessionId=${reviewableSession._id}`)
  assert(
    reviewableVisibleToStudent.some((grade) => grade._id === reviewableGrade._id),
    'Student should see session grade when reviewability is enabled.'
  )

  const reviewableDisabled = await prof.request(
    'PUT',
    `/sessions/${reviewableSession._id}/reviewable`,
    { reviewable: false }
  )
  assert(
    reviewableDisabled?.session?.reviewable === false,
    'Session reviewable toggle-off should set reviewable=false.'
  )
  const hiddenAfterDisable = await prof.request(
    'GET',
    `/grades?sessionId=${reviewableSession._id}&userId=${studentUser._id}`
  )
  const hiddenReviewGrade = hiddenAfterDisable.find((grade) => grade._id === reviewableGrade._id)
  assert(
    hiddenReviewGrade?.visibleToStudents === false,
    'Disabling reviewability should hide session grade from students.'
  )
  const reviewableHiddenFromStudent = await student.request('GET', `/grades?sessionId=${reviewableSession._id}`)
  assert(
    !reviewableHiddenFromStudent.some((grade) => grade._id === reviewableGrade._id),
    'Student should not see session grade when reviewability is disabled.'
  )
  await student.request(
    'PUT',
    `/sessions/${reviewableSession._id}/reviewable`,
    { reviewable: true },
    { expectStatus: 403 }
  )
  await prof.request('DELETE', `/sessions/${reviewableSession._id}`)

  const users = await admin.request('GET', '/users')
  if (users.length < 4) throw new Error('Admin should be able to list users.')

  const adminCourses = await admin.request('GET', '/courses')
  assert(adminCourses.some((entry) => entry._id === createdCourse._id), 'Admin should be able to list newly created course.')

  const videoConfig = await prof.request('GET', `/courses/${course._id}/video-chat-config`)
  if (!Object.prototype.hasOwnProperty.call(videoConfig, 'enabled')) {
    throw new Error('Video config endpoint missing expected shape.')
  }

  const videoCategoryName = `SmokeVideo-${Date.now()}`
  const videoCategoryCreate = await prof.request('POST', `/courses/${course._id}/groups/categories`, {
    categoryName: videoCategoryName,
    nGroups: 2,
  })
  const videoCategory = (videoCategoryCreate.groupCategories || []).find(
    (entry) => entry.categoryName === videoCategoryName
  )
  assert(videoCategory, 'Video test category should be created.')
  const groupOneNumber = Number(videoCategory.groups?.[0]?.groupNumber || 0)
  const groupTwoNumber = Number(videoCategory.groups?.[1]?.groupNumber || 0)
  assert(groupOneNumber > 0 && groupTwoNumber > 0, 'Video test groups should exist.')

  await prof.request(
    'POST',
    `/courses/${course._id}/groups/categories/${videoCategory.categoryNumber}/groups/${groupOneNumber}/students/${studentUser._id}/toggle`,
    {}
  )
  await prof.request(
    'POST',
    `/courses/${course._id}/groups/categories/${videoCategory.categoryNumber}/groups/${groupTwoNumber}/students/${student2User._id}/toggle`,
    {}
  )

  await prof.request('POST', `/courses/${course._id}/video-chat/toggle`, { enabled: true })
  const courseVideoConnection = await student.request('GET', `/courses/${course._id}/video-chat/connection`)
  assert(courseVideoConnection?.connectionInfo?.options?.roomName, 'Course video connection payload missing roomName.')
  await student.request('POST', `/courses/${course._id}/video-chat/join`, {})
  await student.request('POST', `/courses/${course._id}/video-chat/leave`, {})

  await prof.request(
    'POST',
    `/courses/${course._id}/video-chat/categories/${videoCategory.categoryNumber}/toggle`,
    { enabled: true }
  )
  const categoryVideoConnection = await student.request(
    'GET',
    `/courses/${course._id}/video-chat/categories/${videoCategory.categoryNumber}/connection`
  )
  assert(
    Number(categoryVideoConnection?.connectionInfo?.groupNumber) === groupOneNumber,
    'Student should resolve to assigned group video room.'
  )

  await student.request(
    'POST',
    `/courses/${course._id}/video-chat/categories/${videoCategory.categoryNumber}/groups/${groupOneNumber}/join`,
    {}
  )
  await student.request(
    'POST',
    `/courses/${course._id}/video-chat/categories/${videoCategory.categoryNumber}/groups/${groupTwoNumber}/help/toggle`,
    {},
    { expectStatus: 403 }
  )
  const helpToggled = await student.request(
    'POST',
    `/courses/${course._id}/video-chat/categories/${videoCategory.categoryNumber}/groups/${groupOneNumber}/help/toggle`,
    {}
  )
  const helpCategory = (helpToggled.groupCategories || []).find(
    (entry) => Number(entry.categoryNumber) === Number(videoCategory.categoryNumber)
  )
  const helpGroup = (helpCategory?.groups || []).find((entry) => Number(entry.groupNumber) === groupOneNumber)
  assert(helpGroup?.helpVideoChat === true, 'Group help flag should be enabled after student toggle.')

  const clearedGroup = await prof.request(
    'POST',
    `/courses/${course._id}/video-chat/categories/${videoCategory.categoryNumber}/groups/${groupOneNumber}/clear`,
    {}
  )
  const clearedCategory = (clearedGroup.groupCategories || []).find(
    (entry) => Number(entry.categoryNumber) === Number(videoCategory.categoryNumber)
  )
  const clearedGroupState = (clearedCategory?.groups || []).find(
    (entry) => Number(entry.groupNumber) === groupOneNumber
  )
  assert(
    (clearedGroupState?.joinedVideoChat || []).length === 0 && clearedGroupState?.helpVideoChat === false,
    'Instructor clear group should reset joined/help state.'
  )
  await student.request(
    'POST',
    `/courses/${course._id}/video-chat/categories/${videoCategory.categoryNumber}/groups/${groupOneNumber}/leave`,
    {}
  )
  await prof.request(
    'POST',
    `/courses/${course._id}/video-chat/categories/${videoCategory.categoryNumber}/clear`,
    {}
  )
  await prof.request('POST', `/courses/${course._id}/video-chat/clear`, {})

  const verifyResponse = await student.request('POST', '/users/verify-email', {})
  if (!Object.prototype.hasOwnProperty.call(verifyResponse, 'success')) {
    throw new Error('Verify-email endpoint missing expected response shape.')
  }

  const loginState = await student.request('GET', '/auth/me')
  const studentUserId = loginState?.user?._id
  if (!studentUserId) throw new Error('Could not resolve authenticated seeded student user id.')

  const uploadPayload = new FormData()
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])
  uploadPayload.append('file', new Blob([pngBytes], { type: 'image/png' }), 'smoke-profile.png')
  const uploadedImage = await student.requestMultipart('/images', uploadPayload)
  if (!uploadedImage?.url || !uploadedImage?.UID) {
    throw new Error('Image upload did not return expected url/UID shape.')
  }

  await student.request('PUT', `/users/${studentUserId}/profile`, {
    profileImage: uploadedImage.url,
    profileThumbnail: uploadedImage.url,
  })
  const updatedStudent = await student.request('GET', `/users/${studentUserId}`)
  if (updatedStudent?.profile?.profileImage !== uploadedImage.url) {
    throw new Error('Profile image URL was not persisted on seeded user.')
  }
  if (updatedStudent?.profile?.profileThumbnail !== uploadedImage.url) {
    throw new Error('Profile thumbnail URL was not persisted on seeded user.')
  }

  const forgot = await admin.request('POST', '/auth/forgot-password', { email: 'student2@gmail.com' })
  if (!forgot.success) throw new Error('Forgot-password endpoint did not report success.')
  if (!forgot.debugResetToken) throw new Error('Forgot-password debug token missing in non-production mode.')
  const reset = await admin.request('POST', '/auth/reset-password', {
    token: forgot.debugResetToken,
    password: '12345678',
  })
  if (!reset.success) throw new Error('Reset-password endpoint did not report success.')

  const preEnrollCourses = await student.request('GET', '/courses')
  assert(!preEnrollCourses.some((entry) => entry._id === createdCourse._id), 'Student should not have pre-enrolled in created course.')
  const enrolledCourse = await student.request('POST', '/courses/enroll', {
    enrollmentCode: createdCourse.enrollmentCode.toUpperCase(),
  })
  if (enrolledCourse._id !== createdCourse._id) {
    throw new Error('Enrollment by code should return the enrolled course.')
  }
  await student.request('GET', `/courses/${createdCourse._id}`)
  await student.request('GET', `/sessions?courseId=${createdCourse._id}`)
  const studentCourses = await student.request('GET', '/courses')
  if (!studentCourses.some((c) => c._id === createdCourse._id)) {
    throw new Error('Enrolled course was not visible in student course list.')
  }

  await student.request('POST', '/auth/logout', {})
  await prof.request('POST', '/auth/logout', {})
  await admin.request('POST', '/auth/logout', {})
  await student2.request('POST', '/auth/logout', {})

  console.log('Migration smoke checks passed for professor, student, and admin parity paths.')
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
