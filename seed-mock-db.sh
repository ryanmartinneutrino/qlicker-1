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

  console.log('Done. Seeded users and Migration Test Course with enrollment code MIGRATE123')
  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
NODE
