import { MongoClient, Db } from 'mongodb'

let client: MongoClient | null = null
let db: Db | null = null

export async function connectDB(mongoUrl: string): Promise<Db> {
  if (db) return db

  client = new MongoClient(mongoUrl, {
    // Connection pooling settings for high concurrency
    maxPoolSize: 50,
    minPoolSize: 5,
    maxIdleTimeMS: 30000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  })

  await client.connect()
  const url = new URL(mongoUrl)
  const dbName = url.pathname.slice(1).split('?')[0] || 'qlicker'
  db = client.db(dbName)

  console.log(`Connected to MongoDB: ${dbName}`)
  return db
}

export function getDB(): Db {
  if (!db) throw new Error('Database not connected. Call connectDB() first.')
  return db
}

export function getClient(): MongoClient {
  if (!client) throw new Error('MongoDB client not initialized.')
  return client
}
