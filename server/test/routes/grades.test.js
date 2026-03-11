import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { createApp, getAuthToken, authenticatedRequest } from '../helpers.js';
import Course from '../../src/models/Course.js';
import Grade from '../../src/models/Grade.js';
import Question from '../../src/models/Question.js';
import Response from '../../src/models/Response.js';
import Session from '../../src/models/Session.js';
import User from '../../src/models/User.js';

let app;

beforeEach(async (ctx) => {
  if (mongoose.connection.readyState !== 1) {
    ctx.skip();
    return;
  }
  app = await createApp();
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

async function createUser({ email, roles = ['student'], firstname = 'Test', lastname = 'User' }) {
  return User.create({
    emails: [{ address: email.toLowerCase(), verified: true }],
    profile: {
      firstname,
      lastname,
      roles,
      courses: [],
    },
    createdAt: new Date(),
  });
}

async function createCourseAsProf(profToken, overrides = {}) {
  const payload = {
    name: 'Test Course',
    deptCode: 'CS',
    courseNumber: '610',
    section: '001',
    semester: 'Winter 2026',
    ...overrides,
  };

  const res = await authenticatedRequest(app, 'POST', '/api/v1/courses', {
    token: profToken,
    payload,
  });
  expect(res.statusCode).toBe(201);
  return res.json().course;
}

async function createSessionInCourse(profToken, courseId, overrides = {}) {
  const res = await authenticatedRequest(app, 'POST', `/api/v1/courses/${courseId}/sessions`, {
    token: profToken,
    payload: {
      name: 'Test Session',
      ...overrides,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().session;
}

async function setupCourseWithStudents({ studentCount = 2, prefix = 'grades' } = {}) {
  const prof = await createUser({
    email: `${prefix}.prof@example.com`,
    roles: ['professor'],
    firstname: 'Prof',
    lastname: 'One',
  });
  const profToken = await getAuthToken(app, prof);
  const createdCourse = await createCourseAsProf(profToken, {
    name: `${prefix}-course`,
  });

  const students = [];
  for (let i = 0; i < studentCount; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const student = await createUser({
      email: `${prefix}.student${i}@example.com`,
      roles: ['student'],
      firstname: `S${i}`,
      lastname: `Student${i}`,
    });
    students.push(student);
  }

  await Course.findByIdAndUpdate(createdCourse._id, {
    $set: {
      instructors: [prof._id],
      students: students.map((student) => student._id),
    },
  });

  const studentTokens = [];
  for (const student of students) {
    // eslint-disable-next-line no-await-in-loop
    studentTokens.push(await getAuthToken(app, student));
  }

  const course = await Course.findById(createdCourse._id).lean();
  return {
    prof,
    profToken,
    course,
    students,
    studentTokens,
  };
}

async function createMcQuestion({ creatorId, sessionId, courseId, points = 1 }) {
  return Question.create({
    type: 0,
    creator: creatorId,
    owner: creatorId,
    courseId,
    sessionId,
    plainText: 'MC question',
    content: '<p>MC question</p>',
    options: [
      { answer: 'A', plainText: 'A', correct: true },
      { answer: 'B', plainText: 'B', correct: false },
    ],
    sessionOptions: {
      points,
      maxAttempts: 1,
      attemptWeights: [1],
      attempts: [{ number: 1, closed: false }],
    },
  });
}

async function createSaQuestion({ creatorId, sessionId, courseId, points = 1 }) {
  return Question.create({
    type: 2,
    creator: creatorId,
    owner: creatorId,
    courseId,
    sessionId,
    plainText: 'SA question',
    content: '<p>Explain your reasoning</p>',
    sessionOptions: {
      points,
      maxAttempts: 1,
      attempts: [{ number: 1, closed: false }],
    },
  });
}

describe('Grading routes', () => {
  it('backfills a missing session msScoringMethod to the default during grade recalculation', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const { profToken, course } = await setupCourseWithStudents({
      studentCount: 1,
      prefix: 'ms-backfill',
    });

    const session = await createSessionInCourse(profToken, course._id, { name: 'MS backfill session' });
    await Session.findByIdAndUpdate(session._id, {
      $set: { status: 'done' },
      $unset: { msScoringMethod: '' },
    });

    const recalc = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/grades/recalculate`, {
      token: profToken,
      payload: { missingOnly: false },
    });

    expect(recalc.statusCode).toBe(200);

    const persistedSession = await Session.findById(session._id).lean();
    expect(persistedSession.msScoringMethod).toBe('right-minus-wrong');
  });

  it('recalculates grades, preserves manual overrides, and exposes grading conflicts/warnings', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const { profToken, course, students } = await setupCourseWithStudents({
      studentCount: 2,
      prefix: 'manual-conflicts',
    });

    const session = await createSessionInCourse(profToken, course._id, { name: 'Manual conflict session' });
    await Session.findByIdAndUpdate(session._id, {
      $set: {
        status: 'done',
        joined: [students[0]._id],
      },
    });

    const mcQuestion = await createMcQuestion({
      creatorId: students[0]._id,
      sessionId: session._id,
      courseId: course._id,
      points: 1,
    });
    const saQuestion = await createSaQuestion({
      creatorId: students[0]._id,
      sessionId: session._id,
      courseId: course._id,
      points: 1,
    });

    await Session.findByIdAndUpdate(session._id, {
      $set: { questions: [mcQuestion._id, saQuestion._id] },
    });

    const now = new Date();
    await Response.create({
      attempt: 1,
      questionId: mcQuestion._id,
      studentUserId: students[0]._id,
      answer: 'A',
      createdAt: now,
      updatedAt: now,
    });
    await Response.create({
      attempt: 1,
      questionId: saQuestion._id,
      studentUserId: students[0]._id,
      answer: 'This should be manually graded.',
      createdAt: now,
      updatedAt: now,
    });

    const recalcInitial = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/grades/recalculate`, {
      token: profToken,
      payload: { missingOnly: false },
    });

    expect(recalcInitial.statusCode).toBe(200);
    expect(recalcInitial.json().summary.createdGradeCount).toBe(2);

    const gradesAfterInitial = await Grade.find({ sessionId: session._id, courseId: course._id }).lean();
    const studentGrade = gradesAfterInitial.find((grade) => grade.userId === students[0]._id);
    expect(studentGrade).toBeDefined();

    const setManualMark = await authenticatedRequest(
      app,
      'PATCH',
      `/api/v1/grades/${studentGrade._id}/marks/${mcQuestion._id}`,
      {
        token: profToken,
        payload: {
          points: 0,
          feedback: '<p>Manual override</p>',
        },
      }
    );
    expect(setManualMark.statusCode).toBe(200);
    expect(setManualMark.json().grade.marks.find((mark) => mark.questionId === mcQuestion._id).automatic).toBe(false);

    const recalcAgain = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/grades/recalculate`, {
      token: profToken,
      payload: { missingOnly: false },
    });

    expect(recalcAgain.statusCode).toBe(200);
    const recalcSummary = recalcAgain.json().summary;
    expect(recalcSummary.manualMarkConflicts).toHaveLength(1);
    expect(recalcSummary.manualMarkConflicts[0].questionId).toBe(mcQuestion._id);
    expect(recalcSummary.ungradableQuestionIds).toContain(saQuestion._id);
    expect(recalcSummary.warnings.join(' ')).toContain('cannot be auto-graded');
    expect(recalcSummary.warnings.join(' ')).toContain('manual mark overrides differ');

    const persistedStudentGrade = await Grade.findById(studentGrade._id).lean();
    const persistedManualMark = persistedStudentGrade.marks.find((mark) => mark.questionId === mcQuestion._id);
    expect(persistedManualMark.points).toBe(0);
    expect(persistedManualMark.automatic).toBe(false);

    const restoreAutomaticMark = await authenticatedRequest(
      app,
      'POST',
      `/api/v1/grades/${studentGrade._id}/marks/${mcQuestion._id}/set-automatic`,
      { token: profToken }
    );
    expect(restoreAutomaticMark.statusCode).toBe(200);
    const restoredMark = restoreAutomaticMark.json().grade.marks.find((mark) => mark.questionId === mcQuestion._id);
    expect(restoredMark.automatic).toBe(true);
    expect(restoredMark.points).toBe(1);

    const setManualGradeValue = await authenticatedRequest(app, 'PATCH', `/api/v1/grades/${studentGrade._id}/value`, {
      token: profToken,
      payload: { value: 12.3 },
    });
    expect(setManualGradeValue.statusCode).toBe(200);
    expect(setManualGradeValue.json().grade.automatic).toBe(false);
    expect(setManualGradeValue.json().grade.value).toBe(12.3);

    const restoreAutomaticGradeValue = await authenticatedRequest(app, 'POST', `/api/v1/grades/${studentGrade._id}/value/set-automatic`, {
      token: profToken,
    });
    expect(restoreAutomaticGradeValue.statusCode).toBe(200);
    expect(restoreAutomaticGradeValue.json().grade.automatic).toBe(true);
    expect(restoreAutomaticGradeValue.json().grade.value).toBe(50);
  });

  it('enforces student visibility restrictions for course/session grades and blocks student recalculation', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const {
      profToken,
      course,
      students,
      studentTokens,
    } = await setupCourseWithStudents({ studentCount: 2, prefix: 'visibility' });

    const reviewableSession = await createSessionInCourse(profToken, course._id, { name: 'Reviewable session' });
    const hiddenGradesSession = await createSessionInCourse(profToken, course._id, { name: 'Non-reviewable session' });

    await Session.findByIdAndUpdate(reviewableSession._id, {
      $set: {
        status: 'done',
        reviewable: true,
        joined: [students[0]._id],
      },
    });
    await Session.findByIdAndUpdate(hiddenGradesSession._id, {
      $set: {
        status: 'done',
        reviewable: false,
        joined: [students[0]._id],
      },
    });

    const reviewableQuestion = await createMcQuestion({
      creatorId: students[0]._id,
      sessionId: reviewableSession._id,
      courseId: course._id,
      points: 1,
    });
    const hiddenQuestion = await createMcQuestion({
      creatorId: students[0]._id,
      sessionId: hiddenGradesSession._id,
      courseId: course._id,
      points: 1,
    });

    await Session.findByIdAndUpdate(reviewableSession._id, {
      $set: { questions: [reviewableQuestion._id] },
    });
    await Session.findByIdAndUpdate(hiddenGradesSession._id, {
      $set: { questions: [hiddenQuestion._id] },
    });

    const now = new Date();
    await Response.create({
      attempt: 1,
      questionId: reviewableQuestion._id,
      studentUserId: students[0]._id,
      answer: 'A',
      createdAt: now,
      updatedAt: now,
    });
    await Response.create({
      attempt: 1,
      questionId: hiddenQuestion._id,
      studentUserId: students[0]._id,
      answer: 'A',
      createdAt: now,
      updatedAt: now,
    });

    const recalcReviewable = await authenticatedRequest(
      app,
      'POST',
      `/api/v1/sessions/${reviewableSession._id}/grades/recalculate`,
      { token: profToken, payload: { missingOnly: false } }
    );
    expect(recalcReviewable.statusCode).toBe(200);

    const recalcHidden = await authenticatedRequest(
      app,
      'POST',
      `/api/v1/sessions/${hiddenGradesSession._id}/grades/recalculate`,
      { token: profToken, payload: { missingOnly: false } }
    );
    expect(recalcHidden.statusCode).toBe(200);

    const studentAToken = studentTokens[0];
    const studentBToken = studentTokens[1];

    const courseGradesForStudentA = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/grades`, {
      token: studentAToken,
    });
    expect(courseGradesForStudentA.statusCode).toBe(200);
    const courseGradesPayload = courseGradesForStudentA.json();
    expect(courseGradesPayload.instructorView).toBe(false);
    expect(courseGradesPayload.sessions).toHaveLength(1);
    expect(courseGradesPayload.sessions[0]._id).toBe(reviewableSession._id);
    expect(courseGradesPayload.rows).toHaveLength(1);
    expect(courseGradesPayload.rows[0].student.studentId).toBe(students[0]._id);

    const courseGradesForStudentB = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/grades`, {
      token: studentBToken,
    });
    expect(courseGradesForStudentB.statusCode).toBe(200);
    expect(courseGradesForStudentB.json().rows).toHaveLength(1);
    expect(courseGradesForStudentB.json().rows[0].student.studentId).toBe(students[1]._id);

    const sessionGradesReviewable = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${reviewableSession._id}/grades`, {
      token: studentAToken,
    });
    expect(sessionGradesReviewable.statusCode).toBe(200);
    expect(sessionGradesReviewable.json().instructorView).toBe(false);
    expect(sessionGradesReviewable.json().grades).toHaveLength(1);
    expect(sessionGradesReviewable.json().grades[0].userId).toBe(students[0]._id);

    const sessionGradesNotReviewable = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${hiddenGradesSession._id}/grades`, {
      token: studentAToken,
    });
    expect(sessionGradesNotReviewable.statusCode).toBe(403);

    const studentRecalcAttempt = await authenticatedRequest(
      app,
      'POST',
      `/api/v1/sessions/${reviewableSession._id}/grades/recalculate`,
      {
        token: studentAToken,
        payload: { missingOnly: false },
      }
    );
    expect(studentRecalcAttempt.statusCode).toBe(403);
  });

  it('excludes low-response single-attempt questions and supports missing-only grade backfill', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const { profToken, course, students } = await setupCourseWithStudents({
      studentCount: 20,
      prefix: 'low-response',
    });

    const session = await createSessionInCourse(profToken, course._id, { name: 'Low response exclusion session' });
    await Session.findByIdAndUpdate(session._id, {
      $set: {
        status: 'done',
        reviewable: false,
        joined: students.map((student) => student._id),
      },
    });

    const question = await createMcQuestion({
      creatorId: students[0]._id,
      sessionId: session._id,
      courseId: course._id,
      points: 1,
    });

    await Session.findByIdAndUpdate(session._id, {
      $set: { questions: [question._id] },
    });

    const now = new Date();
    await Response.create({
      attempt: 1,
      questionId: question._id,
      studentUserId: students[0]._id,
      answer: 'A',
      createdAt: now,
      updatedAt: now,
    });

    const firstRecalc = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/grades/recalculate`, {
      token: profToken,
      payload: { missingOnly: false },
    });

    expect(firstRecalc.statusCode).toBe(200);
    const firstSummary = firstRecalc.json().summary;
    expect(firstSummary.lowResponseExcludedQuestionIds).toContain(question._id);
    expect(firstSummary.createdGradeCount).toBe(20);

    const responseStudentGrade = await Grade.findOne({
      sessionId: session._id,
      courseId: course._id,
      userId: students[0]._id,
    }).lean();
    expect(responseStudentGrade.outOf).toBe(0);
    expect(responseStudentGrade.numQuestions).toBe(0);
    expect(responseStudentGrade.participation).toBe(100);
    expect(responseStudentGrade.marks[0].outOf).toBe(0);

    await Grade.deleteOne({
      sessionId: session._id,
      courseId: course._id,
      userId: students[19]._id,
    });

    const missingOnlyRecalc = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/grades/recalculate`, {
      token: profToken,
      payload: { missingOnly: true },
    });

    expect(missingOnlyRecalc.statusCode).toBe(200);
    const missingSummary = missingOnlyRecalc.json().summary;
    expect(missingSummary.createdGradeCount).toBe(1);
    expect(missingSummary.skippedExistingCount).toBe(19);
  });

  it('seeds missing grade rows when making a session reviewable and toggles grade visibility', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const { profToken, course, students } = await setupCourseWithStudents({
      studentCount: 3,
      prefix: 'reviewable-toggle',
    });

    const session = await createSessionInCourse(profToken, course._id, { name: 'Reviewable toggle session' });
    await Session.findByIdAndUpdate(session._id, {
      $set: {
        status: 'done',
        reviewable: false,
      },
    });

    await Grade.create({
      userId: students[0]._id,
      courseId: course._id,
      sessionId: session._id,
      name: session.name,
      joined: false,
      participation: 0,
      value: 0,
      automatic: true,
      points: 0,
      outOf: 0,
      numAnswered: 0,
      numQuestions: 0,
      numAnsweredTotal: 0,
      numQuestionsTotal: 0,
      visibleToStudents: false,
      needsGrading: false,
      marks: [],
    });

    const makeReviewable = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { reviewable: true },
    });

    expect(makeReviewable.statusCode).toBe(200);
    expect(makeReviewable.json().session.reviewable).toBe(true);
    expect(makeReviewable.json().grading).toBeDefined();
    expect(makeReviewable.json().grading.missingOnly).toBe(true);
    expect(makeReviewable.json().grading.createdGradeCount).toBe(2);

    const visibleGrades = await Grade.find({ sessionId: session._id, courseId: course._id }).lean();
    expect(visibleGrades).toHaveLength(3);
    expect(visibleGrades.every((grade) => grade.visibleToStudents === true)).toBe(true);

    const hideReviewable = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/reviewable`, {
      token: profToken,
      payload: { reviewable: false },
    });

    expect(hideReviewable.statusCode).toBe(200);
    const hiddenGrades = await Grade.find({ sessionId: session._id, courseId: course._id }).lean();
    expect(hiddenGrades.every((grade) => grade.visibleToStudents === false)).toBe(true);
  });
});
