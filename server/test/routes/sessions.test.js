import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { createApp, createTestUser, getAuthToken, authenticatedRequest } from '../helpers.js';
import Course from '../../src/models/Course.js';
import Question from '../../src/models/Question.js';
import Response from '../../src/models/Response.js';

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
