import { Router } from 'express'
import { generateStringId } from '../utils/id'
import { getResponses } from '../collections/responses'
import { getQuestions } from '../collections/questions'
import { getSessions } from '../collections/sessions'
import { getCourses } from '../collections/courses'
import { requireAuth } from '../auth/middleware'
import { responseLimiter } from '../middleware/rate-limit'
import type { User } from '@qlicker/shared'
import { responseSchema } from '@qlicker/shared'
import { gradeResponse } from '../utils/grading'

const router = Router()

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

    const isAdmin = user.profile.roles.includes('admin')
    let isInstructor = false

    if (question.sessionId) {
      const sessions = getSessions()
      const session = await sessions.findOne({ _id: question.sessionId } as Parameters<typeof sessions.findOne>[0])
      if (session) {
        const courses = getCourses()
        const course = await courses.findOne({ _id: session.courseId } as Parameters<typeof courses.findOne>[0])
        if (course) {
          isInstructor = course.instructors?.includes(user._id ?? '') ?? false
        }
      }
    }

    if (isAdmin || isInstructor) {
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

    let sessionId = question.sessionId
    let courseId = question.courseId
    if (sessionId && !courseId) {
      const session = await getSessions().findOne({ _id: sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0])
      courseId = session?.courseId
    }

    // Upsert: one response per (questionId, studentUserId, attempt)
    const filter = {
      questionId: parsed.data.questionId,
      studentUserId: parsed.data.studentUserId,
      attempt: parsed.data.attempt,
    }
    const existing = await responses.findOne(filter as Parameters<typeof responses.findOne>[0])
    if (existing) {
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

    const baseDoc = { _id: generateStringId('response'), ...parsed.data, createdAt: new Date() }
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
    if (existing.studentUserId !== user._id && !user.profile.roles.includes('admin')) {
      return res.status(403).json({ error: 'Forbidden.' })
    }
    const parsed = responseSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    const merged = { ...existing, ...parsed.data }
    const questionId = (merged.questionId || existing.questionId) as string
    const studentUserId = (merged.studentUserId || existing.studentUserId) as string
    const attempt = Number(merged.attempt ?? existing.attempt ?? 1)
    const question = await getQuestions().findOne({ _id: questionId } as Parameters<ReturnType<typeof getQuestions>['findOne']>[0])
    let sessionId = question?.sessionId
    let courseId = question?.courseId
    if (sessionId && !courseId) {
      const session = await getSessions().findOne({ _id: sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0])
      courseId = session?.courseId
    }
    const { responseUpdate } = question
      ? await gradeResponse({
          responseDoc: merged as typeof existing,
          questionId,
          studentUserId,
          attempt,
          sessionId,
          courseId,
        })
      : { responseUpdate: {} }
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
