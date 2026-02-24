import type { User } from '@qlicker/shared'
import { UserRole } from '@qlicker/shared'
import { getCourses } from '../collections/courses'
import { getGrades } from '../collections/grades'
import { getQuestions } from '../collections/questions'
import { getResponses } from '../collections/responses'
import { getSessions } from '../collections/sessions'

export interface CourseAccess {
  exists: boolean
  canAccess: boolean
  canManage: boolean
  isInstructor: boolean
  isStudent: boolean
}

export function isAdmin(user: User): boolean {
  return user.profile.roles.includes(UserRole.admin)
}

export function isProfessor(user: User): boolean {
  return user.profile.roles.includes(UserRole.prof)
}

export async function resolveCourseIdFromSession(sessionId?: string): Promise<string | undefined> {
  if (!sessionId) return undefined
  const session = await getSessions().findOne(
    { _id: sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0],
    { projection: { courseId: 1 } }
  )
  return session?.courseId
}

export async function resolveCourseIdFromQuestion(questionId?: string): Promise<string | undefined> {
  if (!questionId) return undefined
  const question = await getQuestions().findOne(
    { _id: questionId } as Parameters<ReturnType<typeof getQuestions>['findOne']>[0],
    { projection: { courseId: 1, sessionId: 1 } }
  )
  if (!question) return undefined
  if (question.courseId) return question.courseId
  return resolveCourseIdFromSession(question.sessionId)
}

export async function resolveCourseIdFromGrade(gradeId?: string): Promise<string | undefined> {
  if (!gradeId) return undefined
  const grade = await getGrades().findOne(
    { _id: gradeId } as Parameters<ReturnType<typeof getGrades>['findOne']>[0],
    { projection: { courseId: 1, sessionId: 1 } }
  )
  if (!grade) return undefined
  if (grade.courseId) return grade.courseId
  return resolveCourseIdFromSession(grade.sessionId)
}

export async function resolveCourseIdFromResponse(responseId?: string): Promise<string | undefined> {
  if (!responseId) return undefined
  const response = await getResponses().findOne(
    { _id: responseId } as Parameters<ReturnType<typeof getResponses>['findOne']>[0],
    { projection: { questionId: 1 } }
  )
  if (!response) return undefined
  return resolveCourseIdFromQuestion(response.questionId)
}

export async function courseAccessForUser(user: User, courseId?: string): Promise<CourseAccess> {
  if (!courseId) {
    return {
      exists: false,
      canAccess: false,
      canManage: false,
      isInstructor: false,
      isStudent: false,
    }
  }

  if (isAdmin(user)) {
    return {
      exists: true,
      canAccess: true,
      canManage: true,
      isInstructor: true,
      isStudent: true,
    }
  }

  const course = await getCourses().findOne(
    { _id: courseId } as Parameters<ReturnType<typeof getCourses>['findOne']>[0],
    { projection: { owner: 1, instructors: 1, students: 1 } }
  )
  if (!course) {
    return {
      exists: false,
      canAccess: false,
      canManage: false,
      isInstructor: false,
      isStudent: false,
    }
  }

  const userId = user._id ?? ''
  const isOwner = course.owner === userId
  const inInstructors = Boolean(course.instructors?.includes(userId))
  const inStudents = Boolean(course.students?.includes(userId))
  const isInstructor = isOwner || inInstructors

  return {
    exists: true,
    canAccess: isInstructor || inStudents,
    canManage: isInstructor,
    isInstructor,
    isStudent: inStudents,
  }
}

export async function canUserAccessCourse(user: User, courseId?: string): Promise<boolean> {
  const access = await courseAccessForUser(user, courseId)
  return access.canAccess
}

export async function canUserManageCourse(user: User, courseId?: string): Promise<boolean> {
  const access = await courseAccessForUser(user, courseId)
  return access.canManage
}
