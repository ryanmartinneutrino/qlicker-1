import { getDB } from '../db'
import type { Collection } from 'mongodb'
import type { Settings } from '@qlicker/shared'

export function getSettings(): Collection<Settings> {
  return getDB().collection<Settings>('settings')
}

export async function initSettings(): Promise<Collection<Settings>> {
  return getSettings()
}
