import { Router } from 'express'
import { generateStringId } from '../utils/id'
import { getSessions, quizIsActive } from '../collections/sessions'
import { getCourses } from '../collections/courses'
import { requireAuth, requireInstructor } from '../auth/middleware'
import type { User } from '@qlicker/shared'
import { sessionSchema } from '@qlicker/shared'
import { getResponses } from '../collections/responses'
import { getUsers } from '../collections/users'

const router = Router()

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

/** GET /api/sessions?courseId=... */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { courseId } = req.query as { courseId?: string }
    const sessions = getSessions()
    const query: Record<string, unknown> = {}
    if (courseId) query.courseId = courseId
    const result = await sessions.find(query).toArray()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

/** GET /api/sessions/:sessionId */
router.get('/:sessionId', requireAuth, async (req, res, next) => {
  try {
    const sessions = getSessions()
    const session = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })
    res.json(session)
  } catch (err) {
    next(err)
  }
})

/** POST /api/sessions — create session */
router.post('/', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const parsed = sessionSchema.omit({ _id: true, createdAt: true }).safeParse(normalizeSessionPayload(req.body))
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
    await sessions.deleteOne({ _id: req.params.sessionId } as Parameters<typeof sessions.deleteOne>[0])
    res.json({ success: true })
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
