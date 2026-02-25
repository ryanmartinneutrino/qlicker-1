import { Router, type Response as ExpressResponse } from 'express'
import { getGrades } from '../collections/grades'
import { requireAuth, requireInstructor } from '../auth/middleware'
import type { User } from '@qlicker/shared'
import { gradeSchema, QuestionType } from '@qlicker/shared'
import { getSessions } from '../collections/sessions'
import { getCourses } from '../collections/courses'
import { getQuestions } from '../collections/questions'
import { getResponses } from '../collections/responses'
import { getUsers } from '../collections/users'
import type { Grade, Mark, Question, Response, Session } from '@qlicker/shared'
import type { WithId } from 'mongodb'
import { generateStringId } from '../utils/id'
import { sendCsvDownload } from '../utils/csv'
import {
  courseAccessForUser,
  canUserManageCourse,
  isAdmin,
  isProfessor,
  resolveCourseIdFromSession,
} from '../auth/course-access'

const router = Router()

interface CsvUser {
  firstname: string
  lastname: string
  email: string
}

interface StudentGradeRow {
  userId: string
  firstname: string
  lastname: string
  email: string
  totalPoints: number
  totalOutOf: number
  totalAnswered: number
  totalQuestions: number
  bySessionId: Record<string, Grade>
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function toMillis(value: unknown): number {
  if (!value) return 0
  const date = value instanceof Date ? value : new Date(value as string)
  const time = date.getTime()
  return Number.isFinite(time) ? time : 0
}

function sessionLabel(session: Session): string {
  const name = (session.name || 'Untitled Session').toUpperCase()
  const stamp = session.date || session.quizEnd || session.quizStart || session.createdAt
  if (!stamp) return name
  const parsed = new Date(stamp)
  if (Number.isNaN(parsed.getTime())) return name
  return `${name} (${parsed.toISOString().slice(0, 10)})`
}

function parseSessionIdQuery(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseSessionIdQuery(entry))
  }
  return []
}

async function loadCsvUserMap(userIds: string[]): Promise<Map<string, CsvUser>> {
  const users = getUsers()
  const ids = [...new Set(userIds.filter((id) => typeof id === 'string' && id.length > 0))]
  if (ids.length < 1) return new Map()

  const docs = await users
    .find(
      { _id: { $in: ids } } as Parameters<typeof users.find>[0],
      { projection: { _id: 1, emails: 1, 'profile.firstname': 1, 'profile.lastname': 1 } }
    )
    .toArray()

  return new Map(
    docs.map((doc) => [
      doc._id,
      {
        firstname: doc.profile.firstname || '',
        lastname: doc.profile.lastname || '',
        email: doc.emails?.[0]?.address || '',
      },
    ])
  )
}

function asArrayAnswer(answer: Response['answer']): string[] {
  if (Array.isArray(answer)) return answer.map((v) => String(v))
  return [String(answer)]
}

function questionPoints(question: Question): number {
  if (question.type === QuestionType.SA && question.sessionOptions?.points === undefined) return 0
  return question.sessionOptions?.points ?? 1
}

function attemptWeight(question: Question, attempt: number): number {
  const maxAttempts = Number(question.sessionOptions?.maxAttempts ?? 1)
  if (maxAttempts <= 1) return 1
  const weights = question.sessionOptions?.attemptWeights || [1]
  if (attempt >= 1 && attempt <= weights.length) return Number(weights[attempt - 1])
  return 0
}

function buildOptionIndexMap(question: Question): Map<string, number> {
  const map = new Map<string, number>()
  ;(question.options || []).forEach((option, index) => {
    const letter = String.fromCharCode(65 + index)
    map.set(normalizeText(letter), index)
    map.set(normalizeText(String(index)), index)
    if (option.answer) map.set(normalizeText(option.answer), index)
    if (option.plainText) map.set(normalizeText(option.plainText), index)
    if (option.content) map.set(normalizeText(option.content), index)
  })
  return map
}

function isAutoGradeable(type: Question['type']): boolean {
  return (
    type === QuestionType.MC ||
    type === QuestionType.TF ||
    type === QuestionType.MS ||
    type === QuestionType.NU
  )
}

function calculateAutomaticPoints(question: Question, response: Response | null): number {
  if (!response) return 0
  const basePoints = questionPoints(question)
  const weightedPoints = basePoints * attemptWeight(question, Number(response.attempt || 1))
  if (weightedPoints <= 0) return 0

  const optionIndexMap = buildOptionIndexMap(question)
  const correctIndexes = new Set<number>()
  ;(question.options || []).forEach((option, idx) => {
    if (option.correct) correctIndexes.add(idx)
  })

  if (question.type === QuestionType.MC || question.type === QuestionType.TF) {
    const raw = asArrayAnswer(response.answer)[0] || ''
    const idx = optionIndexMap.get(normalizeText(raw))
    return idx !== undefined && correctIndexes.has(idx) ? weightedPoints : 0
  }

  if (question.type === QuestionType.MS) {
    const rawSelections = asArrayAnswer(response.answer)
    const selectedIndexes = new Set<number>()
    rawSelections.forEach((selection) => {
      const idx = optionIndexMap.get(normalizeText(selection))
      if (idx !== undefined) selectedIndexes.add(idx)
    })
    const intersection = [...selectedIndexes].filter((idx) => correctIndexes.has(idx))
    const denominator = correctIndexes.size
    const rawScore =
      denominator > 0 ? (2 * intersection.length - selectedIndexes.size) / denominator : 0
    const boundedScore = Math.max(0, Math.min(1, rawScore))
    return weightedPoints * boundedScore
  }

  if (question.type === QuestionType.NU) {
    const raw = asArrayAnswer(response.answer)[0] || ''
    const numericAnswer = Number(raw)
    const expected = Number(question.correctNumerical ?? NaN)
    const tolerance = Number(question.toleranceNumerical ?? 0)
    const correct =
      Number.isFinite(numericAnswer) &&
      Number.isFinite(expected) &&
      Math.abs(numericAnswer - expected) <= Math.abs(tolerance)
    return correct ? weightedPoints : 0
  }

  return 0
}

async function ensureSessionManageAccess(
  user: User,
  session: Pick<Session, 'courseId'>,
  res: ExpressResponse
): Promise<boolean> {
  if (isAdmin(user)) return true
  const allowed = await canUserManageCourse(user, session.courseId)
  if (!allowed) {
    res.status(403).json({ error: 'Forbidden.' })
    return false
  }
  return true
}

async function loadManagedGrade(
  user: User,
  gradeId: string,
  res: ExpressResponse
): Promise<WithId<Grade> | null> {
  const grades = getGrades()
  const grade = await grades.findOne({ _id: gradeId } as Parameters<typeof grades.findOne>[0])
  if (!grade) {
    res.status(404).json({ error: 'Grade not found.' })
    return null
  }
  if (isAdmin(user)) return grade

  const courseId = grade.courseId || (await resolveCourseIdFromSession(grade.sessionId))
  const allowed = await canUserManageCourse(user, courseId)
  if (!allowed) {
    res.status(403).json({ error: 'Forbidden.' })
    return null
  }

  return grade
}

/** GET /api/grades?courseId=...&sessionId=...&userId=... */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const { courseId, sessionId, userId } = req.query as Record<string, string | undefined>
    const grades = getGrades()
    const query: Record<string, unknown> = {}
    if (courseId) query.courseId = courseId
    if (sessionId) query.sessionId = sessionId

    if (isAdmin(user)) {
      if (userId) query.userId = userId
      const result = await grades.find(query).toArray()
      return res.json(result)
    }

    if (isProfessor(user)) {
      let targetCourseId = courseId
      if (!targetCourseId && sessionId) {
        targetCourseId = await resolveCourseIdFromSession(sessionId)
      }

      if (targetCourseId) {
        const allowed = await canUserManageCourse(user, targetCourseId)
        if (!allowed) return res.status(403).json({ error: 'Forbidden.' })
      } else {
        const instructorCourses = await getCourses()
          .find(
            {
              $or: [{ owner: user._id }, { instructors: user._id }],
            } as Parameters<ReturnType<typeof getCourses>['find']>[0],
            { projection: { _id: 1 } }
          )
          .toArray()

        const ids = instructorCourses
          .map((course) => course._id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)

        if (ids.length === 0) return res.json([])
        query.courseId = { $in: ids }
      }

      if (userId) query.userId = userId
      const result = await grades.find(query).toArray()
      return res.json(result)
    }

    // Students can only see their own visible grades.
    query.userId = user._id
    query.visibleToStudents = true
    const result = await grades.find(query).toArray()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

/** GET /api/grades/course/:courseId/export?sessionIds=... */
router.get('/course/:courseId/export', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const courseId = req.params.courseId
    const courses = getCourses()
    const sessions = getSessions()
    const grades = getGrades()

    const course = await courses.findOne(
      { _id: courseId } as Parameters<typeof courses.findOne>[0],
      { projection: { _id: 1 } }
    )
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const access = await courseAccessForUser(user, courseId)
    if (!isAdmin(user) && !access.canAccess) {
      return res.status(403).json({ error: 'Forbidden.' })
    }
    const canManageAll = isAdmin(user) || access.canManage

    const requestedSessionIds = parseSessionIdQuery(req.query.sessionIds)
    const allCourseSessions = await sessions
      .find({ courseId } as Parameters<typeof sessions.find>[0])
      .toArray()
    const orderedSessions = [...allCourseSessions].sort((left, right) => {
      const leftStamp = left.date || left.quizEnd || left.quizStart || left.createdAt
      const rightStamp = right.date || right.quizEnd || right.quizStart || right.createdAt
      return toMillis(rightStamp) - toMillis(leftStamp)
    })
    const allowedSessionIds = new Set(
      orderedSessions
        .map((session) => session._id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
    const selectedSessionIds =
      requestedSessionIds.length > 0
        ? requestedSessionIds.filter((sessionId) => allowedSessionIds.has(sessionId))
        : [...allowedSessionIds]
    const selectedSessionIdSet = new Set(selectedSessionIds)
    const selectedSessions = orderedSessions.filter((session) => session._id && selectedSessionIdSet.has(session._id))

    const gradeQuery: Record<string, unknown> = { courseId }
    if (requestedSessionIds.length > 0 || selectedSessionIds.length > 0) {
      gradeQuery.sessionId = { $in: selectedSessionIds }
    }
    if (!canManageAll) {
      gradeQuery.userId = user._id
      gradeQuery.visibleToStudents = true
    }
    const gradeDocs = await grades.find(gradeQuery).toArray()

    const userIdSet = new Set<string>()
    gradeDocs.forEach((grade) => {
      if (typeof grade.userId === 'string' && grade.userId.length > 0) {
        userIdSet.add(grade.userId)
      }
    })
    const userMap = await loadCsvUserMap([...userIdSet])

    const rowsByUserId = new Map<string, StudentGradeRow>()
    gradeDocs.forEach((grade) => {
      if (!grade.userId || !grade.sessionId || !selectedSessionIdSet.has(grade.sessionId)) return
      const known = userMap.get(grade.userId)
      const current = rowsByUserId.get(grade.userId) || {
        userId: grade.userId,
        firstname: known?.firstname || '',
        lastname: known?.lastname || '',
        email: known?.email || '',
        totalPoints: 0,
        totalOutOf: 0,
        totalAnswered: 0,
        totalQuestions: 0,
        bySessionId: {},
      }

      current.bySessionId[grade.sessionId] = grade
      current.totalPoints += Number(grade.points ?? 0)
      current.totalOutOf += Number(grade.outOf ?? 0)
      current.totalAnswered += Number(grade.numAnswered ?? 0)
      current.totalQuestions += Number(grade.numQuestions ?? 0)
      rowsByUserId.set(grade.userId, current)
    })

    const sortedRows = [...rowsByUserId.values()].sort((left, right) => {
      const byLast = left.lastname.localeCompare(right.lastname)
      if (byLast !== 0) return byLast
      const byFirst = left.firstname.localeCompare(right.firstname)
      if (byFirst !== 0) return byFirst
      return left.userId.localeCompare(right.userId)
    })

    const header: Array<unknown> = ['LastName', 'FirstName', 'Email', 'UserId']
    selectedSessions.forEach((session) => {
      const label = sessionLabel(session)
      header.push(`${label} (%)`)
      header.push(`${label} (Points)`)
      header.push(`${label} (OutOf)`)
    })
    header.push('Total (%)')
    header.push('TotalPoints')
    header.push('TotalOutOf')
    header.push('Answered')
    header.push('Questions')

    const csvRows: Array<Array<unknown>> = [header]
    sortedRows.forEach((row) => {
      const totalPercent = row.totalOutOf > 0 ? Math.round((1000 * row.totalPoints) / row.totalOutOf) / 10 : 0
      const values: Array<unknown> = [row.lastname, row.firstname, row.email, row.userId]
      selectedSessions.forEach((session, index) => {
        const sessionId = session._id || `session-${index}`
        const grade = row.bySessionId[sessionId]
        if (!grade) {
          values.push('', '', '')
          return
        }
        const points = Number(grade.points ?? 0)
        const outOf = Number(grade.outOf ?? 0)
        const pct = outOf > 0 ? Math.round((1000 * points) / outOf) / 10 : 0
        values.push(pct, points.toFixed(1), outOf.toFixed(1))
      })
      values.push(
        totalPercent,
        row.totalPoints.toFixed(1),
        row.totalOutOf.toFixed(1),
        row.totalAnswered,
        row.totalQuestions
      )
      csvRows.push(values)
    })

    sendCsvDownload(res, `course-grades-${courseId}.csv`, csvRows)
  } catch (err) {
    next(err)
  }
})

/** GET /api/grades/session/:sessionId/export */
router.get('/session/:sessionId/export', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const user = req.user as User
    const sessionId = req.params.sessionId
    const sessions = getSessions()
    const courses = getCourses()
    const grades = getGrades()
    const questionsCol = getQuestions()

    const session = await sessions.findOne({ _id: sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })
    if (!(await ensureSessionManageAccess(user, session, res))) return

    const course = await courses.findOne(
      { _id: session.courseId } as Parameters<typeof courses.findOne>[0],
      { projection: { students: 1 } }
    )
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const questionIds = (session.questions || []).filter(
      (questionId): questionId is string => typeof questionId === 'string' && questionId.length > 0
    )
    const unsortedQuestions = await questionsCol
      .find({ _id: { $in: questionIds } } as Parameters<typeof questionsCol.find>[0])
      .toArray()
    const questionById = new Map(
      unsortedQuestions
        .filter((question): question is WithId<Question> => typeof question._id === 'string' && question._id.length > 0)
        .map((question) => [question._id, question])
    )
    const orderedQuestions = questionIds
      .map((questionId) => questionById.get(questionId))
      .filter((question): question is WithId<Question> => Boolean(question))

    const gradeDocs = await grades
      .find({ sessionId } as Parameters<typeof grades.find>[0])
      .toArray()
    const gradeByUserId = new Map<string, WithId<Grade>>()
    gradeDocs.forEach((grade) => {
      if (typeof grade.userId === 'string' && grade.userId.length > 0) {
        gradeByUserId.set(grade.userId, grade)
      }
    })

    const studentIds = (course.students || []).filter(
      (studentId): studentId is string => typeof studentId === 'string' && studentId.length > 0
    )
    const userMap = await loadCsvUserMap(studentIds)

    const sortedStudentIds = [...studentIds].sort((left, right) => {
      const leftUser = userMap.get(left)
      const rightUser = userMap.get(right)
      const byLast = (leftUser?.lastname || '').localeCompare(rightUser?.lastname || '')
      if (byLast !== 0) return byLast
      const byFirst = (leftUser?.firstname || '').localeCompare(rightUser?.firstname || '')
      if (byFirst !== 0) return byFirst
      return left.localeCompare(right)
    })

    const header: Array<unknown> = [
      'LastName',
      'FirstName',
      'Email',
      'UserId',
      'Joined',
      'Participation',
      'Grade (%)',
      'Points',
      'OutOf',
      'Answered',
      'Questions',
      'NeedsGrading',
      'VisibleToStudents',
    ]
    orderedQuestions.forEach((_question, index) => {
      const label = `Q${index + 1}`
      header.push(`${label} Points`)
      header.push(`${label} OutOf`)
      header.push(`${label} NeedsGrading`)
      header.push(`${label} Feedback`)
    })

    const csvRows: Array<Array<unknown>> = [header]
    sortedStudentIds.forEach((studentId) => {
      const user = userMap.get(studentId)
      const grade = gradeByUserId.get(studentId)
      const values: Array<unknown> = [
        user?.lastname || '',
        user?.firstname || '',
        user?.email || '',
        studentId,
        grade?.joined ? 'true' : 'false',
        grade?.participation ?? '',
        grade?.value ?? '',
        Number(grade?.points ?? 0).toFixed(1),
        Number(grade?.outOf ?? 0).toFixed(1),
        grade?.numAnswered ?? '',
        grade?.numQuestions ?? '',
        grade?.needsGrading ? 'true' : 'false',
        grade?.visibleToStudents ? 'true' : 'false',
      ]

      const markByQuestionId = new Map(
        (grade?.marks || [])
          .filter((mark): mark is Mark & { questionId: string } => typeof mark.questionId === 'string' && mark.questionId.length > 0)
          .map((mark) => [mark.questionId, mark])
      )
      orderedQuestions.forEach((question) => {
        const mark = markByQuestionId.get(question._id)
        values.push(mark?.points !== undefined ? Number(mark.points).toFixed(1) : '')
        values.push(mark?.outOf !== undefined ? Number(mark.outOf).toFixed(1) : '')
        values.push(mark?.needsGrading ? 'true' : mark ? 'false' : '')
        values.push(mark?.feedback || '')
      })

      csvRows.push(values)
    })

    sendCsvDownload(res, `session-grades-${sessionId}.csv`, csvRows)
  } catch (err) {
    next(err)
  }
})

/** GET /api/grades/:gradeId */
router.get('/:gradeId', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const grades = getGrades()
    const grade = await grades.findOne({ _id: req.params.gradeId } as Parameters<typeof grades.findOne>[0])
    if (!grade) return res.status(404).json({ error: 'Grade not found.' })

    if (isAdmin(user)) {
      return res.json(grade)
    }

    if (isProfessor(user)) {
      const targetCourseId = grade.courseId || (await resolveCourseIdFromSession(grade.sessionId))
      const allowed = await canUserManageCourse(user, targetCourseId)
      if (!allowed) return res.status(403).json({ error: 'Forbidden.' })
      return res.json(grade)
    }

    if (grade.userId !== user._id || !grade.visibleToStudents) {
      return res.status(403).json({ error: 'Forbidden.' })
    }

    res.json(grade)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/grades/:gradeId — update a grade (instructor only) */
router.put('/:gradeId', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const user = req.user as User
    const grades = getGrades()
    const parsed = gradeSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })
    const existing = await loadManagedGrade(user, req.params.gradeId, res)
    if (!existing) return

    await grades.updateOne(
      { _id: req.params.gradeId } as Parameters<typeof grades.updateOne>[0],
      { $set: parsed.data }
    )
    const updated = await grades.findOne({ _id: req.params.gradeId } as Parameters<typeof grades.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/grades/:gradeId/visible — toggle student visibility */
router.put('/:gradeId/visible', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const user = req.user as User
    const { visible } = req.body as { visible: boolean }
    const grades = getGrades()
    const existing = await loadManagedGrade(user, req.params.gradeId, res)
    if (!existing) return
    await grades.updateOne(
      { _id: req.params.gradeId } as Parameters<typeof grades.updateOne>[0],
      { $set: { visibleToStudents: visible } }
    )
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

/** POST /api/grades/calc-session/:sessionId — (re)calculate grades for a session */
router.post('/calc-session/:sessionId', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const user = req.user as User
    const sessions = getSessions()
    const courses = getCourses()
    const questionsCol = getQuestions()
    const responsesCol = getResponses()
    const grades = getGrades()

    const session = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })
    if (!(await ensureSessionManageAccess(user, session, res))) return
    const course = await courses.findOne({ _id: session.courseId } as Parameters<typeof courses.findOne>[0])
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const questionIds = (session.questions || []).filter((id): id is string => typeof id === 'string' && id.length > 0)
    const unsortedQuestions = await questionsCol
      .find({ _id: { $in: questionIds } } as Parameters<typeof questionsCol.find>[0])
      .toArray()
    const questionById = new Map<string, WithId<Question>>(
      unsortedQuestions
        .filter((q): q is WithId<Question> => typeof q._id === 'string' && q._id.length > 0)
        .map((q) => [q._id, q])
    )
    const questions: WithId<Question>[] = questionIds
      .map((qId) => questionById.get(qId))
      .filter((q): q is WithId<Question> => Boolean(q))

    const responses = await responsesCol
      .find({ questionId: { $in: questionIds } } as Parameters<typeof responsesCol.find>[0])
      .toArray()

    const students = (course.students || []).filter((id): id is string => typeof id === 'string' && id.length > 0)
    const joined = new Set((session.joined || []).filter((id): id is string => typeof id === 'string' && id.length > 0))
    const numQuestionsTotal = questions.length
    const markOutOf = questions.map((q) => questionPoints(q))
    const numQuestions = markOutOf.filter((points) => points > 0).length
    const gradeOutOf = markOutOf.reduce((sum, value) => sum + value, 0)

    let updatedCount = 0
    for (const studentId of students) {
      const existing = await grades.findOne({
        userId: studentId,
        courseId: session.courseId,
        sessionId: session._id,
      } as Parameters<typeof grades.findOne>[0])

      let gradePoints = 0
      let numAnswered = 0
      let numAnsweredTotal = 0
      let needsGrading = false

      const marks: Mark[] = []
      for (let i = 0; i < questions.length; i += 1) {
        const question = questions[i]
        const candidateResponses = responses.filter(
          (resp) => resp.studentUserId === studentId && resp.questionId === question._id
        )
        const latestResponse = candidateResponses.sort(
          (a, b) => Number(b.attempt || 0) - Number(a.attempt || 0)
        )[0] || null

        if (latestResponse) {
          numAnsweredTotal += 1
          if (markOutOf[i] > 0) numAnswered += 1
        }

        const existingMark = existing?.marks?.find((mark) => mark.questionId === question._id)
        const markAutomatic = !(existingMark && existingMark.automatic === false)
        const autoGradeable = isAutoGradeable(question.type)

        let points = 0
        if (markAutomatic && autoGradeable) {
          points = calculateAutomaticPoints(question, latestResponse)
        } else if (existingMark?.points !== undefined) {
          points = existingMark.points
        }

        let markNeedsGrading = false
        if (!autoGradeable && markOutOf[i] > 0 && latestResponse) {
          markNeedsGrading = existingMark?.needsGrading ?? true
          if (markNeedsGrading) needsGrading = true
        }

        gradePoints += points
        marks.push({
          questionId: question._id,
          responseId: latestResponse?._id || '0',
          attempt: latestResponse?.attempt || 0,
          points,
          outOf: markOutOf[i],
          automatic: markAutomatic && autoGradeable,
          needsGrading: markNeedsGrading,
          feedback: existingMark?.feedback || '',
        })
      }

      let participation = 0
      if (numAnswered > 0) {
        participation = numQuestions > 0 ? Math.round((1000 * numAnswered) / numQuestions) / 10 : 100
      }
      if (joined.has(studentId) && numQuestions === 0) participation = 100

      const automaticGrade = existing?.automatic !== false
      let value = existing?.value ?? 0
      if (automaticGrade) {
        if (gradePoints > 0) {
          value = gradeOutOf > 0 ? Math.round((1000 * gradePoints) / gradeOutOf) / 10 : 100
        } else {
          value = 0
        }
      }

      const gradeId = existing?._id || generateStringId('grade')
      const patch: Partial<Grade> = {
        _id: gradeId,
        userId: studentId,
        courseId: session.courseId,
        sessionId: session._id,
        name: session.name,
        marks,
        joined: joined.has(studentId),
        participation,
        value,
        points: gradePoints,
        automatic: automaticGrade,
        outOf: gradeOutOf,
        numAnswered,
        numQuestions,
        numAnsweredTotal,
        numQuestionsTotal,
        visibleToStudents: Boolean(session.reviewable),
        needsGrading,
      }

      await grades.updateOne(
        { _id: gradeId } as Parameters<typeof grades.updateOne>[0],
        { $set: gradePatchWithoutId(patch) },
        { upsert: true }
      )
      updatedCount += 1
    }

    res.json({ success: true, updated: updatedCount })
  } catch (err) {
    next(err)
  }
})

function gradePatchWithoutId(grade: Partial<Grade>): Partial<Grade> {
  const { _id: _omit, ...rest } = grade
  return rest
}

/** PUT /api/grades/session/:sessionId/visible — toggle visibility for all session grades */
router.put('/session/:sessionId/visible', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const user = req.user as User
    const visible = Boolean((req.body as { visible?: boolean }).visible)
    const sessions = getSessions()
    const session = await sessions.findOne(
      { _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0],
      { projection: { courseId: 1 } }
    )
    if (!session) return res.status(404).json({ error: 'Session not found.' })
    if (!(await ensureSessionManageAccess(user, session, res))) return
    const grades = getGrades()
    await grades.updateMany(
      { sessionId: req.params.sessionId } as Parameters<typeof grades.updateMany>[0],
      { $set: { visibleToStudents: visible } }
    )
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
