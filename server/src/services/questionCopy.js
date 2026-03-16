import Question from '../models/Question.js';
import Session from '../models/Session.js';

function buildCopiedSessionOptions(sessionOptions) {
  if (sessionOptions == null) return undefined;
  if (typeof sessionOptions !== 'object') return undefined;

  const next = {};

  if (sessionOptions.points !== undefined) next.points = sessionOptions.points;
  if (sessionOptions.maxAttempts !== undefined) next.maxAttempts = sessionOptions.maxAttempts;
  if (Array.isArray(sessionOptions.attemptWeights)) next.attemptWeights = [...sessionOptions.attemptWeights];

  next.hidden = true;
  next.stats = false;
  next.correct = false;
  next.attempts = [];

  return next;
}

export async function copyQuestionToSession({
  sourceQuestion,
  targetSessionId,
  targetCourseId,
  userId,
  addToSession = true,
}) {
  if (!sourceQuestion) {
    throw new Error('Source question is required');
  }

  const sourceObject = sourceQuestion.toObject ? sourceQuestion.toObject() : sourceQuestion;
  const sourceQuestionId = String(sourceObject._id || sourceQuestion._id || '');
  const originalQuestionId = String(sourceObject.originalQuestion || sourceQuestionId);
  const originalCourseId = String(sourceObject.originalCourse || sourceObject.courseId || targetCourseId || '');
  const copiedPayload = { ...sourceObject };
  delete copiedPayload._id;
  delete copiedPayload.__v;
  delete copiedPayload.updatedAt;
  copiedPayload.sessionOptions = buildCopiedSessionOptions(sourceObject.sessionOptions);

  const copy = await Question.create({
    ...copiedPayload,
    creator: String(sourceObject.creator || userId),
    owner: userId,
    sessionId: targetSessionId,
    courseId: targetCourseId,
    originalQuestion: originalQuestionId,
    originalCourse: originalCourseId,
    createdAt: new Date(),
    lastEditedAt: new Date(),
    approved: true,
    studentCreated: !!sourceObject.studentCreated,
  });

  if (addToSession) {
    const session = await Session.findById(targetSessionId).lean();
    const nextQuestionIds = [...new Set([
      ...((session?.questions || []).map((questionId) => String(questionId))),
      String(copy._id),
    ])];

    await Session.findByIdAndUpdate(targetSessionId, {
      $set: { questions: nextQuestionIds },
    });
  }

  return copy;
}
