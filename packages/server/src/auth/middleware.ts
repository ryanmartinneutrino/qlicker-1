import type { Request, Response, NextFunction } from 'express'
import type { User } from '@qlicker/shared'
import { UserRole } from '@qlicker/shared'
import {
  courseAccessForUser,
  isAdmin,
  resolveCourseIdFromGrade,
  resolveCourseIdFromQuestion,
  resolveCourseIdFromResponse,
  resolveCourseIdFromSession,
} from './course-access'

/** Require authenticated session */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) {
    next()
  } else {
    res.status(401).json({ error: 'Authentication required.' })
  }
}

/** Require user to have the given role */
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user as User | undefined
    if (!user || !user.profile.roles.includes(role)) {
      res.status(403).json({ error: 'Forbidden.' })
      return
    }
    next()
  }
}

/** Require admin role */
export const requireAdmin = requireRole(UserRole.admin)

/** Require professor or admin role */
export const requireProfOrAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const user = req.user as User | undefined
  if (
    !user ||
    (!user.profile.roles.includes(UserRole.prof) &&
      !user.profile.roles.includes(UserRole.admin))
  ) {
    res.status(403).json({ error: 'Forbidden.' })
    return
  }
  next()
}

/** Require user to be an instructor of the given course (param: courseId) */
export async function requireInstructor(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user as User | undefined

  if (!user) {
    res.status(401).json({ error: 'Authentication required.' })
    return
  }

  if (isAdmin(user)) {
    next()
    return
  }

  try {
    let courseId = req.params.courseId || req.body?.courseId
    if (!courseId) courseId = await resolveCourseIdFromSession(req.params.sessionId)
    if (!courseId) courseId = await resolveCourseIdFromGrade(req.params.gradeId)
    if (!courseId) courseId = await resolveCourseIdFromQuestion(req.params.questionId)
    if (!courseId) courseId = await resolveCourseIdFromResponse(req.params.responseId)

    if (!courseId) {
      res.status(400).json({ error: 'courseId required.' })
      return
    }

    const access = await courseAccessForUser(user, courseId)
    if (!access.exists) {
      res.status(404).json({ error: 'Course not found.' })
      return
    }

    if (!access.canManage) {
      res.status(403).json({ error: 'Forbidden.' })
      return
    }

    next()
  } catch (err) {
    next(err)
  }
}
