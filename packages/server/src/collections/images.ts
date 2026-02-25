import { getDB } from '../db'
import type { Collection } from 'mongodb'
import type { Image } from '@qlicker/shared'

export function getImages(): Collection<Image> {
  return getDB().collection<Image>('images')
}

export async function initImages(): Promise<Collection<Image>> {
  const col = getImages()
  // Index migrated from server/main.js
  await col.createIndex({ UID: 1 })
  // Owner scoping for image listing/deletion.
  await col.createIndex({ owner: 1 })
  return col
}
