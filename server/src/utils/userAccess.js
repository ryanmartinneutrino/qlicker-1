import Course from '../models/Course.js';

function normalizeUserId(userOrId) {
  if (!userOrId) return '';
  if (typeof userOrId === 'string') return String(userOrId).trim();
  return String(userOrId._id || userOrId.userId || '').trim();
}

function getUserRoles(userOrId) {
  if (!userOrId || typeof userOrId === 'string') return [];
  return Array.isArray(userOrId.profile?.roles) ? userOrId.profile.roles : [];
}

function getUserCourseIds(userOrId) {
  if (!userOrId || typeof userOrId === 'string') return [];
  if (!Array.isArray(userOrId.profile?.courses)) return [];
  return userOrId.profile.courses
    .map((courseId) => String(courseId || '').trim())
    .filter(Boolean);
}

/*
 * Short-lived in-memory cache for the instructor flag.
 * Avoids a Course.exists() DB roundtrip on every GET /me and every
 * user-sanitisation call while still reflecting changes within a few
 * seconds.  Entries auto-expire after CACHE_TTL_MS.
 */
const CACHE_TTL_MS = 30_000;
const instructorCache = new Map();

function getCachedFlag(userId) {
  const entry = instructorCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    instructorCache.delete(userId);
    return undefined;
  }
  return entry.value;
}

function setCachedFlag(userId, value) {
  instructorCache.set(userId, { value, ts: Date.now() });
}

export function invalidateAccessCache(userId) {
  const id = normalizeUserId(userId);
  if (id) instructorCache.delete(id);
}

export async function getUserAccessFlags(userOrId, options = {}) {
  const userId = normalizeUserId(userOrId);
  const roles = getUserRoles(userOrId);
  const courseIds = getUserCourseIds(userOrId);
  const canAccessProfessorDashboard = roles.includes('professor');
  const forceInstructorLookup = options.forceInstructorLookup === true;
  const mayNeedInstructorCourseLookup = forceInstructorLookup
    || roles.includes('professor')
    || roles.includes('admin')
    || courseIds.length > 0;

  if (!userId) {
    return {
      hasInstructorCourses: false,
      canAccessProfessorDashboard,
    };
  }

  if (!mayNeedInstructorCourseLookup) {
    return {
      hasInstructorCourses: false,
      canAccessProfessorDashboard,
    };
  }

  const cached = getCachedFlag(userId);
  if (cached !== undefined) {
    return {
      hasInstructorCourses: cached,
      canAccessProfessorDashboard,
    };
  }

  const instructorFilter = { instructors: userId };
  if (!forceInstructorLookup && courseIds.length > 0) {
    instructorFilter._id = { $in: courseIds };
  }

  const hasInstructorCourses = !!(await Course.exists(instructorFilter));
  setCachedFlag(userId, hasInstructorCourses);
  return {
    hasInstructorCourses,
    canAccessProfessorDashboard,
  };
}
