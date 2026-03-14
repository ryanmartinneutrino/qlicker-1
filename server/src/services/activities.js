import { isSlideQuestion } from './grading.js';

/**
 * Canonical activity-type constants.
 * Extend this object when adding new activity kinds to sessions.
 */
export const ACTIVITY_TYPES = {
  QUESTION: 'question',
  SLIDE: 'slide',
};

function normalizeId(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function hasCompleteActivities(session) {
  const questionIds = Array.isArray(session?.questions)
    ? session.questions.map((questionId) => normalizeId(questionId))
    : [];
  const activities = Array.isArray(session?.activities) ? session.activities : [];

  if (activities.length === 0) return false;
  if (activities.length !== questionIds.length) return false;

  return activities.every((activity, index) => (
    normalizeId(activity?.activityId) === questionIds[index]
  ));
}

/**
 * Determine the activity type for a question document.
 * Slides (type 6) map to ACTIVITY_TYPES.SLIDE; everything else maps to QUESTION.
 */
export function classifyQuestionAsActivity(question) {
  if (!question) return ACTIVITY_TYPES.QUESTION;
  return isSlideQuestion(question) ? ACTIVITY_TYPES.SLIDE : ACTIVITY_TYPES.QUESTION;
}

/**
 * Build an ordered activities array from a list of question IDs and a
 * Map<stringId, questionDoc>.  Used for legacy sessions that only have a
 * `questions` array and no `activities` field yet.
 */
export function buildActivitiesFromQuestions(questionIds, questionsMap) {
  return (questionIds || []).map((id) => ({
    activityType: classifyQuestionAsActivity(questionsMap?.get(String(id))),
    activityId: String(id),
  }));
}

/**
 * Return the authoritative activity sequence for a session.
 *
 * - If `session.activities` is populated (new-style session), return it as-is.
 * - Otherwise build the sequence on the fly from `session.questions` plus the
 *   provided `questionsMap` so that legacy sessions work transparently.
 *
 * @param {Object} session   – session document (plain object or Mongoose doc)
 * @param {Map}    questionsMap – Map<stringId, questionDoc> (needed only for legacy fallback)
 */
export function getSessionActivities(session, questionsMap = new Map()) {
  if (hasCompleteActivities(session)) {
    return session.activities;
  }
  return buildActivitiesFromQuestions(session?.questions || [], questionsMap);
}

/**
 * Extract a flat ordered list of activity IDs from an activities array.
 * Useful when code needs to fall back to the legacy `questions`-style flat list.
 */
export function getActivityIds(activities) {
  return (activities || [])
    .map((activity) => normalizeId(activity?.activityId))
    .filter(Boolean);
}
