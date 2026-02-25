import { Router } from 'express'
import { generateStringId } from '../utils/id'
import { getSessions, quizIsActive } from '../collections/sessions'
import { getCourses } from '../collections/courses'
import { getQuestions } from '../collections/questions'
import { getGrades } from '../collections/grades'
import { requireAuth, requireInstructor } from '../auth/middleware'
import type { Question, User } from '@qlicker/shared'
import { sessionSchema } from '@qlicker/shared'
import { getResponses } from '../collections/responses'
import { getUsers } from '../collections/users'
import { canUserAccessCourse, courseAccessForUser, isAdmin } from '../auth/course-access'

const router = Router()
const defaultQuestionSessionOptions = {
  hidden: false,
  stats: false,
  correct: false,
  points: 1,
  maxAttempts: 1,
  attemptWeights: [1],
  attempts: [{ number: 1, closed: false }],
}

function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return undefined
}

function normalizeSessionPayload(body: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...body }
  if ('date' in normalized) normalized.date = parseOptionalDate(normalized.date)
  if ('quizStart' in normalized) normalized.quizStart = parseOptionalDate(normalized.quizStart)
  if ('quizEnd' in normalized) normalized.quizEnd = parseOptionalDate(normalized.quizEnd)
  if (Array.isArray(normalized.quizExtensions)) {
    normalized.quizExtensions = normalized.quizExtensions.map((extension) => {
      const entry = extension as Record<string, unknown>
      return {
        ...entry,
        quizStart: parseOptionalDate(entry.quizStart),
        quizEnd: parseOptionalDate(entry.quizEnd),
      }
    })
  }
  return normalized
}

function adjustQuizWindow(
  quizStart: Date | null | undefined,
  quizEnd: Date | null | undefined
): { quizStart?: Date | null; quizEnd?: Date | null } {
  if (!(quizStart instanceof Date) || !(quizEnd instanceof Date)) {
    return { quizStart, quizEnd }
  }
  if (quizStart.getTime() <= quizEnd.getTime()) {
    return { quizStart, quizEnd }
  }
  return { quizStart, quizEnd: new Date(quizStart.getTime() + 60 * 60 * 1000) }
}

async function resolveQuestionCourseId(question: Pick<Question, 'courseId' | 'sessionId'>): Promise<string | undefined> {
  if (question.courseId) return question.courseId
  if (!question.sessionId) return undefined
  const session = await getSessions().findOne(
    { _id: question.sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0],
    { projection: { courseId: 1 } }
  )
  return session?.courseId
}

/** GET /api/sessions?courseId=... */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const { courseId } = req.query as { courseId?: string }
    const sessions = getSessions()

    if (courseId) {
      const allowed = await canUserAccessCourse(user, courseId)
      if (!allowed) return res.status(403).json({ error: 'Forbidden.' })
      const result = await sessions.find({ courseId } as Parameters<typeof sessions.find>[0]).toArray()
      return res.json(result)
    }

    if (isAdmin(user)) {
      const result = await sessions.find({}).toArray()
      return res.json(result)
    }

    const courseIds = await getCourses()
      .find(
        {
          $or: [{ owner: user._id }, { instructors: user._id }, { students: user._id }],
        } as Parameters<ReturnType<typeof getCourses>['find']>[0],
        { projection: { _id: 1 } }
      )
      .toArray()

    const allowedIds = courseIds
      .map((course) => course._id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    if (allowedIds.length === 0) return res.json([])

    const result = await sessions
      .find({ courseId: { $in: allowedIds } } as Parameters<typeof sessions.find>[0])
      .toArray()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

/** GET /api/sessions/:sessionId */
router.get('/:sessionId', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const sessions = getSessions()
    const session = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })

    const allowed = await canUserAccessCourse(user, session.courseId)
    if (!allowed) return res.status(403).json({ error: 'Forbidden.' })

    res.json(session)
  } catch (err) {
    next(err)
  }
})

/** POST /api/sessions — create session */
router.post('/', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const normalized = normalizeSessionPayload(req.body as Record<string, unknown>)
    if (typeof normalized.status !== 'string' || normalized.status.trim().length < 1) {
      normalized.status = 'hidden'
    }
    const parsed = sessionSchema.omit({ _id: true, createdAt: true }).safeParse(normalized)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    const sessions = getSessions()
    const doc = {
      _id: generateStringId('session'), ...parsed.data, createdAt: new Date() }
    await sessions.insertOne(doc as Parameters<typeof sessions.insertOne>[0])
    const created = await sessions.findOne({ _id: doc._id } as Parameters<typeof sessions.findOne>[0])

    // Add session to course
    if (parsed.data.courseId) {
      const courses = getCourses()
      await courses.updateOne(
        { _id: parsed.data.courseId } as Parameters<typeof courses.updateOne>[0],
        { $addToSet: { sessions: doc._id } }
      )
    }

    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/sessions/:sessionId — update session */
router.put('/:sessionId', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const sessions = getSessions()
    const existing = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!existing) return res.status(404).json({ error: 'Session not found.' })
    const parsed = sessionSchema.partial().safeParse(normalizeSessionPayload(req.body))
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    const patch: Record<string, unknown> = { ...parsed.data }
    const quiz = 'quiz' in patch ? Boolean(patch.quiz) : Boolean(existing.quiz)
    if (!quiz) {
      patch.quizExtensions = []
    }
    const mergedQuizStart =
      patch.quizStart instanceof Date || patch.quizStart === null
        ? (patch.quizStart as Date | null)
        : (existing.quizStart ?? null)
    const mergedQuizEnd =
      patch.quizEnd instanceof Date || patch.quizEnd === null
        ? (patch.quizEnd as Date | null)
        : (existing.quizEnd ?? null)
    const adjusted = adjustQuizWindow(mergedQuizStart, mergedQuizEnd)
    if (adjusted.quizStart !== undefined) patch.quizStart = adjusted.quizStart
    if (adjusted.quizEnd !== undefined) patch.quizEnd = adjusted.quizEnd

    if (Array.isArray(patch.quizExtensions)) {
      patch.quizExtensions = patch.quizExtensions.map((raw) => {
        const entry = raw as { userId: string; quizStart?: Date | null; quizEnd?: Date | null }
        const fixed = adjustQuizWindow(entry.quizStart, entry.quizEnd)
        return {
          userId: entry.userId,
          quizStart: fixed.quizStart ?? null,
          quizEnd: fixed.quizEnd ?? null,
        }
      })
    }

    await sessions.updateOne(
      { _id: req.params.sessionId } as Parameters<typeof sessions.updateOne>[0],
      { $set: patch }
    )
    const updated = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/sessions/:sessionId */
router.delete('/:sessionId', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const sessions = getSessions()
    const questions = getQuestions()
    const responses = getResponses()
    const grades = getGrades()
    const courses = getCourses()

    const existing = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!existing) return res.status(404).json({ error: 'Session not found.' })

    const questionIds = (existing.questions || []).filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (questionIds.length > 0) {
      await responses.deleteMany({ questionId: { $in: questionIds } } as Parameters<typeof responses.deleteMany>[0])
    }
    await questions.deleteMany({ sessionId: existing._id } as Parameters<typeof questions.deleteMany>[0])
    await grades.deleteMany({ sessionId: existing._id } as Parameters<typeof grades.deleteMany>[0])
    await courses.updateOne(
      { _id: existing.courseId } as Parameters<typeof courses.updateOne>[0],
      { $pull: { sessions: existing._id } }
    )
    await sessions.deleteOne({ _id: req.params.sessionId } as Parameters<typeof sessions.deleteOne>[0])
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

/** POST /api/sessions/:sessionId/copy — duplicate a session (optionally into another managed course) */
router.post('/:sessionId/copy', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const user = req.user as User
    const sessions = getSessions()
    const questions = getQuestions()
    const courses = getCourses()

    const source = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!source) return res.status(404).json({ error: 'Session not found.' })

    const requestedCourseId = typeof req.body?.courseId === 'string' ? req.body.courseId.trim() : ''
    const targetCourseId = requestedCourseId || source.courseId

    if (targetCourseId !== source.courseId) {
      const targetAccess = await courseAccessForUser(user, targetCourseId)
      if (!targetAccess.exists) return res.status(404).json({ error: 'Course not found.' })
      if (!targetAccess.canManage) return res.status(403).json({ error: 'Forbidden.' })
    }

    const targetCourse = await courses.findOne({ _id: targetCourseId } as Parameters<typeof courses.findOne>[0])
    if (!targetCourse) return res.status(404).json({ error: 'Course not found.' })

    const sourceQuestionIds = (source.questions || []).filter(
      (questionId): questionId is string => typeof questionId === 'string' && questionId.length > 0
    )
    const questionDocs = sourceQuestionIds.length > 0
      ? await questions
          .find({ _id: { $in: sourceQuestionIds } } as Parameters<typeof questions.find>[0])
          .toArray()
      : []
    const questionById = new Map(
      questionDocs
        .filter((question): question is typeof question & { _id: string } => typeof question._id === 'string')
        .map((question) => [question._id, question])
    )
    const orderedQuestions = sourceQuestionIds
      .map((questionId) => questionById.get(questionId))
      .filter((question): question is NonNullable<typeof question> => Boolean(question))

    const copiedSessionId = generateStringId('session')
    const copiedQuestions = orderedQuestions.map((question) => {
      const { _id: _omitId, createdAt: _omitCreatedAt, ...rest } = question
      const normalizedSessionOptions = {
        ...defaultQuestionSessionOptions,
        ...(question.sessionOptions || {}),
        hidden: false,
        stats: false,
        correct: false,
        attempts: [{ number: 1, closed: false }],
      }
      return {
        ...rest,
        _id: generateStringId('question'),
        courseId: targetCourseId,
        sessionId: copiedSessionId,
        sessionOptions: normalizedSessionOptions,
        createdAt: new Date(),
      }
    })
    if (copiedQuestions.length > 0) {
      await questions.insertMany(copiedQuestions as Parameters<typeof questions.insertMany>[0])
    }

    const copiedQuestionIds = copiedQuestions.map((question) => question._id)
    const copiedSession = {
      ...source,
      _id: copiedSessionId,
      courseId: targetCourseId,
      name: source.name ? `${source.name} (Copy)` : 'Session Copy',
      status: 'hidden',
      date: null,
      joined: [],
      submittedQuiz: [],
      currentQuestion: copiedQuestionIds[0],
      questions: copiedQuestionIds,
      createdAt: new Date(),
    }

    await sessions.insertOne(copiedSession as Parameters<typeof sessions.insertOne>[0])
    await courses.updateOne(
      { _id: targetCourseId } as Parameters<typeof courses.updateOne>[0],
      { $addToSet: { sessions: copiedSessionId } }
    )

    const created = await sessions.findOne({ _id: copiedSessionId } as Parameters<typeof sessions.findOne>[0])
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/sessions/:sessionId/status — change session status */
router.put('/:sessionId/status', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const { status } = req.body as { status: string }
    const validStatuses = ['hidden', 'visible', 'running', 'done']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' })
    }
    const sessions = getSessions()
    const existing = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!existing) return res.status(404).json({ error: 'Session not found.' })
    if (status === 'running' && (!Array.isArray(existing.questions) || existing.questions.length === 0)) {
      return res.status(400).json({ error: 'Cannot run a session with no questions.' })
    }

    const patch: Record<string, unknown> = { status }
    if (status === 'running') {
      if (!existing.currentQuestion && existing.questions?.[0]) {
        patch.currentQuestion = existing.questions[0]
      }
    }
    if (status === 'done' && !existing.date) {
      patch.date = new Date()
    }

    await sessions.updateOne(
      { _id: req.params.sessionId } as Parameters<typeof sessions.updateOne>[0],
      { $set: patch }
    )
    const updated = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** POST /api/sessions/:sessionId/submit — student submits quiz */
router.post('/:sessionId/submit', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const sessions = getSessions()
    const session = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })

    const access = await courseAccessForUser(user, session.courseId)
    if (!access.canAccess) return res.status(403).json({ error: 'Forbidden.' })
    if (!access.isStudent && !isAdmin(user)) {
      return res.status(403).json({ error: 'Only enrolled students can submit quizzes.' })
    }

    if (!session.quiz) return res.status(400).json({ error: 'Not a quiz session.' })
    if (!quizIsActive(session, user._id)) return res.status(400).json({ error: 'Quiz is closed.' })
    if (!(session.joined || []).includes(user._id ?? '')) {
      return res.status(400).json({ error: 'User did not start quiz.' })
    }
    if ((session.submittedQuiz || []).includes(user._id ?? '')) {
      return res.status(400).json({ error: 'Quiz already submitted.' })
    }

    const questionIds = (session.questions || []).filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (questionIds.length === 0) return res.status(400).json({ error: 'Quiz has no questions.' })
    const responses = getResponses()
    const responseDocs = await responses
      .find({
        questionId: { $in: questionIds },
        studentUserId: user._id,
        attempt: 1,
      } as Parameters<typeof responses.find>[0])
      .toArray()
    if (responseDocs.length !== questionIds.length) {
      return res.status(400).json({ error: 'Must answer all questions to submit quiz.' })
    }

    await responses.updateMany(
      {
        questionId: { $in: questionIds },
        studentUserId: user._id,
        attempt: 1,
      } as Parameters<typeof responses.updateMany>[0],
      { $set: { editable: false } }
    )

    await sessions.updateOne(
      { _id: req.params.sessionId } as Parameters<typeof sessions.updateOne>[0],
      { $addToSet: { submittedQuiz: user._id } }
    )
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

/** POST /api/sessions/:sessionId/join — track student joining a session */
router.post('/:sessionId/join', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const sessions = getSessions()
    const session = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })

    const access = await courseAccessForUser(user, session.courseId)
    if (!access.canAccess) return res.status(403).json({ error: 'Forbidden.' })
    if (!access.isStudent && !isAdmin(user)) {
      return res.status(403).json({ error: 'Only enrolled students can join sessions.' })
    }

    await sessions.updateOne(
      { _id: req.params.sessionId } as Parameters<typeof sessions.updateOne>[0],
      { $addToSet: { joined: user._id } }
    )
    const updated = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/sessions/:sessionId/current — set the current question for a running session */
router.put('/:sessionId/current', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const { questionId } = req.body as { questionId?: string }
    if (!questionId) return res.status(400).json({ error: 'questionId required.' })

    const sessions = getSessions()
    const session = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })
    if (!(session.questions || []).includes(questionId)) {
      return res.status(400).json({ error: 'Question is not part of this session.' })
    }

    await sessions.updateOne(
      { _id: req.params.sessionId } as Parameters<typeof sessions.updateOne>[0],
      { $set: { currentQuestion: questionId } }
    )
    const updated = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** POST /api/sessions/:sessionId/questions/:questionId/copy — copy question into session */
router.post('/:sessionId/questions/:questionId/copy', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const user = req.user as User
    const sessions = getSessions()
    const questions = getQuestions()

    const session = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })

    const source = await questions.findOne({ _id: req.params.questionId } as Parameters<typeof questions.findOne>[0])
    if (!source) return res.status(404).json({ error: 'Question not found.' })

    const sourceCourseId = await resolveQuestionCourseId(source)
    if (!sourceCourseId) return res.status(400).json({ error: 'Question is missing courseId.' })
    if (sourceCourseId !== session.courseId) {
      return res.status(400).json({ error: 'Question must belong to the same course as the session.' })
    }

    const userId = user._id || ''
    const copiedId = generateStringId('question')
    const copiedQuestion = {
      ...source,
      _id: copiedId,
      originalQuestion: source._id,
      sessionId: session._id,
      courseId: session.courseId,
      owner: userId,
      creator: userId,
      approved: true,
      public: false,
      studentCopyOfPublic: undefined,
      sessionOptions: defaultQuestionSessionOptions,
      createdAt: new Date(),
    }

    await questions.insertOne(copiedQuestion as Parameters<typeof questions.insertOne>[0])
    await sessions.updateOne(
      { _id: req.params.sessionId } as Parameters<typeof sessions.updateOne>[0],
      { $addToSet: { questions: copiedId } }
    )

    const created = await questions.findOne({ _id: copiedId } as Parameters<typeof questions.findOne>[0])
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/sessions/:sessionId/questions/:questionId — remove question from session */
router.delete('/:sessionId/questions/:questionId', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const sessions = getSessions()
    const questions = getQuestions()

    const session = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })
    if (!(session.questions || []).includes(req.params.questionId)) {
      return res.status(404).json({ error: 'Question is not attached to this session.' })
    }

    await questions.deleteOne({ _id: req.params.questionId } as Parameters<typeof questions.deleteOne>[0])

    const patch: Record<string, unknown> = { questions: (session.questions || []).filter((id) => id !== req.params.questionId) }
    if (session.currentQuestion === req.params.questionId) {
      patch.currentQuestion = null
    }

    await sessions.updateOne(
      { _id: req.params.sessionId } as Parameters<typeof sessions.updateOne>[0],
      { $set: patch }
    )

    const updated = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/sessions/:sessionId/questions — reorder attached questions */
router.put('/:sessionId/questions', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    if (!Array.isArray((req.body as { questionIds?: unknown[] }).questionIds)) {
      return res.status(400).json({ error: 'questionIds required.' })
    }
    const questionIds = (req.body as { questionIds: unknown[] }).questionIds
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    const sessions = getSessions()
    const session = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })

    const existingIds = new Set((session.questions || []).filter((id): id is string => typeof id === 'string'))
    const incomingIds = new Set(questionIds)
    if (existingIds.size !== incomingIds.size || questionIds.some((id) => !existingIds.has(id))) {
      return res.status(400).json({ error: 'questionIds must exactly match attached session questions.' })
    }

    const patch: Record<string, unknown> = { questions: questionIds }
    if (session.currentQuestion && !incomingIds.has(session.currentQuestion)) {
      patch.currentQuestion = questionIds[0]
    }

    await sessions.updateOne(
      { _id: req.params.sessionId } as Parameters<typeof sessions.updateOne>[0],
      { $set: patch }
    )
    const updated = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** GET /api/sessions/:sessionId/extension-candidates — session students for extension modal */
router.get('/:sessionId/extension-candidates', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const sessions = getSessions()
    const session = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })

    const courses = getCourses()
    const course = await courses.findOne({ _id: session.courseId } as Parameters<typeof courses.findOne>[0])
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const studentIds = (course.students || []).filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (studentIds.length === 0) return res.json([])

    const users = getUsers()
    const docs = await users
      .find(
        { _id: { $in: studentIds } } as Parameters<typeof users.find>[0],
        { projection: { _id: 1, profile: 1, emails: 1 } }
      )
      .toArray()
    const userById = new Map(docs.map((doc) => [doc._id, doc]))
    const payload = studentIds.map((id) => {
      const u = userById.get(id)
      const first = u?.profile?.firstname || ''
      const last = u?.profile?.lastname || ''
      const email = u?.emails?.[0]?.address || ''
      return {
        userId: id,
        name: `${first} ${last}`.trim() || id,
        email,
      }
    })
    res.json(payload)
  } catch (err) {
    next(err)
  }
})

export default router
