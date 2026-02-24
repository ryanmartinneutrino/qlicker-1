import type { Server as SocketIOServer, Socket } from 'socket.io'
import { getDB } from '../db'
import { SharedChangeStream } from './shared-streams'
import { getCourses } from '../collections/courses'
import { getSessions } from '../collections/sessions'
import { getQuestions } from '../collections/questions'
import { getUsers } from '../collections/users'
import type { User } from '@qlicker/shared'
import { UserRole } from '@qlicker/shared'

// One SharedChangeStream per collection
const streams: Record<string, SharedChangeStream> = {}

/** Extract authenticated user ID from socket session */
function getUserIdFromSocket(socket: Socket): string | undefined {
  return (socket.request as { session?: { passport?: { user?: string } } }).session?.passport?.user
}

function isAdmin(user: User): boolean {
  return user.profile.roles.includes(UserRole.admin)
}

async function loadSocketUser(socket: Socket): Promise<User | null> {
  const userId = getUserIdFromSocket(socket)
  if (!userId) return null
  return getUsers().findOne({ _id: userId } as Parameters<ReturnType<typeof getUsers>['findOne']>[0])
}

async function courseAccess(user: User, courseId?: string): Promise<{ canAccess: boolean; isInstructor: boolean }> {
  if (!courseId) return { canAccess: false, isInstructor: false }
  if (isAdmin(user)) return { canAccess: true, isInstructor: true }

  const course = await getCourses().findOne(
    { _id: courseId } as Parameters<ReturnType<typeof getCourses>['findOne']>[0],
    { projection: { owner: 1, instructors: 1, students: 1 } }
  )
  if (!course) return { canAccess: false, isInstructor: false }

  const userId = user._id ?? ''
  const instructor = Boolean(course.owner === userId || course.instructors?.includes(userId))
  const student = Boolean(course.students?.includes(userId))
  return { canAccess: instructor || student, isInstructor: instructor }
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
    const stream = new SharedChangeStream()
    streams[name] = stream

    const col = db.collection(name)
    const changeStream = col.watch([], { fullDocument: 'updateLookup' })
    changeStream.on('change', (event) => {
      const doc = (event as {
        fullDocument?: {
          _id?: unknown
          sessionId?: string
          courseId?: string
          questionId?: string
        }
      }).fullDocument

      // Collection-level wildcard
      stream.publish(`${name}:*`, event)

      if (!doc) {
        return
      }

      // Document-level routing
      if (doc._id) stream.publish(`${name}:${doc._id}`, event)
      // Parent-level routing
      if (doc.sessionId) stream.publish(`${name}:session:${doc.sessionId}`, event)
      if (doc.courseId) stream.publish(`${name}:course:${doc.courseId}`, event)
      if (doc.questionId) stream.publish(`${name}:question:${doc.questionId}`, event)
    })

    changeStream.on('error', (err) => {
      console.error(`Change stream error for ${name}:`, err)
    })
  }

  // Socket.IO connection handler
  io.on('connection', (socket: Socket) => {
    const unsubscribers: (() => void)[] = []

    /**
     * Subscribe to responses for a question.
     * Mirrors the responses.forQuestion publication in imports/api/responses.js.
     * Students see their own responses; if stats is enabled they see all but
     * without other students' IDs.
     */
    socket.on('subscribe:responses', async ({ questionId }: { questionId: string }) => {
      if (!questionId) return

      const user = await loadSocketUser(socket)
      if (!user) {
        socket.emit('error', { message: 'Not authenticated.' })
        return
      }

      const question = await getQuestions().findOne(
        { _id: questionId } as Parameters<ReturnType<typeof getQuestions>['findOne']>[0]
      )
      if (!question) return

      let sessionCourseId = question.courseId
      if (!sessionCourseId && question.sessionId) {
        const session = await getSessions().findOne(
          { _id: question.sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0],
          { projection: { courseId: 1 } }
        )
        sessionCourseId = session?.courseId
      }

      const access = await courseAccess(user, sessionCourseId)
      if (!access.canAccess && !isAdmin(user)) {
        socket.emit('error', { message: 'Forbidden.' })
        return
      }

      const userId = user._id || ''
      const unsub = streams.responses.subscribe(`responses:question:${questionId}`, (event) => {
        const doc = (event as { fullDocument?: { studentUserId?: string } }).fullDocument

        if (isAdmin(user) || access.isInstructor) {
          socket.emit('responses:change', event)
          return
        }

        const statsEnabled = question.sessionOptions?.stats ?? false
        if (statsEnabled) {
          if (doc?.studentUserId && doc.studentUserId !== userId) {
            const { studentUserId: _omit, ...docRest } = doc
            const sanitized = { ...event, fullDocument: docRest }
            socket.emit('responses:change', sanitized)
          } else {
            socket.emit('responses:change', event)
          }
          return
        }

        if (doc?.studentUserId === userId) {
          socket.emit('responses:change', event)
        }
      })
      unsubscribers.push(unsub)
    })

    /** Subscribe to session updates */
    socket.on('subscribe:session', async ({ sessionId }: { sessionId: string }) => {
      if (!sessionId) return

      const user = await loadSocketUser(socket)
      if (!user) return

      const session = await getSessions().findOne(
        { _id: sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0],
        { projection: { courseId: 1 } }
      )
      if (!session) return

      const access = await courseAccess(user, session.courseId)
      if (!access.canAccess && !isAdmin(user)) return

      const unsub = streams.sessions.subscribe(`sessions:${sessionId}`, (event) => {
        socket.emit('session:change', event)
      })
      unsubscribers.push(unsub)
    })

    /** Subscribe to question updates within a session */
    socket.on('subscribe:questions', async ({ sessionId }: { sessionId: string }) => {
      if (!sessionId) return

      const user = await loadSocketUser(socket)
      if (!user) return

      const session = await getSessions().findOne(
        { _id: sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0],
        { projection: { courseId: 1 } }
      )
      if (!session) return

      const access = await courseAccess(user, session.courseId)
      if (!access.canAccess && !isAdmin(user)) return

      const unsub = streams.questions.subscribe(`questions:session:${sessionId}`, (event) => {
        socket.emit('questions:change', event)
      })
      unsubscribers.push(unsub)
    })

    /** Subscribe to question updates within a course */
    socket.on('subscribe:questions-course', async ({ courseId }: { courseId: string }) => {
      if (!courseId) return

      const user = await loadSocketUser(socket)
      if (!user) return

      const access = await courseAccess(user, courseId)
      if (!access.canAccess && !isAdmin(user)) return

      const unsub = streams.questions.subscribe(`questions:course:${courseId}`, (event) => {
        socket.emit('questions:change', event)
      })
      unsubscribers.push(unsub)
    })

    /** Subscribe to session updates within a course */
    socket.on('subscribe:sessions', async ({ courseId }: { courseId: string }) => {
      if (!courseId) return

      const user = await loadSocketUser(socket)
      if (!user) return

      const access = await courseAccess(user, courseId)
      if (!access.canAccess && !isAdmin(user)) return

      const unsub = streams.sessions.subscribe(`sessions:course:${courseId}`, (event) => {
        socket.emit('sessions:change', event)
      })
      unsubscribers.push(unsub)
    })

    /** Subscribe to grade updates for a user */
    socket.on('subscribe:grades', async ({ userId: targetUserId }: { userId: string }) => {
      const user = await loadSocketUser(socket)
      if (!user || !targetUserId) return

      const own = user._id === targetUserId
      if (!own && !isAdmin(user)) return

      const unsub = streams.grades.subscribe('grades:*', (event) => {
        const doc = (event as { fullDocument?: { userId?: string } }).fullDocument
        if (doc?.userId === targetUserId) {
          socket.emit('grades:change', event)
        }
      })
      unsubscribers.push(unsub)
    })

    socket.on('disconnect', () => {
      unsubscribers.forEach((unsub) => unsub())
    })
  })
}
