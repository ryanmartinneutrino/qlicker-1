import { Router } from 'express'
import { getQuestions } from '../collections/questions'
import { requireAuth, requireInstructor } from '../auth/middleware'
import type { User } from '@qlicker/shared'
import { questionSchema } from '@qlicker/shared'

const router = Router()

/** GET /api/questions?sessionId=...&courseId=... */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, courseId, owner } = req.query as Record<string, string | undefined>
    const questions = getQuestions()
    const query: Record<string, unknown> = {}
    if (sessionId) query.sessionId = sessionId
    if (courseId) query.courseId = courseId
    if (owner) query.owner = owner
    const result = await questions.find(query).toArray()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

/** GET /api/questions/:questionId */
router.get('/:questionId', requireAuth, async (req, res, next) => {
  try {
    const questions = getQuestions()
    const q = await questions.findOne({ _id: req.params.questionId } as Parameters<typeof questions.findOne>[0])
    if (!q) return res.status(404).json({ error: 'Question not found.' })
    res.json(q)
  } catch (err) {
    next(err)
  }
})

/** POST /api/questions — create question */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const parsed = questionSchema.omit({ _id: true, createdAt: true, creator: true }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    const questions = getQuestions()
    const doc = {
      ...parsed.data,
      creator: user._id ?? '',
      createdAt: new Date(),
    }
    const result = await questions.insertOne(doc as Parameters<typeof questions.insertOne>[0])
    const created = await questions.findOne({ _id: result.insertedId } as Parameters<typeof questions.findOne>[0])
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/questions/:questionId — update question */
router.put('/:questionId', requireAuth, async (req, res, next) => {
  try {
    const questions = getQuestions()
    const parsed = questionSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    await questions.updateOne(
      { _id: req.params.questionId } as Parameters<typeof questions.updateOne>[0],
      { $set: parsed.data }
    )
    const updated = await questions.findOne({ _id: req.params.questionId } as Parameters<typeof questions.findOne>[0])
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/questions/:questionId */
router.delete('/:questionId', requireAuth, async (req, res, next) => {
  try {
    const questions = getQuestions()
    await questions.deleteOne({ _id: req.params.questionId } as Parameters<typeof questions.deleteOne>[0])
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
