import { Router } from 'express'
import { generateStringId } from '../utils/id'
import { getSessions } from '../collections/sessions'
import { getCourses } from '../collections/courses'
import { requireAuth, requireInstructor } from '../auth/middleware'
import type { User } from '@qlicker/shared'
import { sessionSchema } from '@qlicker/shared'

const router = Router()

/** GET /api/sessions?courseId=... */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { courseId } = req.query as { courseId?: string }
    const user = req.user as User
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
    const user = req.user as User
    const parsed = sessionSchema.omit({ _id: true, createdAt: true }).safeParse(req.body)
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
    const parsed = sessionSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    await sessions.updateOne(
      { _id: req.params.sessionId } as Parameters<typeof sessions.updateOne>[0],
      { $set: parsed.data }
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
    await sessions.updateOne(
      { _id: req.params.sessionId } as Parameters<typeof sessions.updateOne>[0],
      { $set: { status } }
    )
    res.json({ success: true, status })
  } catch (err) {
    next(err)
  }
})

/** POST /api/sessions/:sessionId/submit — student submits quiz */
router.post('/:sessionId/submit', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const sessions = getSessions()
    await sessions.updateOne(
      { _id: req.params.sessionId } as Parameters<typeof sessions.updateOne>[0],
      { $addToSet: { submittedQuiz: user._id } }
    )
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
