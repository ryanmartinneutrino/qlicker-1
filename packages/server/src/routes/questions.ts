import { Router } from 'express'
import { generateStringId } from '../utils/id'
import { getQuestions } from '../collections/questions'
import { getCourses } from '../collections/courses'
import {
  getCourseById,
  getQuestionById,
  getSessionById,
  isAdminUser,
  isCourseInstructor,
  isCourseMember,
  requireAuth,
  requireQuestionAccess,
} from '../auth/middleware'
import type { User } from '@qlicker/shared'
import { questionSchema } from '@qlicker/shared'

const router = Router()

async function resolveQuestionCourseId(question: {
  courseId?: string
  sessionId?: string
}): Promise<string | null> {
  if (question.courseId) return question.courseId
  if (!question.sessionId) return null
  const session = await getSessionById(question.sessionId)
  return session?.courseId || null
}

async function canMutateQuestion(
  user: User,
  question: { creator?: string; owner?: string; courseId?: string; sessionId?: string }
): Promise<boolean> {
  if (isAdminUser(user)) return true
  const userId = user._id ?? ''
  if ((question.creator && question.creator === userId) || (question.owner && question.owner === userId)) {
    return true
  }
  const courseId = await resolveQuestionCourseId(question)
  if (!courseId) return false
  const course = await getCourseById(courseId)
  return isCourseInstructor(user, course)
}

/** GET /api/questions?sessionId=...&courseId=... */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const { sessionId, courseId, owner } = req.query as Record<string, string | undefined>
    const questions = getQuestions()
    const query: Record<string, unknown> = {}

    if (sessionId) {
      const session = await getSessionById(sessionId)
      if (!session) return res.status(404).json({ error: 'Session not found.' })
      const course = await getCourseById(session.courseId)
      if (!course) return res.status(404).json({ error: 'Course not found.' })
      if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })
      query.sessionId = sessionId
    }

    if (courseId) {
      const course = await getCourseById(courseId)
      if (!course) return res.status(404).json({ error: 'Course not found.' })
      if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })
      query.courseId = courseId
    }

    if (owner) {
      if (!isAdminUser(user) && owner !== user._id) return res.status(403).json({ error: 'Forbidden.' })
      query.owner = owner
    }

    if (!sessionId && !courseId && !owner) {
      if (isAdminUser(user)) {
        const result = await questions.find({}).toArray()
        return res.json(result)
      }

      const courses = getCourses()
      const myCourseIds = (
        await courses
          .find(
            {
              $or: [{ instructors: user._id }, { students: user._id }, { owner: user._id }],
            } as Parameters<typeof courses.find>[0],
            { projection: { _id: 1 } }
          )
          .toArray()
      )
        .map((course) => course._id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)

      query.$or = [
        { owner: user._id },
        { creator: user._id },
        ...(myCourseIds.length > 0 ? [{ courseId: { $in: myCourseIds } }] : []),
      ]
    }

    const result = await questions.find(query).toArray()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

/** GET /api/questions/:questionId */
router.get('/:questionId', requireAuth, requireQuestionAccess, async (req, res, next) => {
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

    if (parsed.data.sessionId) {
      const session = await getSessionById(parsed.data.sessionId)
      if (!session) return res.status(404).json({ error: 'Session not found.' })
      const course = await getCourseById(session.courseId)
      if (!course) return res.status(404).json({ error: 'Course not found.' })
      if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })
      if (parsed.data.courseId && parsed.data.courseId !== session.courseId) {
        return res.status(400).json({ error: 'question courseId does not match the session course.' })
      }
    } else if (parsed.data.courseId) {
      const course = await getCourseById(parsed.data.courseId)
      if (!course) return res.status(404).json({ error: 'Course not found.' })
      if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })
    }

    const questions = getQuestions()
    const doc = {
      _id: generateStringId('question'),
      ...parsed.data,
      creator: user._id ?? '',
      owner: parsed.data.owner || (user._id ?? ''),
      createdAt: new Date(),
    }
    await questions.insertOne(doc as Parameters<typeof questions.insertOne>[0])
    const created = await questions.findOne({ _id: doc._id } as Parameters<typeof questions.findOne>[0])
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

/** PUT /api/questions/:questionId — update question */
router.put('/:questionId', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const questions = getQuestions()
    const existing = await getQuestionById(req.params.questionId)
    if (!existing) return res.status(404).json({ error: 'Question not found.' })
    if (!(await canMutateQuestion(user, existing))) {
      return res.status(403).json({ error: 'Forbidden.' })
    }

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
    const user = req.user as User
    const questions = getQuestions()
    const existing = await getQuestionById(req.params.questionId)
    if (!existing) return res.status(404).json({ error: 'Question not found.' })
    if (!(await canMutateQuestion(user, existing))) {
      return res.status(403).json({ error: 'Forbidden.' })
    }
    await questions.deleteOne({ _id: req.params.questionId } as Parameters<typeof questions.deleteOne>[0])
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
