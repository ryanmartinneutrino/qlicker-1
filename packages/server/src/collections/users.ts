import { getDB } from '../db'
import type { Collection } from 'mongodb'
import type { User } from '@qlicker/shared'

export function getUsers(): Collection<User> {
  return getDB().collection<User>('users')
}

export async function initUsers(): Promise<Collection<User>> {
  const col = getUsers()
  await col.createIndex({ 'emails.address': 1 }, { unique: true, sparse: true })
  await col.createIndex({ 'profile.roles': 1 })
  return col
}
