import { Router, type Response as ExpressResponse } from 'express'
import { getGrades } from '../collections/grades'
import { requireAuth, requireInstructor } from '../auth/middleware'
import type { User } from '@qlicker/shared'
import { gradeSchema } from '@qlicker/shared'
import { getSessions } from '../collections/sessions'
import { getCourses } from '../collections/courses'
import { getQuestions } from '../collections/questions'
import { getUsers } from '../collections/users'
import type { Grade, Mark, Question, Session } from '@qlicker/shared'
import type { WithId } from 'mongodb'
import { sendCsvDownload } from '../utils/csv'
import {
  recalculateSessionGrades,
  SessionGradesError,
  setSessionGradesVisibility,
} from '../services/session-grades'
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

    const session = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })
    if (!(await ensureSessionManageAccess(user, session, res))) return

    const updatedCount = await recalculateSessionGrades(req.params.sessionId)
    res.json({ success: true, updated: updatedCount })
  } catch (err) {
    if (err instanceof SessionGradesError) {
      return res.status(err.status).json({ error: err.message })
    }
    next(err)
  }
})

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
    await setSessionGradesVisibility(req.params.sessionId, visible)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
