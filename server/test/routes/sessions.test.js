import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { createApp, createTestUser, getAuthToken, authenticatedRequest } from '../helpers.js';
import Course from '../../src/models/Course.js';
import Grade from '../../src/models/Grade.js';
import Post from '../../src/models/Post.js';
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
  const {
    allowStudentQuestions,
    inactive,
    requireVerified,
    quizTimeFormat,
    tags,
    ...apiOverrides
  } = overrides;
  const payload = {
    name: 'Test Course',
    deptCode: 'CS',
    courseNumber: '101',
    section: '001',
    semester: 'Fall 2025',
    ...apiOverrides,
  };
  const res = await authenticatedRequest(app, 'POST', '/api/v1/courses', {
    token: profToken,
    payload,
  });
  if (res.statusCode === 201) {
    const courseId = res.json().course?._id;
    const postCreateUpdates = {};
    if (allowStudentQuestions !== undefined) postCreateUpdates.allowStudentQuestions = allowStudentQuestions;
    if (inactive !== undefined) postCreateUpdates.inactive = inactive;
    if (requireVerified !== undefined) postCreateUpdates.requireVerified = requireVerified;
    if (quizTimeFormat !== undefined) postCreateUpdates.quizTimeFormat = quizTimeFormat;
    if (tags !== undefined) postCreateUpdates.tags = tags;
    if (courseId && Object.keys(postCreateUpdates).length > 0) {
      await Course.findByIdAndUpdate(courseId, { $set: postCreateUpdates });
    }
  }
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
async function setupCourseWithStudent(courseOverrides = {}) {
  const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
  const profToken = await getAuthToken(app, prof);
  const createRes = await createCourseAsProf(profToken, courseOverrides);
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

  // Return the copied question's _id (not the original) since
  // copyQuestionToSession creates a new document in the session.
  const sessionQuestions = addRes.json().session.questions;
  const copiedQuestionId = sessionQuestions[sessionQuestions.length - 1];
  return { ...question, _id: copiedQuestionId };
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
    const { course, student, studentToken } = await setupCourseWithStudent({ allowStudentQuestions: true });

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

  it('blocks student practice session creation when student questions are disabled', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { course, studentToken } = await setupCourseWithStudent();

    const res = await createSessionInCourse(studentToken, course._id, {
      name: 'Blocked Practice Session',
      practiceQuiz: true,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toMatch(/student practice is disabled/i);
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
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();

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
    const { course, studentToken } = await setupCourseWithStudent({ allowStudentQuestions: true });
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
    await Grade.findOneAndUpdate(
      {
        userId: student._id,
        courseId: course._id,
        sessionId: sessionWithFeedback._id,
      },
      {
        $set: {
          name: sessionWithFeedback.name,
          visibleToStudents: true,
          marks: [
            {
              questionId: 'q-feedback-1',
              feedback: '<p>New feedback</p>',
              feedbackUpdatedAt: now,
            },
          ],
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
    await Grade.findOneAndUpdate(
      {
        userId: student._id,
        courseId: course._id,
        sessionId: sessionWithoutFeedback._id,
      },
      {
        $set: {
          name: sessionWithoutFeedback.name,
          visibleToStudents: true,
          marks: [
            {
              questionId: 'q-feedback-2',
              feedback: '',
              feedbackUpdatedAt: null,
            },
          ],
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

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

  it('hydrates legacy session response tracking and exposes hasResponses in the session list', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student } = await setupCourseWithStudent();
    const sessionRes = await createSessionInCourse(profToken, course._id, { name: 'Tracked Session' });
    const session = sessionRes.json().session;
    const question = await createQuestionInSession(profToken, {
      type: 0,
      content: '<p>Tracked question</p>',
      plainText: 'Tracked question',
      sessionId: session._id,
      courseId: course._id,
      options: [
        { content: 'A', correct: true },
        { content: 'B', correct: false },
      ],
    });

    await Response.create({
      questionId: question._id,
      studentUserId: student._id,
      attempt: 1,
      answer: '0',
      createdAt: new Date(),
    });
    await Session.updateOne(
      { _id: session._id },
      { $unset: { hasResponses: 1, questionResponseCounts: 1 } }
    );

    const res = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    const listed = res.json().sessions.find((row) => row._id === session._id);
    expect(listed).toBeDefined();
    expect(listed.hasResponses).toBe(true);
    expect(listed.questionResponseCounts).toBeUndefined();

    const persisted = await Session.findById(session._id).lean();
    expect(persisted.hasResponses).toBe(true);
    expect(Number(persisted.questionResponseCounts?.[question._id] || 0)).toBe(1);
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

  it('orders paginated sessions by session status bucket and session time instead of creation time', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof-sort@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;

    const runningRes = await createSessionInCourse(profToken, course._id, { name: 'Running Session' });
    const hiddenRes = await createSessionInCourse(profToken, course._id, { name: 'Hidden Session' });
    const upcomingSoonRes = await createSessionInCourse(profToken, course._id, {
      name: 'Upcoming Soon',
      quiz: true,
      quizStart: new Date('2026-04-02T12:00:00.000Z').toISOString(),
      quizEnd: new Date('2026-04-02T13:00:00.000Z').toISOString(),
    });
    const upcomingLaterRes = await createSessionInCourse(profToken, course._id, {
      name: 'Upcoming Later',
      quiz: true,
      quizStart: new Date('2026-04-03T12:00:00.000Z').toISOString(),
      quizEnd: new Date('2026-04-03T13:00:00.000Z').toISOString(),
    });

    await Promise.all([
      authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${runningRes.json().session._id}`, {
        token: profToken,
        payload: { status: 'running' },
      }),
      authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${upcomingSoonRes.json().session._id}`, {
        token: profToken,
        payload: { status: 'visible' },
      }),
      authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${upcomingLaterRes.json().session._id}`, {
        token: profToken,
        payload: { status: 'visible' },
      }),
    ]);

    await Promise.all([
      Session.findByIdAndUpdate(runningRes.json().session._id, { $set: { createdAt: new Date('2026-03-20T08:00:00.000Z') } }),
      Session.findByIdAndUpdate(hiddenRes.json().session._id, { $set: { createdAt: new Date('2026-03-25T08:00:00.000Z') } }),
      Session.findByIdAndUpdate(upcomingSoonRes.json().session._id, { $set: { createdAt: new Date('2026-03-26T08:00:00.000Z') } }),
      Session.findByIdAndUpdate(upcomingLaterRes.json().session._id, { $set: { createdAt: new Date('2026-03-24T08:00:00.000Z') } }),
    ]);

    const page1 = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions?page=1&limit=2`, {
      token: profToken,
    });
    expect(page1.statusCode).toBe(200);
    expect(page1.json().sessions.map((session) => session.name)).toEqual([
      'Running Session',
      'Hidden Session',
    ]);

    const page2 = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions?page=2&limit=2`, {
      token: profToken,
    });
    expect(page2.statusCode).toBe(200);
    expect(page2.json().sessions.map((session) => session.name)).toEqual([
      'Upcoming Later',
      'Upcoming Soon',
    ]);
  });

  it('returns per-type session counts for paginated professor and student session lists', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent({ allowStudentQuestions: true });

    const interactiveARes = await createSessionInCourse(profToken, course._id, { name: 'Interactive A' });
    const interactiveBRes = await createSessionInCourse(profToken, course._id, { name: 'Interactive B' });
    const quizRes = await createSessionInCourse(profToken, course._id, {
      name: 'Quiz A',
      quiz: true,
      quizStart: new Date(Date.now() + (60 * 1000)).toISOString(),
      quizEnd: new Date(Date.now() + (120 * 60 * 1000)).toISOString(),
    });
    expect(quizRes.statusCode).toBe(201);
    await Promise.all([
      interactiveARes,
      interactiveBRes,
      quizRes,
    ].map((response) => authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${response.json().session._id}`, {
      token: profToken,
      payload: { status: 'visible' },
    })));
    const practiceRes = await createSessionInCourse(studentToken, course._id, {
      name: 'My Practice',
      practiceQuiz: true,
    });
    expect(practiceRes.statusCode).toBe(201);

    const profListRes = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions?page=1&limit=2`, {
      token: profToken,
    });
    expect(profListRes.statusCode).toBe(200);
    expect(profListRes.json().sessionTypeCounts).toEqual({
      total: 3,
      interactive: 2,
      quizzes: 1,
      practice: 0,
    });

    const studentListRes = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/sessions?page=1&limit=2`, {
      token: studentToken,
    });
    expect(studentListRes.statusCode).toBe(200);
    expect(studentListRes.json().sessionTypeCounts).toEqual({
      total: 4,
      interactive: 2,
      quizzes: 1,
      practice: 1,
    });
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
    const { prof, profToken, course, student, studentToken } = await setupCourseWithStudent({ allowStudentQuestions: true });
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

    const res = await authenticatedRequest(app, 'GET', '/api/v1/sessions/live?view=student', {
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

  it('instructor does not see student-created practice sessions in live sessions', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent({ allowStudentQuestions: true });

    const instructorSessionRes = await createSessionInCourse(profToken, course._id, { name: 'Instructor Live Poll' });
    const instructorSession = instructorSessionRes.json().session;
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${instructorSession._id}`, {
      token: profToken,
      payload: { status: 'running' },
    });

    const studentPracticeRes = await createSessionInCourse(studentToken, course._id, {
      name: 'Student Practice Session',
      practiceQuiz: true,
    });
    const studentPracticeSession = studentPracticeRes.json().session;
    await Session.updateOne(
      { _id: studentPracticeSession._id },
      { $set: { status: 'running' } }
    );

    const res = await authenticatedRequest(app, 'GET', '/api/v1/sessions/live?view=instructor', {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    const sessionIds = (res.json().liveSessions || []).map((row) => String(row._id));
    expect(sessionIds).toContain(String(instructorSession._id));
    expect(sessionIds).not.toContain(String(studentPracticeSession._id));
  });

  it('student-only instructor accounts can fetch instructor-view live sessions', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof-live-mixed@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const course = (await createCourseAsProf(profToken, { name: 'Mixed Instructor Live Course' })).json().course;

    const mixed = await createTestUser({ email: 'mixed-live@example.com', roles: ['student'] });
    const mixedToken = await getAuthToken(app, mixed);

    const addInstructorRes = await authenticatedRequest(app, 'POST', `/api/v1/courses/${course._id}/instructors`, {
      token: profToken,
      payload: { userId: mixed._id.toString() },
    });
    expect(addInstructorRes.statusCode).toBe(200);

    const createSessionRes = await createSessionInCourse(profToken, course._id, {
      name: 'Mixed Instructor Live Session',
    });
    expect(createSessionRes.statusCode).toBe(201);
    const instructorSession = createSessionRes.json().session;
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${instructorSession._id}`, {
      token: profToken,
      payload: { status: 'running' },
    });

    const res = await authenticatedRequest(app, 'GET', '/api/v1/sessions/live?view=instructor', {
      token: mixedToken,
    });

    expect(res.statusCode).toBe(200);
    const sessionIds = (res.json().liveSessions || []).map((row) => String(row._id));
    expect(sessionIds).toContain(String(instructorSession._id));
  });

  it('rejects instructor-view live sessions for students without instructor courses', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const student = await createTestUser({ email: 'plain-student-live@example.com', roles: ['student'] });
    const studentToken = await getAuthToken(app, student);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/sessions/live?view=instructor', {
      token: studentToken,
    });

    expect(res.statusCode).toBe(403);
  });

  it('admin all-view includes student-created live sessions', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent({ allowStudentQuestions: true });

    const instructorSessionRes = await createSessionInCourse(profToken, course._id, { name: 'Instructor Live Poll' });
    const instructorSession = instructorSessionRes.json().session;
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${instructorSession._id}`, {
      token: profToken,
      payload: { status: 'running' },
    });

    const studentPracticeRes = await createSessionInCourse(studentToken, course._id, {
      name: 'Student Practice Session',
      practiceQuiz: true,
    });
    const studentPracticeSession = studentPracticeRes.json().session;
    await Session.updateOne(
      { _id: studentPracticeSession._id },
      { $set: { status: 'running' } }
    );

    const admin = await createTestUser({ email: 'admin-live@example.com', roles: ['admin'] });
    const adminToken = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/sessions/live?view=all', {
      token: adminToken,
    });

    expect(res.statusCode).toBe(200);
    const sessionIds = (res.json().liveSessions || []).map((row) => String(row._id));
    expect(sessionIds).toContain(String(instructorSession._id));
    expect(sessionIds).toContain(String(studentPracticeSession._id));
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
    const { profToken, course, studentToken } = await setupCourseWithStudent({ allowStudentQuestions: true });
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

  it('returns a warning before making an ended session reviewable with manual-grading questions', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course } = await setupCourseWithStudent();
    const session = (await createSessionInCourse(profToken, course._id)).json().session;

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
        status: 'done',
      },
    });

    const warningRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { reviewable: true },
    });

    expect(warningRes.statusCode).toBe(200);
    const warningBody = warningRes.json();
    expect(warningBody.grading).toBeNull();
    expect(warningBody.nonAutoGradeableWarning.questionCount).toBe(1);
    expect(warningBody.nonAutoGradeableWarning.nonAutoGradeableCount).toBe(1);
    expect(warningBody.nonAutoGradeableWarning.noResponseCount).toBe(0);

    const warnedSession = await Session.findById(session._id).lean();
    expect(warnedSession.reviewable).toBe(false);
    expect(await Grade.countDocuments({ sessionId: session._id, courseId: course._id })).toBe(0);
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

    const addRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    const addResQuestions = addRes.json().session.questions;
    const copiedQuestionId = addResQuestions[addResQuestions.length - 1];

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/question-visibility`, {
      token: profToken,
      payload: { hidden: false, stats: true },
    });

    const liveSession = await Session.findById(session._id).lean();
    const liveQuestionId = liveSession.currentQuestion || question._id;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentTwoToken,
      payload: {},
    });

    await Response.create({
      questionId: copiedQuestionId,
      studentUserId: student._id,
      attempt: 1,
      answer: 'First response',
    });
    await Response.create({
      questionId: copiedQuestionId,
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

  it('treats legacy numerical type 5 questions as numerical in live stats and histogram generation', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const question = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 5,
      content: '<p>Legacy numerical</p>',
      plainText: 'Legacy numerical',
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

    await Response.create({
      questionId: question._id,
      studentUserId: student._id,
      attempt: 1,
      answer: '42',
    });

    const liveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: profToken,
    });
    expect(liveRes.statusCode).toBe(200);
    expect(liveRes.json().responseStats?.type).toBe('numerical');

    const histogramRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/histogram`, {
      token: profToken,
      payload: {},
    });
    expect(histogramRes.statusCode).toBe(200);
    expect(histogramRes.json().histogramData?.bins?.length).toBeGreaterThan(0);
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

    const addRes2 = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    const addRes2Questions = addRes2.json().session.questions;
    const copiedQId2 = addRes2Questions[addRes2Questions.length - 1];
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
      questionId: copiedQId2,
      studentUserId: student._id,
      attempt: 1,
      answer: 'First response',
    });
    await Response.create({
      questionId: copiedQId2,
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

    const addRes3 = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    const addRes3Questions = addRes3.json().session.questions;
    const copiedQId3 = addRes3Questions[addRes3Questions.length - 1];
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
      questionId: copiedQId3,
      studentUserId: student._id,
      attempt: 1,
      answer: 'First response',
      createdAt: new Date('2026-03-28T10:00:00.000Z'),
    });
    await Response.create({
      questionId: copiedQId3,
      studentUserId: studentTwo._id,
      attempt: 1,
      answer: 'Second response',
      createdAt: new Date('2026-03-28T10:05:00.000Z'),
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
    expect(body.responseStats.answers.map((entry) => entry.answer)).toEqual(['Second response', 'First response']);
    expect(body.responseStats.answers[0]).not.toHaveProperty('studentUserId');
    expect(body.responseStats.answers[0]).toHaveProperty('studentName');
    expect(body.allResponses[0]).not.toHaveProperty('studentUserId');
    expect(body.allResponses[0]).toHaveProperty('studentName');
  });

  it('hides the short-answer response list from student and presentation payloads when the professor turns it off', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
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

    const addRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    const copiedQuestionId = addRes.json().session.questions.at(-1);

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, { token: profToken });
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/question-visibility`, {
      token: profToken,
      payload: { hidden: false, stats: true, responseListVisible: false },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    await Response.create({
      questionId: copiedQuestionId,
      studentUserId: student._id,
      attempt: 1,
      answer: 'Hidden response',
      createdAt: new Date('2026-03-28T10:10:00.000Z'),
    });

    const studentLiveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: studentToken,
    });
    expect(studentLiveRes.statusCode).toBe(200);
    expect(studentLiveRes.json().showResponseList).toBe(false);
    expect(studentLiveRes.json().responseStats?.answers || []).toHaveLength(0);

    const presentationLiveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live?view=presentation`, {
      token: profToken,
    });
    expect(presentationLiveRes.statusCode).toBe(200);
    expect(presentationLiveRes.json().showResponseList).toBe(false);
    expect(presentationLiveRes.json().responseStats?.answers || []).toHaveLength(0);

    const instructorLiveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live?includeStudentNames=true`, {
      token: profToken,
    });
    expect(instructorLiveRes.statusCode).toBe(200);
    expect(instructorLiveRes.json().responseStats?.answers?.map((entry) => entry.answer)).toEqual(['Hidden response']);
  });

  it('instructor can opt in to student names for numerical control view', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const studentTwo = await createTestUser({
      email: 'student-live-prof-numeric-names@example.com',
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
        type: 4,
        content: '<p>Value?</p>',
        plainText: 'Value?',
        sessionId: session._id,
        courseId: course._id,
      },
    });
    const question = qRes.json().question;

    const addRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    const addResQuestions = addRes.json().session.questions;
    const copiedQuestionId = addResQuestions[addResQuestions.length - 1];
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
      questionId: copiedQuestionId,
      studentUserId: student._id,
      attempt: 1,
      answer: '10',
    });
    await Response.create({
      questionId: copiedQuestionId,
      studentUserId: studentTwo._id,
      attempt: 1,
      answer: '12',
    });

    const liveRes = await authenticatedRequest(
      app,
      'GET',
      `/api/v1/sessions/${session._id}/live?includeStudentNames=true`,
      { token: profToken }
    );

    expect(liveRes.statusCode).toBe(200);
    const body = liveRes.json();
    expect(body.responseStats?.type).toBe('numerical');
    expect(body.responseStats?.answers?.length).toBeGreaterThan(0);
    expect(body.responseStats.answers[0]).not.toHaveProperty('studentUserId');
    expect(body.responseStats.answers[0]).toHaveProperty('studentName');
    expect(body.allResponses[0]).not.toHaveProperty('studentUserId');
    expect(body.allResponses[0]).toHaveProperty('studentName');
  });

  it('presentation view never includes student names in response payloads', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
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

    const addRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    const addResQuestions = addRes.json().session.questions;
    const copiedQuestionId = addResQuestions[addResQuestions.length - 1];
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, { token: profToken });
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/question-visibility`, {
      token: profToken,
      payload: { hidden: false, stats: true },
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    await Response.create({
      questionId: copiedQuestionId,
      studentUserId: student._id,
      attempt: 1,
      answer: 'First response',
    });

    const liveRes = await authenticatedRequest(
      app,
      'GET',
      `/api/v1/sessions/${session._id}/live?view=presentation&includeStudentNames=true`,
      { token: profToken }
    );

    expect(liveRes.statusCode).toBe(200);
    const body = liveRes.json();
    expect(body.responseStats?.type).toBe('shortAnswer');
    expect(body.responseStats.answers[0]).not.toHaveProperty('studentName');
    expect(body.allResponses[0]).not.toHaveProperty('studentName');
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
    expect(new Date(body.session.date).getTime()).toBeGreaterThanOrEqual(new Date(session.createdAt).getTime());
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

  it('seeds hidden grade rows when ending a session without making it reviewable', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, student } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const question = await Question.create({
      type: 0,
      creator: prof._id,
      owner: prof._id,
      courseId: course._id,
      sessionId: session._id,
      plainText: 'Pick one',
      content: '<p>Pick one</p>',
      options: [
        { answer: 'A', plainText: 'A', correct: true },
        { answer: 'B', plainText: 'B', correct: false },
      ],
      sessionOptions: {
        points: 1,
        maxAttempts: 1,
        attemptWeights: [1],
        attempts: [{ number: 1, closed: false }],
      },
    });

    await Session.findByIdAndUpdate(session._id, {
      $set: {
        questions: [question._id],
        joined: [student._id],
      },
    });

    await Response.create({
      questionId: question._id,
      studentUserId: student._id,
      attempt: 1,
      answer: 'A',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/end`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().session.status).toBe('done');
    expect(res.json().session.reviewable).toBe(false);

    const grades = await Grade.find({ sessionId: session._id, courseId: course._id }).lean();
    expect(grades).toHaveLength(1);
    expect(grades[0].visibleToStudents).toBe(false);
    expect(grades[0].marks).toHaveLength(1);
    expect(grades[0].marks[0].attempt).toBe(1);
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
      'session:quiz-submitted',
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

  it('records submittedAt and submittedIpAddress when quiz responses are autosaved', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const session = await createOpenQuiz({ profToken, courseId: course._id, practiceQuiz: false });
    const question = await addMcQuestion({ profToken, sessionId: session._id, courseId: course._id, content: 'Audit me' });

    const firstSaveRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/quiz-response`, {
      token: studentToken,
      headers: { 'x-forwarded-for': '203.0.113.60' },
      payload: { questionId: question._id, answer: '0' },
    });
    expect(firstSaveRes.statusCode).toBe(200);
    expect(firstSaveRes.json().response.submittedIpAddress).toBe('203.0.113.60');
    expect(firstSaveRes.json().response.submittedAt).toBeTruthy();

    const firstSavedAt = new Date(firstSaveRes.json().response.submittedAt).getTime();

    const secondSaveRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/quiz-response`, {
      token: studentToken,
      headers: { 'x-forwarded-for': '203.0.113.61' },
      payload: { questionId: question._id, answer: '1' },
    });
    expect(secondSaveRes.statusCode).toBe(200);
    expect(secondSaveRes.json().response.submittedIpAddress).toBe('203.0.113.61');
    expect(new Date(secondSaveRes.json().response.submittedAt).getTime()).toBeGreaterThanOrEqual(firstSavedAt);

    const stored = await Response.findOne({
      questionId: question._id,
      studentUserId: student._id,
      attempt: 1,
    }).lean();
    expect(stored.submittedIpAddress).toBe('203.0.113.61');
    expect(stored.submittedAt).toBeTruthy();

    const trackedSession = await Session.findById(session._id).lean();
    expect(trackedSession.hasResponses).toBe(true);
    expect(Number(trackedSession.questionResponseCounts?.[question._id] || 0)).toBe(1);

    const trackedQuestion = await Question.findById(question._id).lean();
    expect(trackedQuestion.sessionProperties).toEqual(expect.objectContaining({
      lastAttemptNumber: 1,
      lastAttemptResponseCount: 1,
    }));
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
    const copiedQuestionId = String(setQuestionsRes.json().session.questions[0]);
    expect(copiedQuestionId).not.toBe(String(libraryQuestion._id));
    const copiedQuestion = await Question.findById(copiedQuestionId).lean();
    expect(copiedQuestion).toBeTruthy();
    expect(String(copiedQuestion.sessionId)).toBe(String(practiceSession._id));
    expect(String(copiedQuestion.originalQuestion)).toBe(String(libraryQuestion._id));

    const quizRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${practiceSession._id}/quiz`, {
      token: studentToken,
    });
    expect(quizRes.statusCode).toBe(200);
    expect(quizRes.json().questions).toHaveLength(1);

    const answerRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${practiceSession._id}/quiz-response`, {
      token: studentToken,
      payload: { questionId: copiedQuestionId, answer: '0' },
    });
    expect(answerRes.statusCode).toBe(200);

    const lockRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${practiceSession._id}/quiz-question-submit`, {
      token: studentToken,
      payload: { questionId: copiedQuestionId },
    });
    expect(lockRes.statusCode).toBe(200);
  });

  it('blocks practice question edits when the course disables student questions', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'practice-edit-prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const course = (await createCourseAsProf(profToken)).json().course;
    await Course.findByIdAndUpdate(course._id, { $set: { allowStudentQuestions: true } });
    const student = await createTestUser({ email: 'practice-edit-student@example.com', roles: ['student'] });
    const studentToken = await getAuthToken(app, student);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const sessionRes = await createSessionInCourse(studentToken, course._id, {
      name: 'Editable Practice Session',
      practiceQuiz: true,
    });
    expect(sessionRes.statusCode).toBe(201);
    const practiceSession = sessionRes.json().session;

    await Course.findByIdAndUpdate(course._id, { $set: { allowStudentQuestions: false } });

    const editRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${practiceSession._id}/practice-questions`, {
      token: studentToken,
      payload: { questionIds: [] },
    });
    expect(editRes.statusCode).toBe(403);
    expect(editRes.json().message).toMatch(/student practice is disabled/i);
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

  it('returns the same join code for concurrent automatic refresh requests', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, student } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const openRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/join-code-settings`, {
      token: profToken,
      payload: { joinCodeEnabled: true, joinCodeActive: true },
    });
    expect(openRes.statusCode).toBe(200);

    await Session.findByIdAndUpdate(session._id, {
      $set: { joinCodeExpiresAt: new Date(Date.now() - 1000) },
    });

    const wsSendToUsersSpy = vi.spyOn(app, 'wsSendToUsers');
    const firstRefreshRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/refresh-join-code`, {
      token: profToken,
      payload: { force: false },
    });
    const secondRefreshRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/refresh-join-code`, {
      token: profToken,
      payload: { force: false },
    });

    expect(firstRefreshRes.statusCode).toBe(200);
    expect(secondRefreshRes.statusCode).toBe(200);
    expect(secondRefreshRes.json().joinCode).toBe(firstRefreshRes.json().joinCode);

    const joinCodeCalls = wsSendToUsersSpy.mock.calls.filter(([, event]) => event === 'session:join-code-changed');
    expect(joinCodeCalls).toHaveLength(2);

    const instructorCall = joinCodeCalls.find(([userIds]) => userIds.includes(String(prof._id)));
    const studentCall = joinCodeCalls.find(([userIds]) => userIds.includes(String(student._id)));
    expect(instructorCall[2].currentJoinCode).toBe(firstRefreshRes.json().joinCode);
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

  it('includes canonical distribution stats in response-added deltas for multiple-select questions', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const question = await createQuestionInSession(profToken, {
      type: 1,
      content: '<p>Select both correct answers</p>',
      plainText: 'Select both correct answers',
      sessionId: session._id,
      courseId: course._id,
      options: [
        { content: 'A', correct: true },
        { content: 'B', correct: true },
        { content: 'C', correct: false },
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
    await Question.findByIdAndUpdate(question._id, {
      $set: {
        'sessionOptions.attemptStats': [
          {
            number: 1,
            type: 'distribution',
            total: 999,
            distribution: [
              { index: 0, answer: 'A', correct: true, count: 999 },
              { index: 1, answer: 'B', correct: true, count: 999 },
              { index: 2, answer: 'C', correct: false, count: 999 },
            ],
          },
        ],
      },
    });

    const wsSendToUsersSpy = vi.spyOn(app, 'wsSendToUsers');
    const respondRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/respond`, {
      token: studentToken,
      payload: { answer: ['0', '1'] },
    });

    expect(respondRes.statusCode).toBe(201);
    const instructorResponseCall = wsSendToUsersSpy.mock.calls.find(([userIds, event]) => (
      event === 'session:response-added' && userIds.includes(String(prof._id))
    ));
    expect(instructorResponseCall).toBeDefined();

    const [, , payload] = instructorResponseCall;
    expect(payload.responseCount).toBe(1);
    expect(payload.responseStats).toEqual(expect.objectContaining({
      type: 'distribution',
      total: 1,
    }));
    expect(payload.responseStats.distribution).toEqual([
      expect.objectContaining({ count: 1 }),
      expect.objectContaining({ count: 1 }),
      expect.objectContaining({ count: 0 }),
    ]);
  });

  it('includes distribution stats for instructors even when live stats are disabled for students', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, student, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await createQuestionInSession(profToken, {
      type: 0,
      content: '<p>MC question without live stats</p>',
      plainText: 'MC question without live stats',
      sessionId: session._id,
      courseId: course._id,
      options: [
        { content: 'Option A', correct: true },
        { content: 'Option B', correct: false },
      ],
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });
    // Make the question visible but do NOT enable stats for students.
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/question-visibility`, {
      token: profToken,
      payload: { hidden: false, stats: false },
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

    // Instructor should receive responseStats even though stats are not enabled for students.
    const instructorCall = wsSendToUsersSpy.mock.calls.find(([userIds, event]) => (
      event === 'session:response-added' && userIds.includes(String(prof._id))
    ));
    expect(instructorCall).toBeDefined();
    const [, , instructorPayload] = instructorCall;
    expect(instructorPayload.responseStats).toEqual(expect.objectContaining({
      type: 'distribution',
      total: 1,
    }));
    expect(instructorPayload.responseStats.distribution).toEqual([
      expect.objectContaining({ count: 1 }),
      expect.objectContaining({ count: 0 }),
    ]);

    // Student should NOT receive responseStats because stats are disabled.
    const studentCall = wsSendToUsersSpy.mock.calls.find(([userIds, event]) => (
      event === 'session:response-added' && userIds.includes(String(student._id))
    ));
    // Student may or may not receive the event, but if they do, no responseStats.
    if (studentCall) {
      expect(studentCall[2]).not.toHaveProperty('responseStats');
    }
  });

  it('includes complete short-answer stats in response-added deltas', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, student, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await createQuestionInSession(profToken, {
      type: 2,
      content: '<p>Visible short answer stats question</p>',
      plainText: 'Visible short answer stats question',
      sessionId: session._id,
      courseId: course._id,
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
      payload: { answer: 'Delta answer', answerWysiwyg: '<p>Delta answer</p>' },
    });

    expect(respondRes.statusCode).toBe(201);
    const instructorResponseCall = wsSendToUsersSpy.mock.calls.find(([userIds, event]) => (
      event === 'session:response-added' && userIds.includes(String(prof._id))
    ));
    expect(instructorResponseCall).toBeDefined();

    const [, , payload] = instructorResponseCall;
    expect(payload.responseStats).toEqual(expect.objectContaining({
      type: 'shortAnswer',
      total: 1,
      answers: [
        expect.objectContaining({
          answer: 'Delta answer',
          answerWysiwyg: '<p>Delta answer</p>',
        }),
      ],
    }));
    expect(payload.responseStats.answers[0]).not.toHaveProperty('studentUserId');
    expect(payload.response).toEqual(expect.objectContaining({
      answer: 'Delta answer',
      studentName: expect.any(String),
    }));
  });

  it('includes complete numerical stats in response-added deltas', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await createQuestionInSession(profToken, {
      type: 4,
      content: '<p>Visible numerical stats question</p>',
      plainText: 'Visible numerical stats question',
      sessionId: session._id,
      courseId: course._id,
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
      payload: { answer: '7.5' },
    });

    expect(respondRes.statusCode).toBe(201);
    const instructorResponseCall = wsSendToUsersSpy.mock.calls.find(([userIds, event]) => (
      event === 'session:response-added' && userIds.includes(String(prof._id))
    ));
    expect(instructorResponseCall).toBeDefined();

    const [, , payload] = instructorResponseCall;
    expect(payload.responseStats).toEqual(expect.objectContaining({
      type: 'numerical',
      total: 1,
      values: [7.5],
      answers: [
        expect.objectContaining({
          answer: '7.5',
        }),
      ],
      mean: 7.5,
      stdev: 0,
      median: 7.5,
      min: 7.5,
      max: 7.5,
    }));
    expect(payload.responseStats.answers[0]).not.toHaveProperty('studentUserId');
  });

  it('tracks live response counts on the session and resets the question attempt counter on new attempts', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;
    const question = await createQuestionInSession(profToken, {
      type: 0,
      content: '<p>Tracked live question</p>',
      plainText: 'Tracked live question',
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

    const respondRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/respond`, {
      token: studentToken,
      payload: { answer: '0' },
    });
    expect(respondRes.statusCode).toBe(201);

    const trackedSession = await Session.findById(session._id).lean();
    expect(trackedSession.hasResponses).toBe(true);
    expect(Number(trackedSession.questionResponseCounts?.[question._id] || 0)).toBe(1);

    const trackedQuestion = await Question.findById(question._id).lean();
    expect(trackedQuestion.sessionProperties).toEqual(expect.objectContaining({
      lastAttemptNumber: 1,
      lastAttemptResponseCount: 1,
    }));

    const newAttemptRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/new-attempt`, {
      token: profToken,
    });
    expect(newAttemptRes.statusCode).toBe(200);

    const resetQuestion = await Question.findById(question._id).lean();
    expect(resetQuestion.sessionProperties).toEqual(expect.objectContaining({
      lastAttemptNumber: 2,
      lastAttemptResponseCount: 0,
    }));
  });
});

describe('Live session telemetry', () => {
  it('accepts batched student interface telemetry and summarizes it for instructors', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const submitRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/live-telemetry`, {
      token: studentToken,
      payload: {
        role: 'student',
        samples: [
          { metric: 'live_fetch_request_ms', durationMs: 1200, success: true, transport: 'polling' },
          { metric: 'live_fetch_request_ms', durationMs: 2800, success: false, transport: 'websocket' },
          { metric: 'server_emit_to_dom_ms', durationMs: 2600, success: true, transport: 'websocket' },
        ],
      },
    });

    expect(submitRes.statusCode).toBe(200);
    expect(submitRes.json().accepted).toBe(3);

    const summaryRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live-telemetry`, {
      token: profToken,
    });

    expect(summaryRes.statusCode).toBe(200);
    const telemetry = summaryRes.json().telemetry;
    expect(telemetry.sessionId).toBe(session._id);
    expect(telemetry.courseId).toBe(course._id);
    expect(telemetry.student.sampleCount).toBe(3);
    expect(telemetry.student.transportCounts.polling).toBe(1);
    expect(telemetry.student.transportCounts.websocket).toBe(2);
    expect(telemetry.student.metrics.live_fetch_request_ms.count).toBe(2);
    expect(telemetry.student.metrics.live_fetch_request_ms.successRate).toBe(0.5);
    expect(telemetry.student.metrics.live_fetch_request_ms.p99Ms).toBe(3000);
    expect(telemetry.student.metrics.server_emit_to_dom_ms.p99Ms).toBe(3000);
  });

  it('rejects role-mismatched telemetry submissions from students', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const submitRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/live-telemetry`, {
      token: studentToken,
      payload: {
        role: 'professor',
        samples: [
          { metric: 'live_fetch_request_ms', durationMs: 1000, success: true, transport: 'websocket' },
        ],
      },
    });

    expect(submitRes.statusCode).toBe(403);
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

    const copiedIds = {};
    for (const qId of [qMc._id, qSa._id, qZero._id]) {
      const addRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
        token: profToken,
        payload: { questionId: qId },
      });
      expect(addRes.statusCode).toBe(200);
      const qs = addRes.json().session.questions;
      copiedIds[qId] = qs[qs.length - 1];
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
      questionId: copiedIds[qMc._id],
      studentUserId: student._id,
      attempt: 1,
      answer: '0',
    });
    await Response.create({
      questionId: copiedIds[qSa._id],
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
    const addResRespQuestions = addRes.json().session.questions;
    const copiedQIdResp = addResRespQuestions[addResRespQuestions.length - 1];

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    // Write a response directly without joining to emulate legacy/misaligned data.
    await Response.create({
      questionId: copiedQIdResp,
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

  it('rejects instructor results access for student-created practice sessions', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent({ allowStudentQuestions: true });

    const studentPracticeRes = await createSessionInCourse(studentToken, course._id, {
      name: 'Student Practice Session',
      practiceQuiz: true,
    });
    const studentPracticeSession = studentPracticeRes.json().session;

    const resultsRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${studentPracticeSession._id}/results`, {
      token: profToken,
    });

    expect(resultsRes.statusCode).toBe(404);
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

    const addRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    const addResQuestions = addRes.json().session.questions;
    const copiedQuestionId = addResQuestions[addResQuestions.length - 1];

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/current`, {
      token: profToken,
      payload: { questionId: copiedQuestionId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.currentQuestion).toBe(copiedQuestionId);
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
    // The cross-course copy traces originalQuestion back through the session copy.
    const sourceSessionCopy = await Question.findById(sourceQuestion._id).lean();
    expect(copiedQuestion.originalQuestion).toBe(sourceSessionCopy.originalQuestion || sourceQuestion._id);
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
      hidden: true,
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

  it('defaults copied question points to 1 unless preservePoints is requested', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'copy-points@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const courseRes = await createCourseAsProf(profToken);
    const course = courseRes.json().course;
    const sessRes = await createSessionInCourse(profToken, course._id, { name: 'Points source session' });
    const session = sessRes.json().session;

    const questionRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: {
        type: 2,
        content: '<p>Question with custom points</p>',
        plainText: 'Question with custom points',
        sessionId: session._id,
        courseId: course._id,
        sessionOptions: {
          points: 0,
          maxAttempts: 2,
        },
      },
    });
    const sourceQuestion = questionRes.json().question;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: sourceQuestion._id },
    });

    const defaultCopyRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/copy`, {
      token: profToken,
    });
    expect(defaultCopyRes.statusCode).toBe(201);
    const defaultCopyQuestion = await Question.findById(defaultCopyRes.json().session.questions[0]).lean();
    expect(defaultCopyQuestion.sessionOptions.points).toBe(1);
    expect(defaultCopyQuestion.sessionOptions.maxAttempts).toBe(2);

    const preservedCopyRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/copy`, {
      token: profToken,
      payload: { preservePoints: true },
    });
    expect(preservedCopyRes.statusCode).toBe(201);
    const preservedCopyQuestion = await Question.findById(preservedCopyRes.json().session.questions[0]).lean();
    expect(preservedCopyQuestion.sessionOptions.points).toBe(0);
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
    const addRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    const sessionQuestions = addRes.json().session.questions;
    const copiedQuestionId = sessionQuestions[sessionQuestions.length - 1];

    // Mark session done and reviewable
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}`, {
      token: profToken,
      payload: { status: 'done', reviewable: true },
    });

    return { session, question: { ...question, _id: copiedQuestionId } };
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

    await Grade.findOneAndUpdate(
      {
        userId: student._id,
        courseId: course._id,
        sessionId: session._id,
      },
      {
        $set: {
          name: session.name,
          visibleToStudents: true,
          marks: [
            {
              questionId: question._id,
              feedback: '<p>Please revisit this step.</p>',
              feedbackUpdatedAt: new Date(),
            },
          ],
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

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

    const addResLegacy = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    const addResLegacyQuestions = addResLegacy.json().session.questions;
    const copiedLegacyQId = addResLegacyQuestions[addResLegacyQuestions.length - 1];

    await Question.collection.updateOne(
      { _id: copiedLegacyQId },
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
        type: 0,
        content: '<p>Pick the correct answer.</p>',
        plainText: 'Pick the correct answer.',
        sessionId: session._id,
        courseId: course._id,
        options: [
          { answer: 'A', plainText: 'A', content: 'A', correct: true },
          { answer: 'B', plainText: 'B', content: 'B', correct: false },
        ],
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

    const grade = await Grade.findOneAndUpdate(
      {
        userId: student._id,
        courseId: course._id,
        sessionId: session._id,
      },
      {
        $set: {
          name: session.name,
          visibleToStudents: true,
          marks: [
            {
              questionId: question._id,
              points: 0,
              outOf: 1,
              automatic: false,
              needsGrading: false,
              attempt: 1,
              responseId: new mongoose.Types.ObjectId().toString(),
              feedback: '<p>Initial feedback</p>',
              feedbackUpdatedAt: new Date(),
            },
          ],
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

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

// ---------- Session chat quick posts ----------
describe('session chat quick posts', () => {
  it('keeps zero-vote quick posts hidden while exposing them as shared prior-question options', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();

    const sessionRes = await createSessionInCourse(profToken, course._id, { name: 'Chat Session' });
    const session = sessionRes.json().session;

    const questionOne = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 0,
      content: '<p>Question 1</p>',
      plainText: 'Question 1',
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
    });
    const questionTwo = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 0,
      content: '<p>Question 2</p>',
      plainText: 'Question 2',
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
    });

    const enableChatRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/chat-settings`, {
      token: profToken,
      payload: { chatEnabled: true },
    });
    expect(enableChatRes.statusCode).toBe(200);

    const startRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });
    expect(startRes.statusCode).toBe(200);

    const setQuestionRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/current`, {
      token: profToken,
      payload: { questionId: questionTwo._id },
    });
    expect(setQuestionRes.statusCode).toBe(200);

    const joinRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });
    expect(joinRes.statusCode).toBe(200);

    const initialChatRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/chat`, {
      token: studentToken,
    });
    expect(initialChatRes.statusCode).toBe(200);
    expect(initialChatRes.json().currentQuestionNumber).toBe(2);
    expect(initialChatRes.json().posts).toHaveLength(0);
    expect(initialChatRes.json().quickPostOptions).toEqual([
      expect.objectContaining({
        questionNumber: 1,
        upvoteCount: 0,
        viewerHasUpvoted: false,
      }),
    ]);

    const toggleQuickPostRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/chat/quick-posts/1/toggle`, {
      token: studentToken,
    });
    expect(toggleQuickPostRes.statusCode).toBe(200);
    expect(toggleQuickPostRes.json().viewerHasUpvoted).toBe(true);
    expect(toggleQuickPostRes.json().upvoteCount).toBe(1);

    const quickPosts = await Post.find({
      scopeType: 'session',
      sessionId: String(session._id),
      isQuickPost: true,
    }).lean();
    expect(quickPosts).toHaveLength(2);
    const questionOneQuickPost = quickPosts.find((post) => Number(post.quickPostQuestionNumber) === 1);
    expect(questionOneQuickPost).toBeTruthy();
    expect(Number(questionOneQuickPost.upvoteCount)).toBe(1);
    expect((questionOneQuickPost.upvoteUserIds || []).map(String)).toContain(String(student._id));
    expect(questionOneQuickPost.body).toBe("I didn't understand question 1");

    const updatedChatRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/chat`, {
      token: studentToken,
    });
    expect(updatedChatRes.statusCode).toBe(200);
    expect(updatedChatRes.json().posts).toEqual([
      expect.objectContaining({
        isQuickPost: true,
        quickPostQuestionNumber: 1,
        upvoteCount: 1,
        viewerHasUpvoted: true,
      }),
    ]);
    expect(updatedChatRes.json().quickPostOptions).toEqual([
      expect.objectContaining({
        questionNumber: 1,
        upvoteCount: 1,
        viewerHasUpvoted: true,
      }),
    ]);

    expect(String(questionOne._id)).not.toBe(String(questionTwo._id));
  });

  it('numbers quick-post options by questions only and ignores slides in the cutoff', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();

    const sessionRes = await createSessionInCourse(profToken, course._id, { name: 'Slides Chat Session' });
    const session = sessionRes.json().session;

    const slideOne = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 6,
      content: '<p>Slide 1</p>',
      plainText: 'Slide 1',
    });
    const questionOne = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 0,
      content: '<p>Question 1</p>',
      plainText: 'Question 1',
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
    });
    const questionTwo = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 0,
      content: '<p>Question 2</p>',
      plainText: 'Question 2',
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
    });
    const slideTwo = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 6,
      content: '<p>Slide 2</p>',
      plainText: 'Slide 2',
    });
    await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 6,
      content: '<p>Slide 3</p>',
      plainText: 'Slide 3',
    });
    await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 0,
      content: '<p>Question 3</p>',
      plainText: 'Question 3',
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
    });
    await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 6,
      content: '<p>Slide 4</p>',
      plainText: 'Slide 4',
    });

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/chat-settings`, {
      token: profToken,
      payload: { chatEnabled: true },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/current`, {
      token: profToken,
      payload: { questionId: slideTwo._id },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    const chatRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/chat`, {
      token: studentToken,
    });
    expect(chatRes.statusCode).toBe(200);
    expect(chatRes.json().currentQuestionNumber).toBe(3);
    expect(chatRes.json().quickPostOptions.map((post) => post.questionNumber)).toEqual([2, 1]);

    const quickPosts = await Post.find({
      scopeType: 'session',
      sessionId: String(session._id),
      isQuickPost: true,
    }).lean();
    expect(quickPosts).toHaveLength(3);
    expect(quickPosts.map((post) => Number(post.quickPostQuestionNumber)).sort((a, b) => a - b)).toEqual([1, 2, 3]);

    expect(String(slideOne._id)).not.toBe(String(questionOne._id));
    expect(String(questionOne._id)).not.toBe(String(questionTwo._id));
  });

  it('shows quick-post authors as the first upvoter to professors and anonymous students elsewhere', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();

    const sessionRes = await createSessionInCourse(profToken, course._id, { name: 'Quick Post Author Session' });
    const session = sessionRes.json().session;

    const questionOne = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 0,
      content: '<p>Question 1</p>',
      plainText: 'Question 1',
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
    });
    const questionTwo = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 0,
      content: '<p>Question 2</p>',
      plainText: 'Question 2',
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
    });

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/chat-settings`, {
      token: profToken,
      payload: { chatEnabled: true },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/current`, {
      token: profToken,
      payload: { questionId: questionTwo._id },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/chat/quick-posts/1/toggle`, {
      token: studentToken,
    });

    const profChatRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/chat`, {
      token: profToken,
    });
    expect(profChatRes.statusCode).toBe(200);
    expect(profChatRes.json().posts).toEqual([
      expect.objectContaining({
        isQuickPost: true,
        authorRole: 'student',
        authorName: expect.stringContaining(student.profile.firstname),
        upvoterUserIds: [String(student._id)],
      }),
    ]);
    expect(profChatRes.json().posts[0].upvoterNames).toEqual([
      expect.stringContaining(student.profile.firstname),
    ]);

    const presentationChatRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/chat?view=presentation`, {
      token: profToken,
    });
    expect(presentationChatRes.statusCode).toBe(200);
    expect(presentationChatRes.json().posts).toEqual([
      expect.objectContaining({
        isQuickPost: true,
        authorRole: 'student',
        authorName: null,
      }),
    ]);

    expect(String(questionOne._id)).not.toBe(String(questionTwo._id));
  });

  it('supports quick-post-only mode when rich text chat is disabled', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, studentToken } = await setupCourseWithStudent();

    const sessionRes = await createSessionInCourse(profToken, course._id, { name: 'Quick Post Only Session' });
    const session = sessionRes.json().session;

    const questionOne = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 0,
      content: '<p>Question 1</p>',
      plainText: 'Question 1',
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
    });
    const questionTwo = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 0,
      content: '<p>Question 2</p>',
      plainText: 'Question 2',
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
    });

    const settingsRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/chat-settings`, {
      token: profToken,
      payload: { chatEnabled: true, richTextChatEnabled: false },
    });
    expect(settingsRes.statusCode).toBe(200);
    expect(settingsRes.json().session).toEqual(expect.objectContaining({
      chatEnabled: true,
      richTextChatEnabled: false,
    }));

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/current`, {
      token: profToken,
      payload: { questionId: questionTwo._id },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    const studentChatRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/chat`, {
      token: studentToken,
    });
    expect(studentChatRes.statusCode).toBe(200);
    expect(studentChatRes.json()).toEqual(expect.objectContaining({
      richTextChatEnabled: false,
      canPost: true,
      canComment: true,
    }));

    const quickPostRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/chat/quick-posts/1/toggle`, {
      token: studentToken,
    });
    expect(quickPostRes.statusCode).toBe(200);

    const richPostStudentRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/chat/posts`, {
      token: studentToken,
      payload: { body: 'Student rich text post' },
    });
    expect(richPostStudentRes.statusCode).toBe(403);

    const richPostProfRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/chat/posts`, {
      token: profToken,
      payload: { body: 'Professor rich text post' },
    });
    expect(richPostProfRes.statusCode).toBe(403);

    const quickPost = await Post.findOne({
      scopeType: 'session',
      sessionId: String(session._id),
      isQuickPost: true,
      quickPostQuestionNumber: 1,
    }).lean();
    expect(quickPost?._id).toBeTruthy();

    const commentRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/chat/posts/${quickPost._id}/comments`, {
      token: studentToken,
      payload: { body: 'Disabled comment' },
    });
    expect(commentRes.statusCode).toBe(403);

    expect(String(questionOne._id)).not.toBe(String(questionTwo._id));
  });

  it('keeps mixed-role student instructor names private in presentation chat while preserving self-view names', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course } = await setupCourseWithStudent();
    const hybridStudentInstructor = await createTestUser({
      email: 'hybrid-student-instructor@example.com',
      roles: ['student'],
      firstname: 'Hybrid',
      lastname: 'Student',
    });
    const hybridToken = await getAuthToken(app, hybridStudentInstructor);
    await Course.findByIdAndUpdate(course._id, {
      $addToSet: { instructors: String(hybridStudentInstructor._id) },
    });

    const sessionRes = await createSessionInCourse(profToken, course._id, { name: 'Mixed Role Chat Session' });
    const session = sessionRes.json().session;

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/chat-settings`, {
      token: profToken,
      payload: { chatEnabled: true },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const postRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/chat/posts`, {
      token: hybridToken,
      payload: { body: 'Hybrid post' },
    });
    expect(postRes.statusCode).toBe(200);

    const commentRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/chat/posts/${postRes.json().postId}/comments`, {
      token: hybridToken,
      payload: { body: 'Hybrid comment' },
    });
    expect(commentRes.statusCode).toBe(200);

    const presentationChatRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/chat?view=presentation`, {
      token: profToken,
    });
    expect(presentationChatRes.statusCode).toBe(200);
    expect(presentationChatRes.json().posts).toEqual([
      expect.objectContaining({
        authorRole: 'instructor',
        authorName: null,
        comments: [
          expect.objectContaining({
            authorRole: 'instructor',
            authorName: null,
          }),
        ],
      }),
    ]);

    const ownChatRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/chat`, {
      token: hybridToken,
    });
    expect(ownChatRes.statusCode).toBe(200);
    expect(ownChatRes.json().posts).toEqual([
      expect.objectContaining({
        authorRole: 'instructor',
        authorName: expect.stringContaining('Hybrid'),
        comments: [
          expect.objectContaining({
            authorRole: 'instructor',
            authorName: expect.stringContaining('Hybrid'),
          }),
        ],
      }),
    ]);
  });

  it('shows dismissed posts last for professors but hides them from presentation view', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();

    const sessionRes = await createSessionInCourse(profToken, course._id, { name: 'Dismissed Chat Session' });
    const session = sessionRes.json().session;

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/chat-settings`, {
      token: profToken,
      payload: { chatEnabled: true },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    const activePost = await Post.create({
      scopeType: 'session',
      courseId: String(course._id),
      sessionId: String(session._id),
      authorId: String(student._id),
      authorRole: 'student',
      body: 'Active question',
      bodyWysiwyg: '',
      isQuickPost: false,
      quickPostQuestionNumber: null,
      upvoteUserIds: [],
      upvoteCount: 1,
      comments: [],
      dismissedAt: null,
      dismissedBy: '',
      createdAt: new Date('2026-04-02T02:00:00.000Z'),
      updatedAt: new Date('2026-04-02T02:00:00.000Z'),
    });
    const dismissedPost = await Post.create({
      scopeType: 'session',
      courseId: String(course._id),
      sessionId: String(session._id),
      authorId: String(student._id),
      authorRole: 'student',
      body: 'Dismissed question',
      bodyWysiwyg: '',
      isQuickPost: false,
      quickPostQuestionNumber: null,
      upvoteUserIds: [],
      upvoteCount: 10,
      comments: [],
      dismissedAt: new Date('2026-04-02T02:02:00.000Z'),
      dismissedBy: String(student._id),
      createdAt: new Date('2026-04-02T02:01:00.000Z'),
      updatedAt: new Date('2026-04-02T02:02:00.000Z'),
    });

    const profChatRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/chat`, {
      token: profToken,
    });
    expect(profChatRes.statusCode).toBe(200);
    expect(profChatRes.json().posts.map((post) => post.body)).toEqual([
      activePost.body,
      dismissedPost.body,
    ]);
    expect(profChatRes.json().posts[1].dismissed).toBe(true);

    const presentationChatRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/chat?view=presentation`, {
      token: profToken,
    });
    expect(presentationChatRes.statusCode).toBe(200);
    expect(presentationChatRes.json().posts.map((post) => post.body)).toEqual([
      activePost.body,
    ]);
  });

  it('broadcasts null post deltas when a student deletes their own post', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, student, studentToken } = await setupCourseWithStudent();

    const sessionRes = await createSessionInCourse(profToken, course._id, { name: 'Delete Chat Session' });
    const session = sessionRes.json().session;

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/chat-settings`, {
      token: profToken,
      payload: { chatEnabled: true },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    const post = await Post.create({
      scopeType: 'session',
      courseId: String(course._id),
      sessionId: String(session._id),
      authorId: String(student._id),
      authorRole: 'student',
      body: 'Delete me',
      bodyWysiwyg: '',
      isQuickPost: false,
      quickPostQuestionNumber: null,
      upvoteUserIds: [],
      upvoteCount: 0,
      comments: [],
      dismissedAt: null,
      dismissedBy: '',
    });

    const wsSendToUsersSpy = vi.spyOn(app, 'wsSendToUsers');
    const deleteRes = await authenticatedRequest(app, 'DELETE', `/api/v1/sessions/${session._id}/chat/posts/${post._id}`, {
      token: studentToken,
    });

    expect(deleteRes.statusCode).toBe(200);
    expect(await Post.findById(post._id)).toBeNull();

    const chatUpdatedCalls = wsSendToUsersSpy.mock.calls.filter(([, event]) => event === 'session:chat-updated');
    expect(chatUpdatedCalls).toHaveLength(2);
    expect(chatUpdatedCalls).toEqual(expect.arrayContaining([
      [
        [String(prof._id)],
        'session:chat-updated',
        expect.objectContaining({
          courseId: course._id,
          sessionId: session._id,
          changeType: 'post-deleted',
          postId: String(post._id),
          post: null,
        }),
      ],
      [
        [String(student._id)],
        'session:chat-updated',
        expect.objectContaining({
          courseId: course._id,
          sessionId: session._id,
          changeType: 'post-deleted',
          postId: String(post._id),
          post: null,
        }),
      ],
    ]));
  });

  it('broadcasts updated post deltas when a student deletes their own comment', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course, student, studentToken } = await setupCourseWithStudent();

    const sessionRes = await createSessionInCourse(profToken, course._id, { name: 'Delete Chat Comment Session' });
    const session = sessionRes.json().session;

    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/chat-settings`, {
      token: profToken,
      payload: { chatEnabled: true },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    const post = await Post.create({
      scopeType: 'session',
      courseId: String(course._id),
      sessionId: String(session._id),
      authorId: String(prof._id),
      authorRole: 'instructor',
      body: 'Comment target',
      bodyWysiwyg: '',
      isQuickPost: false,
      quickPostQuestionNumber: null,
      upvoteUserIds: [],
      upvoteCount: 0,
      comments: [
        {
          _id: 'comment-own',
          authorId: String(student._id),
          authorRole: 'student',
          body: 'Delete this comment',
          bodyWysiwyg: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: 'comment-keep',
          authorId: String(prof._id),
          authorRole: 'instructor',
          body: 'Keep this comment',
          bodyWysiwyg: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      dismissedAt: null,
      dismissedBy: '',
    });

    const wsSendToUsersSpy = vi.spyOn(app, 'wsSendToUsers');
    const deleteRes = await authenticatedRequest(
      app,
      'DELETE',
      `/api/v1/sessions/${session._id}/chat/posts/${post._id}/comments/comment-own`,
      { token: studentToken }
    );

    expect(deleteRes.statusCode).toBe(200);
    const updatedPost = await Post.findById(post._id).lean();
    expect(updatedPost.comments).toHaveLength(1);
    expect(updatedPost.comments[0]._id).toBe('comment-keep');

    const chatUpdatedCalls = wsSendToUsersSpy.mock.calls.filter(([, event]) => event === 'session:chat-updated');
    expect(chatUpdatedCalls).toHaveLength(2);
    expect(chatUpdatedCalls).toEqual(expect.arrayContaining([
      [
        [String(prof._id)],
        'session:chat-updated',
        expect.objectContaining({
          courseId: course._id,
          sessionId: session._id,
          changeType: 'comment-deleted',
          postId: String(post._id),
          post: expect.objectContaining({
            comments: [
              expect.objectContaining({
                _id: 'comment-keep',
              }),
            ],
          }),
        }),
      ],
      [
        [String(student._id)],
        'session:chat-updated',
        expect.objectContaining({
          courseId: course._id,
          sessionId: session._id,
          changeType: 'comment-deleted',
          postId: String(post._id),
        }),
      ],
    ]));
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

// ---------- Histogram routes (NU type questions) ----------
describe('POST /api/v1/sessions/:id/histogram', () => {
  it('generates histogram data for a numerical question in a live session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const question = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 4,
      content: '<p>What is x?</p>',
      plainText: 'What is x?',
      correctNumerical: 42,
      toleranceNumerical: 1,
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    // Create several numeric responses
    await Response.create([
      { questionId: question._id, studentUserId: student._id, attempt: 1, answer: '40' },
    ]);
    const student2 = await createTestUser({ email: 'hist-s2@example.com', roles: ['student'] });
    const student2Token = await getAuthToken(app, student2);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: student2Token,
      payload: { enrollmentCode: course.enrollmentCode },
    });
    await Response.create([
      { questionId: question._id, studentUserId: student2._id, attempt: 1, answer: '42' },
    ]);
    const student3 = await createTestUser({ email: 'hist-s3@example.com', roles: ['student'] });
    await Response.create([
      { questionId: question._id, studentUserId: student3._id, attempt: 1, answer: '44' },
    ]);

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/histogram`, {
      token: profToken,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.histogramData).toBeDefined();
    expect(body.histogramData.bins).toBeDefined();
    expect(Array.isArray(body.histogramData.bins)).toBe(true);
    expect(body.histogramData.bins.length).toBeGreaterThan(0);
    expect(body.histogramData.visible).toBe(true);
    expect(body.histogramData.overflowLow).toBeDefined();
    expect(body.histogramData.overflowHigh).toBeDefined();
    expect(body.histogramData.rangeMin).toBeDefined();
    expect(body.histogramData.rangeMax).toBeDefined();
    expect(body.histogramData.numBins).toBeDefined();
    expect(body.histogramData.generatedAt).toBeDefined();

    // Verify it was stored on the question
    const updatedQ = await Question.findById(question._id).lean();
    expect(updatedQ.sessionOptions.histogramData.visible).toBe(true);
    expect(updatedQ.sessionOptions.histogramData.bins.length).toBeGreaterThan(0);
  });

  it('rejects histogram generation for non-numerical question', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 2,
      content: '<p>SA question</p>',
      plainText: 'SA question',
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/histogram`, {
      token: profToken,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('accepts custom range parameters', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const question = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 4,
      content: '<p>Number?</p>',
      plainText: 'Number?',
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    await Response.create([
      { questionId: question._id, studentUserId: student._id, attempt: 1, answer: '10' },
    ]);

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/histogram`, {
      token: profToken,
      payload: { rangeMin: 0, rangeMax: 100, numBins: 10 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.histogramData.numBins).toBe(10);
    expect(body.histogramData.rangeMin).toBe(0);
    expect(body.histogramData.rangeMax).toBe(100);
  });
});

describe('PATCH /api/v1/sessions/:id/histogram-visibility', () => {
  it('toggles histogram visibility', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const question = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 4,
      content: '<p>Number?</p>',
      plainText: 'Number?',
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    await Response.create([
      { questionId: question._id, studentUserId: student._id, attempt: 1, answer: '42' },
    ]);

    // Generate the histogram first
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/histogram`, {
      token: profToken,
      payload: {},
    });

    // Hide the histogram
    const hideRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/histogram-visibility`, {
      token: profToken,
      payload: { visible: false },
    });

    expect(hideRes.statusCode).toBe(200);
    expect(hideRes.json().histogramData.visible).toBe(false);

    // Show the histogram
    const showRes = await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/histogram-visibility`, {
      token: profToken,
      payload: { visible: true },
    });

    expect(showRes.statusCode).toBe(200);
    expect(showRes.json().histogramData.visible).toBe(true);
  });
});

describe('Histogram in /sessions/:id/live', () => {
  it('instructor sees histogramData in live endpoint after generation', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const question = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 4,
      content: '<p>Value?</p>',
      plainText: 'Value?',
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    await Response.create([
      { questionId: question._id, studentUserId: student._id, attempt: 1, answer: '50' },
    ]);

    // Generate histogram
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/histogram`, {
      token: profToken,
      payload: {},
    });

    // Check instructor live endpoint
    const liveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: profToken,
    });

    expect(liveRes.statusCode).toBe(200);
    const body = liveRes.json();
    expect(body.histogramData).toBeDefined();
    expect(body.histogramData.visible).toBe(true);
    expect(body.histogramData.bins.length).toBeGreaterThan(0);
  });

  it('student sees histogramData only when stats are enabled and histogram is visible', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const question = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 4,
      content: '<p>Value?</p>',
      plainText: 'Value?',
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    await Response.create([
      { questionId: question._id, studentUserId: student._id, attempt: 1, answer: '50' },
    ]);

    // Generate histogram
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/histogram`, {
      token: profToken,
      payload: {},
    });

    // Stats disabled — student should NOT see histogramData
    const liveRes1 = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: studentToken,
    });
    expect(liveRes1.statusCode).toBe(200);
    expect(liveRes1.json().histogramData).toBeUndefined();

    // Enable stats
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/question-visibility`, {
      token: profToken,
      payload: { hidden: false, stats: true },
    });

    // Stats enabled + histogram visible → student sees it
    const liveRes2 = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: studentToken,
    });
    expect(liveRes2.statusCode).toBe(200);
    expect(liveRes2.json().histogramData).toBeDefined();
    expect(liveRes2.json().histogramData.bins.length).toBeGreaterThan(0);

    // Hide histogram
    await authenticatedRequest(app, 'PATCH', `/api/v1/sessions/${session._id}/histogram-visibility`, {
      token: profToken,
      payload: { visible: false },
    });

    // Stats enabled but histogram hidden → student should NOT see it
    const liveRes3 = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: studentToken,
    });
    expect(liveRes3.statusCode).toBe(200);
    expect(liveRes3.json().histogramData).toBeUndefined();
  });

  it('numerical responseStats include stdev and answers list', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const question = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 4,
      content: '<p>Value?</p>',
      plainText: 'Value?',
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

    await Response.create([
      { questionId: question._id, studentUserId: student._id, attempt: 1, answer: '10' },
    ]);

    const liveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: profToken,
    });

    expect(liveRes.statusCode).toBe(200);
    const body = liveRes.json();
    expect(body.responseStats?.type).toBe('numerical');
    expect(body.responseStats.stdev).toBeDefined();
    expect(Array.isArray(body.responseStats.answers)).toBe(true);
    expect(body.responseStats.answers.length).toBe(1);
    // Student identifiers should not be exposed
    expect(body.responseStats.answers[0]).not.toHaveProperty('studentUserId');
  });

  it.each([
    {
      label: 'multiple choice',
      type: 0,
      questionPayload: {
        content: '<p>Choose one.</p>',
        plainText: 'Choose one.',
        options: [
          { content: 'A', correct: true },
          { content: 'B', correct: false },
        ],
      },
      firstAnswer: 0,
      secondAnswer: 1,
      thirdAnswer: 1,
      assertStats: (stats) => {
        expect(stats.type).toBe('distribution');
        expect(stats.total).toBe(3);
        expect(stats.distribution.map((entry) => entry.count)).toEqual([1, 2]);
      },
    },
    {
      label: 'true/false',
      type: 1,
      questionPayload: {
        content: '<p>True or false?</p>',
        plainText: 'True or false?',
        options: [
          { content: 'True', correct: true },
          { content: 'False', correct: false },
        ],
      },
      firstAnswer: 0,
      secondAnswer: 1,
      thirdAnswer: 1,
      assertStats: (stats) => {
        expect(stats.type).toBe('distribution');
        expect(stats.total).toBe(3);
        expect(stats.distribution.map((entry) => entry.count)).toEqual([1, 2]);
      },
    },
    {
      label: 'multi-select',
      type: 3,
      questionPayload: {
        content: '<p>Select all that apply.</p>',
        plainText: 'Select all that apply.',
        options: [
          { content: 'A', correct: true },
          { content: 'B', correct: false },
          { content: 'C', correct: true },
        ],
      },
      firstAnswer: [0, 1],
      secondAnswer: [1, 2],
      thirdAnswer: [0, 2],
      assertStats: (stats) => {
        expect(stats.type).toBe('distribution');
        expect(stats.total).toBe(3);
        expect(stats.distribution.map((entry) => entry.count)).toEqual([2, 2, 2]);
      },
    },
    {
      label: 'short answer',
      type: 2,
      questionPayload: {
        content: '<p>Explain.</p>',
        plainText: 'Explain.',
      },
      firstAnswer: 'First response',
      secondAnswer: 'Legacy cached response',
      thirdAnswer: 'Newest response',
      assertStats: (stats) => {
        expect(stats.type).toBe('shortAnswer');
        expect(stats.total).toBe(3);
        expect(stats.answers.map((entry) => entry.answer)).toEqual([
          'Newest response',
          'Legacy cached response',
          'First response',
        ]);
      },
    },
    {
      label: 'numerical',
      type: 4,
      questionPayload: {
        content: '<p>Value?</p>',
        plainText: 'Value?',
      },
      firstAnswer: '10',
      secondAnswer: '20',
      thirdAnswer: '30',
      assertStats: (stats) => {
        expect(stats.type).toBe('numerical');
        expect(stats.total).toBe(3);
        expect([...(stats.values || [])].sort((a, b) => a - b)).toEqual([10, 20, 30]);
        if (stats.sum !== undefined) expect(stats.sum).toBe(60);
        expect(stats.min).toBe(10);
        expect(stats.max).toBe(30);
      },
    },
  ])('rebuilds stale live stats from canonical responses for $label questions', async ({
    type,
    questionPayload,
    firstAnswer,
    secondAnswer,
    thirdAnswer,
    assertStats,
  }) => {
    const { profToken, course, studentToken } = await setupCourseWithStudent();
    const studentTwo = await createTestUser({
      email: `live-stats-${type}-two@example.com`,
      roles: ['student'],
    });
    const studentTwoToken = await getAuthToken(app, studentTwo);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentTwoToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const studentThree = await createTestUser({
      email: `live-stats-${type}-three@example.com`,
      roles: ['student'],
    });
    const studentThreeToken = await getAuthToken(app, studentThree);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentThreeToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const qRes = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
      token: profToken,
      payload: {
        type,
        sessionId: session._id,
        courseId: course._id,
        ...questionPayload,
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

    const liveSession = await Session.findById(session._id).lean();
    const liveQuestionId = liveSession.currentQuestion || question._id;

    const joinedTokens = [studentToken, studentTwoToken, studentThreeToken];
    for (const token of joinedTokens) {
      // eslint-disable-next-line no-await-in-loop
      await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
        token,
        payload: {},
      });
    }

    const firstRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/respond`, {
      token: studentToken,
      payload: { answer: firstAnswer },
    });
    expect(firstRes.statusCode).toBe(201);

    const secondRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/respond`, {
      token: studentTwoToken,
      payload: { answer: secondAnswer },
    });
    expect(secondRes.statusCode).toBe(201);

    const numericFirstAnswer = Number(firstAnswer);
    const firstAttemptStats = (() => {
      if ([0, 1, 3].includes(type)) {
        return {
          number: 1,
          type: 'distribution',
          total: 1,
          distribution: (questionPayload.options || []).map((option, index) => {
            const selected = Array.isArray(firstAnswer)
              ? firstAnswer.includes(index)
              : Number(firstAnswer) === index;
            return {
              index,
              answer: option.content || option.plainText || option.answer || '',
              correct: !!option.correct,
              count: selected ? 1 : 0,
            };
          }),
        };
      }

      if (type === 2) {
        return {
          number: 1,
          type: 'shortAnswer',
          total: 1,
          answers: [
            {
              studentUserId: studentToken,
              answer: firstAnswer,
              answerWysiwyg: '',
            },
          ],
        };
      }

      return {
        number: 1,
        type: 'numerical',
        total: 1,
        answers: [
          {
            studentUserId: studentToken,
            answer: firstAnswer,
          },
        ],
        values: Number.isFinite(numericFirstAnswer) ? [numericFirstAnswer] : [],
        sum: Number.isFinite(numericFirstAnswer) ? numericFirstAnswer : 0,
        sumSquares: Number.isFinite(numericFirstAnswer) ? numericFirstAnswer * numericFirstAnswer : 0,
        min: Number.isFinite(numericFirstAnswer) ? numericFirstAnswer : null,
        max: Number.isFinite(numericFirstAnswer) ? numericFirstAnswer : null,
      };
    })();

    await Question.findByIdAndUpdate(liveQuestionId, {
      $set: {
        'sessionOptions.attemptStats': [firstAttemptStats],
        'sessionProperties.lastAttemptNumber': 1,
        'sessionProperties.lastAttemptResponseCount': 1,
      },
    });

    const thirdRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/respond`, {
      token: studentThreeToken,
      payload: { answer: thirdAnswer },
    });
    expect(thirdRes.statusCode).toBe(201);

    const responseCount = await Response.countDocuments({
      questionId: liveQuestionId,
      attempt: 1,
    });
    expect(responseCount).toBe(3);

    const liveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: profToken,
    });
    expect(liveRes.statusCode).toBe(200);
    const body = liveRes.json();
    assertStats(body.responseStats);

    const persistedQuestion = await Question.findById(liveQuestionId).lean();
    const persistedStats = persistedQuestion.sessionOptions.attemptStats[0];
    assertStats({
      ...persistedStats,
      values: persistedStats.values || [],
      distribution: persistedStats.distribution || [],
      answers: persistedStats.answers || [],
    });
  });

  it('histogramData is stripped from student question payload', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, student, studentToken } = await setupCourseWithStudent();
    const sessRes = await createSessionInCourse(profToken, course._id);
    const session = sessRes.json().session;

    const question = await createQuestionInSession(profToken, {
      sessionId: session._id,
      courseId: course._id,
      type: 4,
      content: '<p>Value?</p>',
      plainText: 'Value?',
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/start`, {
      token: profToken,
    });

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/join`, {
      token: studentToken,
      payload: {},
    });

    await Response.create([
      { questionId: question._id, studentUserId: student._id, attempt: 1, answer: '50' },
    ]);

    // Generate histogram
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/histogram`, {
      token: profToken,
      payload: {},
    });

    // Student live — histogramData should NOT be embedded in currentQuestion.sessionOptions
    const liveRes = await authenticatedRequest(app, 'GET', `/api/v1/sessions/${session._id}/live`, {
      token: studentToken,
    });
    expect(liveRes.statusCode).toBe(200);
    const body = liveRes.json();
    expect(body.currentQuestion?.sessionOptions?.histogramData).toBeUndefined();
  });
});
