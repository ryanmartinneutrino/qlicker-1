import Course from '../models/Course.js';

function normalizeUserId(userOrId) {
  if (!userOrId) return '';
  if (typeof userOrId === 'string') return String(userOrId).trim();
  return String(userOrId._id || userOrId.userId || '').trim();
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

export async function getUserAccessFlags(userOrId) {
  const userId = normalizeUserId(userOrId);
  if (!userId) {
    return { hasInstructorCourses: false };
  }

  const cached = getCachedFlag(userId);
  if (cached !== undefined) {
    return { hasInstructorCourses: cached };
  }

  const hasInstructorCourses = !!(await Course.exists({ instructors: userId }));
  setCachedFlag(userId, hasInstructorCourses);
  return { hasInstructorCourses };
}

