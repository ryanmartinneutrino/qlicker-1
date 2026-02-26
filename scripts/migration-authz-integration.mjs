#!/usr/bin/env node

import {
  ApiSession,
  assert,
  assertQlickerApiReachable,
  resolveApiBaseUrl,
} from './migration-runtime-utils.mjs'

const baseUrl = resolveApiBaseUrl()

async function run() {
  await assertQlickerApiReachable({ baseUrl, requireFingerprint: true })

  const prof = new ApiSession('prof', baseUrl)
  const student = new ApiSession('student', baseUrl)
  const student2 = new ApiSession('student2', baseUrl)
  const admin = new ApiSession('admin', baseUrl)
  const outsiderProf = new ApiSession('outsiderProf', baseUrl)
  const rosterCandidate = new ApiSession('rosterCandidate', baseUrl)

  await prof.login('prof@gmail.com', '12345678')
  await student.login('student1@gmail.com', '12345678')
  await student2.login('student2@gmail.com', '12345678')
  await admin.login('admin@gmail.com', '12345678')

  const meProf = await prof.request('GET', '/auth/me')
  const meStudent = await student.request('GET', '/auth/me')
  const meStudent2 = await student2.request('GET', '/auth/me')
  const meAdmin = await admin.request('GET', '/auth/me')
  assert(meProf?.user?._id, 'Professor user id missing.')
  assert(meStudent?.user?._id, 'Student user id missing.')
  assert(meStudent2?.user?._id, 'Student2 user id missing.')
  assert(meAdmin?.user?._id, 'Admin user id missing.')

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
  await prof.request('PUT', `/courses/${tempCourse._id}`, { allowStudentQuestions: true })

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

  const rosterEmail = `roster.student.${Date.now()}@gmail.com`
  const rosterPassword = '12345678'
  await rosterCandidate.request('POST', '/auth/register', {
    email: rosterEmail,
    password: rosterPassword,
    firstname: 'Roster',
    lastname: 'Candidate',
  })
  const rosterIdentity = await rosterCandidate.request('GET', '/auth/me')
  assert(rosterIdentity?.user?._id, 'Roster candidate user id missing.')

  // promote/canPromote parity checks
  await student.request(
    'PATCH',
    `/users/${meProf.user._id}/can-promote`,
    { canPromote: true },
    { expectStatus: 403 }
  )
  await admin.request('PATCH', `/users/${meProf.user._id}/can-promote`, { canPromote: true })

  const profAfterPromoteToggle = await prof.request('GET', `/users/${meProf.user._id}`)
  assert(profAfterPromoteToggle?.profile?.canPromote === true, 'Professor canPromote toggle should persist.')

  await student.request('POST', '/users/promote', { email: rosterEmail }, { expectStatus: 403 })
  await student.request('POST', `/users/${rosterIdentity.user._id}/promote`, {}, { expectStatus: 403 })
  await prof.request('POST', '/users/promote', { email: rosterEmail })

  await rosterCandidate.login(rosterEmail, rosterPassword)
  const rosterPromotedByEmail = await rosterCandidate.request('GET', '/auth/me')
  assert(
    (rosterPromotedByEmail?.user?.profile?.roles || []).includes('professor'),
    'Promote-by-email should set role to professor.'
  )

  await admin.request('PUT', `/users/${rosterIdentity.user._id}/role`, { role: 'student' })
  await admin.request('POST', `/users/${rosterIdentity.user._id}/promote`, {})
  await rosterCandidate.login(rosterEmail, rosterPassword)
  const rosterPromotedById = await rosterCandidate.request('GET', '/auth/me')
  assert(
    (rosterPromotedById?.user?.profile?.roles || []).includes('professor'),
    'Promote-by-id should set role to professor.'
  )

  await prof.request('POST', `/users/${meAdmin.user._id}/promote`, {}, { expectStatus: 400 })

  const outsiderEmail = `outsider.prof.${Date.now()}@gmail.com`
  const outsiderPassword = '12345678'
  await outsiderProf.request('POST', '/auth/register', {
    email: outsiderEmail,
    password: outsiderPassword,
    firstname: 'Outsider',
    lastname: 'Professor',
  })
  const outsiderIdentity = await outsiderProf.request('GET', '/auth/me')
  assert(outsiderIdentity?.user?._id, 'Outsider professor user id missing.')
  await admin.request('PUT', `/users/${outsiderIdentity.user._id}/role`, { role: 'professor' })
  await outsiderProf.login(outsiderEmail, outsiderPassword)
  const outsiderCourse = await outsiderProf.request('POST', '/courses', {
    name: `Authz Outsider ${Date.now()}`,
    deptCode: 'CISC',
    courseNumber: '399',
    section: '001',
    semester: 'Fall 2026',
  })
  assert(outsiderCourse?._id, 'Outsider professor course creation failed.')
  await outsiderProf.request('PUT', `/courses/${tempCourse._id}`, { name: 'Outsider takeover' }, { expectStatus: 403 })
  await outsiderProf.request('DELETE', `/courses/${tempCourse._id}`, undefined, { expectStatus: 403 })
  await outsiderProf.request('POST', `/courses/${tempCourse._id}/enrollment-code/regenerate`, {}, { expectStatus: 403 })
  await outsiderProf.request('GET', `/courses/${tempCourse._id}/roster`, undefined, { expectStatus: 403 })
  await outsiderProf.request('DELETE', `/courses/${tempCourse._id}/students/${meStudent.user._id}`, undefined, { expectStatus: 403 })
  await outsiderProf.request('POST', `/courses/${tempCourse._id}/students`, { email: rosterEmail }, { expectStatus: 403 })
  await outsiderProf.request('POST', `/courses/${tempCourse._id}/instructors`, { email: rosterEmail }, { expectStatus: 403 })
  await outsiderProf.request('DELETE', `/courses/${tempCourse._id}/instructors/${meProf.user._id}`, undefined, { expectStatus: 403 })
  await outsiderProf.request('GET', `/courses/${tempCourse._id}/groups/manage`, undefined, { expectStatus: 403 })
  await outsiderProf.request('POST', `/courses/${tempCourse._id}/groups/categories`, { categoryName: 'blocked', nGroups: 1 }, { expectStatus: 403 })
  await outsiderProf.request('POST', `/courses/${tempCourse._id}/video-chat/toggle`, { enabled: true }, { expectStatus: 403 })

  // roster parity checks (add student by email, promote to instructor, remove instructor)
  await prof.request('POST', `/courses/${tempCourse._id}/students`, { email: rosterEmail })
  const rosterAfterStudentAdd = await prof.request('GET', `/courses/${tempCourse._id}/roster`)
  assert(
    rosterAfterStudentAdd.students.some((entry) => entry._id === rosterIdentity.user._id),
    'Added student should appear in roster students.'
  )

  await prof.request('POST', `/courses/${tempCourse._id}/instructors`, { email: rosterEmail })
  const rosterAfterInstructorAdd = await prof.request('GET', `/courses/${tempCourse._id}/roster`)
  assert(
    rosterAfterInstructorAdd.instructors.some((entry) => entry._id === rosterIdentity.user._id),
    'Promoted instructor should appear in roster instructors.'
  )
  assert(
    !rosterAfterInstructorAdd.students.some((entry) => entry._id === rosterIdentity.user._id),
    'Promoted instructor should be removed from roster students.'
  )

  await rosterCandidate.login(rosterEmail, rosterPassword)
  await rosterCandidate.request(
    'DELETE',
    `/courses/${tempCourse._id}/instructors/${rosterIdentity.user._id}`,
    undefined,
    { expectStatus: 400 }
  )
  await prof.request('DELETE', `/courses/${tempCourse._id}/instructors/${meProf.user._id}`, undefined, { expectStatus: 400 })
  await prof.request('DELETE', `/courses/${tempCourse._id}/instructors/${rosterIdentity.user._id}`)
  const rosterAfterInstructorRemoval = await prof.request('GET', `/courses/${tempCourse._id}/roster`)
  assert(
    !rosterAfterInstructorRemoval.instructors.some((entry) => entry._id === rosterIdentity.user._id),
    'Removed instructor should no longer appear in roster instructors.'
  )

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

  await prof.request('PUT', `/sessions/${tempSession._id}/status`, { status: 'done' })
  const reviewableEnabled = await prof.request(
    'PUT',
    `/sessions/${tempSession._id}/reviewable`,
    { reviewable: true }
  )
  assert(
    reviewableEnabled?.session?.reviewable === true,
    'Instructor should be able to enable session reviewability.'
  )
  const reviewableDisabled = await prof.request(
    'PUT',
    `/sessions/${tempSession._id}/reviewable`,
    { reviewable: false }
  )
  assert(
    reviewableDisabled?.session?.reviewable === false,
    'Instructor should be able to disable session reviewability.'
  )

  // export surface checks (course/session grades + session responses)
  await prof.request('POST', `/grades/calc-session/${tempSession._id}`, {})

  await outsiderProf.request('PUT', `/sessions/${tempSession._id}/status`, { status: 'visible' }, { expectStatus: 403 })
  await outsiderProf.request(
    'PUT',
    `/sessions/${tempSession._id}/reviewable`,
    { reviewable: true },
    { expectStatus: 403 }
  )
  await student.request(
    'PUT',
    `/sessions/${tempSession._id}/reviewable`,
    { reviewable: true },
    { expectStatus: 403 }
  )
  await outsiderProf.request('PUT', `/sessions/${tempSession._id}/questions`, { questionIds: [sessionQuestion._id] }, { expectStatus: 403 })
  await outsiderProf.request('POST', `/sessions/${tempSession._id}/questions/${publicQuestion._id}/copy`, {}, { expectStatus: 403 })
  await outsiderProf.request('GET', `/sessions/${tempSession._id}/extension-candidates`, undefined, { expectStatus: 403 })
  await outsiderProf.request('POST', `/grades/calc-session/${tempSession._id}`, {}, { expectStatus: 403 })
  await outsiderProf.request('GET', `/grades/session/${tempSession._id}/export`, undefined, { expectStatus: 403 })
  await outsiderProf.request('PUT', `/grades/session/${tempSession._id}/visible`, { visible: true }, { expectStatus: 403 })

  const courseGradesCsv = await prof.request(
    'GET',
    `/grades/course/${tempCourse._id}/export?sessionIds=${encodeURIComponent(tempSession._id)}`
  )
  assert(typeof courseGradesCsv === 'string', 'Course grades export should return CSV text.')
  assert(courseGradesCsv.includes('"LastName","FirstName","Email","UserId"'), 'Course grades export header mismatch.')
  assert(courseGradesCsv.includes(meStudent.user._id), 'Course grades export should include enrolled student row.')

  await student2.request('GET', `/grades/course/${tempCourse._id}/export`, undefined, { expectStatus: 403 })

  const sessionGradesCsv = await prof.request('GET', `/grades/session/${tempSession._id}/export`)
  assert(typeof sessionGradesCsv === 'string', 'Session grades export should return CSV text.')
  assert(sessionGradesCsv.includes('"Grade (%)"'), 'Session grades export header mismatch.')
  await student.request('GET', `/grades/session/${tempSession._id}/export`, undefined, { expectStatus: 403 })

  const tempStudentGrades = await prof.request('GET', `/grades?courseId=${tempCourse._id}&sessionId=${tempSession._id}&userId=${meStudent.user._id}`)
  const tempGrade = tempStudentGrades.find((grade) => grade.userId === meStudent.user._id)
  assert(tempGrade?._id, 'Expected generated temp grade for outsider authz checks.')
  await outsiderProf.request('PUT', `/grades/${tempGrade._id}`, { participation: 77 }, { expectStatus: 403 })
  await outsiderProf.request('PUT', `/grades/${tempGrade._id}/visible`, { visible: true }, { expectStatus: 403 })

  const sessionResponsesCsv = await prof.request('GET', `/responses/session/${tempSession._id}/export`)
  assert(typeof sessionResponsesCsv === 'string', 'Session responses export should return CSV text.')
  assert(
    sessionResponsesCsv.includes('"QuestionIndex","QuestionId","QuestionPlainText","QuestionType"'),
    'Session responses export header mismatch.'
  )
  await student.request('GET', `/responses/session/${tempSession._id}/export`, undefined, { expectStatus: 403 })

  // group assignment semantics check (exclusive membership + renumber on delete)
  const createdCategory = await prof.request('POST', `/courses/${tempCourse._id}/groups/categories`, {
    categoryName: 'AuthzCategory',
    nGroups: 2,
  })
  const category = (createdCategory.groupCategories || []).find((entry) => entry.categoryName === 'AuthzCategory')
  assert(category, 'Group category should be created.')
  const initialGroups = category.groups || []
  assert(initialGroups.length >= 2, 'Category should contain at least two groups.')

  const groupA = initialGroups[0]
  const groupB = initialGroups[1]
  assert(groupA?.groupNumber && groupB?.groupNumber, 'Group numbers should be defined.')

  await prof.request(
    'POST',
    `/courses/${tempCourse._id}/groups/categories/${category.categoryNumber}/groups/${groupA.groupNumber}/students/${meStudent.user._id}/toggle`,
    {}
  )
  const moved = await prof.request(
    'POST',
    `/courses/${tempCourse._id}/groups/categories/${category.categoryNumber}/groups/${groupB.groupNumber}/students/${meStudent.user._id}/toggle`,
    {}
  )
  const movedCategory = (moved.groupCategories || []).find((entry) => entry.categoryName === 'AuthzCategory')
  const movedGroups = movedCategory?.groups || []
  const inGroupA = (movedGroups.find((entry) => entry.groupNumber === groupA.groupNumber)?.students || []).includes(meStudent.user._id)
  const inGroupB = (movedGroups.find((entry) => entry.groupNumber === groupB.groupNumber)?.students || []).includes(meStudent.user._id)
  assert(!inGroupA && inGroupB, 'Student should be assigned to exactly one group within a category.')

  const deletedGroup = await prof.request(
    'DELETE',
    `/courses/${tempCourse._id}/groups/categories/${category.categoryNumber}/groups/${groupA.groupNumber}`
  )
  const deletedCategory = (deletedGroup.groupCategories || []).find((entry) => entry.categoryName === 'AuthzCategory')
  const remainingGroupNumbers = (deletedCategory?.groups || []).map((entry) => Number(entry.groupNumber))
  assert(
    remainingGroupNumbers.every((number, index) => number === index + 1),
    'Group numbers should be renumbered after deletion.'
  )

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

  // image ownership auth check
  const formData = new FormData()
  formData.append('file', new Blob(['authz-image'], { type: 'image/png' }), 'authz.png')
  const uploadedImage = await prof.upload('/images', formData)
  assert(uploadedImage?._id, 'Image upload should succeed for owner test.')
  await student.request('DELETE', `/images/${uploadedImage._id}`, undefined, { expectStatus: 403 })
  await admin.request('DELETE', `/images/${uploadedImage._id}`)

  // cleanup temp resources
  await prof.request('DELETE', `/sessions/${tempSession._id}`)
  await prof.request('DELETE', `/courses/${tempCourse._id}`)
  await prof.request('DELETE', `/courses/${tempCourse2._id}`)
  await outsiderProf.request('DELETE', `/courses/${outsiderCourse._id}`)
  await outsiderProf.request('POST', '/auth/logout', {})
  await admin.request('DELETE', `/users/${outsiderIdentity.user._id}`)
  await rosterCandidate.request('POST', '/auth/logout', {})
  await admin.request('DELETE', `/users/${rosterIdentity.user._id}`)
  await admin.request('PATCH', `/users/${meProf.user._id}/can-promote`, { canPromote: false })

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
