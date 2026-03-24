#!/usr/bin/env node
/**
 * seed.mjs – Populate MongoDB with load-test fixtures.
 *
 * Creates:
 *   • 1 admin user
 *   • 1 professor user
 *   • N student users  (default 500)
 *   • 1 course with all students enrolled and the professor as instructor
 *   • 1 session with 5 questions (MC, MS, TF, SA, NU)
 *
 * Usage:
 *   MONGO_URL=mongodb://localhost:27017/qlicker node seed.mjs [--students 500] [--clean]
 *
 * The script writes load-testing/state.json which the k6 scenario reads.
 */

import mongoose from 'mongoose';
import { hash } from '@node-rs/argon2';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, 'state.json');

/* ---------- helpers ---------------------------------------------------- */

/** Generate a 17-char random alphanumeric ID (Meteor-compatible) */
function meteorId() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < 17; i++) {
    id += chars[crypto.randomInt(chars.length)];
  }
  return id;
}

/** Hash a password using the same argon2 settings the server uses */
async function hashPassword(pw) {
  return hash(pw, {
    memoryCost: 65536,
    timeCost: 3,
    outputLen: 32,
    parallelism: 1,
  });
}

/* ---------- Mongoose schemas (minimal – matches server models) --------- */

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: meteorId },
    emails: [
      {
        address: String,
        verified: { type: Boolean, default: false },
      },
    ],
    services: {
      password: { bcrypt: String },
    },
    profile: {
      firstname: String,
      lastname: String,
      roles: [String],
      profileImage: { type: String, default: '' },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'users', versionKey: false },
);

const courseSchema = new mongoose.Schema(
  {
    _id: { type: String, default: meteorId },
    name: String,
    deptCode: { type: String, default: '' },
    courseNumber: { type: String, default: '' },
    section: { type: String, default: '' },
    semester: { type: String, default: '' },
    owner: String,
    instructors: [String],
    students: [String],
    enrollmentCode: String,
    sessions: [String],
    inactive: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'courses', versionKey: false },
);

const sessionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: meteorId },
    name: String,
    description: { type: String, default: '' },
    courseId: String,
    creator: String,
    status: { type: String, default: 'hidden' },
    quiz: { type: Boolean, default: false },
    practiceQuiz: { type: Boolean, default: false },
    reviewable: { type: Boolean, default: false },
    questions: [String],
    currentQuestion: { type: String, default: '' },
    joined: [String],
    submittedQuiz: [String],
    joinCodeEnabled: { type: Boolean, default: false },
    joinCodeActive: { type: Boolean, default: false },
    currentJoinCode: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'sessions', versionKey: false },
);

const questionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: meteorId },
    type: Number,
    content: { type: String, default: '' },
    plainText: { type: String, default: '' },
    courseId: { type: String, default: '' },
    sessionId: { type: String, default: '' },
    creator: String,
    options: [
      {
        _id: false,
        answer: String,
        correct: Boolean,
        plainText: { type: String, default: '' },
        wysiwyg: { type: Boolean, default: false },
      },
    ],
    correctNumerical: { type: Number, default: null },
    toleranceNumerical: { type: Number, default: null },
    solution: { type: String, default: '' },
    solution_plainText: { type: String, default: '' },
    tags: { type: [String], default: [] },
    public: { type: Boolean, default: false },
    sessionOptions: {
      hidden: { type: Boolean, default: true },
      stats: { type: Boolean, default: false },
      correct: { type: Boolean, default: false },
      points: { type: Number, default: 1 },
      maxAttempts: { type: Number, default: 1 },
      attempts: { type: Array, default: [] },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'questions', versionKey: false },
);

const User = mongoose.model('User', userSchema);
const Course = mongoose.model('Course', courseSchema);
const Session = mongoose.model('Session', sessionSchema);
const Question = mongoose.model('Question', questionSchema);

/* ---------- question definitions --------------------------------------- */

const QUESTIONS = [
  {
    type: 0, // MC
    content: '<p>Which planet is closest to the Sun?</p>',
    plainText: 'Which planet is closest to the Sun?',
    options: [
      { answer: 'Venus', correct: false, plainText: 'Venus' },
      { answer: 'Mercury', correct: true, plainText: 'Mercury' },
      { answer: 'Earth', correct: false, plainText: 'Earth' },
      { answer: 'Mars', correct: false, plainText: 'Mars' },
    ],
  },
  {
    type: 1, // MS
    content: '<p>Select all prime numbers.</p>',
    plainText: 'Select all prime numbers.',
    options: [
      { answer: '2', correct: true, plainText: '2' },
      { answer: '4', correct: false, plainText: '4' },
      { answer: '7', correct: true, plainText: '7' },
      { answer: '9', correct: false, plainText: '9' },
      { answer: '11', correct: true, plainText: '11' },
    ],
  },
  {
    type: 0, // TF (MC with 2 options)
    content: '<p>True or False: Water boils at 100 °C at sea level.</p>',
    plainText: 'True or False: Water boils at 100 °C at sea level.',
    options: [
      { answer: 'True', correct: true, plainText: 'True' },
      { answer: 'False', correct: false, plainText: 'False' },
    ],
  },
  {
    type: 2, // SA
    content: '<p>What is the chemical symbol for gold?</p>',
    plainText: 'What is the chemical symbol for gold?',
    options: [],
    solution: 'Au',
    solution_plainText: 'Au',
  },
  {
    type: 3, // NU
    content: '<p>What is the value of π rounded to two decimal places?</p>',
    plainText: 'What is the value of π rounded to two decimal places?',
    options: [],
    correctNumerical: 3.14,
    toleranceNumerical: 0.01,
  },
];

/* ---------- main ------------------------------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const cleanOnly = args.includes('--clean');

  const studentsIdx = args.indexOf('--students');
  const numStudents = studentsIdx !== -1 ? parseInt(args[studentsIdx + 1], 10) : 500;
  if (Number.isNaN(numStudents) || numStudents < 1) {
    console.error('--students must be a positive integer');
    process.exit(1);
  }

  const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/qlicker';
  console.log(`Connecting to ${mongoUrl} …`);
  await mongoose.connect(mongoUrl);

  if (cleanOnly) {
    console.log('Cleaning load-test data …');
    await cleanup();
    await mongoose.disconnect();
    if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
    console.log('Done.');
    return;
  }

  console.log(`Seeding ${numStudents} students + professor + admin …`);
  const state = await seed(numStudents);

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`State written to ${STATE_PATH}`);
  await mongoose.disconnect();
  console.log('Done.');
}

/* ---------- seed logic ------------------------------------------------- */

const LOAD_TEST_TAG = '__loadtest__';
const PASSWORD = 'LoadTest1!';

async function seed(numStudents) {
  // Clean any previous run first
  await cleanup();

  const passwordHash = await hashPassword(PASSWORD);

  // --- Admin ---
  const admin = await User.create({
    emails: [{ address: 'loadtest-admin@example.com', verified: true }],
    services: { password: { bcrypt: passwordHash } },
    profile: { firstname: 'LT', lastname: 'Admin', roles: ['admin'] },
  });

  // --- Professor ---
  const professor = await User.create({
    emails: [{ address: 'loadtest-prof@example.com', verified: true }],
    services: { password: { bcrypt: passwordHash } },
    profile: { firstname: 'LT', lastname: 'Professor', roles: ['professor'] },
  });

  // --- Students (bulk) ---
  const studentDocs = [];
  for (let i = 1; i <= numStudents; i++) {
    studentDocs.push({
      _id: meteorId(),
      emails: [{ address: `loadtest-student${i}@example.com`, verified: true }],
      services: { password: { bcrypt: passwordHash } },
      profile: {
        firstname: 'Student',
        lastname: `LT${String(i).padStart(4, '0')}`,
        roles: ['student'],
      },
    });
  }
  await User.insertMany(studentDocs);
  const studentIds = studentDocs.map((s) => s._id);

  // --- Course ---
  const enrollmentCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  const course = await Course.create({
    name: `Load Test Course (${numStudents} students)`,
    deptCode: 'LT',
    courseNumber: '999',
    section: '001',
    semester: 'Load Test',
    owner: professor._id,
    instructors: [professor._id],
    students: studentIds,
    enrollmentCode,
  });

  // --- Questions ---
  const questionIds = [];
  for (const qDef of QUESTIONS) {
    const q = await Question.create({
      ...qDef,
      creator: professor._id,
      courseId: course._id,
      tags: [LOAD_TEST_TAG],
      sessionOptions: {
        hidden: true,
        stats: false,
        correct: false,
        points: 1,
        maxAttempts: 1,
        attempts: [],
      },
    });
    questionIds.push(q._id);
  }

  // --- Session ---
  const session = await Session.create({
    name: 'Load Test Session',
    courseId: course._id,
    creator: professor._id,
    status: 'hidden',
    questions: questionIds,
  });

  // Add session to course
  await Course.findByIdAndUpdate(course._id, { $push: { sessions: session._id } });

  // Build student credentials list for the k6 scenario
  const students = studentDocs.map((s, i) => ({
    email: `loadtest-student${i + 1}@example.com`,
    id: s._id,
  }));

  return {
    password: PASSWORD,
    admin: { email: 'loadtest-admin@example.com', id: admin._id },
    professor: { email: 'loadtest-prof@example.com', id: professor._id },
    students,
    course: { id: course._id, enrollmentCode },
    session: { id: session._id },
    questions: questionIds.map((id, i) => ({
      id,
      type: QUESTIONS[i].type,
      label: ['MC', 'MS', 'TF', 'SA', 'NU'][i],
      optionCount: QUESTIONS[i].options.length,
    })),
  };
}

async function cleanup() {
  // Collect load-test user IDs before deleting them (needed to clean responses)
  const loadTestUsers = await User.find(
    { 'emails.address': /^loadtest-/ },
    { _id: 1 },
  ).lean();
  const userIds = loadTestUsers.map((u) => u._id);

  // Remove users with loadtest emails
  await User.deleteMany({ 'emails.address': /^loadtest-/ });
  // Remove courses tagged as load test
  await Course.deleteMany({ deptCode: 'LT', courseNumber: '999' });
  // Remove questions tagged for load test
  await Question.deleteMany({ tags: LOAD_TEST_TAG });
  // Remove sessions created by the load test professor
  await Session.deleteMany({ name: 'Load Test Session' });

  // Clean responses from load test students
  if (userIds.length > 0) {
    const db = mongoose.connection.db;
    if (db) {
      await db
        .collection('responses')
        .deleteMany({ studentUserId: { $in: userIds } })
        .catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
