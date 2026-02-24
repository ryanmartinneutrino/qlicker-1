import { Router } from 'express'
import { generateStringId } from '../utils/id'
import { getResponses } from '../collections/responses'
import { getQuestions } from '../collections/questions'
import { getSessions } from '../collections/sessions'
import { quizIsActive } from '../collections/sessions'
import { requireAuth } from '../auth/middleware'
import { responseLimiter } from '../middleware/rate-limit'
import type { Question, User } from '@qlicker/shared'
import { responseSchema } from '@qlicker/shared'
import { gradeResponse } from '../utils/grading'
import { courseAccessForUser, isAdmin } from '../auth/course-access'

const router = Router()

function getCurrentAttemptState(question: { sessionOptions?: { attempts?: Array<{ number: number; closed: boolean }> } }) {
  const attempts = question.sessionOptions?.attempts || []
  if (attempts.length < 1) return { number: 1, closed: false }
  const latest = attempts[attempts.length - 1]
  return { number: latest.number, closed: latest.closed }
}

async function resolveQuestionContext(question: Pick<Question, 'sessionId' | 'courseId'>): Promise<{
  sessionId?: string
  courseId?: string
}> {
  const sessionId = question.sessionId
  if (question.courseId) {
    return { sessionId, courseId: question.courseId }
  }

  if (!sessionId) {
    return { sessionId, courseId: undefined }
  }

  const session = await getSessions().findOne(
    { _id: sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0],
    { projection: { courseId: 1 } }
  )

  return {
    sessionId,
    courseId: session?.courseId,
  }
}

/** GET /api/responses?questionId=... — get responses for a question */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const { questionId } = req.query as { questionId?: string }
    if (!questionId) return res.status(400).json({ error: 'questionId required.' })

    const responses = getResponses()
    const questions = getQuestions()
    const question = await questions.findOne({ _id: questionId } as Parameters<typeof questions.findOne>[0])
    if (!question) return res.status(404).json({ error: 'Question not found.' })

    const context = await resolveQuestionContext(question)
    if (!context.courseId && !isAdmin(user)) {
      return res.status(403).json({ error: 'Forbidden.' })
    }

    const access = await courseAccessForUser(user, context.courseId)
    if (!access.canAccess && !isAdmin(user)) {
      return res.status(403).json({ error: 'Forbidden.' })
    }

    if (isAdmin(user) || access.isInstructor) {
      const result = await responses.find({ questionId }).toArray()
      return res.json(result)
    }

    // Students: show own response, and if stats is enabled, show others without studentUserId
    const statsEnabled = question.sessionOptions?.stats ?? false
    if (statsEnabled) {
      const all = await responses.find({ questionId }).toArray()
      const sanitized = all.map((r) => {
        if (r.studentUserId === user._id) return r
        const { studentUserId: _omit, ...rest } = r
        return rest
      })
      return res.json(sanitized)
    }

    const own = await responses.find({ questionId, studentUserId: user._id }).toArray()
    res.json(own)
  } catch (err) {
    next(err)
  }
})

/** GET /api/responses/session/:sessionId/me — get a student's responses for all session questions */
router.get('/session/:sessionId/me', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const sessions = getSessions()
    const session = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })

    const access = await courseAccessForUser(user, session.courseId)
    if (!access.canAccess && !isAdmin(user)) {
      return res.status(403).json({ error: 'Forbidden.' })
    }

    const requestedUserId = typeof req.query?.userId === 'string' ? req.query.userId : ''
    if (requestedUserId && requestedUserId !== user._id && !(access.isInstructor || isAdmin(user))) {
      return res.status(403).json({ error: 'Forbidden.' })
    }
    const targetUserId = requestedUserId || user._id || ''
    if (!targetUserId) return res.json([])

    const questionIds = (session.questions || []).filter((questionId): questionId is string => typeof questionId === 'string' && questionId.length > 0)
    if (questionIds.length < 1) return res.json([])

    const responses = getResponses()
    const docs = await responses
      .find({
        questionId: { $in: questionIds },
        studentUserId: targetUserId,
      } as Parameters<typeof responses.find>[0])
      .toArray()
    res.json(docs)
  } catch (err) {
    next(err)
  }
})

/** POST /api/responses — submit a response */
router.post('/', requireAuth, responseLimiter, async (req, res, next) => {
  try {
    const user = req.user as User
    const parsed = responseSchema.omit({ _id: true, createdAt: true }).safeParse({
      ...req.body,
      studentUserId: user._id,
    })
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    const responses = getResponses()
    const question = await getQuestions().findOne({
      _id: parsed.data.questionId,
    } as Parameters<ReturnType<typeof getQuestions>['findOne']>[0])
    if (!question) return res.status(404).json({ error: 'Question not found.' })
    if (!question.sessionId) return res.status(400).json({ error: 'Question is not attached to a session.' })

    const sessions = getSessions()
    const session = await sessions.findOne({ _id: question.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })

    const context = await resolveQuestionContext(question)
    const access = await courseAccessForUser(user, context.courseId)
    if (!access.canAccess && !isAdmin(user)) {
      return res.status(403).json({ error: 'Forbidden.' })
    }
    if (!access.isStudent && !isAdmin(user)) {
      return res.status(403).json({ error: 'Only enrolled students can submit responses.' })
    }

    if (session.quiz) {
      if (!quizIsActive(session, user._id)) {
        return res.status(400).json({ error: 'Quiz is closed.' })
      }
      if ((session.submittedQuiz || []).includes(user._id ?? '')) {
        return res.status(400).json({ error: 'Quiz already submitted.' })
      }
      const maxAttempts = Number(question.sessionOptions?.maxAttempts ?? 1)
      if (parsed.data.attempt < 1 || parsed.data.attempt > maxAttempts) {
        return res.status(400).json({ error: 'Attempt is out of bounds for this quiz question.' })
      }
    } else {
      if (session.status !== 'running') {
        return res.status(400).json({ error: 'Session is closed.' })
      }
      const currentAttempt = getCurrentAttemptState(question)
      if (parsed.data.attempt !== currentAttempt.number) {
        return res.status(400).json({ error: 'Attempt does not match current open attempt.' })
      }
      if (currentAttempt.closed) {
        return res.status(400).json({ error: 'Current attempt is closed.' })
      }
    }

    const sessionId = context.sessionId
    const courseId = context.courseId

    // Upsert: one response per (questionId, studentUserId, attempt)
    const filter = {
      questionId: parsed.data.questionId,
      studentUserId: parsed.data.studentUserId,
      attempt: parsed.data.attempt,
    }
    const existing = await responses.findOne(filter as Parameters<typeof responses.findOne>[0])
    if (existing) {
      if (!session.quiz) {
        return res.status(400).json({ error: 'Response already submitted for this attempt.' })
      }
      if (existing.editable === false) {
        return res.status(400).json({ error: 'Response is no longer editable.' })
      }
      if (parsed.data.attempt !== 1 || existing.attempt !== 1) {
        return res.status(400).json({ error: 'Only first-attempt quiz responses are editable.' })
      }
      const responseDoc = { ...existing, ...parsed.data }
      const { responseUpdate } = await gradeResponse({
        responseDoc,
        questionId: parsed.data.questionId,
        studentUserId: parsed.data.studentUserId,
        attempt: parsed.data.attempt,
        sessionId,
        courseId,
      })
      const setPayload: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() }
      if (responseUpdate.correct !== undefined) {
        setPayload.correct = responseUpdate.correct
      }
      await responses.updateOne(
        filter as Parameters<typeof responses.updateOne>[0],
        { $set: setPayload }
      )
      const updated = await responses.findOne(filter as Parameters<typeof responses.findOne>[0])
      return res.json(updated)
    }

    const baseDoc = {
      _id: generateStringId('response'),
      ...parsed.data,
      createdAt: new Date(),
      editable: session.quiz ? true : undefined,
    }
    const { responseUpdate } = await gradeResponse({
      responseDoc: baseDoc,
      questionId: parsed.data.questionId,
      studentUserId: parsed.data.studentUserId,
      attempt: parsed.data.attempt,
      sessionId,
      courseId,
    })
    const doc = responseUpdate.correct === undefined ? baseDoc : { ...baseDoc, correct: responseUpdate.correct }
    await responses.insertOne(doc as Parameters<typeof responses.insertOne>[0])
    const created = await responses.findOne({ _id: doc._id } as Parameters<typeof responses.findOne>[0])
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/responses/:responseId — update a response */
router.put('/:responseId', requireAuth, responseLimiter, async (req, res, next) => {
  try {
    const user = req.user as User
    const responses = getResponses()
    const existing = await responses.findOne({ _id: req.params.responseId } as Parameters<typeof responses.findOne>[0])
    if (!existing) return res.status(404).json({ error: 'Response not found.' })

    const parsed = responseSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    const questionId = (parsed.data.questionId || existing.questionId) as string
    const question = await getQuestions().findOne(
      { _id: questionId } as Parameters<ReturnType<typeof getQuestions>['findOne']>[0]
    )
    if (!question) return res.status(404).json({ error: 'Question not found.' })

    const context = await resolveQuestionContext(question)
    const access = await courseAccessForUser(user, context.courseId)
    if (!access.canAccess && !isAdmin(user)) {
      return res.status(403).json({ error: 'Forbidden.' })
    }

    const canOverride = isAdmin(user) || access.isInstructor
    if (existing.studentUserId !== user._id && !canOverride) {
      return res.status(403).json({ error: 'Forbidden.' })
    }

    if (!canOverride) {
      if (parsed.data.studentUserId && parsed.data.studentUserId !== existing.studentUserId) {
        return res.status(403).json({ error: 'Cannot change response owner.' })
      }
      if (parsed.data.questionId && parsed.data.questionId !== existing.questionId) {
        return res.status(400).json({ error: 'Cannot move response to another question.' })
      }
    }

    const merged = { ...existing, ...parsed.data }
    const studentUserId = (merged.studentUserId || existing.studentUserId) as string
    const attempt = Number(merged.attempt ?? existing.attempt ?? 1)

    if (question.sessionId && !canOverride) {
      const session = await getSessions().findOne(
        { _id: question.sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0]
      )
      if (!session) return res.status(404).json({ error: 'Session not found.' })
      if (!session.quiz) {
        return res.status(400).json({ error: 'Can only update quiz responses.' })
      }
      if (!quizIsActive(session, user._id)) {
        return res.status(400).json({ error: 'Quiz is closed.' })
      }
      if (existing.editable === false) {
        return res.status(400).json({ error: 'Response is no longer editable.' })
      }
      if (attempt !== 1) {
        return res.status(400).json({ error: 'Only first-attempt quiz responses are editable.' })
      }
    }

    const { responseUpdate } = await gradeResponse({
      responseDoc: merged as typeof existing,
      questionId,
      studentUserId,
      attempt,
      sessionId: context.sessionId,
      courseId: context.courseId,
    })

    const setPayload: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() }
    if (responseUpdate.correct !== undefined) {
      setPayload.correct = responseUpdate.correct
    }

    await responses.updateOne(
      { _id: req.params.responseId } as Parameters<typeof responses.updateOne>[0],
      { $set: setPayload }
    )
    const updated = await responses.findOne({ _id: req.params.responseId } as Parameters<typeof responses.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

export default router
