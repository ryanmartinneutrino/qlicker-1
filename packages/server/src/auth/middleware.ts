import type { Request, Response, NextFunction } from 'express'
import { getCourses } from '../collections/courses'
import { getSessions } from '../collections/sessions'
import { getGrades } from '../collections/grades'
import { getQuestions } from '../collections/questions'
import type { Course, Session, Question, User } from '@qlicker/shared'
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

function asOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readIdFromRequest(req: Request, name: string): string | null {
  const fromParams = asOptionalString((req.params as Record<string, unknown>)[name])
  if (fromParams) return fromParams
  const fromBody = asOptionalString((req.body as Record<string, unknown> | undefined)?.[name])
  if (fromBody) return fromBody
  const fromQuery = asOptionalString((req.query as Record<string, unknown> | undefined)?.[name])
  return fromQuery
}

export function isAdminUser(user: User | undefined): boolean {
  return Boolean(user?.profile.roles.includes(UserRole.admin))
}

export function isCourseInstructor(user: User | undefined, course: Course | null): boolean {
  if (!user || !course) return false
  if (isAdminUser(user)) return true
  return course.instructors?.includes(user._id ?? '') ?? false
}

export function isCourseStudent(user: User | undefined, course: Course | null): boolean {
  if (!user || !course) return false
  return course.students?.includes(user._id ?? '') ?? false
}

export function isCourseMember(user: User | undefined, course: Course | null): boolean {
  if (!user || !course) return false
  return isCourseInstructor(user, course) || isCourseStudent(user, course)
}

export async function getCourseById(courseId: string): Promise<Course | null> {
  const courses = getCourses()
  return courses.findOne({ _id: courseId } as Parameters<typeof courses.findOne>[0]) as Promise<Course | null>
}

export async function getSessionById(sessionId: string): Promise<Session | null> {
  const sessions = getSessions()
  return sessions.findOne({ _id: sessionId } as Parameters<typeof sessions.findOne>[0]) as Promise<Session | null>
}

export async function getQuestionById(questionId: string): Promise<Question | null> {
  const questions = getQuestions()
  return questions.findOne({ _id: questionId } as Parameters<typeof questions.findOne>[0]) as Promise<Question | null>
}

export async function resolveCourseFromRequest(req: Request): Promise<Course | null> {
  const directCourseId = readIdFromRequest(req, 'courseId')
  if (directCourseId) {
    return getCourseById(directCourseId)
  }

  const sessionId = readIdFromRequest(req, 'sessionId')
  if (sessionId) {
    const session = await getSessionById(sessionId)
    if (!session?.courseId) return null
    return getCourseById(session.courseId)
  }

  const questionId = readIdFromRequest(req, 'questionId')
  if (questionId) {
    const question = await getQuestionById(questionId)
    if (!question) return null
    if (question.courseId) return getCourseById(question.courseId)
    if (question.sessionId) {
      const session = await getSessionById(question.sessionId)
      if (session?.courseId) return getCourseById(session.courseId)
    }
    return null
  }

  const gradeId = readIdFromRequest(req, 'gradeId')
  if (gradeId) {
    const grade = await getGrades().findOne(
      { _id: gradeId } as Parameters<ReturnType<typeof getGrades>['findOne']>[0]
    )
    if (!grade?.courseId) return null
    return getCourseById(grade.courseId)
  }

  return null
}

/** Require membership in the request-scoped course */
export async function requireCourseMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.user as User | undefined
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' })
    return
  }
  try {
    const course = await resolveCourseFromRequest(req)
    if (!course) {
      res.status(404).json({ error: 'Course not found.' })
      return
    }
    if (!isCourseMember(user, course)) {
      res.status(403).json({ error: 'Forbidden.' })
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}

/** Require instructor membership in the request-scoped course (or admin) */
export async function requireCourseInstructorOrAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user as User | undefined
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' })
    return
  }
  try {
    const course = await resolveCourseFromRequest(req)
    if (!course) {
      res.status(404).json({ error: 'Course not found.' })
      return
    }
    if (!isCourseInstructor(user, course)) {
      res.status(403).json({ error: 'Forbidden.' })
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}

/** Require membership in the session's course */
export async function requireSessionMemberAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user as User | undefined
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' })
    return
  }
  try {
    const sessionId = readIdFromRequest(req, 'sessionId')
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required.' })
      return
    }
    const session = await getSessionById(sessionId)
    if (!session) {
      res.status(404).json({ error: 'Session not found.' })
      return
    }
    const course = await getCourseById(session.courseId)
    if (!course) {
      res.status(404).json({ error: 'Course not found.' })
      return
    }
    if (!isCourseMember(user, course)) {
      res.status(403).json({ error: 'Forbidden.' })
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}

/** Require access to a question via ownership or course membership */
export async function requireQuestionAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user as User | undefined
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' })
    return
  }
  try {
    const questionId = readIdFromRequest(req, 'questionId')
    if (!questionId) {
      res.status(400).json({ error: 'questionId required.' })
      return
    }
    const question = await getQuestionById(questionId)
    if (!question) {
      res.status(404).json({ error: 'Question not found.' })
      return
    }

    if (isAdminUser(user)) {
      next()
      return
    }

    const userId = user._id ?? ''
    const ownsQuestion =
      (question.creator && question.creator === userId) ||
      (question.owner && question.owner === userId)
    if (ownsQuestion) {
      next()
      return
    }

    let course: Course | null = null
    if (question.courseId) {
      course = await getCourseById(question.courseId)
    } else if (question.sessionId) {
      const session = await getSessionById(question.sessionId)
      if (session?.courseId) {
        course = await getCourseById(session.courseId)
      }
    }

    if (!course || !isCourseMember(user, course)) {
      res.status(403).json({ error: 'Forbidden.' })
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}

/** Backwards-compatible alias used across existing routes */
export const requireInstructor = requireCourseInstructorOrAdmin
