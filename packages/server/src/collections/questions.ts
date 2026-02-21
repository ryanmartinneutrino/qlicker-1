import { getDB } from '../db'
import type { Collection } from 'mongodb'
import type { Question } from '@qlicker/shared'

export function getQuestions(): Collection<Question> {
  return getDB().collection<Question>('questions')
}

export async function initQuestions(): Promise<Collection<Question>> {
  const col = getQuestions()
  // Indexes migrated from server/main.js
  await col.createIndex({ sessionId: 1 })
  await col.createIndex({ courseId: 1 })
  await col.createIndex({ owner: 1 })
  await col.createIndex({ creator: 1 })
  await col.createIndex({ sessionId: 1, courseId: 1 }) // compound for hot path
  return col
}
