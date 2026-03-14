import Question from '../models/Question.js';
import Session from '../models/Session.js';
import { buildActivitiesFromQuestions } from './activities.js';

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
    const session = await Session.findById(targetSessionId).lean();
    const nextQuestionIds = [...new Set([
      ...((session?.questions || []).map((questionId) => String(questionId))),
      String(copy._id),
    ])];
    const sessionQuestionDocs = await Question.find({ _id: { $in: nextQuestionIds } })
      .select('_id type')
      .lean();
    const sessionQuestionMap = new Map(
      sessionQuestionDocs.map((question) => [String(question._id), question])
    );
    const nextActivities = buildActivitiesFromQuestions(nextQuestionIds, sessionQuestionMap);

    await Session.findByIdAndUpdate(targetSessionId, {
      $set: { questions: nextQuestionIds, activities: nextActivities },
    });
  }

  return copy;
}
