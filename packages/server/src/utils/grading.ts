import { getGrades } from '../collections/grades'
import { getQuestions } from '../collections/questions'
import { generateStringId } from './id'
import type { Grade, Mark, Question, Response } from '@qlicker/shared'

interface EvaluationResult {
  correct?: boolean
  pointsAwarded: number
  pointsPossible: number
  automatic: boolean
  needsGrading: boolean
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function asArrayAnswer(answer: Response['answer']): string[] {
  if (Array.isArray(answer)) return answer.map((v) => String(v))
  return [String(answer)]
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

function evaluateResponse(question: Question, response: Pick<Response, 'answer'>): EvaluationResult {
  const pointsPossible = question.sessionOptions?.points ?? 1
  const optionIndexMap = buildOptionIndexMap(question)
  const correctIndexes = new Set<number>()
  ;(question.options || []).forEach((option, idx) => {
    if (option.correct) correctIndexes.add(idx)
  })

  if (question.type === 0 || question.type === 2) {
    const raw = asArrayAnswer(response.answer)[0] || ''
    const idx = optionIndexMap.get(normalizeText(raw))
    const correct = idx !== undefined && correctIndexes.has(idx)
    return {
      correct,
      pointsAwarded: correct ? pointsPossible : 0,
      pointsPossible,
      automatic: true,
      needsGrading: false,
    }
  }

  if (question.type === 1) {
    const rawSelections = asArrayAnswer(response.answer)
    const selectedIndexes = new Set<number>()
    rawSelections.forEach((selection) => {
      const idx = optionIndexMap.get(normalizeText(selection))
      if (idx !== undefined) selectedIndexes.add(idx)
    })
    const sameSize = selectedIndexes.size === correctIndexes.size
    const sameMembers = sameSize && [...selectedIndexes].every((idx) => correctIndexes.has(idx))
    const correct = sameMembers && correctIndexes.size > 0
    return {
      correct,
      pointsAwarded: correct ? pointsPossible : 0,
      pointsPossible,
      automatic: true,
      needsGrading: false,
    }
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
    return {
      correct,
      pointsAwarded: correct ? pointsPossible : 0,
      pointsPossible,
      automatic: true,
      needsGrading: false,
    }
  }

  const answer = asArrayAnswer(response.answer)[0] || ''
  const expected = question.solution_plainText || question.solution || ''
  if (expected.trim()) {
    const correct = normalizeText(answer) === normalizeText(expected)
    return {
      correct,
      pointsAwarded: correct ? pointsPossible : 0,
      pointsPossible,
      automatic: true,
      needsGrading: false,
    }
  }

  return {
    pointsAwarded: 0,
    pointsPossible,
    automatic: false,
    needsGrading: true,
  }
}

function summarizeMarks(marks: Mark[]): {
  points: number
  outOf: number
  needsGrading: boolean
} {
  let points = 0
  let outOf = 0
  let needsGrading = false
  for (const mark of marks) {
    if (typeof mark.points === 'number') points += mark.points
    if (typeof mark.outOf === 'number') outOf += mark.outOf
    if (mark.needsGrading) needsGrading = true
  }
  return { points, outOf, needsGrading }
}

export async function gradeResponse(params: {
  responseDoc: Response
  questionId: string
  studentUserId: string
  attempt: number
  sessionId?: string
  courseId?: string
}): Promise<{ responseUpdate: { correct?: boolean }; grade?: Grade }> {
  const { responseDoc, questionId, studentUserId, attempt, sessionId, courseId } = params
  const question = await getQuestions().findOne({ _id: questionId } as Parameters<ReturnType<typeof getQuestions>['findOne']>[0])
  if (!question) return { responseUpdate: {} }

  const evaluation = evaluateResponse(question, responseDoc)
  const responseUpdate = evaluation.correct === undefined ? {} : { correct: evaluation.correct }

  if (!sessionId || !courseId) return { responseUpdate }

  const grades = getGrades()
  const existing = await grades.findOne({
    userId: studentUserId,
    sessionId,
  } as Parameters<typeof grades.findOne>[0])

  const nextMark: Mark = {
    questionId,
    responseId: responseDoc._id,
    attempt,
    points: evaluation.pointsAwarded,
    outOf: evaluation.pointsPossible,
    automatic: evaluation.automatic,
    needsGrading: evaluation.needsGrading,
  }

  const previousMarks = (existing?.marks || []).filter(
    (mark) => !(mark.questionId === questionId && mark.attempt === attempt)
  )
  const marks = [...previousMarks, nextMark]
  const summary = summarizeMarks(marks)

  const questionIdsInSession = await getQuestions()
    .find({ sessionId } as Parameters<ReturnType<typeof getQuestions>['find']>[0], { projection: { _id: 1 } })
    .toArray()
  const sessionQuestionIds = new Set(questionIdsInSession.map((q) => q._id).filter((id): id is string => Boolean(id)))

  const answeredQuestionIds = new Set(
    marks
      .map((mark) => mark.questionId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .filter((id) => sessionQuestionIds.has(id))
  )

  const gradePatch: Partial<Grade> = {
    userId: studentUserId,
    courseId,
    sessionId,
    marks,
    points: summary.points,
    outOf: summary.outOf,
    numQuestions: sessionQuestionIds.size,
    numAnswered: answeredQuestionIds.size,
    needsGrading: summary.needsGrading,
    automatic: !summary.needsGrading,
    visibleToStudents: existing?.visibleToStudents ?? false,
  }

  const gradeId = existing?._id || generateStringId('grade')
  await grades.updateOne(
    { _id: gradeId } as Parameters<typeof grades.updateOne>[0],
    { $set: gradePatch, $setOnInsert: { _id: gradeId } },
    { upsert: true }
  )
  const updatedGrade = await grades.findOne({ _id: gradeId } as Parameters<typeof grades.findOne>[0])
  return { responseUpdate, grade: updatedGrade ?? undefined }
}
