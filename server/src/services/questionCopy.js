import Question from '../models/Question.js';
import Session from '../models/Session.js';

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
  const originalQuestionId = String(sourceObject._id || sourceQuestion._id || '');
  const copiedPayload = { ...sourceObject };
  delete copiedPayload._id;
  delete copiedPayload.__v;
  delete copiedPayload.updatedAt;

  const copy = await Question.create({
    ...copiedPayload,
    creator: userId,
    owner: userId,
    sessionId: targetSessionId,
    courseId: targetCourseId,
    originalQuestion: originalQuestionId,
    createdAt: new Date(),
  });

  if (addToSession) {
    await Session.findByIdAndUpdate(targetSessionId, {
      $addToSet: { questions: copy._id },
    });
  }

  return copy;
}
