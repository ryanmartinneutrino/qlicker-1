import type { Server as SocketIOServer, Socket } from 'socket.io'
import { getDB } from '../db'
import { SharedChangeStream } from './shared-streams'
import { getQuestions } from '../collections/questions'
import { getUsers } from '../collections/users'
import {
  getCourseById,
  getSessionById,
  isAdminUser,
  isCourseInstructor,
  isCourseMember,
} from '../auth/middleware'
import type { User } from '@qlicker/shared'

// One SharedChangeStream per collection
const streams: Record<string, SharedChangeStream> = {}

/** Extract authenticated user ID from socket session */
function getUserIdFromSocket(socket: Socket): string | undefined {
  const req = socket.request as {
    user?: { _id?: string }
    session?: { passport?: { user?: string } }
  }
  if (typeof req.user?._id === 'string' && req.user._id.length > 0) return req.user._id
  return req.session?.passport?.user
}

/**
 * Initialize Socket.IO + MongoDB Change Streams.
 *
 * Architecture:
 * - One MongoDB Change Stream per collection (fan-out via EventEmitter).
 * - Clients subscribe to specific routing keys (e.g., "session:<id>").
 * - Proper authorization checks on each subscription.
 * - Change Stream events are routed to only the relevant clients.
 *
 * Requires MongoDB replica set (already required per Docker deployment).
 */
export function setupRealtime(io: SocketIOServer): void {
  const db = getDB()
  const collectionNames = ['courses', 'sessions', 'questions', 'responses', 'grades']

  // Start one Change Stream per collection
  for (const name of collectionNames) {
    const stream = new SharedChangeStream(name)
    streams[name] = stream

    const col = db.collection(name)
    const changeStream = col.watch([], { fullDocument: 'updateLookup' })
    changeStream.on('change', (event) => {
      // Collection-level wildcard
      stream.publish(`${name}:*`, event)
      // Route to appropriate keys
      const typedEvent = event as {
        fullDocument?: {
          _id?: unknown
          sessionId?: string
          courseId?: string
          questionId?: string
        }
        documentKey?: { _id?: unknown }
      }
      const doc = typedEvent.fullDocument
      const docId = doc?._id || typedEvent.documentKey?._id
      if (docId) stream.publish(`${name}:${docId}`, event)
      // Document-level routing
      // Parent-level routing
      if (doc?.sessionId) stream.publish(`${name}:session:${doc.sessionId}`, event)
      if (doc?.courseId) stream.publish(`${name}:course:${doc.courseId}`, event)
      if (doc?.questionId) stream.publish(`${name}:question:${doc.questionId}`, event)
    })

    changeStream.on('error', (err) => {
      console.error(`Change stream error for ${name}:`, err)
    })
  }

  // Socket.IO connection handler
  io.on('connection', (socket: Socket) => {
    const unsubscribers: (() => void)[] = []
    let socketUser: User | null | undefined

    async function getSocketUser(): Promise<User | null> {
      if (socketUser !== undefined) return socketUser
      const userId = getUserIdFromSocket(socket)
      if (!userId) {
        socketUser = null
        return socketUser
      }
      socketUser = (await getUsers().findOne({
        _id: userId,
      } as Parameters<ReturnType<typeof getUsers>['findOne']>[0])) as User | null
      return socketUser
    }

    async function requireSocketUser(): Promise<User | null> {
      const user = await getSocketUser()
      if (user) return user
      socket.emit('subscription:error', { message: 'Not authenticated.' })
      return null
    }

    async function requireCourseAccess(
      courseId: string,
      mode: 'member' | 'instructor'
    ): Promise<{ user: User; isInstructor: boolean } | null> {
      const user = await requireSocketUser()
      if (!user) return null
      const course = await getCourseById(courseId)
      if (!course) {
        socket.emit('subscription:error', { message: 'Course not found.' })
        return null
      }
      const instructor = isCourseInstructor(user, course)
      if (mode === 'instructor' && !instructor) {
        socket.emit('subscription:error', { message: 'Forbidden.' })
        return null
      }
      if (mode === 'member' && !isCourseMember(user, course)) {
        socket.emit('subscription:error', { message: 'Forbidden.' })
        return null
      }
      return { user, isInstructor: instructor }
    }

    /**
     * Subscribe to responses for a question.
     * Mirrors the responses.forQuestion publication in imports/api/responses.js.
     * Students see their own responses; if stats is enabled they see all but
     * without other students' IDs.
     */
    socket.on('subscribe:responses', async ({ questionId }: { questionId: string }) => {
      if (!questionId) return

      const user = await requireSocketUser()
      if (!user) return
      const userId = user._id ?? ''

      const question = await getQuestions().findOne({ _id: questionId } as Parameters<ReturnType<typeof getQuestions>['findOne']>[0])
      if (!question) return

      let isInstructor = false
      let isMember = false
      if (question.sessionId) {
        const session = await getSessionById(question.sessionId)
        if (session) {
          const course = await getCourseById(session.courseId)
          if (course) {
            isInstructor = isCourseInstructor(user, course)
            isMember = isCourseMember(user, course)
          }
        }
      } else if (question.courseId) {
        const course = await getCourseById(question.courseId)
        if (course) {
          isInstructor = isCourseInstructor(user, course)
          isMember = isCourseMember(user, course)
        }
      } else if (question.creator === userId || question.owner === userId) {
        isMember = true
      }

      if (!isMember && !isAdminUser(user)) {
        socket.emit('subscription:error', { message: 'Forbidden.' })
        return
      }

      const unsub = streams['responses'].subscribe(
        `responses:question:${questionId}`,
        (event) => {
          const doc = (event as { fullDocument?: { studentUserId?: string } }).fullDocument
          if (isInstructor) {
            socket.emit('responses:change', event)
          } else {
            const statsEnabled = question.sessionOptions?.stats ?? false
            if (!doc) {
              socket.emit('responses:change', event)
              return
            }
            if (statsEnabled) {
              // Omit studentUserId for other students (use destructuring, not undefined assignment)
              if (doc?.studentUserId && doc.studentUserId !== userId) {
                const { studentUserId: _omit, ...docRest } = doc
                const sanitized = { ...event, fullDocument: docRest }
                socket.emit('responses:change', sanitized)
              } else {
                socket.emit('responses:change', event)
              }
            } else if (doc?.studentUserId === userId) {
              socket.emit('responses:change', event)
            }
          }
        }
      )
      unsubscribers.push(unsub)
    })

    /** Subscribe to session updates */
    socket.on('subscribe:session', async ({ sessionId }: { sessionId: string }) => {
      if (!sessionId) return
      const session = await getSessionById(sessionId)
      if (!session) {
        socket.emit('subscription:error', { message: 'Session not found.' })
        return
      }
      const access = await requireCourseAccess(session.courseId, 'member')
      if (!access) return

      const unsub = streams['sessions'].subscribe(`sessions:${sessionId}`, (event) => {
        socket.emit('session:change', event)
      })
      unsubscribers.push(unsub)
    })

    /** Subscribe to question updates within a session */
    socket.on('subscribe:questions', async ({ sessionId }: { sessionId: string }) => {
      if (!sessionId) return
      const session = await getSessionById(sessionId)
      if (!session) {
        socket.emit('subscription:error', { message: 'Session not found.' })
        return
      }
      const access = await requireCourseAccess(session.courseId, 'member')
      if (!access) return

      const unsub = streams['questions'].subscribe(`questions:session:${sessionId}`, (event) => {
        socket.emit('questions:change', event)
      })
      unsubscribers.push(unsub)
      const deleteUnsub = streams['questions'].subscribe('questions:*', (event) => {
        if ((event as { operationType?: string }).operationType === 'delete') {
          socket.emit('questions:change', event)
        }
      })
      unsubscribers.push(deleteUnsub)
    })

    /** Subscribe to question updates within a course */
    socket.on('subscribe:questions-course', async ({ courseId }: { courseId: string }) => {
      if (!courseId) return
      const access = await requireCourseAccess(courseId, 'member')
      if (!access) return

      const unsub = streams['questions'].subscribe(`questions:course:${courseId}`, (event) => {
        socket.emit('questions:change', event)
      })
      unsubscribers.push(unsub)
      const deleteUnsub = streams['questions'].subscribe('questions:*', (event) => {
        if ((event as { operationType?: string }).operationType === 'delete') {
          socket.emit('questions:change', event)
        }
      })
      unsubscribers.push(deleteUnsub)
    })

    /** Subscribe to session updates within a course */
    socket.on('subscribe:sessions', async ({ courseId }: { courseId: string }) => {
      if (!courseId) return
      const access = await requireCourseAccess(courseId, 'member')
      if (!access) return

      const unsub = streams['sessions'].subscribe(`sessions:course:${courseId}`, (event) => {
        socket.emit('sessions:change', event)
      })
      unsubscribers.push(unsub)
      const deleteUnsub = streams['sessions'].subscribe('sessions:*', (event) => {
        if ((event as { operationType?: string }).operationType === 'delete') {
          socket.emit('sessions:change', event)
        }
      })
      unsubscribers.push(deleteUnsub)
    })

    /** Subscribe to grade updates for a user */
    socket.on('subscribe:grades', async ({ userId: targetUserId, courseId }: { userId: string; courseId?: string }) => {
      const requestingUser = await requireSocketUser()
      if (!requestingUser) return
      const requestingUserId = requestingUser._id ?? ''

      let canViewAll = isAdminUser(requestingUser)
      if (!canViewAll && targetUserId !== requestingUserId) {
        if (!courseId) {
          socket.emit('subscription:error', { message: 'Forbidden.' })
          return
        }
        const access = await requireCourseAccess(courseId, 'instructor')
        if (!access) return
        canViewAll = true
      }

      const unsub = streams['grades'].subscribe(`grades:*`, (event) => {
        const doc = (event as { fullDocument?: { userId?: string; visibleToStudents?: boolean; courseId?: string } }).fullDocument
        if (!doc) {
          socket.emit('grades:change', event)
          return
        }
        if (doc?.userId === targetUserId) {
          if (courseId && doc.courseId !== courseId) return
          if (!canViewAll && !doc.visibleToStudents) return
          socket.emit('grades:change', event)
        }
      })
      unsubscribers.push(unsub)
    })

    // Unsubscribe from all on disconnect
    socket.on('disconnect', () => {
      unsubscribers.forEach((unsub) => unsub())
    })
  })
}
