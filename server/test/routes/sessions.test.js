import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { createApp, createTestUser, getAuthToken, authenticatedRequest } from '../helpers.js';
import Course from '../../src/models/Course.js';
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
      payload: { type: 1, content: 'Q1', sessionId: session._id, courseId: course._id },
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
    });
    const session = sessRes.json().session;

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/copy`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.session.name).toBe('Original (copy)');
    expect(body.session.description).toBe('Desc');
    expect(body.session.status).toBe('hidden');
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
});
