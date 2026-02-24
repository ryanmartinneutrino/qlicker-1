import { Router } from 'express'
import { generateStringId } from '../utils/id'
import { getQuestions } from '../collections/questions'
import { getCourses } from '../collections/courses'
import { getSessions } from '../collections/sessions'
import { requireAuth } from '../auth/middleware'
import type { Question, User } from '@qlicker/shared'
import { questionSchema, UserRole } from '@qlicker/shared'

const router = Router()

function isAdmin(user: User): boolean {
  return user.profile.roles.includes(UserRole.admin)
}

async function resolveCourseIdFromQuestion(question: Partial<Question>): Promise<string | undefined> {
  if (question.courseId) return question.courseId
  if (!question.sessionId) return undefined

  const session = await getSessions().findOne(
    { _id: question.sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0],
    { projection: { courseId: 1 } }
  )
  return session?.courseId
}

async function userCanAccessCourse(user: User, courseId: string): Promise<boolean> {
  if (isAdmin(user)) return true

  const course = await getCourses().findOne(
    { _id: courseId } as Parameters<ReturnType<typeof getCourses>['findOne']>[0],
    { projection: { owner: 1, instructors: 1, students: 1 } }
  )
  if (!course) return false

  const userId = user._id ?? ''
  return Boolean(
    course.owner === userId ||
      course.instructors?.includes(userId) ||
      course.students?.includes(userId)
  )
}

async function userCanManageCourse(user: User, courseId: string): Promise<boolean> {
  if (isAdmin(user)) return true

  const course = await getCourses().findOne(
    { _id: courseId } as Parameters<ReturnType<typeof getCourses>['findOne']>[0],
    { projection: { owner: 1, instructors: 1 } }
  )
  if (!course) return false

  const userId = user._id ?? ''
  return Boolean(course.owner === userId || course.instructors?.includes(userId))
}

type OptionInput = {
  plainText?: string
  answer?: string
  content?: string
  correct?: boolean
  wysiwyg?: boolean
}

function normalizeQuestionOptions(options: OptionInput[]): OptionInput[] {
  return options.map((option) => {
    const text = option.plainText ?? option.answer ?? option.content ?? ''
    return {
      ...option,
      plainText: text,
      answer: option.answer ?? text,
      content: option.content ?? text,
    }
  })
}

function sanitizeQuestionForStudent(question: Question): Question {
  const options = (question.options || []).map((option) => {
    const { correct: _omit, ...rest } = option
    return rest
  })
  const sanitized: Question = { ...question, options }
  delete sanitized.correctNumerical
  return sanitized
}

async function shouldRevealCorrectInSession(
  question: Question,
  sessionId: string | undefined
): Promise<boolean> {
  if (question.sessionOptions?.correct) return true
  if (!sessionId) return false

  const session = await getSessions().findOne(
    { _id: sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0],
    { projection: { practiceQuiz: 1 } }
  )
  return Boolean(session?.practiceQuiz)
}

/** GET /api/questions?sessionId=...&courseId=... */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const { sessionId, courseId, owner } = req.query as Record<string, string | undefined>
    const questions = getQuestions()

    const query: Record<string, unknown> = {}
    if (sessionId) query.sessionId = sessionId
    if (courseId) query.courseId = courseId
    if (owner) query.owner = owner

    if (isAdmin(user)) {
      const result = await questions.find(query).toArray()
      return res.json(result)
    }

    if (owner && owner !== user._id) {
      return res.status(403).json({ error: 'Forbidden.' })
    }

    if (sessionId) {
      const session = await getSessions().findOne(
        { _id: sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0],
        { projection: { courseId: 1, practiceQuiz: 1 } }
      )
      if (!session) return res.status(404).json({ error: 'Session not found.' })

      const allowed = await userCanAccessCourse(user, session.courseId)
      if (!allowed) return res.status(403).json({ error: 'Forbidden.' })

      const result = await questions.find({
        ...query,
        sessionId,
        courseId: session.courseId,
      }).toArray()

      const canManage = await userCanManageCourse(user, session.courseId)
      if (canManage) return res.json(result)

      const sanitized = await Promise.all(
        result.map(async (question) => {
          if (question.sessionOptions?.correct || session.practiceQuiz) return question
          return sanitizeQuestionForStudent(question)
        })
      )
      return res.json(sanitized)
    }

    if (courseId) {
      const allowed = await userCanAccessCourse(user, courseId)
      if (!allowed) return res.status(403).json({ error: 'Forbidden.' })

      const canManage = await userCanManageCourse(user, courseId)
      if (canManage) {
        const result = await questions.find({
          ...query,
          courseId,
        }).toArray()
        return res.json(result)
      }

      // Student view of course library: only non-session questions created/owned by the user.
      const result = await questions.find({
        ...query,
        courseId,
        sessionId: { $exists: false },
        $or: [{ creator: user._id }, { owner: user._id }],
      }).toArray()
      return res.json(result)
    }

    if (owner === user._id) {
      const result = await questions.find({
        ...query,
        owner: user._id,
      }).toArray()
      return res.json(result)
    }

    const isInstructorRole = user.profile.roles.includes(UserRole.prof)
    if (!isInstructorRole) {
      return res.json([])
    }

    const instructorCourses = await getCourses()
        .find(
          {
            $or: [{ owner: user._id }, { instructors: user._id }],
          } as Parameters<ReturnType<typeof getCourses>['find']>[0],
          { projection: { _id: 1 } }
        )
        .toArray()

    const instructorCourseIds = instructorCourses
      .map((course) => course._id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (instructorCourseIds.length < 1) return res.json([])

    const result = await questions.find({
      ...query,
      courseId: { $in: instructorCourseIds },
    }).toArray()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

/** GET /api/questions/:questionId */
router.get('/:questionId', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const questions = getQuestions()
    const question = await questions.findOne(
      { _id: req.params.questionId } as Parameters<typeof questions.findOne>[0]
    )
    if (!question) return res.status(404).json({ error: 'Question not found.' })

    if (!isAdmin(user)) {
      const courseIdForQuestion = await resolveCourseIdFromQuestion(question)
      if (!courseIdForQuestion) {
        if (question.creator !== user._id && question.owner !== user._id) {
          return res.status(403).json({ error: 'Forbidden.' })
        }
        return res.json(question)
      }

      const canManage = await userCanManageCourse(user, courseIdForQuestion)
      if (canManage) {
        return res.json(question)
      }

      const allowed = await userCanAccessCourse(user, courseIdForQuestion)
      if (!allowed) return res.status(403).json({ error: 'Forbidden.' })

      // Students may only read non-session questions they created/own.
      if (!question.sessionId) {
        if (question.creator !== user._id && question.owner !== user._id) {
          return res.status(403).json({ error: 'Forbidden.' })
        }
        return res.json(question)
      }

      const revealCorrect = await shouldRevealCorrectInSession(question, question.sessionId)
      return res.json(revealCorrect ? question : sanitizeQuestionForStudent(question))
    }

    res.json(question)
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

    const courseIdForQuestion = await resolveCourseIdFromQuestion(parsed.data)
    if (!courseIdForQuestion) return res.status(400).json({ error: 'courseId required.' })

    const allowed = await userCanManageCourse(user, courseIdForQuestion)
    if (!allowed) return res.status(403).json({ error: 'Forbidden.' })

    const doc = {
      _id: generateStringId('question'),
      ...parsed.data,
      courseId: courseIdForQuestion,
      options: normalizeQuestionOptions(parsed.data.options || []),
      creator: user._id ?? '',
      owner: parsed.data.owner || user._id || '',
      createdAt: new Date(),
    }

    const questions = getQuestions()
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
    const existing = await questions.findOne(
      { _id: req.params.questionId } as Parameters<typeof questions.findOne>[0]
    )
    if (!existing) return res.status(404).json({ error: 'Question not found.' })

    const parsed = questionSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

    const merged = { ...existing, ...parsed.data }
    const courseIdForQuestion = await resolveCourseIdFromQuestion(merged)
    if (!courseIdForQuestion) return res.status(400).json({ error: 'courseId required.' })

    const allowed = await userCanManageCourse(user, courseIdForQuestion)
    if (!allowed) return res.status(403).json({ error: 'Forbidden.' })

    const updatePayload: Record<string, unknown> = { ...parsed.data, courseId: courseIdForQuestion }
    if (parsed.data.options) {
      updatePayload.options = normalizeQuestionOptions(parsed.data.options)
    }

    await questions.updateOne(
      { _id: req.params.questionId } as Parameters<typeof questions.updateOne>[0],
      { $set: updatePayload }
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
    const existing = await questions.findOne(
      { _id: req.params.questionId } as Parameters<typeof questions.findOne>[0]
    )
    if (!existing) return res.status(404).json({ error: 'Question not found.' })

    const courseIdForQuestion = await resolveCourseIdFromQuestion(existing)
    if (!courseIdForQuestion) return res.status(400).json({ error: 'courseId required.' })

    const allowed = await userCanManageCourse(user, courseIdForQuestion)
    if (!allowed) return res.status(403).json({ error: 'Forbidden.' })

    await questions.deleteOne({ _id: req.params.questionId } as Parameters<typeof questions.deleteOne>[0])
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
