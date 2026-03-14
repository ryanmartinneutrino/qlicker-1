import { isSlideType, normalizeQuestionType } from '../components/questions/constants';

/**
 * Canonical activity-type constants.
 * Must stay in sync with server/src/services/activities.js.
 */
export const ACTIVITY_TYPES = {
  QUESTION: 'question',
  SLIDE: 'slide',
};

/**
 * Determine the activity type for a question document.
 */
export function classifyQuestionAsActivity(question) {
  if (!question) return ACTIVITY_TYPES.QUESTION;
  return isSlideType(normalizeQuestionType(question))
    ? ACTIVITY_TYPES.SLIDE
    : ACTIVITY_TYPES.QUESTION;
}

/**
 * Return the authoritative activity sequence for a session.
 *
 * - Uses `session.activities` when present (new-style session).
 * - Falls back to building from `session.questions` + loaded question docs
 *   for legacy sessions that lack an `activities` array.
 *
 * @param {Object}  session   – session object from API
 * @param {Array}   questions – loaded question docs (needed only for legacy fallback)
 * @returns {Array<{activityType: string, activityId: string}>}
 */
export function getSessionActivities(session, questions = []) {
  if (Array.isArray(session?.activities) && session.activities.length > 0) {
    return session.activities;
  }
  const questionMap = new Map(
    (questions || []).map((q) => [String(q._id), q])
  );
  return (session?.questions || []).map((id) => ({
    activityType: classifyQuestionAsActivity(questionMap.get(String(id))),
    activityId: String(id),
  }));
}

/**
 * Extract a flat ordered list of activity IDs from an activities array.
 */
export function getActivityIds(activities) {
  return (activities || []).map((a) => a.activityId);
}

export function isQuestionActivity(activity) {
  return activity?.activityType === ACTIVITY_TYPES.QUESTION;
}

export function isSlideActivity(activity) {
  return activity?.activityType === ACTIVITY_TYPES.SLIDE;
}

/**
 * Find the index of an activity by its ID within an activities array.
 */
export function findActivityIndex(activities, activityId) {
  return (activities || []).findIndex((a) => a.activityId === activityId);
}
