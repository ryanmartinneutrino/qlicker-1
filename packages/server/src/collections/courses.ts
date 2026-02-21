import { getDB } from '../db'
import type { Collection } from 'mongodb'
import type { Course } from '@qlicker/shared'

export function getCourses(): Collection<Course> {
  return getDB().collection<Course>('courses')
}

export async function initCourses(): Promise<Collection<Course>> {
  const col = getCourses()
  await col.createIndex({ owner: 1 })
  await col.createIndex({ students: 1 })
  await col.createIndex({ instructors: 1 })
  await col.createIndex({ enrollmentCode: 1 }, { unique: true, sparse: true })
  return col
}
