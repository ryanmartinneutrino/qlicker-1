import type { Server as SocketIOServer, Socket } from 'socket.io'
import { getDB } from '../db'
import { SharedChangeStream } from './shared-streams'
import { getSessions } from '../collections/sessions'
import { getQuestions } from '../collections/questions'
import { getUsers } from '../collections/users'
import type { User } from '@qlicker/shared'
import { courseAccessForUser, isAdmin } from '../auth/course-access'

// One SharedChangeStream per collection
const streams: Record<string, SharedChangeStream> = {}

/** Extract authenticated user ID from socket session */
function getUserIdFromSocket(socket: Socket): string | undefined {
  return (socket.request as { session?: { passport?: { user?: string } } }).session?.passport?.user
}

async function loadSocketUser(socket: Socket): Promise<User | null> {
  const userId = getUserIdFromSocket(socket)
  if (!userId) return null
  return getUsers().findOne({ _id: userId } as Parameters<ReturnType<typeof getUsers>['findOne']>[0])
}

function sanitizeQuestionForStudent(question: Record<string, unknown>): Record<string, unknown> {
  const options = Array.isArray(question.options)
    ? question.options.map((option) => {
        if (!option || typeof option !== 'object') return option
        const { correct: _omit, ...rest } = option as Record<string, unknown>
        return rest
      })
    : question.options

  const sanitized: Record<string, unknown> = { ...question, options }
  delete sanitized.correctNumerical
  return sanitized
}

function stripFullDocument(event: Record<string, unknown>): Record<string, unknown> {
  const { fullDocument: _omit, ...rest } = event
  return rest
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

      const docKey = (event as { documentKey?: { _id?: unknown } }).documentKey
      const routingKeys = new Set<string>([`${name}:*`])
      if (doc?._id) routingKeys.add(`${name}:${doc._id}`)
      if (!doc?._id && docKey?._id) routingKeys.add(`${name}:${docKey._id}`)
      if (doc?.sessionId) routingKeys.add(`${name}:session:${doc.sessionId}`)
      if (doc?.courseId) routingKeys.add(`${name}:course:${doc.courseId}`)
      if (doc?.questionId) routingKeys.add(`${name}:question:${doc.questionId}`)
      routingKeys.forEach((routingKey) => stream.publish(routingKey, event))
    })

    changeStream.on('error', (err) => {
      console.error(`Change stream error for ${name}:`, err)
    })
  }

  // Socket.IO connection handler
  io.on('connection', (socket: Socket) => {
    const activeSubscriptions = new Map<string, () => void>()

    const registerSubscription = (key: string, subscribe: () => () => void) => {
      const existing = activeSubscriptions.get(key)
      if (existing) {
        existing()
        activeSubscriptions.delete(key)
      }
      const unsubscribe = subscribe()
      activeSubscriptions.set(key, unsubscribe)
    }

    const removeSubscription = (key: string) => {
      const existing = activeSubscriptions.get(key)
      if (!existing) return
      existing()
      activeSubscriptions.delete(key)
    }

    const removeAllSubscriptions = () => {
      activeSubscriptions.forEach((unsubscribe) => unsubscribe())
      activeSubscriptions.clear()
    }

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

      const access = await courseAccessForUser(user, sessionCourseId)
      if (!access.canAccess && !isAdmin(user)) {
        socket.emit('error', { message: 'Forbidden.' })
        return
      }

      const userId = user._id || ''
      registerSubscription(`responses:${questionId}`, () =>
        streams.responses.subscribe(`responses:question:${questionId}`, (event) => {
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
      )
    })

    socket.on('unsubscribe:responses', ({ questionId }: { questionId: string }) => {
      if (!questionId) return
      removeSubscription(`responses:${questionId}`)
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

      const access = await courseAccessForUser(user, session.courseId)
      if (!access.canAccess && !isAdmin(user)) return

      registerSubscription(`session:${sessionId}`, () =>
        streams.sessions.subscribe(`sessions:${sessionId}`, (event) => {
          socket.emit('session:change', event)
        })
      )
    })

    socket.on('unsubscribe:session', ({ sessionId }: { sessionId: string }) => {
      if (!sessionId) return
      removeSubscription(`session:${sessionId}`)
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

      const access = await courseAccessForUser(user, session.courseId)
      if (!access.canAccess && !isAdmin(user)) return

      registerSubscription(`questions:session:${sessionId}`, () =>
        streams.questions.subscribe(`questions:session:${sessionId}`, async (event) => {
          const rawEvent = event as unknown as Record<string, unknown>
          if (isAdmin(user) || access.isInstructor) {
            socket.emit('questions:change', rawEvent)
            return
          }

          const question = rawEvent.fullDocument as Record<string, unknown> | undefined
          if (!question) {
            socket.emit('questions:change', stripFullDocument(rawEvent))
            return
          }

          let revealCorrect = Boolean(
            (question.sessionOptions as { correct?: boolean } | undefined)?.correct
          )
          if (!revealCorrect) {
            const latestSession = await getSessions().findOne(
              { _id: sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0],
              { projection: { practiceQuiz: 1 } }
            )
            revealCorrect = Boolean(latestSession?.practiceQuiz)
          }

          if (revealCorrect) {
            socket.emit('questions:change', rawEvent)
            return
          }

          socket.emit('questions:change', {
            ...rawEvent,
            fullDocument: sanitizeQuestionForStudent(question),
          })
        })
      )
    })

    socket.on('unsubscribe:questions', ({ sessionId }: { sessionId: string }) => {
      if (!sessionId) return
      removeSubscription(`questions:session:${sessionId}`)
    })

    /** Subscribe to question updates within a course */
    socket.on('subscribe:questions-course', async ({ courseId }: { courseId: string }) => {
      if (!courseId) return

      const user = await loadSocketUser(socket)
      if (!user) return

      const access = await courseAccessForUser(user, courseId)
      if (!access.canAccess && !isAdmin(user)) return

      registerSubscription(`questions:course:${courseId}`, () =>
        streams.questions.subscribe(`questions:course:${courseId}`, (event) => {
          const rawEvent = event as unknown as Record<string, unknown>
          if (isAdmin(user) || access.isInstructor) {
            socket.emit('questions:change', rawEvent)
            return
          }
          // Student course-library views use role-filtered REST queries; emit invalidation only.
          socket.emit('questions:change', stripFullDocument(rawEvent))
        })
      )
    })

    socket.on('unsubscribe:questions-course', ({ courseId }: { courseId: string }) => {
      if (!courseId) return
      removeSubscription(`questions:course:${courseId}`)
    })

    /** Subscribe to session updates within a course */
    socket.on('subscribe:sessions', async ({ courseId }: { courseId: string }) => {
      if (!courseId) return

      const user = await loadSocketUser(socket)
      if (!user) return

      const access = await courseAccessForUser(user, courseId)
      if (!access.canAccess && !isAdmin(user)) return

      registerSubscription(`sessions:course:${courseId}`, () =>
        streams.sessions.subscribe(`sessions:course:${courseId}`, (event) => {
          socket.emit('sessions:change', event)
        })
      )
    })

    socket.on('unsubscribe:sessions', ({ courseId }: { courseId: string }) => {
      if (!courseId) return
      removeSubscription(`sessions:course:${courseId}`)
    })

    /** Subscribe to grade updates for a user */
    socket.on('subscribe:grades', async ({ userId: targetUserId }: { userId: string }) => {
      const user = await loadSocketUser(socket)
      if (!user || !targetUserId) return

      const own = user._id === targetUserId
      if (!own && !isAdmin(user)) return

      registerSubscription(`grades:${targetUserId}`, () =>
        streams.grades.subscribe('grades:*', (event) => {
          const doc = (event as { fullDocument?: { userId?: string } }).fullDocument
          if (doc?.userId === targetUserId) {
            socket.emit('grades:change', event)
          }
        })
      )
    })

    socket.on('unsubscribe:grades', ({ userId: targetUserId }: { userId: string }) => {
      if (!targetUserId) return
      removeSubscription(`grades:${targetUserId}`)
    })

    socket.on('disconnect', () => {
      removeAllSubscriptions()
    })
  })
}
