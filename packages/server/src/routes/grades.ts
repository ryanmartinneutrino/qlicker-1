import { Router } from 'express'
import { getGrades } from '../collections/grades'
import {
  getCourseById,
  getSessionById,
  isAdminUser,
  isCourseInstructor,
  isCourseMember,
  requireAuth,
  requireInstructor,
} from '../auth/middleware'
import type { User } from '@qlicker/shared'
import { gradeSchema } from '@qlicker/shared'
import { getSessions } from '../collections/sessions'
import { getCourses } from '../collections/courses'
import { getQuestions } from '../collections/questions'
import { getResponses } from '../collections/responses'
import type { Grade, Mark, Question, Response } from '@qlicker/shared'
import type { WithId } from 'mongodb'
import { generateStringId } from '../utils/id'

const router = Router()

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function asArrayAnswer(answer: Response['answer']): string[] {
  if (Array.isArray(answer)) return answer.map((v) => String(v))
  return [String(answer)]
}

function questionPoints(question: Question): number {
  if (question.type === 2 && question.sessionOptions?.points === undefined) return 0
  return question.sessionOptions?.points ?? 1
}

function attemptWeight(question: Question, attempt: number): number {
  const maxAttempts = Number(question.sessionOptions?.maxAttempts ?? 1)
  if (maxAttempts <= 1) return 1
  const weights = question.sessionOptions?.attemptWeights || [1]
  if (attempt >= 1 && attempt <= weights.length) return Number(weights[attempt - 1])
  return 0
}

function buildOptionIndexMap(question: Question): Map<string, number> {
  const map = new Map<string, number>()
  ;(question.options || []).forEach((option, index) => {
    const letter = String.fromCharCode(65 + index)
    map.set(normalizeText(letter), index)
    map.set(normalizeText(String(index)), index)
    if (option.answer) map.set(normalizeText(option.answer), index)
    if (option.plainText) map.set(normalizeText(option.plainText), index)
    if (option.content) map.set(normalizeText(option.content), index)
  })
  return map
}

function calculateAutomaticPoints(question: Question, response: Response | null): number {
  if (!response) return 0
  const basePoints = questionPoints(question)
  const weightedPoints = basePoints * attemptWeight(question, Number(response.attempt || 1))
  if (weightedPoints <= 0) return 0

  const optionIndexMap = buildOptionIndexMap(question)
  const correctIndexes = new Set<number>()
  ;(question.options || []).forEach((option, idx) => {
    if (option.correct) correctIndexes.add(idx)
  })

  if (question.type === 0 || question.type === 1) {
    const raw = asArrayAnswer(response.answer)[0] || ''
    const idx = optionIndexMap.get(normalizeText(raw))
    return idx !== undefined && correctIndexes.has(idx) ? weightedPoints : 0
  }

  if (question.type === 3) {
    const rawSelections = asArrayAnswer(response.answer)
    const selectedIndexes = new Set<number>()
    rawSelections.forEach((selection) => {
      const idx = optionIndexMap.get(normalizeText(selection))
      if (idx !== undefined) selectedIndexes.add(idx)
    })
    const intersection = [...selectedIndexes].filter((idx) => correctIndexes.has(idx))
    const denominator = correctIndexes.size
    const rawScore =
      denominator > 0 ? (2 * intersection.length - selectedIndexes.size) / denominator : 0
    const boundedScore = Math.max(0, Math.min(1, rawScore))
    return weightedPoints * boundedScore
  }

  if (question.type === 4) {
    const raw = asArrayAnswer(response.answer)[0] || ''
    const numericAnswer = Number(raw)
    const expected = Number(question.correctNumerical ?? NaN)
    const tolerance = Number(question.toleranceNumerical ?? 0)
    const correct =
      Number.isFinite(numericAnswer) &&
      Number.isFinite(expected) &&
      Math.abs(numericAnswer - expected) <= Math.abs(tolerance)
    return correct ? weightedPoints : 0
  }

  return 0
}

/** GET /api/grades?courseId=...&sessionId=...&userId=... */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as User
    const { courseId, sessionId, userId } = req.query as Record<string, string | undefined>
    const grades = getGrades()
    const query: Record<string, unknown> = {}
    const isAdmin = isAdminUser(user)
    const isProfessor = user.profile.roles.includes('professor')

    if (courseId) query.courseId = courseId
    if (sessionId) query.sessionId = sessionId

    if (isAdmin) {
      if (userId) query.userId = userId
      const result = await grades.find(query).toArray()
      return res.json(result)
    }

    if (courseId) {
      const course = await getCourseById(courseId)
      if (!course) return res.status(404).json({ error: 'Course not found.' })
      if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })

      if (isProfessor) {
        if (!isCourseInstructor(user, course)) return res.status(403).json({ error: 'Forbidden.' })
        if (userId) query.userId = userId
      } else {
        if (userId && userId !== user._id) return res.status(403).json({ error: 'Forbidden.' })
        query.userId = user._id
        query.visibleToStudents = true
      }
      const result = await grades.find(query).toArray()
      return res.json(result)
    }

    if (sessionId) {
      const session = await getSessionById(sessionId)
      if (!session) return res.status(404).json({ error: 'Session not found.' })
      const course = await getCourseById(session.courseId)
      if (!course) return res.status(404).json({ error: 'Course not found.' })
      if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })

      if (isProfessor) {
        if (!isCourseInstructor(user, course)) return res.status(403).json({ error: 'Forbidden.' })
        if (userId) query.userId = userId
      } else {
        if (userId && userId !== user._id) return res.status(403).json({ error: 'Forbidden.' })
        query.userId = user._id
        query.visibleToStudents = true
      }
      const result = await grades.find(query).toArray()
      return res.json(result)
    }

    if (isProfessor) {
      const courses = getCourses()
      const myCourseIds = (
        await courses
          .find(
            { $or: [{ instructors: user._id }, { owner: user._id }] } as Parameters<
              typeof courses.find
            >[0],
            { projection: { _id: 1 } }
          )
          .toArray()
      )
        .map((course) => course._id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)

      if (myCourseIds.length < 1) return res.json([])
      query.courseId = { $in: myCourseIds }
      if (userId) query.userId = userId
      const result = await grades.find(query).toArray()
      return res.json(result)
    }

    if (userId && userId !== user._id) return res.status(403).json({ error: 'Forbidden.' })
    // Student default: only own visible grades.
    query.userId = user._id
    query.visibleToStudents = true
    const result = await grades.find(query).toArray()
    res.json(result)
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

    if (isAdminUser(user)) return res.json(grade)

    if (grade.courseId) {
      const course = await getCourseById(grade.courseId)
      if (!course) return res.status(404).json({ error: 'Course not found.' })
      if (!isCourseMember(user, course)) return res.status(403).json({ error: 'Forbidden.' })
      if (isCourseInstructor(user, course)) return res.json(grade)
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
    const grades = getGrades()
    const parsed = gradeSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors })

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
    const { visible } = req.body as { visible: boolean }
    const grades = getGrades()
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
    const sessions = getSessions()
    const courses = getCourses()
    const questionsCol = getQuestions()
    const responsesCol = getResponses()
    const grades = getGrades()

    const session = await sessions.findOne({ _id: req.params.sessionId } as Parameters<typeof sessions.findOne>[0])
    if (!session) return res.status(404).json({ error: 'Session not found.' })
    const course = await courses.findOne({ _id: session.courseId } as Parameters<typeof courses.findOne>[0])
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const questionIds = (session.questions || []).filter((id): id is string => typeof id === 'string' && id.length > 0)
    const unsortedQuestions = await questionsCol
      .find({ _id: { $in: questionIds } } as Parameters<typeof questionsCol.find>[0])
      .toArray()
    const questionById = new Map<string, WithId<Question>>(
      unsortedQuestions
        .filter((q): q is WithId<Question> => typeof q._id === 'string' && q._id.length > 0)
        .map((q) => [q._id, q])
    )
    const questions: WithId<Question>[] = questionIds
      .map((qId) => questionById.get(qId))
      .filter((q): q is WithId<Question> => Boolean(q))

    const responses = await responsesCol
      .find({ questionId: { $in: questionIds } } as Parameters<typeof responsesCol.find>[0])
      .toArray()

    const students = (course.students || []).filter((id): id is string => typeof id === 'string' && id.length > 0)
    const joined = new Set((session.joined || []).filter((id): id is string => typeof id === 'string' && id.length > 0))
    const numQuestionsTotal = questions.length
    const markOutOf = questions.map((q) => questionPoints(q))
    const numQuestions = markOutOf.filter((points) => points > 0).length
    const gradeOutOf = markOutOf.reduce((sum, value) => sum + value, 0)

    let updatedCount = 0
    for (const studentId of students) {
      const existing = await grades.findOne({
        userId: studentId,
        courseId: session.courseId,
        sessionId: session._id,
      } as Parameters<typeof grades.findOne>[0])

      let gradePoints = 0
      let numAnswered = 0
      let numAnsweredTotal = 0
      let needsGrading = false

      const marks: Mark[] = []
      for (let i = 0; i < questions.length; i += 1) {
        const question = questions[i]
        const candidateResponses = responses.filter(
          (resp) => resp.studentUserId === studentId && resp.questionId === question._id
        )
        const latestResponse = candidateResponses.sort(
          (a, b) => Number(b.attempt || 0) - Number(a.attempt || 0)
        )[0] || null

        if (latestResponse) {
          numAnsweredTotal += 1
          if (markOutOf[i] > 0) numAnswered += 1
        }

        const existingMark = existing?.marks?.find((mark) => mark.questionId === question._id)
        const markAutomatic = !(existingMark && existingMark.automatic === false)
        const isAutoGradeable = question.type === 0 || question.type === 1 || question.type === 3 || question.type === 4

        let points = 0
        if (markAutomatic && isAutoGradeable) {
          points = calculateAutomaticPoints(question, latestResponse)
        } else if (existingMark?.points !== undefined) {
          points = existingMark.points
        }

        let markNeedsGrading = false
        if (!isAutoGradeable && markOutOf[i] > 0 && latestResponse) {
          markNeedsGrading = existingMark?.needsGrading ?? true
          if (markNeedsGrading) needsGrading = true
        }

        gradePoints += points
        marks.push({
          questionId: question._id,
          responseId: latestResponse?._id || '0',
          attempt: latestResponse?.attempt || 0,
          points,
          outOf: markOutOf[i],
          automatic: markAutomatic && isAutoGradeable,
          needsGrading: markNeedsGrading,
          feedback: existingMark?.feedback || '',
        })
      }

      let participation = 0
      if (numAnswered > 0) {
        participation = numQuestions > 0 ? Math.round((1000 * numAnswered) / numQuestions) / 10 : 100
      }
      if (joined.has(studentId) && numQuestions === 0) participation = 100

      const automaticGrade = existing?.automatic !== false
      let value = existing?.value ?? 0
      if (automaticGrade) {
        if (gradePoints > 0) {
          value = gradeOutOf > 0 ? Math.round((1000 * gradePoints) / gradeOutOf) / 10 : 100
        } else {
          value = 0
        }
      }

      const gradeId = existing?._id || generateStringId('grade')
      const patch: Partial<Grade> = {
        _id: gradeId,
        userId: studentId,
        courseId: session.courseId,
        sessionId: session._id,
        name: session.name,
        marks,
        joined: joined.has(studentId),
        participation,
        value,
        points: gradePoints,
        automatic: automaticGrade,
        outOf: gradeOutOf,
        numAnswered,
        numQuestions,
        numAnsweredTotal,
        numQuestionsTotal,
        visibleToStudents: Boolean(session.reviewable),
        needsGrading,
      }

      await grades.updateOne(
        { _id: gradeId } as Parameters<typeof grades.updateOne>[0],
        { $set: gradePatchWithoutId(patch) },
        { upsert: true }
      )
      updatedCount += 1
    }

    res.json({ success: true, updated: updatedCount })
  } catch (err) {
    next(err)
  }
})

function gradePatchWithoutId(grade: Partial<Grade>): Partial<Grade> {
  const { _id: _omit, ...rest } = grade
  return rest
}

/** PUT /api/grades/session/:sessionId/visible — toggle visibility for all session grades */
router.put('/session/:sessionId/visible', requireAuth, requireInstructor, async (req, res, next) => {
  try {
    const visible = Boolean((req.body as { visible?: boolean }).visible)
    const grades = getGrades()
    await grades.updateMany(
      { sessionId: req.params.sessionId } as Parameters<typeof grades.updateMany>[0],
      { $set: { visibleToStudents: visible } }
    )
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
