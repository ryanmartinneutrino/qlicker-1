#!/usr/bin/env bash
set -euo pipefail

MONGO_URL="${MONGO_URL:-mongodb://localhost:27017/qlicker?replicaSet=rs0}"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

echo "Seeding mock users/course into ${MONGO_URL}"

MONGO_URL="$MONGO_URL" node <<'NODE'
const { MongoClient } = require('mongodb')
const bcrypt = require('bcrypt')
const crypto = require('crypto')

const mongoUrl = process.env.MONGO_URL

const USERS = [
  { email: 'prof@gmail.com', first: 'Prof', last: 'User', roles: ['professor'] },
  { email: 'student1@gmail.com', first: 'Student', last: 'One', roles: ['student'] },
  { email: 'student2@gmail.com', first: 'Student', last: 'Two', roles: ['student'] },
  { email: 'admin@gmail.com', first: 'Admin', last: 'User', roles: ['admin'] },
]

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`
}

async function main() {
  const client = new MongoClient(mongoUrl)
  await client.connect()
  const db = client.db()

  const users = db.collection('users')
const courses = db.collection('courses')
const sessions = db.collection('sessions')
const questions = db.collection('questions')
const responses = db.collection('responses')
const grades = db.collection('grades')
const settings = db.collection('settings')

  const passwordHash = await bcrypt.hash('12345678', 10)

  const userIds = {}
  for (const entry of USERS) {
    const existing = await users.findOne({ 'emails.address': entry.email })
    const baseDoc = {
      emails: [{ address: entry.email, verified: true }],
      profile: {
        firstname: entry.first,
        lastname: entry.last,
        roles: entry.roles,
        courses: [],
      },
      services: {
        password: { bcrypt: passwordHash },
      },
      createdAt: new Date(),
    }

    if (existing) {
      await users.updateOne(
        { _id: existing._id },
        { $set: baseDoc }
      )
      userIds[entry.email] = existing._id
    } else {
      const inserted = { _id: makeId('user'), ...baseDoc }
      await users.insertOne(inserted)
      userIds[entry.email] = inserted._id
    }
  }

  const profId = userIds['prof@gmail.com']
  const studentIds = [userIds['student1@gmail.com'], userIds['student2@gmail.com']]

  const existingCourse = await courses.findOne({ owner: profId, name: 'Migration Test Course' })
  let courseId

  if (existingCourse) {
    courseId = existingCourse._id
    await courses.updateOne(
      { _id: existingCourse._id },
      {
        $set: {
          deptCode: 'CISC',
          courseNumber: '101',
          section: '001',
          semester: 'Fall 2026',
          enrollmentCode: 'MIGRATE123',
          instructors: [profId],
          students: studentIds,
          inactive: false,
          allowStudentQuestions: true,
        },
      }
    )
  } else {
    courseId = makeId('course')
    await courses.insertOne({
      _id: courseId,
      name: 'Migration Test Course',
      deptCode: 'CISC',
      courseNumber: '101',
      section: '001',
      owner: profId,
      enrollmentCode: 'MIGRATE123',
      semester: 'Fall 2026',
      inactive: false,
      students: studentIds,
      instructors: [profId],
      sessions: [],
      createdAt: new Date(),
      allowStudentQuestions: true,
    })
  }

  for (const entry of USERS) {
    const uid = userIds[entry.email]
    await users.updateOne({ _id: uid }, { $addToSet: { 'profile.courses': courseId } })
  }

  const sessionIds = {
    interactive: makeId('session'),
    quiz: makeId('session'),
  }
  const questionIds = {
    q1: makeId('question'),
    q2: makeId('question'),
    q3: makeId('question'),
  }

  await sessions.deleteMany({ courseId })
  await questions.deleteMany({ courseId })
  await responses.deleteMany({ questionId: { $in: Object.values(questionIds) } })
  await grades.deleteMany({ courseId })

  await sessions.insertMany([
    {
      _id: sessionIds.interactive,
      name: 'Interactive Demo Session',
      description: 'Realtime session for migration smoke tests',
      courseId,
      status: 'running',
      quiz: false,
      createdAt: new Date(),
      questions: [questionIds.q1, questionIds.q2],
      currentQuestion: questionIds.q1,
      joined: studentIds,
    },
    {
      _id: sessionIds.quiz,
      name: 'Quiz Demo Session',
      description: 'Quiz lifecycle + extension smoke test',
      courseId,
      status: 'visible',
      quiz: true,
      quizStart: new Date(Date.now() - 30 * 60 * 1000),
      quizEnd: new Date(Date.now() + 30 * 60 * 1000),
      quizExtensions: [{ userId: studentIds[0], quizEnd: new Date(Date.now() + 90 * 60 * 1000) }],
      createdAt: new Date(),
      questions: [questionIds.q3],
      submittedQuiz: [],
    },
  ])

  await courses.updateOne(
    { _id: courseId },
    { $set: { sessions: [sessionIds.interactive, sessionIds.quiz] } }
  )

  await questions.insertMany([
    {
      _id: questionIds.q1,
      plainText: 'What is 2 + 2?',
      type: 0,
      content: 'What is 2 + 2?',
      options: [
        { plainText: '3', answer: '3', correct: false },
        { plainText: '4', answer: '4', correct: true },
      ],
      creator: profId,
      owner: profId,
      sessionId: sessionIds.interactive,
      courseId,
      public: false,
      approved: true,
      createdAt: new Date(),
      tags: [],
      sessionOptions: {
        hidden: false,
        stats: true,
        correct: true,
        points: 1,
        maxAttempts: 1,
        attemptWeights: [1],
        attempts: [{ number: 1, closed: false }],
      },
      solution: '4',
      solution_plainText: '4',
    },
    {
      _id: questionIds.q2,
      plainText: 'Name one JavaScript runtime',
      type: 3,
      content: 'Name one JavaScript runtime',
      options: [],
      creator: profId,
      owner: profId,
      sessionId: sessionIds.interactive,
      courseId,
      public: false,
      approved: true,
      createdAt: new Date(),
      tags: [],
      solution: 'Node.js',
      solution_plainText: 'Node.js',
    },
    {
      _id: questionIds.q3,
      plainText: 'The Earth is round.',
      type: 2,
      content: 'The Earth is round.',
      options: [
        { plainText: 'True', answer: 'True', correct: true },
        { plainText: 'False', answer: 'False', correct: false },
      ],
      creator: profId,
      owner: profId,
      sessionId: sessionIds.quiz,
      courseId,
      public: false,
      approved: true,
      createdAt: new Date(),
      tags: [],
      solution: 'True',
      solution_plainText: 'True',
    },
  ])

  await responses.insertMany([
    {
      _id: makeId('response'),
      attempt: 1,
      questionId: questionIds.q1,
      studentUserId: studentIds[0],
      answer: '4',
      correct: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: makeId('response'),
      attempt: 1,
      questionId: questionIds.q1,
      studentUserId: studentIds[1],
      answer: '3',
      correct: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: makeId('response'),
      attempt: 1,
      questionId: questionIds.q2,
      studentUserId: studentIds[0],
      answer: 'Node.js',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])

  await grades.insertMany([
    {
      _id: makeId('grade'),
      userId: studentIds[0],
      courseId,
      sessionId: sessionIds.interactive,
      name: 'Interactive Demo Session',
      marks: [{ questionId: questionIds.q1, points: 1, outOf: 1, automatic: true }],
      points: 1,
      outOf: 1,
      visibleToStudents: true,
    },
    {
      _id: makeId('grade'),
      userId: studentIds[1],
      courseId,
      sessionId: sessionIds.interactive,
      name: 'Interactive Demo Session',
      marks: [{ questionId: questionIds.q1, points: 0, outOf: 1, automatic: true }],
      points: 0,
      outOf: 1,
      visibleToStudents: true,
    },
  ])

  const existingSettings = await settings.findOne({})
  const settingsDoc = {
    restrictDomain: false,
    allowedDomains: [],
    maxImageSize: 10,
    maxImageWidth: 1200,
    email: 'admin@qlicker.local',
    requireVerified: false,
    storageType: 'Local',
    Jitsi_Enabled: true,
    Jitsi_Domain: 'meet.jit.si',
    Jitsi_EnabledCourses: [courseId],
    Jitsi_WhiteboardDomain: '',
    Jitsi_EtherpadDomain: '',
  }
  if (existingSettings) {
    await settings.updateOne({ _id: existingSettings._id }, { $set: settingsDoc })
  } else {
    await settings.insertOne({ _id: makeId('settings'), ...settingsDoc })
  }

  console.log('Done. Seeded users, course, sessions, questions, responses, grades, and settings for migration parity checks.')
  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
NODE
