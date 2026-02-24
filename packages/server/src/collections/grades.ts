import { getDB } from '../db'
import type { Collection } from 'mongodb'
import type { Grade } from '@qlicker/shared'

export function getGrades(): Collection<Grade> {
  return getDB().collection<Grade>('grades')
}

export async function initGrades(): Promise<Collection<Grade>> {
  const col = getGrades()
  // Indexes migrated from server/main.js
  await col.createIndex({ userId: 1 })
  await col.createIndex({ courseId: 1 })
  await col.createIndex({ sessionId: 1 })
  await col.createIndex({ userId: 1, sessionId: 1 }) // compound for hot path
  await col.createIndex({ courseId: 1, userId: 1 })
  await col.createIndex({ sessionId: 1, userId: 1 })
  await col.createIndex({ sessionId: 1, visibleToStudents: 1, userId: 1 })
  return col
}
