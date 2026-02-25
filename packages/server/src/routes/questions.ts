import { Router } from 'express'
import { generateStringId } from '../utils/id'
import { getQuestions } from '../collections/questions'
import { getCourses } from '../collections/courses'
import { getSessions } from '../collections/sessions'
import { requireAuth } from '../auth/middleware'
import type { Course, Question, User } from '@qlicker/shared'
import { questionSchema, UserRole } from '@qlicker/shared'

const router = Router()

function withoutUndefined<T extends Record<string, unknown>>(doc: T): T {
  return Object.fromEntries(
    Object.entries(doc).filter(([, value]) => value !== undefined)
  ) as T
}

function sessionDetachedFilter(): Record<string, unknown> {
  return {
    $or: [{ sessionId: { $exists: false } }, { sessionId: null }],
  }
}

function withDetachedSessionFilter(filter: Record<string, unknown>): Record<string, unknown> {
  return {
    $and: [filter, sessionDetachedFilter()],
  }
}

function isAdmin(user: User): boolean {
  return user.profile.roles.includes(UserRole.admin)
}

function isCourseInstructor(user: User, course: Pick<Course, 'owner' | 'instructors'>): boolean {
  if (isAdmin(user)) return true
  const userId = user._id ?? ''
  return Boolean(course.owner === userId || course.instructors?.includes(userId))
}

function isCourseStudent(user: User, course: Pick<Course, 'students'>): boolean {
  if (isAdmin(user)) return true
  const userId = user._id ?? ''
  return Boolean(course.students?.includes(userId))
}

async function getCourseAccessInfo(user: User, courseId: string): Promise<{
  course: Course | null
  canAccess: boolean
  canManage: boolean
  isStudent: boolean
}> {
  const course = await getCourses().findOne(
    { _id: courseId } as Parameters<ReturnType<typeof getCourses>['findOne']>[0]
  )
  if (!course) {
    return { course: null, canAccess: false, canManage: false, isStudent: false }
  }

  const canManage = isCourseInstructor(user, course)
  const isStudent = isCourseStudent(user, course)
  return {
    course,
    canAccess: canManage || isStudent,
    canManage,
    isStudent,
  }
}

function canStudentEditQuestion(user: User, question: Question, course: Course): boolean {
  if (isCourseInstructor(user, course)) return false
  const userId = user._id ?? ''
  const ownsQuestion = question.owner === userId || question.creator === userId
  if (!ownsQuestion) return false
  if (!course.allowStudentQuestions) return false
  if (question.approved || question.public) return false
  if (question.sessionId) return false
  return true
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
  const access = await getCourseAccessInfo(user, courseId)
  return access.canAccess
}

async function userCanManageCourse(user: User, courseId: string): Promise<boolean> {
  const access = await getCourseAccessInfo(user, courseId)
  return access.canManage
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
    const { sessionId, courseId, owner, library } = req.query as Record<string, string | undefined>
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

      const access = await getCourseAccessInfo(user, session.courseId)
      if (!access.canAccess) return res.status(403).json({ error: 'Forbidden.' })

      const result = await questions.find({
        ...query,
        sessionId,
        courseId: session.courseId,
      }).toArray()

      if (access.canManage) return res.json(result)

      const sanitized = await Promise.all(
        result.map(async (question) => {
          if (question.sessionOptions?.correct || session.practiceQuiz) return question
          return sanitizeQuestionForStudent(question)
        })
      )
      return res.json(sanitized)
    }

    if (courseId) {
      const access = await getCourseAccessInfo(user, courseId)
      if (!access.canAccess) return res.status(403).json({ error: 'Forbidden.' })

      if (library === 'public') {
        const result = await questions.find(withDetachedSessionFilter({
          ...query,
          courseId,
          public: true,
          approved: true,
        })).toArray()
        return res.json(result)
      }

      if (library === 'unapprovedFromStudents') {
        if (!access.canManage) return res.status(403).json({ error: 'Forbidden.' })
        const result = await questions.find(withDetachedSessionFilter({
          ...query,
          courseId,
          approved: false,
          $or: [{ private: false }, { private: { $exists: false } }],
        })).toArray()
        return res.json(result)
      }

      if (library === 'library') {
        if (access.canManage) {
          const result = await questions.find(withDetachedSessionFilter({
            ...query,
            courseId,
            approved: true,
            studentCopyOfPublic: { $exists: false },
          })).toArray()
          return res.json(result)
        }

        const result = await questions.find(withDetachedSessionFilter({
          ...query,
          courseId,
          $or: [{ creator: user._id }, { owner: user._id }],
        })).toArray()
        return res.json(result)
      }

      if (access.canManage) {
        const result = await questions.find({
          ...query,
          courseId,
        }).toArray()
        return res.json(result)
      }

      // Default student view without explicit library: own library only.
      const result = await questions.find(withDetachedSessionFilter({
        ...query,
        courseId,
        $or: [{ creator: user._id }, { owner: user._id }],
      })).toArray()
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

    const result = await questions
      .find({
        ...query,
        courseId: { $in: instructorCourseIds },
      })
      .toArray()
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

      // Students may only read non-session questions they created/own, or public questions.
      if (!question.sessionId) {
        const ownsQuestion = question.creator === user._id || question.owner === user._id
        if (!ownsQuestion && !question.public) {
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

    const access = await getCourseAccessInfo(user, courseIdForQuestion)
    if (!access.course) return res.status(404).json({ error: 'Course not found.' })
    if (!access.canAccess) return res.status(403).json({ error: 'Forbidden.' })

    const isStudentCreation = !access.canManage
    if (isStudentCreation && !access.course.allowStudentQuestions) {
      return res.status(403).json({ error: 'Student questions are disabled for this course.' })
    }
    if (isStudentCreation && parsed.data.sessionId) {
      return res.status(400).json({ error: 'Students cannot create session-attached questions.' })
    }

    const userId = user._id ?? ''
    const doc = withoutUndefined({
      _id: generateStringId('question'),
      ...parsed.data,
      courseId: courseIdForQuestion,
      options: normalizeQuestionOptions(parsed.data.options || []),
      creator: userId,
      owner: userId,
      approved: access.canManage ? true : false,
      public: access.canManage ? Boolean(parsed.data.public) : false,
      sessionId: isStudentCreation ? undefined : parsed.data.sessionId,
      createdAt: new Date(),
    })

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

    const access = await getCourseAccessInfo(user, courseIdForQuestion)
    if (!access.course) return res.status(404).json({ error: 'Course not found.' })
    if (!access.canAccess) return res.status(403).json({ error: 'Forbidden.' })

    const updatePayload: Record<string, unknown> = { ...parsed.data, courseId: courseIdForQuestion }

    if (parsed.data.options) {
      updatePayload.options = normalizeQuestionOptions(parsed.data.options)
    }

    if (!access.canManage) {
      if (!canStudentEditQuestion(user, existing, access.course)) {
        return res.status(403).json({ error: 'Forbidden.' })
      }

      const forbiddenStudentFields = ['approved', 'public', 'owner', 'creator', 'courseId', 'sessionId']
      for (const field of forbiddenStudentFields) {
        if (field in parsed.data) {
          return res.status(403).json({ error: `Students cannot update '${field}'.` })
        }
      }

      updatePayload.approved = false
      updatePayload.public = false
      updatePayload.owner = existing.owner
      updatePayload.creator = existing.creator
      updatePayload.courseId = existing.courseId
      updatePayload.sessionId = existing.sessionId
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

/** POST /api/questions/:questionId/copy — copy a question into caller library */
router.post('/:questionId/copy', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const questions = getQuestions()
    const source = await questions.findOne(
      { _id: req.params.questionId } as Parameters<typeof questions.findOne>[0]
    )
    if (!source) return res.status(404).json({ error: 'Question not found.' })

    const courseIdForQuestion = await resolveCourseIdFromQuestion(source)
    if (!courseIdForQuestion) return res.status(400).json({ error: 'courseId required.' })

    const access = await getCourseAccessInfo(user, courseIdForQuestion)
    if (!access.course) return res.status(404).json({ error: 'Course not found.' })
    if (!access.canAccess) return res.status(403).json({ error: 'Forbidden.' })

    const userId = user._id ?? ''
    const copy = withoutUndefined({
      _id: generateStringId('question'),
      plainText: source.plainText,
      type: source.type,
      content: source.content,
      options: normalizeQuestionOptions(source.options || []),
      toleranceNumerical: source.toleranceNumerical,
      correctNumerical: source.correctNumerical,
      creator: source.creator || userId,
      owner: userId,
      originalQuestion: source._id,
      sessionId: undefined,
      courseId: courseIdForQuestion,
      public: false,
      solution: source.solution,
      solution_plainText: source.solution_plainText,
      createdAt: new Date(),
      approved: access.canManage ? true : false,
      tags: source.tags || [],
      sessionOptions: source.sessionOptions,
      imagePath: source.imagePath,
      studentCopyOfPublic: access.canManage ? undefined : true,
    })

    await questions.insertOne(copy as Parameters<typeof questions.insertOne>[0])
    const created = await questions.findOne({ _id: copy._id } as Parameters<typeof questions.findOne>[0])
    res.status(201).json(created)
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

    const access = await getCourseAccessInfo(user, courseIdForQuestion)
    if (!access.course) return res.status(404).json({ error: 'Course not found.' })
    if (!access.canAccess) return res.status(403).json({ error: 'Forbidden.' })

    if (!access.canManage && !canStudentEditQuestion(user, existing, access.course)) {
      return res.status(403).json({ error: 'Forbidden.' })
    }

    await questions.deleteOne({ _id: req.params.questionId } as Parameters<typeof questions.deleteOne>[0])
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
