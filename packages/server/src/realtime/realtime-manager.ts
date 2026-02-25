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
const routeHintCacheByCollection: Record<string, Map<string, RouteHints>> = {}

type RouteHints = {
  sessionId?: string
  courseId?: string
  questionId?: string
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.floor(parsed)
}

const routeHintCacheMax = toPositiveInt(process.env.QCLICKER_REALTIME_ROUTE_CACHE_MAX, 50_000)

type SubscriptionErrorCode = 'bad_request' | 'not_authenticated' | 'not_found' | 'forbidden'

function asNonEmptyId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function getRouteHintCache(collectionName: string): Map<string, RouteHints> {
  if (!routeHintCacheByCollection[collectionName]) {
    routeHintCacheByCollection[collectionName] = new Map<string, RouteHints>()
  }
  return routeHintCacheByCollection[collectionName]
}

function trimRouteHintCache(cache: Map<string, RouteHints>): void {
  while (cache.size > routeHintCacheMax) {
    const oldest = cache.keys().next().value
    if (!oldest) break
    cache.delete(oldest)
  }
}

function writeRouteHints(collectionName: string, documentId: string, hints: RouteHints): void {
  const cache = getRouteHintCache(collectionName)
  if (cache.has(documentId)) cache.delete(documentId)
  cache.set(documentId, hints)
  trimRouteHintCache(cache)
}

function readRouteHints(collectionName: string, documentId: string): RouteHints | undefined {
  const cache = routeHintCacheByCollection[collectionName]
  return cache?.get(documentId)
}

function deleteRouteHints(collectionName: string, documentId: string): void {
  const cache = routeHintCacheByCollection[collectionName]
  if (!cache) return
  cache.delete(documentId)
}

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

function emitSubscriptionError(
  socket: Socket,
  event: string,
  code: SubscriptionErrorCode,
  message: string
): void {
  socket.emit('subscription:error', { event, code, message })
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
      const operationType = (event as { operationType?: string }).operationType
      const documentId = asNonEmptyId(doc?._id) || asNonEmptyId(docKey?._id)

      if (doc && documentId) {
        writeRouteHints(name, documentId, {
          sessionId: asNonEmptyId(doc.sessionId),
          courseId: asNonEmptyId(doc.courseId),
          questionId: asNonEmptyId(doc.questionId),
        })
      }

      const cachedHints = documentId ? readRouteHints(name, documentId) : undefined
      if (operationType === 'delete' && documentId) {
        deleteRouteHints(name, documentId)
      }

      const routingKeys = new Set<string>([`${name}:*`])
      if (documentId) routingKeys.add(`${name}:${documentId}`)

      const sessionId = asNonEmptyId(doc?.sessionId) || cachedHints?.sessionId
      if (sessionId) routingKeys.add(`${name}:session:${sessionId}`)

      const courseId = asNonEmptyId(doc?.courseId) || cachedHints?.courseId
      if (courseId) routingKeys.add(`${name}:course:${courseId}`)

      const questionId = asNonEmptyId(doc?.questionId) || cachedHints?.questionId
      if (questionId) routingKeys.add(`${name}:question:${questionId}`)

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
      if (!questionId) {
        emitSubscriptionError(socket, 'subscribe:responses', 'bad_request', 'questionId is required.')
        return
      }

      const user = await loadSocketUser(socket)
      if (!user) {
        emitSubscriptionError(
          socket,
          'subscribe:responses',
          'not_authenticated',
          'Authentication required.'
        )
        return
      }

      const question = await getQuestions().findOne(
        { _id: questionId } as Parameters<ReturnType<typeof getQuestions>['findOne']>[0]
      )
      if (!question) {
        emitSubscriptionError(socket, 'subscribe:responses', 'not_found', 'Question not found.')
        return
      }

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
        emitSubscriptionError(socket, 'subscribe:responses', 'forbidden', 'Forbidden.')
        return
      }

      const userId = user._id || ''
      let statsEnabled = question.sessionOptions?.stats ?? false

      registerSubscription(`responses:question-stats:${questionId}`, () =>
        streams.questions.subscribe(`questions:${questionId}`, (event) => {
          const doc = (event as { fullDocument?: { sessionOptions?: { stats?: boolean } } }).fullDocument
          if (doc?.sessionOptions) {
            statsEnabled = Boolean(doc.sessionOptions.stats)
            socket.emit('responses:change', { operationType: 'invalidate' })
          }
        })
      )

      registerSubscription(`responses:${questionId}`, () =>
        streams.responses.subscribe(`responses:question:${questionId}`, (event) => {
          const doc = (event as { fullDocument?: { studentUserId?: string } }).fullDocument

          if (isAdmin(user) || access.isInstructor) {
            socket.emit('responses:change', event)
            return
          }

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
      removeSubscription(`responses:question-stats:${questionId}`)
      removeSubscription(`responses:${questionId}`)
    })

    /** Subscribe to session updates */
    socket.on('subscribe:session', async ({ sessionId }: { sessionId: string }) => {
      if (!sessionId) {
        emitSubscriptionError(socket, 'subscribe:session', 'bad_request', 'sessionId is required.')
        return
      }

      const user = await loadSocketUser(socket)
      if (!user) {
        emitSubscriptionError(
          socket,
          'subscribe:session',
          'not_authenticated',
          'Authentication required.'
        )
        return
      }

      const session = await getSessions().findOne(
        { _id: sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0],
        { projection: { courseId: 1 } }
      )
      if (!session) {
        emitSubscriptionError(socket, 'subscribe:session', 'not_found', 'Session not found.')
        return
      }

      const access = await courseAccessForUser(user, session.courseId)
      if (!access.canAccess && !isAdmin(user)) {
        emitSubscriptionError(socket, 'subscribe:session', 'forbidden', 'Forbidden.')
        return
      }

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
      if (!sessionId) {
        emitSubscriptionError(socket, 'subscribe:questions', 'bad_request', 'sessionId is required.')
        return
      }

      const user = await loadSocketUser(socket)
      if (!user) {
        emitSubscriptionError(
          socket,
          'subscribe:questions',
          'not_authenticated',
          'Authentication required.'
        )
        return
      }

      const session = await getSessions().findOne(
        { _id: sessionId } as Parameters<ReturnType<typeof getSessions>['findOne']>[0],
        { projection: { courseId: 1 } }
      )
      if (!session) {
        emitSubscriptionError(socket, 'subscribe:questions', 'not_found', 'Session not found.')
        return
      }

      const access = await courseAccessForUser(user, session.courseId)
      if (!access.canAccess && !isAdmin(user)) {
        emitSubscriptionError(socket, 'subscribe:questions', 'forbidden', 'Forbidden.')
        return
      }

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
      if (!courseId) {
        emitSubscriptionError(socket, 'subscribe:questions-course', 'bad_request', 'courseId is required.')
        return
      }

      const user = await loadSocketUser(socket)
      if (!user) {
        emitSubscriptionError(
          socket,
          'subscribe:questions-course',
          'not_authenticated',
          'Authentication required.'
        )
        return
      }

      const access = await courseAccessForUser(user, courseId)
      if (!access.canAccess && !isAdmin(user)) {
        emitSubscriptionError(socket, 'subscribe:questions-course', 'forbidden', 'Forbidden.')
        return
      }

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
      if (!courseId) {
        emitSubscriptionError(socket, 'subscribe:sessions', 'bad_request', 'courseId is required.')
        return
      }

      const user = await loadSocketUser(socket)
      if (!user) {
        emitSubscriptionError(
          socket,
          'subscribe:sessions',
          'not_authenticated',
          'Authentication required.'
        )
        return
      }

      const access = await courseAccessForUser(user, courseId)
      if (!access.canAccess && !isAdmin(user)) {
        emitSubscriptionError(socket, 'subscribe:sessions', 'forbidden', 'Forbidden.')
        return
      }

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
      if (!targetUserId) {
        emitSubscriptionError(socket, 'subscribe:grades', 'bad_request', 'userId is required.')
        return
      }

      const user = await loadSocketUser(socket)
      if (!user) {
        emitSubscriptionError(
          socket,
          'subscribe:grades',
          'not_authenticated',
          'Authentication required.'
        )
        return
      }

      const own = user._id === targetUserId
      if (!own && !isAdmin(user)) {
        emitSubscriptionError(socket, 'subscribe:grades', 'forbidden', 'Forbidden.')
        return
      }

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
