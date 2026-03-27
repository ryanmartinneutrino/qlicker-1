import Course from '../models/Course.js';

function normalizeUserId(userOrId) {
  if (!userOrId) return '';
  if (typeof userOrId === 'string') return String(userOrId).trim();
  return String(userOrId._id || userOrId.userId || '').trim();
}

export async function getUserAccessFlags(userOrId) {
  const userId = normalizeUserId(userOrId);
  if (!userId) {
    return { hasInstructorCourses: false };
  }

  const hasInstructorCourses = await Course.exists({ instructors: userId });
  return {
    hasInstructorCourses: !!hasInstructorCourses,
  };
}

