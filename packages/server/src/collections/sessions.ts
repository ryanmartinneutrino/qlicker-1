import { getDB } from '../db'
import type { Collection } from 'mongodb'
import type { Session } from '@qlicker/shared'

export function getSessions(): Collection<Session> {
  return getDB().collection<Session>('sessions')
}

export async function initSessions(): Promise<Collection<Session>> {
  const col = getSessions()
  await col.createIndex({ courseId: 1 })
  await col.createIndex({ status: 1 })
  return col
}

function asMillis(value: Date | null | undefined): number | null {
  if (!(value instanceof Date)) return null
  const ms = value.getTime()
  return Number.isFinite(ms) ? ms : null
}

export function userHasActiveQuizExtension(
  session: Session,
  userId: string | undefined,
  nowMs = Date.now()
): boolean {
  if (!userId || !Array.isArray(session.quizExtensions)) return false
  const extension = session.quizExtensions.find((entry) => entry.userId === userId)
  if (!extension) return false
  const startMs = asMillis(extension.quizStart ?? null)
  const endMs = asMillis(extension.quizEnd ?? null)
  if (startMs === null || endMs === null) return false
  return nowMs > startMs && nowMs < endMs
}

export function quizHasActiveExtensions(session: Session, nowMs = Date.now()): boolean {
  if (!session.quiz || !Array.isArray(session.quizExtensions)) return false
  return session.quizExtensions.some((entry) => {
    const startMs = asMillis(entry.quizStart ?? null)
    const endMs = asMillis(entry.quizEnd ?? null)
    if (startMs === null || endMs === null) return false
    return nowMs > startMs && nowMs < endMs
  })
}

export function quizIsActive(
  session: Session,
  userId: string | undefined,
  nowMs = Date.now()
): boolean {
  if (!session.quiz) return false
  if (session.status === 'running') return true
  if (session.status === 'hidden' || session.status === 'done') return false

  if (userHasActiveQuizExtension(session, userId, nowMs)) return true

  const startMs = asMillis(session.quizStart ?? null)
  const endMs = asMillis(session.quizEnd ?? null)
  if (startMs === null || endMs === null) return false
  return nowMs > startMs && nowMs < endMs
}

export function quizIsClosed(
  session: Session,
  userId: string | undefined,
  nowMs = Date.now()
): boolean {
  if (!session.quiz) return false
  if (session.status === 'running') return false
  if (session.status === 'hidden' || session.status === 'done') return true
  if (userHasActiveQuizExtension(session, userId, nowMs)) return false
  const endMs = asMillis(session.quizEnd ?? null)
  if (endMs === null) return false
  return nowMs >= endMs
}
