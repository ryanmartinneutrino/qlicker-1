import { getDB } from '../db'
import type { Collection } from 'mongodb'
import type { Response } from '@qlicker/shared'

export function getResponses(): Collection<Response> {
  return getDB().collection<Response>('responses')
}

export async function initResponses(): Promise<Collection<Response>> {
  const col = getResponses()
  // Indexes migrated from server/main.js
  await col.createIndex({ questionId: 1 })
  await col.createIndex({ studentUserId: 1 })
  await col.createIndex({ questionId: 1, studentUserId: 1 }) // compound for hot path
  await col.createIndex({ questionId: 1, studentUserId: 1, attempt: 1 })
  await col.createIndex({ studentUserId: 1, createdAt: -1 })
  return col
}
