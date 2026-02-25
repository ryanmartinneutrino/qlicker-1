import { generateStringId } from '../utils/id'
import { getCourses } from '../collections/courses'
import { getGrades } from '../collections/grades'
import { getQuestions } from '../collections/questions'
import { getResponses } from '../collections/responses'
import { getSessions } from '../collections/sessions'
import type { Grade, Mark, Question } from '@qlicker/shared'
import { QuestionType } from '@qlicker/shared'
import type { WithId } from 'mongodb'

export class SessionGradesError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'SessionGradesError'
  }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function asArrayAnswer(answer: unknown): string[] {
  if (Array.isArray(answer)) return answer.map((entry) => String(entry))
  return [String(answer)]
}

function questionPoints(question: Question): number {
  if (question.type === QuestionType.SA && question.sessionOptions?.points === undefined) return 0
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

function isAutoGradeable(type: Question['type']): boolean {
  return (
    type === QuestionType.MC ||
    type === QuestionType.TF ||
    type === QuestionType.MS ||
    type === QuestionType.NU
  )
}

function calculateAutomaticPoints(question: Question, response: { answer: unknown; attempt?: number } | null): number {
  if (!response) return 0
  const basePoints = questionPoints(question)
  const weightedPoints = basePoints * attemptWeight(question, Number(response.attempt || 1))
  if (weightedPoints <= 0) return 0

  const optionIndexMap = buildOptionIndexMap(question)
  const correctIndexes = new Set<number>()
  ;(question.options || []).forEach((option, idx) => {
    if (option.correct) correctIndexes.add(idx)
  })

  if (question.type === QuestionType.MC || question.type === QuestionType.TF) {
    const raw = asArrayAnswer(response.answer)[0] || ''
    const idx = optionIndexMap.get(normalizeText(raw))
    return idx !== undefined && correctIndexes.has(idx) ? weightedPoints : 0
  }

  if (question.type === QuestionType.MS) {
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

  if (question.type === QuestionType.NU) {
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

function gradePatchWithoutId(grade: Partial<Grade>): Partial<Grade> {
  const { _id: _omit, ...rest } = grade
  return rest
}

interface GradeSessionContext {
  _id: string
  courseId: string
  name?: string
  joined?: (string | null)[]
  questions?: (string | null)[]
  reviewable?: boolean
  courseStudents: string[]
}

async function loadSessionWithCourse(sessionId: string): Promise<GradeSessionContext> {
  const sessions = getSessions()
  const courses = getCourses()
  const session = await sessions.findOne({ _id: sessionId } as Parameters<typeof sessions.findOne>[0])
  if (!session) throw new SessionGradesError(404, 'Session not found.')
  if (typeof session._id !== 'string' || session._id.length < 1) {
    throw new SessionGradesError(400, 'Session identifier is invalid.')
  }
  if (typeof session.courseId !== 'string' || session.courseId.length < 1) {
    throw new SessionGradesError(400, 'Session courseId is invalid.')
  }

  const course = await courses.findOne({ _id: session.courseId } as Parameters<typeof courses.findOne>[0])
  if (!course) throw new SessionGradesError(404, 'Course not found.')

  const courseStudents = (course.students || []).filter(
    (studentId): studentId is string => typeof studentId === 'string' && studentId.length > 0
  )

  return {
    _id: session._id,
    courseId: session.courseId,
    name: session.name,
    joined: session.joined,
    questions: session.questions,
    reviewable: session.reviewable,
    courseStudents,
  }
}

export async function recalculateSessionGrades(sessionId: string): Promise<number> {
  const questionsCol = getQuestions()
  const responsesCol = getResponses()
  const grades = getGrades()

  const session = await loadSessionWithCourse(sessionId)

  const questionIds = (session.questions || []).filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  )

  const unsortedQuestions = await questionsCol
    .find({ _id: { $in: questionIds } } as Parameters<typeof questionsCol.find>[0])
    .toArray()
  const questionById = new Map<string, WithId<Question>>(
    unsortedQuestions
      .filter((question): question is WithId<Question> => typeof question._id === 'string' && question._id.length > 0)
      .map((question) => [question._id, question])
  )
  const orderedQuestions: WithId<Question>[] = questionIds
    .map((questionId) => questionById.get(questionId))
    .filter((question): question is WithId<Question> => Boolean(question))

  const responses = await responsesCol
    .find({ questionId: { $in: questionIds } } as Parameters<typeof responsesCol.find>[0])
    .toArray()

  const joined = new Set(
    (session.joined || []).filter((id): id is string => typeof id === 'string' && id.length > 0)
  )
  const markOutOf = orderedQuestions.map((question) => questionPoints(question))
  const numQuestions = markOutOf.filter((points) => points > 0).length
  const gradeOutOf = markOutOf.reduce((sum, value) => sum + value, 0)

  let updatedCount = 0
  for (const studentId of session.courseStudents) {
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
    for (let index = 0; index < orderedQuestions.length; index += 1) {
      const question = orderedQuestions[index]
      const candidateResponses = responses.filter(
        (response) => response.studentUserId === studentId && response.questionId === question._id
      )
      const latestResponse =
        candidateResponses.sort((left, right) => Number(right.attempt || 0) - Number(left.attempt || 0))[0] ||
        null

      if (latestResponse) {
        numAnsweredTotal += 1
        if (markOutOf[index] > 0) numAnswered += 1
      }

      const existingMark = existing?.marks?.find((mark) => mark.questionId === question._id)
      const markAutomatic = !(existingMark && existingMark.automatic === false)
      const autoGradeable = isAutoGradeable(question.type)

      let points = 0
      if (markAutomatic && autoGradeable) {
        points = calculateAutomaticPoints(question, latestResponse)
      } else if (existingMark?.points !== undefined) {
        points = existingMark.points
      }

      let markNeedsGrading = false
      if (!autoGradeable && markOutOf[index] > 0 && latestResponse) {
        markNeedsGrading = existingMark?.needsGrading ?? true
        if (markNeedsGrading) needsGrading = true
      }

      gradePoints += points
      marks.push({
        questionId: question._id,
        responseId: latestResponse?._id || '0',
        attempt: latestResponse?.attempt || 0,
        points,
        outOf: markOutOf[index],
        automatic: markAutomatic && autoGradeable,
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
      numQuestionsTotal: orderedQuestions.length,
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

  return updatedCount
}

export async function setSessionGradesVisibility(sessionId: string, visible: boolean): Promise<void> {
  const grades = getGrades()
  await grades.updateMany(
    { sessionId } as Parameters<typeof grades.updateMany>[0],
    { $set: { visibleToStudents: visible } }
  )
}
