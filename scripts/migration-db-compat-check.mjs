#!/usr/bin/env node

import { MongoClient } from 'mongodb'
import { writeFile } from 'node:fs/promises'

const sampleLimit = Number(process.env.QCLICKER_DB_COMPAT_SAMPLE || 5000)
const strictMode = process.env.QCLICKER_DB_COMPAT_STRICT === 'true'
const outputPath = process.env.QCLICKER_DB_COMPAT_OUTPUT || ''

const mongoCandidates = [
  process.env.QCLICKER_MONGO_URL,
  process.env.MONGO_URL,
  'mongodb://localhost:27017/qlicker?replicaSet=rs0',
  'mongodb://localhost:27017/qlicker?directConnection=true',
  'mongodb://127.0.0.1:27017/qlicker?directConnection=true',
  'mongodb://mongo1:27017/qlicker?replicaSet=rs0',
].filter(Boolean)

const requiredCollections = [
  'courses',
  'sessions',
  'questions',
  'responses',
  'grades',
  'users',
  'settings',
]

function getPathValue(doc, path) {
  return path.split('.').reduce((value, key) => {
    if (value === null || value === undefined) return undefined
    if (typeof value !== 'object') return undefined
    return value[key]
  }, doc)
}

function isDateLike(value) {
  if (value instanceof Date) return true
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return !Number.isNaN(parsed.getTime())
  }
  return false
}

function checkString(doc, path) {
  const value = getPathValue(doc, path)
  return typeof value === 'string' && value.length > 0
}

function checkOptionalString(doc, path) {
  const value = getPathValue(doc, path)
  return value === undefined || (typeof value === 'string' && value.length > 0)
}

function checkBoolean(doc, path) {
  const value = getPathValue(doc, path)
  return typeof value === 'boolean'
}

function checkNumber(doc, path) {
  const value = getPathValue(doc, path)
  return typeof value === 'number' && Number.isFinite(value)
}

function checkArrayOfStrings(doc, path, allowNullItems = false) {
  const value = getPathValue(doc, path)
  if (value === undefined) return true
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (allowNullItems && entry === null) return true
    return typeof entry === 'string'
  })
}

function checkArray(doc, path) {
  const value = getPathValue(doc, path)
  if (value === undefined) return true
  return Array.isArray(value)
}

function checkOwnerOrCreator(doc) {
  return checkString(doc, 'owner') || checkString(doc, 'creator')
}

function checkResponseAnswer(doc) {
  const value = getPathValue(doc, 'answer')
  if (typeof value === 'string') return true
  if (!Array.isArray(value)) return false
  return value.every((entry) => typeof entry === 'string')
}

function checkRoles(doc) {
  const value = getPathValue(doc, 'profile.roles')
  if (!Array.isArray(value) || value.length < 1) return false
  return value.every((entry) => typeof entry === 'string' && entry.length > 0)
}

function checkEmails(doc) {
  const value = getPathValue(doc, 'emails')
  if (!Array.isArray(value) || value.length < 1) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    return typeof entry.address === 'string'
  })
}

const rulesByCollection = {
  courses: [
    { path: 'owner', level: 'error', test: (doc) => checkString(doc, 'owner'), reason: 'owner must be a non-empty string' },
    { path: 'instructors', level: 'warn', test: (doc) => checkArrayOfStrings(doc, 'instructors'), reason: 'instructors must be string[] when present' },
    { path: 'students', level: 'warn', test: (doc) => checkArrayOfStrings(doc, 'students'), reason: 'students must be string[] when present' },
    { path: 'sessions', level: 'warn', test: (doc) => checkArrayOfStrings(doc, 'sessions'), reason: 'sessions must be string[] when present' },
    { path: 'createdAt', level: 'warn', test: (doc) => getPathValue(doc, 'createdAt') === undefined || isDateLike(getPathValue(doc, 'createdAt')), reason: 'createdAt should be date-like when present' },
  ],
  sessions: [
    { path: 'courseId', level: 'error', test: (doc) => checkString(doc, 'courseId'), reason: 'courseId must be a non-empty string' },
    { path: 'status', level: 'error', test: (doc) => checkString(doc, 'status'), reason: 'status must be a non-empty string' },
    { path: 'quiz', level: 'error', test: (doc) => checkBoolean(doc, 'quiz'), reason: 'quiz must be boolean' },
    { path: 'questions', level: 'warn', test: (doc) => checkArrayOfStrings(doc, 'questions', true), reason: 'questions must be (string|null)[] when present' },
    { path: 'joined', level: 'warn', test: (doc) => checkArrayOfStrings(doc, 'joined', true), reason: 'joined must be (string|null)[] when present' },
    { path: 'submittedQuiz', level: 'warn', test: (doc) => checkArrayOfStrings(doc, 'submittedQuiz', true), reason: 'submittedQuiz must be (string|null)[] when present' },
    { path: 'currentQuestion', level: 'warn', test: (doc) => checkOptionalString(doc, 'currentQuestion'), reason: 'currentQuestion must be string when present' },
  ],
  questions: [
    { path: 'type', level: 'error', test: (doc) => checkNumber(doc, 'type'), reason: 'type must be a finite number' },
    { path: 'content', level: 'warn', test: (doc) => checkString(doc, 'content'), reason: 'content should be a non-empty string' },
    { path: 'owner|creator', level: 'error', test: checkOwnerOrCreator, reason: 'owner or creator must be a non-empty string' },
    { path: 'options', level: 'warn', test: (doc) => checkArray(doc, 'options'), reason: 'options must be an array when present' },
    { path: 'courseId', level: 'warn', test: (doc) => checkOptionalString(doc, 'courseId'), reason: 'courseId must be string when present' },
    { path: 'sessionId', level: 'warn', test: (doc) => checkOptionalString(doc, 'sessionId'), reason: 'sessionId must be string when present' },
  ],
  responses: [
    { path: 'questionId', level: 'error', test: (doc) => checkString(doc, 'questionId'), reason: 'questionId must be a non-empty string' },
    { path: 'studentUserId', level: 'error', test: (doc) => checkString(doc, 'studentUserId'), reason: 'studentUserId must be a non-empty string' },
    { path: 'attempt', level: 'error', test: (doc) => checkNumber(doc, 'attempt'), reason: 'attempt must be a finite number' },
    { path: 'answer', level: 'error', test: checkResponseAnswer, reason: 'answer must be string or string[]' },
  ],
  grades: [
    { path: 'userId', level: 'error', test: (doc) => checkString(doc, 'userId'), reason: 'userId must be a non-empty string' },
    { path: 'courseId', level: 'warn', test: (doc) => checkOptionalString(doc, 'courseId'), reason: 'courseId must be string when present' },
    { path: 'sessionId', level: 'warn', test: (doc) => checkOptionalString(doc, 'sessionId'), reason: 'sessionId must be string when present' },
    { path: 'marks', level: 'warn', test: (doc) => checkArray(doc, 'marks'), reason: 'marks must be an array when present' },
  ],
  users: [
    { path: 'emails', level: 'warn', test: checkEmails, reason: 'emails should be non-empty email object[]' },
    { path: 'profile.roles', level: 'error', test: checkRoles, reason: 'profile.roles must be non-empty string[]' },
    { path: 'profile.courses', level: 'warn', test: (doc) => checkArrayOfStrings(doc, 'profile.courses'), reason: 'profile.courses must be string[] when present' },
  ],
  images: [
    { path: 'UID', level: 'warn', test: (doc) => checkString(doc, 'UID'), reason: 'UID should be a non-empty string' },
    { path: 'url', level: 'warn', test: (doc) => checkString(doc, 'url'), reason: 'url should be a non-empty string' },
    { path: 'owner', level: 'warn', test: (doc) => checkOptionalString(doc, 'owner'), reason: 'owner must be string when present' },
  ],
  settings: [],
}

function issueKey(issue) {
  return [issue.level, issue.collection, issue.path, issue.reason].join('|')
}

function addIssue(issueMap, issue, docId) {
  const key = issueKey(issue)
  const existing = issueMap.get(key)
  if (existing) {
    existing.count += 1
    if (docId && existing.examples.length < 5) {
      existing.examples.push(docId)
    }
    return
  }

  issueMap.set(key, {
    ...issue,
    count: 1,
    examples: docId ? [docId] : [],
  })
}

async function connectFirst(urls) {
  let lastError = null
  for (const url of urls) {
    try {
      const client = new MongoClient(url, { serverSelectionTimeoutMS: 7000 })
      await client.connect()
      await client.db().command({ ping: 1 })
      return { client, url }
    } catch (err) {
      lastError = err
    }
  }
  throw new Error(`Unable to connect to MongoDB using candidates: ${urls.join(', ')}\n${String(lastError)}`)
}

async function run() {
  if (mongoCandidates.length < 1) {
    throw new Error('No MongoDB URL candidates found. Set QCLICKER_MONGO_URL or MONGO_URL.')
  }

  const { client, url } = await connectFirst(mongoCandidates)
  const db = client.db()
  const allCollections = await db.listCollections({}, { nameOnly: true }).toArray()
  const collectionNames = new Set(allCollections.map((entry) => entry.name))
  const issueMap = new Map()
  const collectionSummary = {}

  for (const collection of requiredCollections) {
    if (!collectionNames.has(collection)) {
      addIssue(
        issueMap,
        {
          level: 'error',
          collection,
          path: '_collection',
          reason: 'required collection is missing',
        },
        ''
      )
    }
  }

  const checkCollections = [
    ...new Set([...requiredCollections, 'images']),
  ].filter((name) => collectionNames.has(name))

  for (const collectionName of checkCollections) {
    const col = db.collection(collectionName)
    const totalDocs = await col.countDocuments({})
    let nonStringIdCount = null

    try {
      nonStringIdCount = await col.countDocuments({ _id: { $not: { $type: 'string' } } })
      if (nonStringIdCount > 0) {
        addIssue(
          issueMap,
          {
            level: 'error',
            collection: collectionName,
            path: '_id',
            reason: 'contains non-string _id values',
          },
          ''
        )
      }
    } catch {
      nonStringIdCount = null
    }

    const rules = rulesByCollection[collectionName] || []
    let sampled = 0
    if (rules.length > 0) {
      const cursor = col.find({}, { limit: sampleLimit })
      for await (const doc of cursor) {
        sampled += 1
        for (const rule of rules) {
          if (!rule.test(doc)) {
            addIssue(
              issueMap,
              {
                level: rule.level,
                collection: collectionName,
                path: rule.path,
                reason: rule.reason,
              },
              typeof doc._id === 'string' ? doc._id : ''
            )
          }
        }
      }
    }

    collectionSummary[collectionName] = {
      totalDocs,
      sampledDocs: sampled,
      nonStringIdCount,
    }
  }

  const issues = [...issueMap.values()].sort((a, b) => {
    if (a.level !== b.level) return a.level === 'error' ? -1 : 1
    if (a.collection !== b.collection) return a.collection.localeCompare(b.collection)
    if (a.path !== b.path) return a.path.localeCompare(b.path)
    return a.reason.localeCompare(b.reason)
  })

  const errors = issues.filter((issue) => issue.level === 'error')
  const warnings = issues.filter((issue) => issue.level === 'warn')
  const failed = errors.length > 0 || (strictMode && warnings.length > 0)

  const summary = {
    checkedAt: new Date().toISOString(),
    mongoUrl: url,
    dbName: db.databaseName,
    sampleLimit,
    strictMode,
    collectionSummary,
    totals: {
      errors: errors.reduce((sum, issue) => sum + issue.count, 0),
      warnings: warnings.reduce((sum, issue) => sum + issue.count, 0),
      issueKinds: issues.length,
    },
    issues,
    result: failed ? 'fail' : 'pass',
  }

  if (outputPath) {
    await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  }

  console.log(JSON.stringify(summary, null, 2))

  await client.close()

  if (failed) {
    const reason = errors.length > 0
      ? 'compatibility errors found'
      : 'strict mode enabled and warnings found'
    throw new Error(`DB compatibility check failed: ${reason}`)
  }
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
