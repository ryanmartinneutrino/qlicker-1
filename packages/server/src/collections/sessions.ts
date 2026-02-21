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
