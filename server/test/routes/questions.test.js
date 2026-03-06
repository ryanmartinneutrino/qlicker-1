import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { createApp, createTestUser, getAuthToken, authenticatedRequest } from '../helpers.js';
import Course from '../../src/models/Course.js';
import Session from '../../src/models/Session.js';
import Question from '../../src/models/Question.js';

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
  const payload = { name: 'Test Session', ...overrides };
  const res = await authenticatedRequest(app, 'POST', `/api/v1/courses/${courseId}/sessions`, {
    token,
    payload,
  });
  return res;
}

// Helper to create a question via the API
async function createQuestionAsProf(profToken, overrides = {}) {
  const payload = { type: 2, content: 'Test question?', ...overrides };
  const res = await authenticatedRequest(app, 'POST', '/api/v1/questions', {
    token: profToken,
    payload,
  });
  return res;
}

// Helper: prof + course + session
async function setupCourseAndSession() {
  const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
  const profToken = await getAuthToken(app, prof);
  const courseRes = await createCourseAsProf(profToken);
  const course = courseRes.json().course;
  const sessRes = await createSessionInCourse(profToken, course._id);
  const session = sessRes.json().session;
  return { prof, profToken, course, session };
}

// ---------- POST /api/v1/questions ----------
describe('POST /api/v1/questions', () => {
  it('professor can create a question', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);

    const res = await createQuestionAsProf(profToken, {
      type: 0,
      content: 'What is 2+2?',
      options: [
        { answer: '3', correct: false },
        { answer: '4', correct: true },
      ],
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.question).toBeDefined();
    expect(body.question.content).toBe('What is 2+2?');
    expect(body.question.type).toBe(0);
    expect(body.question.creator).toBe(prof._id.toString());
    expect(body.question.options.length).toBe(2);
  });

  it('rejects multiple-choice questions with more than one correct option', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);

    const res = await createQuestionAsProf(profToken, {
      type: 0,
      content: 'Pick one answer',
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: true },
      ],
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Multiple Choice questions can only have one correct option');
  });

  it('student cannot create a question (403)', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const student = await createTestUser({ email: 'student@example.com', roles: ['student'] });
    const studentToken = await getAuthToken(app, student);

    const res = await createQuestionAsProf(studentToken);

    expect(res.statusCode).toBe(403);
  });

  it('creates question with sessionId and courseId', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, session } = await setupCourseAndSession();

    const res = await createQuestionAsProf(profToken, {
      sessionId: session._id,
      courseId: course._id,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.question.sessionId).toBe(session._id);
    expect(body.question.courseId).toBe(course._id);
  });
});

// ---------- GET /api/v1/questions/:id ----------
describe('GET /api/v1/questions/:id', () => {
  it('authenticated user can get a question', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const qRes = await createQuestionAsProf(profToken, { content: 'My Q' });
    const question = qRes.json().question;

    const res = await authenticatedRequest(app, 'GET', `/api/v1/questions/${question._id}`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.question).toBeDefined();
    expect(body.question.content).toBe('My Q');
  });

  it('returns 404 for non-existent question', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/questions/nonexistent12345', {
      token: profToken,
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------- PATCH /api/v1/questions/:id ----------
describe('PATCH /api/v1/questions/:id', () => {
  it('creator can update a question', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const qRes = await createQuestionAsProf(profToken);
    const question = qRes.json().question;

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/questions/${question._id}`, {
      token: profToken,
      payload: { content: 'Updated content', solution: 'The answer is 42' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.question.content).toBe('Updated content');
    expect(body.question.solution).toBe('The answer is 42');
  });

  it('non-creator/non-admin gets 403', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const qRes = await createQuestionAsProf(profToken);
    const question = qRes.json().question;

    const other = await createTestUser({ email: 'other@example.com', roles: ['professor'] });
    const otherToken = await getAuthToken(app, other);

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/questions/${question._id}`, {
      token: otherToken,
      payload: { content: 'Hacked' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('admin can update any question', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const qRes = await createQuestionAsProf(profToken);
    const question = qRes.json().question;

    const admin = await createTestUser({ email: 'admin@example.com', roles: ['admin'] });
    const adminToken = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/questions/${question._id}`, {
      token: adminToken,
      payload: { content: 'Admin edit' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().question.content).toBe('Admin edit');
  });

  it('rejects switching multi-select to multiple-choice when multiple correct options exist', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const qRes = await createQuestionAsProf(profToken, {
      type: 3,
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: true },
      ],
    });
    const question = qRes.json().question;

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/questions/${question._id}`, {
      token: profToken,
      payload: { type: 0 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Multiple Choice questions can only have one correct option');
  });
});

// ---------- DELETE /api/v1/questions/:id ----------
describe('DELETE /api/v1/questions/:id', () => {
  it('creator can delete a question', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const qRes = await createQuestionAsProf(profToken);
    const question = qRes.json().question;

    const res = await authenticatedRequest(app, 'DELETE', `/api/v1/questions/${question._id}`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify deleted
    const deleted = await Question.findById(question._id);
    expect(deleted).toBeNull();
  });

  it('non-creator gets 403', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const qRes = await createQuestionAsProf(profToken);
    const question = qRes.json().question;

    const other = await createTestUser({ email: 'other@example.com', roles: ['professor'] });
    const otherToken = await getAuthToken(app, other);

    const res = await authenticatedRequest(app, 'DELETE', `/api/v1/questions/${question._id}`, {
      token: otherToken,
    });

    expect(res.statusCode).toBe(403);
  });

  it('deleting question removes it from session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, session } = await setupCourseAndSession();

    const qRes = await createQuestionAsProf(profToken, {
      sessionId: session._id,
      courseId: course._id,
    });
    const question = qRes.json().question;

    // Add question to session
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });

    // Delete the question
    await authenticatedRequest(app, 'DELETE', `/api/v1/questions/${question._id}`, {
      token: profToken,
    });

    // Verify removed from session
    const updatedSession = await Session.findById(session._id);
    expect(updatedSession.questions).not.toContain(question._id);
  });
});

// ---------- POST /api/v1/questions/:id/copy ----------
describe('POST /api/v1/questions/:id/copy', () => {
  it('user can copy a question to personal library', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const qRes = await createQuestionAsProf(profToken, { content: 'Original Q' });
    const question = qRes.json().question;

    const other = await createTestUser({ email: 'other@example.com', roles: ['professor'] });
    const otherToken = await getAuthToken(app, other);

    const res = await authenticatedRequest(app, 'POST', `/api/v1/questions/${question._id}/copy`, {
      token: otherToken,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.question.content).toBe('Original Q');
    expect(body.question._id).not.toBe(question._id);
    expect(body.question.creator).toBe(other._id.toString());
    expect(body.question.owner).toBe(other._id.toString());
    expect(body.question.sessionId).toBe('');
    expect(body.question.courseId).toBe('');
  });
});

// ---------- POST /api/v1/sessions/:sessionId/questions ----------
describe('POST /api/v1/sessions/:sessionId/questions', () => {
  it('instructor can add question to session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, session } = await setupCourseAndSession();

    const qRes = await createQuestionAsProf(profToken);
    const question = qRes.json().question;

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.questions).toContain(question._id);
  });

  it('adding same question twice is idempotent', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, session } = await setupCourseAndSession();

    const qRes = await createQuestionAsProf(profToken);
    const question = qRes.json().question;

    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const count = body.session.questions.filter((q) => q === question._id).length;
    expect(count).toBe(1);
  });

  it('non-instructor gets 403', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, session } = await setupCourseAndSession();

    const student = await createTestUser({ email: 'student@example.com', roles: ['student'] });
    const studentToken = await getAuthToken(app, student);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const qRes = await createQuestionAsProf(profToken);
    const question = qRes.json().question;

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: studentToken,
      payload: { questionId: question._id },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------- DELETE /api/v1/sessions/:sessionId/questions/:questionId ----------
describe('DELETE /api/v1/sessions/:sessionId/questions/:questionId', () => {
  it('instructor can remove question from session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, session } = await setupCourseAndSession();

    const qRes = await createQuestionAsProf(profToken);
    const question = qRes.json().question;

    // Add question to session
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });

    // Remove it
    const res = await authenticatedRequest(
      app,
      'DELETE',
      `/api/v1/sessions/${session._id}/questions/${question._id}`,
      { token: profToken }
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.questions).not.toContain(question._id);
  });

  it('non-instructor gets 403', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, session } = await setupCourseAndSession();

    const student = await createTestUser({ email: 'student@example.com', roles: ['student'] });
    const studentToken = await getAuthToken(app, student);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const qRes = await createQuestionAsProf(profToken);
    const question = qRes.json().question;

    const res = await authenticatedRequest(
      app,
      'DELETE',
      `/api/v1/sessions/${session._id}/questions/${question._id}`,
      { token: studentToken }
    );

    expect(res.statusCode).toBe(403);
  });
});

// ---------- PATCH /api/v1/sessions/:sessionId/questions/order ----------
describe('PATCH /api/v1/sessions/:sessionId/questions/order', () => {
  it('instructor can reorder questions', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, session } = await setupCourseAndSession();

    const q1Res = await createQuestionAsProf(profToken, { content: 'Q1' });
    const q2Res = await createQuestionAsProf(profToken, { content: 'Q2' });
    const q1 = q1Res.json().question;
    const q2 = q2Res.json().question;

    // Add both questions
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: q1._id },
    });
    await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: q2._id },
    });

    // Reorder: q2 first, then q1
    const res = await authenticatedRequest(
      app,
      'PATCH',
      `/api/v1/sessions/${session._id}/questions/order`,
      {
        token: profToken,
        payload: { questions: [q2._id, q1._id] },
      }
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.questions[0]).toBe(q2._id);
    expect(body.session.questions[1]).toBe(q1._id);
  });

  it('non-instructor gets 403', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, session } = await setupCourseAndSession();

    const student = await createTestUser({ email: 'student@example.com', roles: ['student'] });
    const studentToken = await getAuthToken(app, student);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const res = await authenticatedRequest(
      app,
      'PATCH',
      `/api/v1/sessions/${session._id}/questions/order`,
      {
        token: studentToken,
        payload: { questions: [] },
      }
    );

    expect(res.statusCode).toBe(403);
  });
});
