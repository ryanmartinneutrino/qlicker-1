#!/usr/bin/env node

import { MongoClient } from 'mongodb'
import { writeFile } from 'node:fs/promises'

const mongoPort = Number(process.env.MONGO_PORT || process.env.QCLICKER_MONGO_PORT || 0)
const mongoFromPort =
  Number.isFinite(mongoPort) && mongoPort > 0
    ? `mongodb://localhost:${Math.floor(mongoPort)}/qlicker?directConnection=true`
    : ''
const baselineUrl = process.env.QCLICKER_BASELINE_MONGO_URL || process.env.BASELINE_MONGO_URL || ''
const candidateUrl =
  process.env.QCLICKER_CANDIDATE_MONGO_URL ||
  process.env.CANDIDATE_MONGO_URL ||
  process.env.QCLICKER_MONGO_URL ||
  process.env.MONGO_URL ||
  mongoFromPort ||
  ''
const samplePerCollection = Number(process.env.QCLICKER_PARITY_SAMPLE_PER_COLLECTION || 300)
const failOnDiff = process.env.QCLICKER_PARITY_FAIL_ON_DIFF === 'true'
const outputPath = process.env.QCLICKER_PARITY_OUTPUT || ''
const collections = (process.env.QCLICKER_PARITY_COLLECTIONS || 'courses,sessions,questions,responses,grades,users,settings,images')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)

function setPath(target, path, value) {
  const keys = path.split('.')
  let cursor = target
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]
    if (i === keys.length - 1) {
      cursor[key] = value
      return
    }
    if (!(key in cursor) || typeof cursor[key] !== 'object' || cursor[key] === null) {
      cursor[key] = {}
    }
    cursor = cursor[key]
  }
}

function getPathValue(doc, path) {
  return path.split('.').reduce((value, key) => {
    if (value === null || value === undefined) return undefined
    if (typeof value !== 'object') return undefined
    return value[key]
  }, doc)
}

function normalize(value) {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry))
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    const out = {}
    for (const key of keys) {
      out[key] = normalize(value[key])
    }
    return out
  }

  return value
}

const projectionByCollection = {
  courses: [
    'name',
    'deptCode',
    'courseNumber',
    'section',
    'semester',
    'owner',
    'instructors',
    'students',
    'sessions',
    'inactive',
    'requireVerified',
    'allowStudentQuestions',
    'groupCategories',
    'videoChatOptions',
  ],
  sessions: [
    'name',
    'description',
    'courseId',
    'status',
    'quiz',
    'practiceQuiz',
    'quizStart',
    'quizEnd',
    'quizExtensions',
    'questions',
    'currentQuestion',
    'joined',
    'submittedQuiz',
    'reviewable',
  ],
  questions: [
    'plainText',
    'type',
    'content',
    'options',
    'toleranceNumerical',
    'correctNumerical',
    'creator',
    'owner',
    'originalQuestion',
    'sessionId',
    'courseId',
    'public',
    'approved',
    'tags',
    'sessionOptions',
    'imagePath',
  ],
  responses: [
    'attempt',
    'questionId',
    'studentUserId',
    'answer',
    'answerWysiwyg',
    'correct',
    'editable',
  ],
  grades: [
    'userId',
    'courseId',
    'sessionId',
    'marks',
    'joined',
    'participation',
    'value',
    'automatic',
    'points',
    'outOf',
    'numAnswered',
    'numQuestions',
    'numAnsweredTotal',
    'numQuestionsTotal',
    'visibleToStudents',
    'needsGrading',
  ],
  users: [
    'emails',
    'profile.firstname',
    'profile.lastname',
    'profile.roles',
    'profile.courses',
    'profile.profileImage',
    'profile.profileThumbnail',
    'profile.studentNumber',
    'services.sso',
  ],
  settings: [
    'restrictDomain',
    'allowedDomains',
    'maxImageSize',
    'maxImageWidth',
    'email',
    'requireVerified',
    'storageType',
    'AWS_bucket',
    'AWS_region',
    'Azure_accountName',
    'Azure_containerName',
    'SSO_enabled',
    'SSO_entrypoint',
    'SSO_EntityId',
    'SSO_identifierFormat',
    'SSO_emailIdentifier',
    'SSO_firstNameIdentifier',
    'SSO_lastNameIdentifier',
    'SSO_studentNumberIdentifier',
    'SSO_roleIdentifier',
    'SSO_roleProfName',
    'Jitsi_Enabled',
    'Jitsi_Domain',
    'Jitsi_EnabledCourses',
    'Jitsi_WhiteboardDomain',
    'Jitsi_EtherpadDomain',
  ],
  images: [
    'url',
    'UID',
    'owner',
  ],
}

function projectDoc(collectionName, doc) {
  const paths = projectionByCollection[collectionName]
  if (!paths || paths.length < 1) {
    return normalize(doc)
  }

  const projected = {}
  for (const path of paths) {
    const value = getPathValue(doc, path)
    if (value !== undefined) {
      setPath(projected, path, value)
    }
  }

  if (Array.isArray(projected.marks)) {
    projected.marks = [...projected.marks].sort((left, right) => {
      const leftKey = `${left?.questionId || ''}:${left?.attempt || 0}:${left?.responseId || ''}`
      const rightKey = `${right?.questionId || ''}:${right?.attempt || 0}:${right?.responseId || ''}`
      return leftKey.localeCompare(rightKey)
    })
  }

  return normalize(projected)
}

async function connect(url, label) {
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 10000 })
  await client.connect()
  await client.db().command({ ping: 1 })
  return { client, db: client.db(), label, url }
}

async function sampleIds(collection, limit) {
  const rows = await collection
    .find({}, { projection: { _id: 1 } })
    .sort({ _id: 1 })
    .limit(limit)
    .toArray()

  return rows
    .map((entry) => (typeof entry._id === 'string' ? entry._id : String(entry._id)))
    .filter((id, index, arr) => id && arr.indexOf(id) === index)
}

async function loadDocsByIds(collection, ids) {
  if (ids.length < 1) return new Map()
  const docs = await collection
    .find({ _id: { $in: ids } })
    .toArray()

  const map = new Map()
  for (const doc of docs) {
    const id = typeof doc._id === 'string' ? doc._id : String(doc._id)
    map.set(id, doc)
  }
  return map
}

async function run() {
  if (!baselineUrl || !candidateUrl) {
    throw new Error('Set QCLICKER_BASELINE_MONGO_URL and QCLICKER_CANDIDATE_MONGO_URL (or MONGO_URL).')
  }

  const baseline = await connect(baselineUrl, 'baseline')
  const candidate = await connect(candidateUrl, 'candidate')

  const baselineNames = new Set((await baseline.db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name))
  const candidateNames = new Set((await candidate.db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name))

  const perCollection = {}
  const missingCollections = []

  for (const name of collections) {
    if (!baselineNames.has(name) || !candidateNames.has(name)) {
      missingCollections.push({
        collection: name,
        baselineHas: baselineNames.has(name),
        candidateHas: candidateNames.has(name),
      })
      continue
    }

    const baselineCol = baseline.db.collection(name)
    const candidateCol = candidate.db.collection(name)

    const [baselineCount, candidateCount] = await Promise.all([
      baselineCol.countDocuments({}),
      candidateCol.countDocuments({}),
    ])

    const [baselineIds, candidateIds] = await Promise.all([
      sampleIds(baselineCol, samplePerCollection),
      sampleIds(candidateCol, samplePerCollection),
    ])

    const unionIds = [...new Set([...baselineIds, ...candidateIds])]
    const [baselineDocs, candidateDocs] = await Promise.all([
      loadDocsByIds(baselineCol, unionIds),
      loadDocsByIds(candidateCol, unionIds),
    ])

    let missingInBaseline = 0
    let missingInCandidate = 0
    let changed = 0
    let unchanged = 0
    const changedExamples = []

    for (const id of unionIds) {
      const left = baselineDocs.get(id)
      const right = candidateDocs.get(id)

      if (!left && right) {
        missingInBaseline += 1
        if (changedExamples.length < 15) {
          changedExamples.push({ _id: id, change: 'missing_in_baseline' })
        }
        continue
      }

      if (left && !right) {
        missingInCandidate += 1
        if (changedExamples.length < 15) {
          changedExamples.push({ _id: id, change: 'missing_in_candidate' })
        }
        continue
      }

      if (!left || !right) continue

      const normalizedLeft = projectDoc(name, left)
      const normalizedRight = projectDoc(name, right)
      const leftJson = JSON.stringify(normalizedLeft)
      const rightJson = JSON.stringify(normalizedRight)

      if (leftJson !== rightJson) {
        changed += 1
        if (changedExamples.length < 15) {
          changedExamples.push({
            _id: id,
            change: 'doc_diff',
            baseline: normalizedLeft,
            candidate: normalizedRight,
          })
        }
      } else {
        unchanged += 1
      }
    }

    perCollection[name] = {
      baselineCount,
      candidateCount,
      sampledIds: unionIds.length,
      missingInBaseline,
      missingInCandidate,
      changed,
      unchanged,
      changedExamples,
    }
  }

  const summary = {
    checkedAt: new Date().toISOString(),
    baseline: {
      url: baseline.url,
      dbName: baseline.db.databaseName,
    },
    candidate: {
      url: candidate.url,
      dbName: candidate.db.databaseName,
    },
    collections,
    samplePerCollection,
    failOnDiff,
    missingCollections,
    perCollection,
  }

  if (outputPath) {
    await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  }

  console.log(JSON.stringify(summary, null, 2))

  await baseline.client.close()
  await candidate.client.close()

  const collectionDiff = Object.values(perCollection).some((entry) => {
    return (
      entry.baselineCount !== entry.candidateCount ||
      entry.missingInBaseline > 0 ||
      entry.missingInCandidate > 0 ||
      entry.changed > 0
    )
  })

  if (failOnDiff && (missingCollections.length > 0 || collectionDiff)) {
    throw new Error('DB parity diff failed: differences detected.')
  }
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
