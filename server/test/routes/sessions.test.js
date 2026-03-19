import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { createApp, createTestUser, getAuthToken, authenticatedRequest } from '../helpers.js';
import Course from '../../src/models/Course.js';
import Grade from '../../src/models/Grade.js';
import Question from '../../src/models/Question.js';
import Response from '../../src/models/Response.js';
import Session from '../../src/models/Session.js';

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

// Helper to create a course via the API
async function createCourseAsProf(profToken, overrides = {}) {
  const payload = {
    name: 'Test Course',
    deptCode: 'CS',
    courseNumber: '101',
    section: '001',
    semester: 'Fall 2025',
    ...overrides,
  };
  const res = await authenticatedRequest(app, 'POST', '/api/v1/courses', {
    token: profToken,
    payload,
  });
  return res;
}

// Helper to create a session via the API
async function createSessionInCourse(token, courseId, overrides = {}) {
  const payload = {
    name: 'Test Session',
    ...overrides,
  };
  const res = await authenticatedRequest(app, 'POST', `/api/v1/courses/${courseId}/sessions`, {
    token,
    payload,
  });
  return res;
}

// Helper to set up a prof + course + enrolled student
async function setupCourseWithStudent() {
  const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
  const profToken = await getAuthToken(app, prof);
  const createRes = await createCourseAsProf(profToken);
  const course = createRes.json().course;

  const student = await createTestUser({ email: 'student@example.com', roles: ['student'] });
  const studentToken = await getAuthToken(app, student);

  await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
    token: studentToken,
    payload: { enrollmentCode: course.enrollmentCode },
  });

  return { prof, profToken, course, student, studentToken };
}

async function createQuestionInSession(profToken, {
  sessionId,
  courseId,
  ...payload
}) {
  const qRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
    token: profToken,
    payload: {
      sessionId,
      courseId,
      ...payload,
    },
  });
  expect(qRes.statusCode).toBe(201);

  const question = qRes.json().question;
  const addRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${sessionId}/questions`, {
    token: profToken,
    payload: { questionId: question._id },
  });
  expect(addRes.statusCode).toBe(200);

  return question;
}

// ---------- POST /api/v1/courses/:courseId/sessions ----------
describe('POST /api/v1/courses/:courseId/sessions', () => {
  it('professor can create a session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;

    const res = await createSessionInCourse(profToken, course._id);

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.session).toBeDefined();
    expect(body.session.name).toBe('Test Session');
    expect(body.session.courseId).toBe(course._id);
    expect(body.session.status).toBe('hidden');
  });

  it('student cannot create a session (403)', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { course, studentToken } = await setupCourseWithStudent();

    const res = await createSessionInCourse(studentToken, course._id);

    expect(res.statusCode).toBe(403);
  });

  it('student can create a practice session that tracks ownership', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { course, student, studentToken } = await setupCourseWithStudent();

    const res = await createSessionInCourse(studentToken, course._id, {
      name: 'My Practice Session',
      practiceQuiz: true,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().session.practiceQuiz).toBe(true);
    expect(res.json().session.quiz).toBe(true);
    expect(res.json().session.studentCreated).toBe(true);
    expect(res.json().session.creator).toBe(student._id.toString());
  });

  it('session is added to course sessions array', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;

    const sessionRes = await createSessionInCourse(profToken, course._id);
    const session = sessionRes.json().session;

    const updatedCourse = await Course.findById(course._id);
    expect(updatedCourse.sessions).toContain(session._id);
  });

  it('creating a practice quiz forces quiz=true', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;

    const res = await createSessionInCourse(profToken, course._id, {
      name: 'Practice Session',
      quiz: false,
      practiceQuiz: true,
    });

    expect(res.statusCode).toBe(201);
    const session = res.json().session;
    expect(session.practiceQuiz).toBe(true);
    expect(session.quiz).toBe(true);
  });

  it('rejects quiz creation when quizEnd is not later than quizStart', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof-quiz-window@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const now = Date.now();

    const res = await createSessionInCourse(profToken, course._id, {
      name: 'Invalid Quiz Window',
      quiz: true,
      quizStart: new Date(now + (60 * 1000)).toISOString(),
      quizEnd: new Date(now).toISOString(),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('Quiz end time must be later than quiz start time');
  });
});

// ---------- GET /api/v1/courses/:courseId/sessions ----------
describe('GET /api/v1/courses/:courseId/sessions', () => {
  it('professor sees all sessions including hidden', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;

    await createSessionInCourse(profToken, course._id, { name: 'Hidden Session' });
    const sess2Res = await createSessionInCourse(profToken, course._id, { name: 'Visible Session' });
    const sess2 = sess2Res.json().session;
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${sess2._id}`, {
      token: profToken,
      payload: { status: 'visible' },
    });

    const res = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessions.length).toBe(2);
  });

  it('student does not see hidden sessions', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();

    await createSessionInCourse(profToken, course._id, { name: 'Hidden Session' });
    const sess2Res = await createSessionInCourse(profToken, course._id, { name: 'Visible Session' });
    const sess2 = sess2Res.json().session;
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${sess2._id}`, {
      token: profToken,
      payload: { status: 'visible' },
    });

    const res = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: studentToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessions.length).toBe(1);
    expect(body.sessions[0].name).toBe('Visible Session');
  });

  it('student only sees their own practice sessions in the session list', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { course, studentToken } = await setupCourseWithStudent();
    const otherStudent = await createTestUser({ email: 'other-student-practice@example.com', roles: ['student'] });
    const otherStudentToken = await getAuthToken(app, otherStudent);
    const enrollRes = await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: otherStudentToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });
    expect(enrollRes.statusCode).toBe(200);

    const ownPractice = await createSessionInCourse(studentToken, course._id, { name: 'Own Practice', practiceQuiz: true });
    expect(ownPractice.statusCode).toBe(201);
    const otherPractice = await createSessionInCourse(otherStudentToken, course._id, { name: 'Other Practice', practiceQuiz: true });
    expect(otherPractice.statusCode).toBe(201);

    const res = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: studentToken,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().sessions.some((session) => session.name === 'Own Practice')).toBe(true);
    expect(res.json().sessions.some((session) => session.name === 'Other Practice')).toBe(false);
  });

  it('student session list includes hasNewFeedback when visible grades have unseen feedback', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();

    const sessionWithFeedbackRes = await createSessionInCourse(profToken, course._id, { name: 'Session A' });
    const sessionWithFeedback = sessionWithFeedbackRes.json().session;
    const sessionWithoutFeedbackRes = await createSessionInCourse(profToken, course._id, { name: 'Session B' });
    const sessionWithoutFeedback = sessionWithoutFeedbackRes.json().session;

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${sessionWithFeedback._id}`, {
      token: profToken,
      payload: { status: 'done', reviewable: true },
    });
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${sessionWithoutFeedback._id}`, {
      token: profToken,
      payload: { status: 'done', reviewable: true },
    });

    const now = new Date();
    await Grade.create({
      userId: student._id,
      courseId: course._id,
      sessionId: sessionWithFeedback._id,
      name: sessionWithFeedback.name,
      visibleToStudents: true,
      marks: [
        {
          questionId: 'q-feedback-1',
          feedback: '<p>New feedback</p>',
          feedbackUpdatedAt: now,
        },
      ],
    });
    await Grade.create({
      userId: student._id,
      courseId: course._id,
      sessionId: sessionWithoutFeedback._id,
      name: sessionWithoutFeedback.name,
      visibleToStudents: true,
      marks: [
        {
          questionId: 'q-feedback-2',
          feedback: '',
          feedbackUpdatedAt: null,
        },
      ],
    });

    const res = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: studentToken,
    });
    expect(res.statusCode).toBe(200);

    const listedWithFeedback = res.json().sessions.find((row) => row._id === sessionWithFeedback._id);
    const listedWithoutFeedback = res.json().sessions.find((row) => row._id === sessionWithoutFeedback._id);
    expect(listedWithFeedback).toBeDefined();
    expect(listedWithFeedback.hasNewFeedback).toBe(true);
    expect(listedWithFeedback.newFeedbackQuestionIds).toEqual(['q-feedback-1']);
    expect(listedWithoutFeedback).toBeDefined();
    expect(listedWithoutFeedback.hasNewFeedback).toBe(false);
  });

  it('non-member gets 403', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;

    const other = await createTestUser({ email: 'other@example.com', roles: ['student'] });
    const otherToken = await getAuthToken(app, other);

    const res = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: otherToken,
    });

    expect(res.statusCode).toBe(403);
  });

  it('scheduled visible quizzes appear as running while the quiz window is active', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();

    const now = Date.now();
    const start = new Date(now - (15 * 60 * 1000)).toISOString();
    const end = new Date(now + (15 * 60 * 1000)).toISOString();
    const sessRes = await createSessionInCourse(profToken, course._id, {
      name: 'Scheduled Quiz',
      quiz: true,
      quizStart: start,
      quizEnd: end,
    });
    const session = sessRes.json().session;

    const visibleRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { status: 'visible' },
    });
    expect(visibleRes.statusCode).toBe(200);

    const studentListRes = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: studentToken,
    });
    expect(studentListRes.statusCode).toBe(200);

    const listed = studentListRes.json().sessions.find((row) => row._id === session._id);
    expect(listed).toBeDefined();
    expect(listed.status).toBe('running');
  });

  it('scheduled visible quizzes auto-close to done once all quiz windows end', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course } = await setupCourseWithStudent();

    const now = Date.now();
    const start = new Date(now - (2 * 60 * 60 * 1000)).toISOString();
    const end = new Date(now - (60 * 1000)).toISOString();
    const sessRes = await createSessionInCourse(profToken, course._id, {
      name: 'Expired Quiz',
      quiz: true,
      quizStart: start,
      quizEnd: end,
    });
    const session = sessRes.json().session;

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { status: 'visible' },
    });

    const listRes = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: profToken,
    });
    expect(listRes.statusCode).toBe(200);
    const listed = listRes.json().sessions.find((row) => row._id === session._id);
    expect(listed).toBeDefined();
    expect(listed.status).toBe('done');

    const persisted = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}`, {
      token: profToken,
    });
    expect(persisted.statusCode).toBe(200);
    expect(persisted.json().session.status).toBe('done');
  });

  it('extensions keep access open only for extension students after the base quiz window closes', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const extensionStudent = await createTestUser({
      email: 'extension-student@example.com',
      roles: ['student'],
    });
    const extensionStudentToken = await getAuthToken(app, extensionStudent);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: extensionStudentToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const now = Date.now();
    const baseStart = new Date(now - (2 * 60 * 60 * 1000)).toISOString();
    const baseEnd = new Date(now - (60 * 1000)).toISOString();
    const extensionStart = new Date(now - (10 * 60 * 1000)).toISOString();
    const extensionEnd = new Date(now + (10 * 60 * 1000)).toISOString();

    const sessRes = await createSessionInCourse(profToken, course._id, {
      name: 'Extension Quiz',
      quiz: true,
      quizStart: baseStart,
      quizEnd: baseEnd,
    });
    const session = sessRes.json().session;

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { status: 'visible' },
    });
    const extensionsRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/extensions`, {
      token: profToken,
      payload: {
        extensions: [
          {
            userId: extensionStudent._id,
            quizStart: extensionStart,
            quizEnd: extensionEnd,
          },
        ],
      },
    });
    expect(extensionsRes.statusCode).toBe(200);

    const studentOneRes = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: studentToken,
    });
    expect(studentOneRes.statusCode).toBe(200);
    const studentOneSession = studentOneRes.json().sessions.find((row) => row._id === session._id);
    expect(studentOneSession.status).toBe('done');

    const studentTwoRes = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: extensionStudentToken,
    });
    expect(studentTwoRes.statusCode).toBe(200);
    const studentTwoSession = studentTwoRes.json().sessions.find((row) => row._id === session._id);
    expect(studentTwoSession.status).toBe('running');

    const profRes = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: profToken,
    });
    expect(profRes.statusCode).toBe(200);
    const profSession = profRes.json().sessions.find((row) => row._id === session._id);
    expect(profSession.status).toBe('running');
    expect(profSession.quizHasActiveExtensions).toBe(true);
  });

  it('supports server-side pagination with page and limit params', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof-pg@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;

    // Create 5 sessions
    for (let i = 0; i < 5; i++) {
      const sessRes = await createSessionInCourse(profToken, course._id, { name: `Session ${i + 1}` });
      expect(sessRes.statusCode).toBe(201);
    }

    // Page 1, limit 2
    const page1 = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions?page=1&limit=2`, {
      token: profToken,
    });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json();
    expect(body1.sessions.length).toBe(2);
    expect(body1.total).toBe(5);
    expect(body1.page).toBe(1);
    expect(body1.pages).toBe(3);

    // Page 3, limit 2 (should have 1 session)
    const page3 = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions?page=3&limit=2`, {
      token: profToken,
    });
    expect(page3.statusCode).toBe(200);
    const body3 = page3.json();
    expect(body3.sessions.length).toBe(1);
    expect(body3.total).toBe(5);
    expect(body3.page).toBe(3);
    expect(body3.pages).toBe(3);
  });

  it('returns all sessions without pagination fields when no page/limit params', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof-nopg@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;

    for (let i = 0; i < 3; i++) {
      await createSessionInCourse(profToken, course._id, { name: `Sess ${i + 1}` });
    }

    const res = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: profToken,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessions.length).toBe(3);
    expect(body.total).toBe(3);
    expect(body.page).toBeUndefined();
    expect(body.pages).toBeUndefined();
  });
});

// ---------- GET /api/v1/sessions/live ----------
describe('GET /api/v1/sessions/live', () => {
  it('student sees running interactive sessions and active unsubmitted quizzes, but not submitted live quizzes', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, student, studentToken } = await setupCourseWithStudent();
    const now = Date.now();

    const liveSessionRes = await createSessionInCourse(profToken, course._id, { name: 'Live Poll' });
    const liveSession = liveSessionRes.json().session;
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${liveSession._id}`, {
      token: profToken,
      payload: { status: 'running' },
    });

    const openQuizRes = await createSessionInCourse(profToken, course._id, {
      name: 'Open Quiz',
      quiz: true,
      quizStart: new Date(now - (15 * 60 * 1000)).toISOString(),
      quizEnd: new Date(now + (15 * 60 * 1000)).toISOString(),
    });
    const openQuiz = openQuizRes.json().session;
    const openQuestion = await Question.create({
      type: 1,
      creator: prof._id,
      owner: prof._id,
      sessionId: openQuiz._id,
      courseId: course._id,
      content: '<p>Open quiz question</p>',
      plainText: 'Open quiz question',
      sessionOptions: { points: 1, maxAttempts: 1, attempts: [{ number: 1, closed: false }] },
    });
    await Session.updateOne(
      { _id: openQuiz._id },
      { $set: { questions: [openQuestion._id], status: 'visible' } }
    );
    await Response.create({
      attempt: 1,
      questionId: openQuestion._id,
      studentUserId: student._id,
      answer: 'A',
    });

    const submittedQuizRes = await createSessionInCourse(profToken, course._id, {
      name: 'Submitted Quiz',
      quiz: true,
      quizStart: new Date(now - (15 * 60 * 1000)).toISOString(),
      quizEnd: new Date(now + (15 * 60 * 1000)).toISOString(),
    });
    const submittedQuiz = submittedQuizRes.json().session;
    await Session.updateOne(
      { _id: submittedQuiz._id },
      { $set: { status: 'visible', submittedQuiz: [student._id] } }
    );

    const studentPracticeRes = await createSessionInCourse(studentToken, course._id, {
      name: 'Student Practice Session',
      practiceQuiz: true,
    });
    const studentPracticeSession = studentPracticeRes.json().session;
    await Session.updateOne(
      { _id: studentPracticeSession._id },
      { $set: { status: 'running' } }
    );

    const res = await authenticatedRequest(app, 'GET', '/api/v1/sessions/live', {
      token: studentToken,
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json().liveSessions || [];
    expect(rows.map((row) => row._id)).toContain(liveSession._id);
    expect(rows.map((row) => row._id)).toContain(openQuiz._id);
    expect(rows.map((row) => row._id)).not.toContain(submittedQuiz._id);
    expect(rows.map((row) => row._id)).not.toContain(studentPracticeSession._id);

    const listedQuiz = rows.find((row) => row._id === openQuiz._id);
    expect(listedQuiz.quiz).toBe(true);
    expect(listedQuiz.quizHasResponsesByCurrentUser).toBe(true);
    expect(listedQuiz.quizAllQuestionsAnsweredByCurrentUser).toBe(true);
  });
});

// ---------- GET /api/v1/sessions/:id ----------
describe('GET /api/v1/sessions/:id', () => {
  it('instructor can get session details', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session).toBeDefined();
    expect(body.session.name).toBe('Test Session');
  });

  it('backfills a missing msScoringMethod to default when instructor opens the session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof-ms@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await Session.updateOne(
      { _id: session._id },
      { $unset: { msScoringMethod: '' } }
    );

    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().session.msScoringMethod).toBe('right-minus-wrong');

    const persisted = await Session.findById(session._id).lean();
    expect(persisted.msScoringMethod).toBe('right-minus-wrong');
  });

  it('student cannot see hidden session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}`, {
      token: studentToken,
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for non-existent session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/sessions/nonexistent123456', {
      token: profToken,
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------- PATCH /api/v1/sessions/:id ----------
describe('PATCH /api/v1/sessions/:id', () => {
  it('instructor can update session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { name: 'Updated Session', description: 'New desc' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.name).toBe('Updated Session');
    expect(body.session.description).toBe('New desc');
  });

  it('persists normalized session tags from editor updates', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'session-tags-prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const course = (await createCourseAsProf(profToken)).json().course;
    await Course.findByIdAndUpdate(course._id, {
      $set: {
        tags: [
          { value: 'kinematics', label: 'kinematics' },
          { value: 'vectors', label: 'vectors' },
        ],
      },
    });
    const session = (await createSessionInCourse(profToken, course._id)).json().session;

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: {
        tags: [
          { value: 'kinematics', label: 'kinematics' },
          { value: 'vectors', label: 'vectors' },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().session.tags).toEqual([
      { value: 'kinematics', label: 'kinematics' },
      { value: 'vectors', label: 'vectors' },
    ]);
  });

  it('non-instructor gets 403', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: studentToken,
      payload: { name: 'Hacked' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('setting practiceQuiz=true also sets quiz=true', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id, { quiz: false, practiceQuiz: false });
    const session = sessRes.json().session;

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { practiceQuiz: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().session.practiceQuiz).toBe(true);
    expect(res.json().session.quiz).toBe(true);
  });

  it('setting quiz=false also clears practiceQuiz', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id, { quiz: true, practiceQuiz: true });
    const session = sessRes.json().session;

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { quiz: false },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().session.quiz).toBe(false);
    expect(res.json().session.practiceQuiz).toBe(false);
  });

  it('cannot make a quiz reviewable while quiz extensions are active', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student } = await setupCourseWithStudent();
    const now = Date.now();
    const sessRes = await createSessionInCourse(profToken, course._id, {
      quiz: true,
      quizStart: new Date(now - (2 * 60 * 60 * 1000)).toISOString(),
      quizEnd: new Date(now + (2 * 60 * 60 * 1000)).toISOString(),
    });
    const session = sessRes.json().session;

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { status: 'done' },
    });

    const extensionRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/extensions`, {
      token: profToken,
      payload: {
        extensions: [
          {
            userId: student._id,
            quizStart: new Date(now - (10 * 60 * 1000)).toISOString(),
            quizEnd: new Date(now + (10 * 60 * 1000)).toISOString(),
          },
        ],
      },
    });
    expect(extensionRes.statusCode).toBe(200);

    const reviewableRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { reviewable: true },
    });
    expect(reviewableRes.statusCode).toBe(400);
    expect(reviewableRes.json().message).toContain('quiz extensions are active');
  });

  it('rejects updates when quizEnd is not later than quizStart', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof-quiz-window-update@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const now = Date.now();

    const sessRes = await createSessionInCourse(profToken, course._id, {
      quiz: true,
      quizStart: new Date(now).toISOString(),
      quizEnd: new Date(now + (60 * 60 * 1000)).toISOString(),
    });
    const session = sessRes.json().session;

    const patchRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { quizEnd: new Date(now - (60 * 1000)).toISOString() },
    });

    expect(patchRes.statusCode).toBe(400);
    expect(patchRes.json().message).toContain('Quiz end time must be later than quiz start time');
  });
});

// ---------- DELETE /api/v1/sessions/:id ----------
describe('DELETE /api/v1/sessions/:id', () => {
  it('instructor can delete session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const res = await authenticatedRequest(app, 'DELETE', `/api/v1/sessions/${session._id}`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify session removed from course
    const updatedCourse = await Course.findById(course._id);
    expect(updatedCourse.sessions).not.toContain(session._id);
  });

  it('non-instructor gets 403', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const res = await authenticatedRequest(app, 'DELETE', `/api/v1/sessions/${session._id}`, {
      token: studentToken,
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------- POST /api/v1/sessions/:id/start ----------
describe('POST /api/v1/sessions/:id/start', () => {
  it('instructor can start a session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.status).toBe('running');
  });

  it('non-instructor gets 403', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: studentToken,
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------- GET /api/v1/sessions/:id/live ----------
describe('GET /api/v1/sessions/:id/live', () => {
  it('treats slides as non-response items in live sessions', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const slide = await createQuestionInSession(profToken, {
      type: 6,
      content: '<p>Slide content</p>',
      plainText: 'Slide content',
      sessionId: session._id,
      courseId: course._id,
      sessionOptions: { points: 0 },
    });
    await createQuestionInSession(profToken, {
      type: 0,
      content: '<p>First graded question</p>',
      plainText: 'First graded question',
      sessionId: session._id,
      courseId: course._id,
      options: [
        { content: 'A', correct: true },
        { content: 'B', correct: false },
      ],
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const visibilityRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/question-visibility`, {
      token: profToken,
      payload: { hidden: false, stats: true, correct: true },
    });
    expect(visibilityRes.statusCode).toBe(200);
    expect(visibilityRes.json().question.sessionOptions.hidden).toBe(false);
    expect(visibilityRes.json().question.sessionOptions.stats).toBe(false);
    expect(visibilityRes.json().question.sessionOptions.correct).toBe(false);

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    const instructorLiveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: profToken,
    });
    expect(instructorLiveRes.statusCode).toBe(200);
    expect(instructorLiveRes.json().currentQuestion._id).toBe(slide._id);
    expect(instructorLiveRes.json().currentAttempt).toBeNull();
    expect(instructorLiveRes.json().responseStats).toBeNull();
    expect(instructorLiveRes.json().responseCount).toBe(0);
    expect(instructorLiveRes.json().pageProgress).toEqual({ current: 1, total: 2 });
    expect(instructorLiveRes.json().questionProgress).toEqual({ current: 0, total: 1 });

    const studentLiveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: studentToken,
    });
    expect(studentLiveRes.statusCode).toBe(200);
    expect(studentLiveRes.json().showStats).toBe(false);
    expect(studentLiveRes.json().showCorrect).toBe(false);
    expect(studentLiveRes.json().pageProgress).toEqual({ current: 1, total: 2 });
    expect(studentLiveRes.json().questionProgress).toEqual({ current: 0, total: 1 });

    const respondRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/respond`, {
      token: studentToken,
      payload: { answer: 'ignored' },
    });
    expect(respondRes.statusCode).toBe(400);
    expect(respondRes.json().message).toContain('Slides do not accept live responses');
  });

  it('student payload is limited to live-participation fields', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: studentToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.session).toBeDefined();
    expect(body.session._id).toBe(session._id);
    expect(body.session.name).toBe(session.name);
    expect(body.session.status).toBe('running');
    expect(body.session).toHaveProperty('joinCodeActive');
    expect(body.session).toHaveProperty('joinCodeEnabled');

    expect(body.session).not.toHaveProperty('joinedCount');
    expect(body.session).not.toHaveProperty('joined');
    expect(body.session).not.toHaveProperty('description');
    expect(body.session).not.toHaveProperty('courseId');
    expect(body.session).not.toHaveProperty('questions');
    expect(body.session).not.toHaveProperty('currentQuestion');
    expect(body.session).not.toHaveProperty('reviewable');
    expect(body).not.toHaveProperty('responseCount');
    expect(body).toHaveProperty('questionCount');
    expect(body).toHaveProperty('questionNumber');
  });

  it('instructor payload still includes joined and response summary fields', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session).toHaveProperty('joinedCount');
    expect(body.session).toHaveProperty('joined');
    expect(body.session).toHaveProperty('questions');
    expect(body.session).toHaveProperty('currentQuestion');
    expect(body).toHaveProperty('responseCount');
  });

  it('presentation view omits joined student detail payloads while keeping course context', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live?view=presentation`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(String(body.course._id)).toBe(String(course._id));
    expect(body.course.name).toBe(course.name);
    expect(body.session.joinedCount).toBe(1);
    expect(body.session).not.toHaveProperty('joined');
    expect(body.session).not.toHaveProperty('joinRecords');
    expect(body.session).not.toHaveProperty('joinedStudents');
  });

  it('student short-answer stats do not include responder identifiers', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const studentTwo = await createTestUser({ email: 'student-live-two@example.com', roles: ['student'] });
    const studentTwoToken = await getAuthToken(app, studentTwo);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentTwoToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const qRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: {
        type: 2,
        content: '<p>Explain.</p>',
        plainText: 'Explain.',
        sessionId: session._id,
        courseId: course._id,
      },
    });
    const question = qRes.json().question;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/question-visibility`, {
      token: profToken,
      payload: { hidden: false, stats: true },
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentTwoToken,
      payload: {},
    });

    await Response.create({
      questionId: question._id,
      studentUserId: student._id,
      attempt: 1,
      answer: 'First response',
    });
    await Response.create({
      questionId: question._id,
      studentUserId: studentTwo._id,
      attempt: 1,
      answer: 'Second response',
    });

    const liveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: studentToken,
    });

    expect(liveRes.statusCode).toBe(200);
    const body = liveRes.json();
    expect(body.responseStats?.type).toBe('shortAnswer');
    expect(body.responseStats?.answers?.length).toBeGreaterThan(0);
    expect(body.responseStats.answers[0]).not.toHaveProperty('studentUserId');
  });

  it('student live payload only includes solution content when showCorrect is enabled', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const qRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: {
        type: 0,
        content: '<p>What is 2+2?</p>',
        plainText: 'What is 2+2?',
        sessionId: session._id,
        courseId: course._id,
        options: [
          { content: '3', correct: false },
          { content: '4', correct: true },
        ],
        solution: '<p>Addition gives 4.</p>',
        solution_plainText: 'Addition gives 4.',
      },
    });
    const question = qRes.json().question;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/question-visibility`, {
      token: profToken,
      payload: { hidden: false, correct: false },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    const hiddenSolutionRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: studentToken,
    });

    expect(hiddenSolutionRes.statusCode).toBe(200);
    const hiddenBody = hiddenSolutionRes.json();
    expect(hiddenBody.showCorrect).toBe(false);
    expect(hiddenBody.currentQuestion).not.toHaveProperty('solution');
    expect(hiddenBody.currentQuestion).not.toHaveProperty('solution_plainText');

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/question-visibility`, {
      token: profToken,
      payload: { hidden: false, correct: true },
    });

    const visibleSolutionRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: studentToken,
    });

    expect(visibleSolutionRes.statusCode).toBe(200);
    const visibleBody = visibleSolutionRes.json();
    expect(visibleBody.showCorrect).toBe(true);
    expect(visibleBody.currentQuestion.options[1].correct).toBe(true);
    expect(visibleBody.currentQuestion.solution).toBe('<p>Addition gives 4.</p>');
    expect(visibleBody.currentQuestion.solution_plainText).toBe('Addition gives 4.');
  });

  it('instructor short-answer payload omits responder identifiers by default', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const studentTwo = await createTestUser({ email: 'student-live-prof-default@example.com', roles: ['student'] });
    const studentTwoToken = await getAuthToken(app, studentTwo);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentTwoToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;
    const qRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: {
        type: 2,
        content: '<p>Explain.</p>',
        plainText: 'Explain.',
        sessionId: session._id,
        courseId: course._id,
      },
    });
    const question = qRes.json().question;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, { token: profToken });
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/question-visibility`, {
      token: profToken,
      payload: { hidden: false, stats: true },
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentTwoToken,
      payload: {},
    });

    await Response.create({
      questionId: question._id,
      studentUserId: student._id,
      attempt: 1,
      answer: 'First response',
    });
    await Response.create({
      questionId: question._id,
      studentUserId: studentTwo._id,
      attempt: 1,
      answer: 'Second response',
    });

    const liveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: profToken,
    });

    expect(liveRes.statusCode).toBe(200);
    const body = liveRes.json();
    expect(body.responseStats?.type).toBe('shortAnswer');
    expect(body.responseStats?.answers?.length).toBeGreaterThan(0);
    expect(body.responseStats.answers[0]).not.toHaveProperty('studentUserId');
    expect(body.responseStats.answers[0]).not.toHaveProperty('studentName');
    expect(body.allResponses[0]).not.toHaveProperty('studentUserId');
    expect(body.allResponses[0]).not.toHaveProperty('studentName');
  });

  it('instructor can opt in to student names for short-answer control view', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const studentTwo = await createTestUser({
      email: 'student-live-prof-names@example.com',
      roles: ['student'],
      firstname: 'Second',
      lastname: 'Learner',
    });
    const studentTwoToken = await getAuthToken(app, studentTwo);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentTwoToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;
    const qRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: {
        type: 2,
        content: '<p>Explain.</p>',
        plainText: 'Explain.',
        sessionId: session._id,
        courseId: course._id,
      },
    });
    const question = qRes.json().question;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, { token: profToken });
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/question-visibility`, {
      token: profToken,
      payload: { hidden: false, stats: true },
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentTwoToken,
      payload: {},
    });

    await Response.create({
      questionId: question._id,
      studentUserId: student._id,
      attempt: 1,
      answer: 'First response',
    });
    await Response.create({
      questionId: question._id,
      studentUserId: studentTwo._id,
      attempt: 1,
      answer: 'Second response',
    });

    const liveRes = await authenticatedRequest(
      app,
      'GET',
      `/api/v1/sessions/${session._id}/live?includeStudentNames=true`,
      { token: profToken }
    );

    expect(liveRes.statusCode).toBe(200);
    const body = liveRes.json();
    expect(body.responseStats?.type).toBe('shortAnswer');
    expect(body.responseStats?.answers?.length).toBeGreaterThan(0);
    expect(body.responseStats.answers[0]).not.toHaveProperty('studentUserId');
    expect(body.responseStats.answers[0]).toHaveProperty('studentName');
    expect(body.allResponses[0]).not.toHaveProperty('studentUserId');
    expect(body.allResponses[0]).toHaveProperty('studentName');
  });
});

// ---------- POST /api/v1/sessions/:id/end ----------
describe('POST /api/v1/sessions/:id/end', () => {
  it('instructor can end a session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    // Start it first
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/end`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.status).toBe('done');
  });

  it('can end a session and set reviewable in one request', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof-end-reviewable@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/end`, {
      token: profToken,
      payload: { reviewable: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.status).toBe('done');
    expect(body.session.reviewable).toBe(true);
  });

  it('returns a non-mutating warning before ending with reviewable manual-grading questions', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const question = await Question.create({
      type: 2,
      creator: prof._id,
      owner: prof._id,
      courseId: course._id,
      sessionId: session._id,
      plainText: 'Explain your answer',
      content: '<p>Explain your answer</p>',
      sessionOptions: {
        points: 4,
        maxAttempts: 1,
        attempts: [{ number: 1, closed: false }],
      },
    });

    await Session.findByIdAndUpdate(session._id, {
      $set: {
        questions: [question._id],
      },
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const warningRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/end`, {
      token: profToken,
      payload: { reviewable: true },
    });

    expect(warningRes.statusCode).toBe(200);
    const warningBody = warningRes.json();
    expect(warningBody.grading).toBeNull();
    expect(warningBody.nonAutoGradeableWarning.questionCount).toBe(1);

    const warnedSession = await Session.findById(session._id).lean();
    expect(warnedSession.status).toBe('running');
    expect(warnedSession.reviewable).toBe(false);
    expect(await Grade.countDocuments({ sessionId: session._id, courseId: course._id })).toBe(0);

    const warnedQuestion = await Question.findById(question._id).lean();
    expect(warnedQuestion.sessionOptions.points).toBe(4);

    const confirmRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/end`, {
      token: profToken,
      payload: {
        reviewable: true,
        acknowledgeNonAutoGradeable: true,
        zeroNonAutoGradeable: true,
      },
    });

    expect(confirmRes.statusCode).toBe(200);
    expect(confirmRes.json().session.status).toBe('done');
    expect(confirmRes.json().session.reviewable).toBe(true);

    const zeroedQuestion = await Question.findById(question._id).lean();
    expect(zeroedQuestion.sessionOptions.points).toBe(0);

    const grades = await Grade.find({ sessionId: session._id, courseId: course._id }).lean();
    expect(grades).toHaveLength(1);
    expect(grades[0].marks).toHaveLength(1);
    expect(grades[0].marks[0].outOf).toBe(0);
  });
});

// ---------- Student quiz routes ----------
describe('Student quiz routes', () => {
  async function createOpenQuiz({ profToken, courseId, practiceQuiz = false }) {
    const now = Date.now();
    const sessRes = await createSessionInCourse(profToken, courseId, {
      name: practiceQuiz ? 'Practice Quiz' : 'Scheduled Quiz',
      quiz: true,
      practiceQuiz,
      quizStart: new Date(now - (30 * 60 * 1000)).toISOString(),
      quizEnd: new Date(now + (30 * 60 * 1000)).toISOString(),
    });
    const session = sessRes.json().session;
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { status: 'visible' },
    });
    return session;
  }

  async function addMcQuestion({ profToken, sessionId, courseId, content = 'Question?' }) {
    return createQuestionInSession(profToken, {
      type: 0,
      content: `<p>${content}</p>`,
      plainText: content,
      sessionId,
      courseId,
      options: [
        { content: 'A', correct: true },
        { content: 'B', correct: false },
      ],
      solution: '<p>Because A is correct.</p>',
      solution_plainText: 'Because A is correct.',
    });
  }

  async function addSlideQuestion({ profToken, sessionId, courseId, content = 'Slide' }) {
    return createQuestionInSession(profToken, {
      type: 6,
      content: `<p>${content}</p>`,
      plainText: content,
      sessionId,
      courseId,
      sessionOptions: { points: 0 },
    });
  }

  it('non-practice quiz supports autosave + final submit and blocks re-entry after submission', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const session = await createOpenQuiz({ profToken, courseId: course._id, practiceQuiz: false });
    const q1 = await addMcQuestion({ profToken, sessionId: session._id, courseId: course._id, content: 'First' });
    const q2 = await addMcQuestion({ profToken, sessionId: session._id, courseId: course._id, content: 'Second' });

    const quizRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/quiz`, {
      token: studentToken,
    });
    expect(quizRes.statusCode).toBe(200);
    expect(quizRes.json().session.status).toBe('running');
    expect(quizRes.json().questions).toHaveLength(2);
    expect(quizRes.json().questions[0].options[0].correct).toBeUndefined();
    expect(quizRes.json().questions[0].solution).toBeUndefined();

    const saveOneRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/quiz-response`, {
      token: studentToken,
      payload: { questionId: q1._id, answer: '0' },
    });
    expect(saveOneRes.statusCode).toBe(200);
    expect(saveOneRes.json().response.editable).toBe(true);

    const earlySubmitRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/submit`, {
      token: studentToken,
    });
    expect(earlySubmitRes.statusCode).toBe(400);
    expect(earlySubmitRes.json().message).toContain('Must answer all questions');

    const saveTwoRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/quiz-response`, {
      token: studentToken,
      payload: { questionId: q2._id, answer: '1' },
    });
    expect(saveTwoRes.statusCode).toBe(200);

    const submitRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/submit`, {
      token: studentToken,
    });
    expect(submitRes.statusCode).toBe(200);
    expect(submitRes.json().success).toBe(true);

    const lockedResponses = await Response.find({
      questionId: { $in: [q1._id, q2._id] },
      studentUserId: student._id,
      attempt: 1,
    }).lean();
    expect(lockedResponses).toHaveLength(2);
    lockedResponses.forEach((response) => {
      expect(response.editable).toBe(false);
    });

    const persistedSessionRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}`, {
      token: studentToken,
    });
    expect(persistedSessionRes.statusCode).toBe(200);
    expect(persistedSessionRes.json().session.quizSubmittedByCurrentUser).toBe(true);

    const reenterRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/quiz`, {
      token: studentToken,
    });
    expect(reenterRes.statusCode).toBe(403);
    expect(reenterRes.json().message).toContain('already submitted');
  });

  it('notifies only the submitting student after quiz submission', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const session = await createOpenQuiz({ profToken, courseId: course._id, practiceQuiz: false });
    const question = await addMcQuestion({ profToken, sessionId: session._id, courseId: course._id, content: 'Only question' });

    const saveRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/quiz-response`, {
      token: studentToken,
      payload: { questionId: question._id, answer: '0' },
    });
    expect(saveRes.statusCode).toBe(200);

    const wsSendToUserSpy = vi.spyOn(app, 'wsSendToUser');
    const submitRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/submit`, {
      token: studentToken,
    });

    expect(submitRes.statusCode).toBe(200);
    expect(wsSendToUserSpy).toHaveBeenCalledTimes(1);
    expect(wsSendToUserSpy).toHaveBeenCalledWith(
      String(student._id),
      'session:updated',
      expect.objectContaining({
        courseId: course._id,
        sessionId: session._id,
      })
    );
  });

  it('ignores slides when checking quiz completion and rejects slide autosaves', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const session = await createOpenQuiz({ profToken, courseId: course._id, practiceQuiz: false });
    const slide = await addSlideQuestion({
      profToken,
      sessionId: session._id,
      courseId: course._id,
      content: 'Read this before answering',
    });
    const question = await addMcQuestion({
      profToken,
      sessionId: session._id,
      courseId: course._id,
      content: 'Only graded question',
    });

    const initialQuizRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/quiz`, {
      token: studentToken,
    });
    expect(initialQuizRes.statusCode).toBe(200);
    expect(initialQuizRes.json().questions).toHaveLength(2);
    expect(initialQuizRes.json().questions[0]._id).toBe(slide._id);
    expect(initialQuizRes.json().allAnswered).toBe(false);

    const slideAutosaveRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/quiz-response`, {
      token: studentToken,
      payload: { questionId: slide._id, answer: 'ignored' },
    });
    expect(slideAutosaveRes.statusCode).toBe(400);
    expect(slideAutosaveRes.json().message).toContain('Slides do not accept quiz responses');

    const answerRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/quiz-response`, {
      token: studentToken,
      payload: { questionId: question._id, answer: '0' },
    });
    expect(answerRes.statusCode).toBe(200);

    const readyQuizRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/quiz`, {
      token: studentToken,
    });
    expect(readyQuizRes.statusCode).toBe(200);
    expect(readyQuizRes.json().allAnswered).toBe(true);

    const submitRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/submit`, {
      token: studentToken,
    });
    expect(submitRes.statusCode).toBe(200);
    expect(submitRes.json().success).toBe(true);

    const lockedResponses = await Response.find({
      questionId: question._id,
      studentUserId: student._id,
      attempt: 1,
    }).lean();
    expect(lockedResponses).toHaveLength(1);
    expect(lockedResponses[0].editable).toBe(false);
  });

  it('practice quizzes lock answers per-question and only reveal solutions after question submission', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const session = await createOpenQuiz({ profToken, courseId: course._id, practiceQuiz: true });
    const question = await addMcQuestion({ profToken, sessionId: session._id, courseId: course._id, content: 'Practice' });

    const initialQuizRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/quiz`, {
      token: studentToken,
    });
    expect(initialQuizRes.statusCode).toBe(200);
    expect(initialQuizRes.json().questions[0].options[0].correct).toBeUndefined();
    expect(initialQuizRes.json().questions[0].solution).toBeUndefined();

    const autosaveRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/quiz-response`, {
      token: studentToken,
      payload: { questionId: question._id, answer: '0' },
    });
    expect(autosaveRes.statusCode).toBe(200);
    expect(autosaveRes.json().response.editable).toBe(true);

    const lockRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/quiz-question-submit`, {
      token: studentToken,
      payload: { questionId: question._id },
    });
    expect(lockRes.statusCode).toBe(200);
    expect(lockRes.json().response.editable).toBe(false);

    const revealQuizRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/quiz`, {
      token: studentToken,
    });
    expect(revealQuizRes.statusCode).toBe(200);
    expect(revealQuizRes.json().questions[0].options[0].correct).toBe(true);
    expect(revealQuizRes.json().questions[0].solution).toBe('<p>Because A is correct.</p>');

    const submitWholeRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/submit`, {
      token: studentToken,
    });
    expect(submitWholeRes.statusCode).toBe(400);
    expect(submitWholeRes.json().message).toContain('Practice quizzes');
  });

  it('student practice sessions can quiz over library questions without attaching them to the session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'student-practice-prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const course = (await createCourseAsProf(profToken)).json().course;
    await Course.findByIdAndUpdate(course._id, { $set: { allowStudentQuestions: true } });
    const student = await createTestUser({ email: 'student-practice-owner@example.com', roles: ['student'] });
    const studentToken = await getAuthToken(app, student);
    const enrollRes = await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });
    expect(enrollRes.statusCode).toBe(200);

    const questionRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: studentToken,
      payload: {
        type: 0,
        courseId: course._id,
        content: 'Library-only practice question',
        options: [
          { answer: 'A', correct: true },
          { answer: 'B', correct: false },
        ],
      },
    });
    expect(questionRes.statusCode).toBe(201);
    const libraryQuestion = questionRes.json().question;
    expect(libraryQuestion.sessionId).toBe('');

    const sessionRes = await createSessionInCourse(studentToken, course._id, {
      name: 'Library Practice Session',
      practiceQuiz: true,
    });
    expect(sessionRes.statusCode).toBe(201);
    const practiceSession = sessionRes.json().session;

    const setQuestionsRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${practiceSession._id}/practice-questions`, {
      token: studentToken,
      payload: { questionIds: [libraryQuestion._id] },
    });
    expect(setQuestionsRes.statusCode).toBe(200);

    const quizRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${practiceSession._id}/quiz`, {
      token: studentToken,
    });
    expect(quizRes.statusCode).toBe(200);
    expect(quizRes.json().questions).toHaveLength(1);

    const answerRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${practiceSession._id}/quiz-response`, {
      token: studentToken,
      payload: { questionId: libraryQuestion._id, answer: '0' },
    });
    expect(answerRes.statusCode).toBe(200);

    const lockRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${practiceSession._id}/quiz-question-submit`, {
      token: studentToken,
      payload: { questionId: libraryQuestion._id },
    });
    expect(lockRes.statusCode).toBe(200);
  });

  it('quiz access route allows active extension students while rejecting students outside the active window', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const extensionStudent = await createTestUser({
      email: 'quiz-extension-access@example.com',
      roles: ['student'],
    });
    const extensionStudentToken = await getAuthToken(app, extensionStudent);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: extensionStudentToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const now = Date.now();
    const sessRes = await createSessionInCourse(profToken, course._id, {
      name: 'Closed Base Quiz',
      quiz: true,
      quizStart: new Date(now - (2 * 60 * 60 * 1000)).toISOString(),
      quizEnd: new Date(now - (60 * 1000)).toISOString(),
    });
    const session = sessRes.json().session;
    await addMcQuestion({ profToken, sessionId: session._id, courseId: course._id, content: 'Extension only' });
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { status: 'visible' },
    });
    const extensionRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/extensions`, {
      token: profToken,
      payload: {
        extensions: [
          {
            userId: extensionStudent._id,
            quizStart: new Date(now - (5 * 60 * 1000)).toISOString(),
            quizEnd: new Date(now + (5 * 60 * 1000)).toISOString(),
          },
        ],
      },
    });
    expect(extensionRes.statusCode).toBe(200);

    const blockedRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/quiz`, {
      token: studentToken,
    });
    expect(blockedRes.statusCode).toBe(403);

    const openRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/quiz`, {
      token: extensionStudentToken,
    });
    expect(openRes.statusCode).toBe(200);
    expect(openRes.json().session.status).toBe('running');
  });
});

// ---------- POST /api/v1/sessions/:id/join ----------
describe('POST /api/v1/sessions/:id/join', () => {
  it('rejects joins while passcode is required but join period is closed', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const enableReqRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { joinCodeEnabled: true },
    });
    expect(enableReqRes.statusCode).toBe(200);

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const joinRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    expect(joinRes.statusCode).toBe(403);
    expect(joinRes.json().message).toContain('Join period is closed');
  });

  it('keeps already joined students joined when passcode requirement is enabled later', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const joinRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });
    expect(joinRes.statusCode).toBe(200);

    const toggleReqRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/join-code-settings`, {
      token: profToken,
      payload: { joinCodeEnabled: true },
    });
    expect(toggleReqRes.statusCode).toBe(200);

    const liveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: studentToken,
    });
    expect(liveRes.statusCode).toBe(200);
    expect(liveRes.json().isJoined).toBe(true);
  });

  it('turning off passcode requirement also closes the join period and clears code', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const enableReqRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { joinCodeEnabled: true },
    });
    expect(enableReqRes.statusCode).toBe(200);

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const openPeriodRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/join-code-settings`, {
      token: profToken,
      payload: { joinCodeActive: true },
    });
    expect(openPeriodRes.statusCode).toBe(200);
    expect(openPeriodRes.json().session.joinCodeActive).toBe(true);
    expect(openPeriodRes.json().session.currentJoinCode).toBeTruthy();

    const disableRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/join-code-settings`, {
      token: profToken,
      payload: { joinCodeEnabled: false },
    });
    expect(disableRes.statusCode).toBe(200);
    expect(disableRes.json().session.joinCodeEnabled).toBe(false);
    expect(disableRes.json().session.joinCodeActive).toBe(false);
    expect(disableRes.json().session.currentJoinCode).toBe('');
  });
});

describe('Live session websocket delta events', () => {
  it('broadcasts participant joins only to instructors', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, student, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const wsSendToUsersSpy = vi.spyOn(app, 'wsSendToUsers');
    const joinRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    expect(joinRes.statusCode).toBe(200);
    expect(wsSendToUsersSpy).toHaveBeenCalledTimes(1);
    expect(wsSendToUsersSpy).toHaveBeenCalledWith(
      [String(prof._id)],
      'session:participant-joined',
      expect.objectContaining({
        courseId: course._id,
        sessionId: session._id,
        joinedCount: 1,
        joinedStudent: expect.objectContaining({
          _id: String(student._id),
        }),
      })
    );
  });

  it('broadcasts attempt deltas for live response state changes', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, student } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;
    const question = await createQuestionInSession(profToken, {
      type: 0,
      content: '<p>Current question</p>',
      plainText: 'Current question',
      sessionId: session._id,
      courseId: course._id,
      options: [
        { content: 'A', correct: true },
        { content: 'B', correct: false },
      ],
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const wsSendToUsersSpy = vi.spyOn(app, 'wsSendToUsers');

    const newAttemptRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/new-attempt`, {
      token: profToken,
    });
    expect(newAttemptRes.statusCode).toBe(200);
    expect(wsSendToUsersSpy).toHaveBeenCalledWith(
      expect.arrayContaining([String(prof._id), String(student._id)]),
      'session:attempt-changed',
      expect.objectContaining({
        courseId: course._id,
        sessionId: session._id,
        questionId: question._id,
        currentAttempt: expect.objectContaining({ number: 1, closed: false }),
        stats: false,
        correct: false,
        resetResponses: true,
      })
    );

    wsSendToUsersSpy.mockClear();

    const toggleRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/toggle-responses`, {
      token: profToken,
      payload: { closed: true },
    });
    expect(toggleRes.statusCode).toBe(200);
    expect(wsSendToUsersSpy).toHaveBeenCalledWith(
      expect.arrayContaining([String(prof._id), String(student._id)]),
      'session:attempt-changed',
      expect.objectContaining({
        courseId: course._id,
        sessionId: session._id,
        questionId: question._id,
        currentAttempt: expect.objectContaining({ number: 1, closed: true }),
        resetResponses: false,
      })
    );
  });

  it('broadcasts join-code changes without leaking the code to students', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, student } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const wsSendToUsersSpy = vi.spyOn(app, 'wsSendToUsers');
    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/join-code-settings`, {
      token: profToken,
      payload: { joinCodeEnabled: true, joinCodeActive: true },
    });

    expect(res.statusCode).toBe(200);
    const joinCodeCalls = wsSendToUsersSpy.mock.calls.filter(([, event]) => event === 'session:join-code-changed');
    expect(joinCodeCalls).toHaveLength(2);

    const instructorCall = joinCodeCalls.find(([userIds]) => userIds.includes(String(prof._id)));
    const studentCall = joinCodeCalls.find(([userIds]) => userIds.includes(String(student._id)));

    expect(instructorCall).toBeDefined();
    expect(instructorCall[2]).toEqual(expect.objectContaining({
      courseId: course._id,
      sessionId: session._id,
      joinCodeEnabled: true,
      joinCodeActive: true,
      joinCodeInterval: 10,
    }));
    expect(instructorCall[2].currentJoinCode).toBeTruthy();

    expect(studentCall).toBeDefined();
    expect(studentCall[2]).toEqual(expect.objectContaining({
      courseId: course._id,
      sessionId: session._id,
      joinCodeEnabled: true,
      joinCodeActive: true,
    }));
    expect(studentCall[2].currentJoinCode).toBeUndefined();
  });

  it('sends response-added deltas only to joined students when live stats are visible', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, student, studentToken } = await setupCourseWithStudent();
    const spectator = await createTestUser({ email: 'spectator-stats@example.com', roles: ['student'] });
    const spectatorToken = await getAuthToken(app, spectator);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: spectatorToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await createQuestionInSession(profToken, {
      type: 0,
      content: '<p>Visible stats question</p>',
      plainText: 'Visible stats question',
      sessionId: session._id,
      courseId: course._id,
      options: [
        { content: 'A', correct: true },
        { content: 'B', correct: false },
      ],
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/question-visibility`, {
      token: profToken,
      payload: { hidden: false, stats: true },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    const wsSendToUsersSpy = vi.spyOn(app, 'wsSendToUsers');
    const respondRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/respond`, {
      token: studentToken,
      payload: { answer: '0' },
    });

    expect(respondRes.statusCode).toBe(201);
    const responseCalls = wsSendToUsersSpy.mock.calls.filter(([, event]) => event === 'session:response-added');
    expect(responseCalls).toHaveLength(2);
    expect(responseCalls).toEqual(expect.arrayContaining([
      [
        [String(prof._id)],
        'session:response-added',
        expect.objectContaining({
          courseId: course._id,
          sessionId: session._id,
          responseCount: 1,
        }),
      ],
      [
        [String(student._id)],
        'session:response-added',
        expect.objectContaining({
          courseId: course._id,
          sessionId: session._id,
          responseCount: 1,
        }),
      ],
    ]));
    expect(responseCalls.some(([userIds]) => userIds.includes(String(spectator._id)))).toBe(false);
  });
});

// ---------- GET /api/v1/sessions/:id/results ----------
describe('GET /api/v1/sessions/:id/results', () => {
  it('calculates participation using Meteor-compatible points defaults', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();

    const studentTwo = await createTestUser({ email: 'student-two@example.com', roles: ['student'] });
    const studentTwoToken = await getAuthToken(app, studentTwo);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentTwoToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const qMcRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: {
        type: 0,
        content: '<p>MC</p>',
        plainText: 'MC',
        sessionId: session._id,
        courseId: course._id,
        options: [
          { content: 'A', correct: true },
          { content: 'B', correct: false },
        ],
      },
    });
    const qMc = qMcRes.json().question;

    const qSaRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: {
        type: 2,
        content: '<p>SA</p>',
        plainText: 'SA',
        sessionId: session._id,
        courseId: course._id,
      },
    });
    const qSa = qSaRes.json().question;

    const qZeroRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: {
        type: 1,
        content: '<p>TF</p>',
        plainText: 'TF',
        sessionId: session._id,
        courseId: course._id,
        options: [
          { content: 'True', correct: true },
          { content: 'False', correct: false },
        ],
      },
    });
    const qZero = qZeroRes.json().question;

    const zeroPointsPatchRes = await authenticatedRequest(app, 'PATCH', `/api/v1/questions/${qZero._id}`, {
      token: profToken,
      payload: { sessionOptions: { points: 0 } },
    });
    expect(zeroPointsPatchRes.statusCode).toBe(200);

    for (const qId of [qMc._id, qSa._id, qZero._id]) {
      const addRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
        token: profToken,
        payload: { questionId: qId },
      });
      expect(addRes.statusCode).toBe(200);
    }

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentTwoToken,
      payload: {},
    });

    await Response.create({
      questionId: qMc._id,
      studentUserId: student._id,
      attempt: 1,
      answer: '0',
    });
    await Response.create({
      questionId: qSa._id,
      studentUserId: student._id,
      attempt: 1,
      answer: 'free text',
    });

    const resultsRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/results`, {
      token: profToken,
    });

    expect(resultsRes.statusCode).toBe(200);
    const byStudent = Object.fromEntries(
      (resultsRes.json().studentResults || []).map((row) => [String(row.studentId), row]),
    );

    expect(byStudent[String(student._id)].participation).toBe(100);
    expect(byStudent[String(studentTwo._id)].participation).toBe(0);
  });

  it('includes responder data even when a student is missing from joined[]', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const qRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: {
        type: 0,
        content: '<p>MC</p>',
        plainText: 'MC',
        sessionId: session._id,
        courseId: course._id,
        options: [
          { content: 'A', correct: true },
          { content: 'B', correct: false },
        ],
      },
    });
    const question = qRes.json().question;

    const addRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    expect(addRes.statusCode).toBe(200);

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    // Write a response directly without joining to emulate legacy/misaligned data.
    await Response.create({
      questionId: question._id,
      studentUserId: student._id,
      attempt: 1,
      answer: '0',
    });

    const liveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: studentToken,
    });
    expect(liveRes.statusCode).toBe(200);
    expect(liveRes.json().isJoined).toBe(false);

    const resultsRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/results`, {
      token: profToken,
    });
    expect(resultsRes.statusCode).toBe(200);

    const row = (resultsRes.json().studentResults || []).find(
      (entry) => String(entry.studentId) === String(student._id),
    );
    expect(row).toBeDefined();
    expect(row.participation).toBe(100);
    expect(row.questionResults[0].responses.length).toBe(1);
  });
});

// ---------- PATCH /api/v1/sessions/:id/current ----------
describe('PATCH /api/v1/sessions/:id/current', () => {
  it('instructor can set current question', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    // Create a question and add it to the session
    const qRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: { type: 2, content: 'Q1', sessionId: session._id, courseId: course._id },
    });
    const question = qRes.json().question;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/current`, {
      token: profToken,
      payload: { questionId: question._id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.currentQuestion).toBe(question._id);
  });

  it('returns 400 if question not in session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/current`, {
      token: profToken,
      payload: { questionId: 'nonexistentId123' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------- POST /api/v1/courses/:courseId/sessions/copy ----------
describe('POST /api/v1/courses/:courseId/sessions/copy', () => {
  it('copies selected sessions into another instructor course and resets session dates/state', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof-copy-bulk@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const sourceCourseRes = await createCourseAsProf(profToken, {
      name: 'Source Course',
      semester: 'Fall/Winter 2024/2025',
    });
    const targetCourseRes = await createCourseAsProf(profToken, {
      name: 'Target Course',
      semester: 'Fall/Winter 2025/2026',
    });
    const sourceCourse = sourceCourseRes.json().course;
    const targetCourse = targetCourseRes.json().course;
    const sourceSessionRes = await createSessionInCourse(profToken, sourceCourse._id, {
      name: 'Import Me',
      description: 'Original session description',
      quiz: true,
      quizStart: new Date('2025-01-10T12:00:00.000Z').toISOString(),
      quizEnd: new Date('2025-01-10T14:00:00.000Z').toISOString(),
      date: new Date('2025-01-10T12:00:00.000Z').toISOString(),
    });
    const sourceSession = sourceSessionRes.json().session;
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${sourceSession._id}`, {
      token: profToken,
      payload: {
        status: 'done',
        reviewable: true,
        joinCodeEnabled: true,
      },
    });

    const sourceQuestion = await createQuestionInSession(profToken, {
      type: 2,
      content: '<p>Imported question</p>',
      plainText: 'Imported question',
      sessionId: sourceSession._id,
      courseId: sourceCourse._id,
      sessionOptions: { points: 3 },
    });

    const res = await authenticatedRequest(app, 'POST', `/api/v1/courses/${targetCourse._id}/sessions/copy`, {
      token: profToken,
      payload: { sessionIds: [sourceSession._id] },
    });

    expect(res.statusCode).toBe(201);
    const copiedSession = res.json().sessions[0];
    expect(copiedSession.courseId).toBe(targetCourse._id);
    expect(copiedSession.name).toBe('Import Me (copy)');
    expect(copiedSession.status).toBe('hidden');
    expect(copiedSession.reviewable).toBe(false);
    expect(copiedSession.joinCodeEnabled).toBe(false);
    expect(copiedSession).not.toHaveProperty('date');
    expect(copiedSession).not.toHaveProperty('quizStart');
    expect(copiedSession).not.toHaveProperty('quizEnd');

    const targetCourseDoc = await Course.findById(targetCourse._id).lean();
    expect(targetCourseDoc.sessions).toContain(copiedSession._id);

    const copiedQuestion = await Question.findById(copiedSession.questions[0]).lean();
    expect(copiedQuestion).toBeTruthy();
    expect(copiedQuestion.sessionId).toBe(copiedSession._id);
    expect(copiedQuestion.courseId).toBe(targetCourse._id);
    expect(copiedQuestion.owner).toBe(prof._id);
    expect(copiedQuestion.originalQuestion).toBe(sourceQuestion._id);
  });
});

// ---------- GET /api/v1/sessions/:id/export + POST /api/v1/courses/:courseId/sessions/import ----------
describe('session import/export endpoints', () => {
  it('exports a portable session payload with ordered questions and draft-safe fields', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof-session-export@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const course = (await createCourseAsProf(profToken, { name: 'Export Course' })).json().course;
    const session = (await createSessionInCourse(profToken, course._id, {
      name: 'Export Session',
      description: 'Export me',
      quiz: true,
      practiceQuiz: true,
    })).json().session;

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: {
        status: 'done',
        reviewable: true,
        joinCodeEnabled: true,
        joinCodeInterval: 30,
      },
    });

    const questionA = await createQuestionInSession(profToken, {
      type: 0,
      content: '<p>First question</p>',
      plainText: 'First question',
      sessionId: session._id,
      courseId: course._id,
      options: [
        { answer: 'Correct', correct: true },
        { answer: 'Incorrect', correct: false },
      ],
      sessionOptions: {
        points: 3,
        hidden: true,
        stats: true,
        correct: true,
        attempts: [{ number: 1, closed: true }],
      },
    });
    const questionB = await createQuestionInSession(profToken, {
      type: 2,
      content: '<p>Second question</p>',
      plainText: 'Second question',
      solution: '<p>Worked solution</p>',
      solution_plainText: 'Worked solution',
      sessionId: session._id,
      courseId: course._id,
      sessionOptions: { points: 5, maxAttempts: 2, attemptWeights: [1, 0.5] },
    });

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/questions/order`, {
      token: profToken,
      payload: { questions: [questionB._id, questionA._id] },
    });

    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/export`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(1);
    expect(body.session).toMatchObject({
      name: 'Export Session',
      description: 'Export me',
      quiz: true,
      practiceQuiz: true,
      reviewable: true,
      joinCodeEnabled: true,
      joinCodeInterval: 30,
    });
    expect(body.session).not.toHaveProperty('courseId');
    expect(body.session).not.toHaveProperty('status');
    expect(body.session).not.toHaveProperty('date');
    expect(body.session).not.toHaveProperty('quizStart');
    expect(body.session).not.toHaveProperty('quizEnd');
    expect(body.session.questions).toHaveLength(2);
    expect(body.session.questions[0].plainText).toBe('Second question');
    expect(body.session.questions[0].sessionOptions).toEqual({
      points: 5,
      maxAttempts: 2,
      attemptWeights: [1, 0.5],
    });
    expect(body.session.questions[1].plainText).toBe('First question');
    expect(body.session.questions[1].sessionOptions).toEqual({
      hidden: true,
      points: 3,
    });
    expect(body.session.questions[1].sessionOptions).not.toHaveProperty('stats');
    expect(body.session.questions[1].sessionOptions).not.toHaveProperty('correct');
    expect(body.session.questions[1].sessionOptions).not.toHaveProperty('attempts');
  });

  it('imports a session export into the current course with new question documents', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof-session-import@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const targetCourse = (await createCourseAsProf(profToken, { name: 'Import Target' })).json().course;

    const res = await authenticatedRequest(app, 'POST', `/api/v1/courses/${targetCourse._id}/sessions/import`, {
      token: profToken,
      payload: {
        version: 1,
        session: {
          name: 'Imported Session',
          description: 'Portable import',
          quiz: false,
          practiceQuiz: false,
          reviewable: true,
          joinCodeEnabled: true,
          joinCodeInterval: 15,
          msScoringMethod: 'correctness-ratio',
          questions: [
            {
              type: 0,
              content: '<p>Imported MC</p>',
              plainText: 'Imported MC',
              options: [
                { answer: 'A', correct: true },
                { answer: 'B', correct: false },
              ],
              tags: [{ value: 'review', label: 'Review' }],
              sessionOptions: { hidden: true, points: 4, maxAttempts: 2, attemptWeights: [1, 0.5] },
            },
            {
              type: 2,
              content: '<p>Imported SA</p>',
              plainText: 'Imported SA',
              solution: '<p>Explain</p>',
              solution_plainText: 'Explain',
            },
          ],
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const importedSession = res.json().session;
    expect(importedSession.courseId).toBe(targetCourse._id);
    expect(importedSession.name).toBe('Imported Session');
    expect(importedSession.status).toBe('hidden');
    expect(importedSession.reviewable).toBe(true);
    expect(importedSession.joinCodeEnabled).toBe(true);
    expect(importedSession.joinCodeInterval).toBe(15);
    expect(importedSession.date).toBeUndefined();
    expect(importedSession.quizStart).toBeUndefined();
    expect(importedSession.quizEnd).toBeUndefined();
    expect(importedSession.currentQuestion).toBe('');
    expect(importedSession.questions).toHaveLength(2);

    const targetCourseDoc = await Course.findById(targetCourse._id).lean();
    expect(targetCourseDoc.sessions).toContain(importedSession._id);

    const importedQuestions = await Question.find({ _id: { $in: importedSession.questions } }).lean();
    expect(importedQuestions).toHaveLength(2);
    importedQuestions.forEach((question) => {
      expect(question.courseId).toBe(targetCourse._id);
      expect(question.sessionId).toBe(importedSession._id);
      expect(question.owner).toBe(prof._id);
    });

    const multipleChoiceQuestion = importedQuestions.find((question) => question.plainText === 'Imported MC');
    expect(multipleChoiceQuestion.tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'review', label: 'Review' }),
      expect.objectContaining({ value: 'imported', label: 'imported' }),
    ]));
    expect(multipleChoiceQuestion.sessionOptions).toMatchObject({
      hidden: true,
      points: 4,
      maxAttempts: 2,
      attemptWeights: [1, 0.5],
    });
    const shortAnswerQuestion = importedQuestions.find((question) => question.plainText === 'Imported SA');
    expect(shortAnswerQuestion.tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'imported', label: 'imported' }),
    ]));
  });
});

// ---------- POST /api/v1/sessions/:id/copy ----------
describe('POST /api/v1/sessions/:id/copy', () => {
  it('instructor can copy a session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id, {
      name: 'Original',
      description: 'Desc',
      quiz: true,
      quizStart: new Date('2025-01-10T12:00:00.000Z').toISOString(),
      quizEnd: new Date('2025-01-10T14:00:00.000Z').toISOString(),
      date: new Date('2025-01-10T12:00:00.000Z').toISOString(),
    });
    const session = sessRes.json().session;
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: {
        status: 'done',
        reviewable: true,
        joinCodeEnabled: true,
      },
    });

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/copy`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.session.name).toBe('Original (copy)');
    expect(body.session.description).toBe('Desc');
    expect(body.session.status).toBe('hidden');
    expect(body.session.reviewable).toBe(false);
    expect(body.session.joinCodeEnabled).toBe(false);
    expect(body.session).not.toHaveProperty('date');
    expect(body.session).not.toHaveProperty('quizStart');
    expect(body.session).not.toHaveProperty('quizEnd');
    expect(body.session._id).not.toBe(session._id);
  });

  it('copied session is added to course', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const copyRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/copy`, {
      token: profToken,
    });
    const copiedSession = copyRes.json().session;

    const updatedCourse = await Course.findById(course._id);
    expect(updatedCourse.sessions).toContain(copiedSession._id);
  });

  it('copied session receives copied questions in order with updated ownership links', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id, { name: 'Original Session' });
    const session = sessRes.json().session;

    const q1Res = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: { type: 2, content: '<p>Question 1</p>', plainText: 'Question 1', sessionId: session._id, courseId: course._id },
    });
    const q2Res = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: { type: 2, content: '<p>Question 2</p>', plainText: 'Question 2', sessionId: session._id, courseId: course._id },
    });
    const q1 = q1Res.json().question;
    const q2 = q2Res.json().question;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: q1._id },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: q2._id },
    });

    const copyRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/copy`, {
      token: profToken,
    });

    expect(copyRes.statusCode).toBe(201);
    const copiedSession = copyRes.json().session;
    expect(copiedSession.questions).toHaveLength(2);
    expect(copiedSession.questions).not.toEqual([q1._id, q2._id]);

    const copiedQuestions = await Question.find({ _id: { $in: copiedSession.questions } }).lean();
    const copiedQuestionsById = new Map(copiedQuestions.map((q) => [q._id, q]));

    copiedSession.questions.forEach((copiedQuestionId, idx) => {
      const copiedQuestion = copiedQuestionsById.get(copiedQuestionId);
      const sourceQuestionId = idx === 0 ? q1._id : q2._id;

      expect(copiedQuestion).toBeDefined();
      expect(copiedQuestion.sessionId).toBe(copiedSession._id);
      expect(copiedQuestion.courseId).toBe(course._id);
      expect(copiedQuestion.originalQuestion).toBe(sourceQuestionId);
      expect(copiedQuestion._id).not.toBe(sourceQuestionId);
    });
  });
});

// ---------- GET /api/v1/sessions/:id/review ----------
describe('GET /api/v1/sessions/:id/review', () => {
  async function createReviewableSession(profToken, courseId) {
    const sessRes = await createSessionInCourse(profToken, courseId, { name: 'Review Session' });
    const session = sessRes.json().session;

    // Create a question with a correct answer and solution
    const qRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: {
        type: 0,
        content: '<p>What is 2+2?</p>',
        plainText: 'What is 2+2?',
        sessionId: session._id,
        courseId,
        options: [
          { content: '3', correct: false },
          { content: '4', correct: true },
          { content: '5', correct: false },
        ],
        solution: '<p>Basic addition: 2+2=4</p>',
        solution_plainText: 'Basic addition: 2+2=4',
      },
    });
    const question = qRes.json().question;

    // Add question to session
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });

    // Mark session done and reviewable
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { status: 'done', reviewable: true },
    });

    return { session, question };
  }

  it('student can review a done+reviewable session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const { session, question } = await createReviewableSession(profToken, course._id);

    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/review`, {
      token: studentToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session).toBeDefined();
    expect(body.questions).toBeDefined();
    expect(body.questions.length).toBe(1);
    expect(body.questions[0]._id).toBe(question._id);
    expect(body.questions[0].solution).toBe('<p>Basic addition: 2+2=4</p>');
    expect(body.questions[0].options[1].correct).toBe(true);
    expect(body.responses).toBeDefined();
  });

  it('student review payload includes feedback summary for new feedback', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const { session, question } = await createReviewableSession(profToken, course._id);

    await Grade.create({
      userId: student._id,
      courseId: course._id,
      sessionId: session._id,
      name: session.name,
      visibleToStudents: true,
      marks: [
        {
          questionId: question._id,
          feedback: '<p>Please revisit this step.</p>',
          feedbackUpdatedAt: new Date(),
        },
      ],
    });

    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/review`, {
      token: studentToken,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().feedback).toBeDefined();
    expect(res.json().feedback.hasNewFeedback).toBe(true);
    expect(res.json().feedback.newFeedbackQuestionIds).toContain(question._id);
  });

  it('normalizes review question solution/correct fields for legacy-shaped records', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id, { name: 'Legacy Review Session' });
    const session = sessRes.json().session;

    const qRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: {
        type: 0,
        content: '<p>Legacy question?</p>',
        plainText: 'Legacy question?',
        sessionId: session._id,
        courseId: course._id,
        options: [
          { content: '3', correct: false },
          { content: '4', correct: false },
        ],
      },
    });
    const question = qRes.json().question;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });

    await Question.collection.updateOne(
      { _id: question._id },
      {
        $set: {
          correctAnswer: '4',
          solutionHtml: '<p>Legacy explanation</p>',
          solutionText: 'Legacy explanation',
          creator: prof._id,
        },
        $unset: {
          solution: '',
          solution_plainText: '',
          'options.0.correct': '',
          'options.1.correct': '',
        },
      }
    );

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { status: 'done', reviewable: true },
    });

    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/review`, {
      token: studentToken,
    });

    expect(res.statusCode).toBe(200);
    const reviewQuestion = res.json().questions[0];
    expect(reviewQuestion.solution).toBe('<p>Legacy explanation</p>');
    expect(reviewQuestion.solution_plainText).toBe('Legacy explanation');
    expect(reviewQuestion.options[1].correct).toBe(true);
  });

  it('student cannot review a non-reviewable session (403)', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { status: 'done', reviewable: false },
    });

    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/review`, {
      token: studentToken,
    });

    expect(res.statusCode).toBe(403);
  });

  it('student cannot review a session that is not done (403)', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { status: 'visible', reviewable: true },
    });

    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/review`, {
      token: studentToken,
    });

    expect(res.statusCode).toBe(403);
  });

  it('non-member cannot review session (403)', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const { session } = await createReviewableSession(profToken, course._id);

    const outsider = await createTestUser({ email: 'outsider@example.com', roles: ['student'] });
    const outsiderToken = await getAuthToken(app, outsider);

    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/review`, {
      token: outsiderToken,
    });

    expect(res.statusCode).toBe(403);
  });

  it('instructor can review session even if not reviewable', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    // Session is hidden and not reviewable, but instructor should still access review
    const res = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/review`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 for non-existent session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/sessions/nonexistentId123/review', {
      token: profToken,
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------- POST /api/v1/sessions/:id/review/feedback/dismiss ----------
describe('POST /api/v1/sessions/:id/review/feedback/dismiss', () => {
  it('dismisses feedback notifications and allows new feedback to re-trigger the session chip', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();

    const sessRes = await createSessionInCourse(profToken, course._id, { name: 'Feedback Session' });
    const session = sessRes.json().session;

    const qRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: {
        type: 2,
        content: '<p>Explain your answer.</p>',
        plainText: 'Explain your answer.',
        sessionId: session._id,
        courseId: course._id,
      },
    });
    const question = qRes.json().question;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { status: 'done', reviewable: true },
    });

    const grade = await Grade.create({
      userId: student._id,
      courseId: course._id,
      sessionId: session._id,
      name: session.name,
      visibleToStudents: true,
      marks: [
        {
          questionId: question._id,
          feedback: '<p>Initial feedback</p>',
          feedbackUpdatedAt: new Date(),
        },
      ],
    });

    const beforeDismiss = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: studentToken,
    });
    expect(beforeDismiss.statusCode).toBe(200);
    const beforeSession = beforeDismiss.json().sessions.find((row) => row._id === session._id);
    expect(beforeSession.hasNewFeedback).toBe(true);

    const dismissRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/review/feedback/dismiss`, {
      token: studentToken,
    });
    expect(dismissRes.statusCode).toBe(200);
    expect(dismissRes.json().feedback.hasNewFeedback).toBe(false);

    const afterDismiss = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: studentToken,
    });
    expect(afterDismiss.statusCode).toBe(200);
    const afterDismissSession = afterDismiss.json().sessions.find((row) => row._id === session._id);
    expect(afterDismissSession.hasNewFeedback).toBe(false);

    const updateFeedbackRes = await authenticatedRequest(
      app,
      'PATCH',
      `/api/v1/grades/${grade._id}/marks/${question._id}`,
      {
        token: profToken,
        payload: { feedback: '<p>Updated feedback</p>' },
      }
    );
    expect(updateFeedbackRes.statusCode).toBe(200);

    const afterUpdate = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: studentToken,
    });
    expect(afterUpdate.statusCode).toBe(200);
    const afterUpdateSession = afterUpdate.json().sessions.find((row) => row._id === session._id);
    expect(afterUpdateSession.hasNewFeedback).toBe(true);
  });
});

// ---------- Session question ordering integration tests ----------
describe('session question ordering', () => {
  it('stores questions and slides in order on the session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    // Create a regular MC question and add to session
    const q = await createQuestionInSession(profToken, {
      type: 0,
      content: '<p>MC question</p>',
      plainText: 'MC question',
      sessionId: session._id,
      courseId: course._id,
      options: [{ content: 'A', correct: true }, { content: 'B', correct: false }],
    });

    // Create a slide and add to session
    const s = await createQuestionInSession(profToken, {
      type: 6,
      content: '<p>Slide</p>',
      plainText: 'Slide',
      sessionId: session._id,
      courseId: course._id,
      sessionOptions: { points: 0 },
    });

    // Fetch the session to verify the ordered questions array
    const getRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}`, {
      token: profToken,
    });
    expect(getRes.statusCode).toBe(200);
    const fetched = getRes.json().session;
    expect(fetched.questions).toEqual([q._id, s._id]);
    expect(fetched.activities).toBeUndefined();
  });

  it('removes a question from the session questions array', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const q1 = await createQuestionInSession(profToken, {
      type: 0,
      content: '<p>Q1</p>',
      plainText: 'Q1',
      sessionId: session._id,
      courseId: course._id,
      options: [{ content: 'A', correct: true }],
    });
    const q2 = await createQuestionInSession(profToken, {
      type: 2,
      content: '<p>Q2</p>',
      plainText: 'Q2',
      sessionId: session._id,
      courseId: course._id,
    });

    // Remove q1
    const removeRes = await authenticatedRequest(app, 'DELETE', `/api/v1/sessions/${session._id}/questions/${q1._id}`, {
      token: profToken,
    });
    expect(removeRes.statusCode).toBe(200);
    const after = removeRes.json().session;
    expect(after.questions).toEqual([q2._id]);
    expect(after.activities).toBeUndefined();
  });

  it('reorders the session questions array', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const slide = await createQuestionInSession(profToken, {
      type: 6,
      content: '<p>Slide first</p>',
      plainText: 'Slide first',
      sessionId: session._id,
      courseId: course._id,
      sessionOptions: { points: 0 },
    });
    const q = await createQuestionInSession(profToken, {
      type: 0,
      content: '<p>MC</p>',
      plainText: 'MC',
      sessionId: session._id,
      courseId: course._id,
      options: [{ content: 'A', correct: true }],
    });

    // Reorder: put MC first, then slide
    const reorderRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/questions/order`, {
      token: profToken,
      payload: { questions: [q._id, slide._id] },
    });
    expect(reorderRes.statusCode).toBe(200);
    const reordered = reorderRes.json().session;
    expect(reordered.questions).toEqual([q._id, slide._id]);
    expect(reordered.activities).toBeUndefined();
  });

  it('does not expose a separate activities array in instructor live session responses', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await createQuestionInSession(profToken, {
      type: 6,
      content: '<p>Slide</p>',
      plainText: 'Slide',
      sessionId: session._id,
      courseId: course._id,
      sessionOptions: { points: 0 },
    });
    await createQuestionInSession(profToken, {
      type: 0,
      content: '<p>Q</p>',
      plainText: 'Q',
      sessionId: session._id,
      courseId: course._id,
      options: [{ content: 'A', correct: true }],
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const liveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: profToken,
    });
    expect(liveRes.statusCode).toBe(200);
    const liveSession = liveRes.json().session;
    expect(liveSession.activities).toBeUndefined();
    expect(liveSession.questions).toHaveLength(2);
  });

  it('copies the questions array when copying a session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await createQuestionInSession(profToken, {
      type: 0,
      content: '<p>Q</p>',
      plainText: 'Q',
      sessionId: session._id,
      courseId: course._id,
      options: [{ content: 'A', correct: true }],
    });
    await createQuestionInSession(profToken, {
      type: 6,
      content: '<p>Slide</p>',
      plainText: 'Slide',
      sessionId: session._id,
      courseId: course._id,
      sessionOptions: { points: 0 },
    });

    const copyRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/copy`, {
      token: profToken,
    });
    expect(copyRes.statusCode).toBe(201);
    const copiedSession = copyRes.json().session;
    expect(copiedSession.activities).toBeUndefined();
    expect(copiedSession.questions.length).toBe(2);
  });

  it('removes deleted questions from the session questions array', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const q = await createQuestionInSession(profToken, {
      type: 0,
      content: '<p>Q</p>',
      plainText: 'Q',
      sessionId: session._id,
      courseId: course._id,
      options: [{ content: 'A', correct: true }],
    });

    // Delete the question
    const delRes = await authenticatedRequest(app, 'DELETE', `/api/v1/questions/${q._id}`, {
      token: profToken,
    });
    expect(delRes.statusCode).toBe(200);

    const getRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}`, {
      token: profToken,
    });
    expect(getRes.statusCode).toBe(200);
    const fetched = getRes.json().session;
    expect(fetched.questions).toEqual([]);
    expect(fetched.activities).toBeUndefined();
  });
});
