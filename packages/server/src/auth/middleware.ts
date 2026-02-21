import type { Request, Response, NextFunction } from 'express'
import { getCourses } from '../collections/courses'
import type { User } from '@qlicker/shared'
import { UserRole } from '@qlicker/shared'

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
  const courseId = req.params.courseId || req.body.courseId

  if (!user) {
    res.status(401).json({ error: 'Authentication required.' })
    return
  }

  if (user.profile.roles.includes(UserRole.admin)) {
    next()
    return
  }

  if (!courseId) {
    res.status(400).json({ error: 'courseId required.' })
    return
  }

  try {
    const courses = getCourses()
    const course = await courses.findOne({ _id: courseId } as Parameters<typeof courses.findOne>[0])
    if (!course) {
      res.status(404).json({ error: 'Course not found.' })
      return
    }

    const isInstructor = course.instructors?.includes(user._id ?? '') ?? false
    if (!isInstructor) {
      res.status(403).json({ error: 'Forbidden.' })
      return
    }

    next()
  } catch (err) {
    next(err)
  }
}
