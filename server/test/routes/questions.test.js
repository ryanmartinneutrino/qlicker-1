import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { createApp, createTestUser, getAuthToken, authenticatedRequest } from '../helpers.js';
import Course from '../../src/models/Course.js';
import Session from '../../src/models/Session.js';
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

  it('accepts slide questions with session options during creation', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, session } = await setupCourseAndSession();

    const res = await createQuestionAsProf(profToken, {
      type: 6,
      content: '<p>Slide content</p>',
      plainText: 'Slide content',
      sessionId: session._id,
      courseId: course._id,
      sessionOptions: {
        points: 0,
        hidden: false,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.question.type).toBe(6);
    expect(body.question.sessionOptions.points).toBe(0);
    expect(body.question.sessionOptions.hidden).toBe(false);
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

  it('course instructors can update a session question when legacy question.courseId is missing', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { course, session } = await setupCourseAndSession();

    const legacyCreator = await createTestUser({ email: 'legacy-owner@example.com', roles: ['professor'] });
    const legacyCreatorToken = await getAuthToken(app, legacyCreator);
    const prof = await createTestUser({ email: 'course-prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);

    await Course.findByIdAndUpdate(course._id, {
      $addToSet: { instructors: prof._id.toString() },
    });

    const qRes = await createQuestionAsProf(legacyCreatorToken, {
      type: 6,
      content: '<p>Legacy slide</p>',
      plainText: 'Legacy slide',
      sessionId: session._id,
      courseId: '',
      sessionOptions: { points: 0 },
    });
    const question = qRes.json().question;

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/questions/${question._id}`, {
      token: profToken,
      payload: {
        type: 6,
        content: '<p>Updated slide</p>',
        plainText: 'Updated slide',
        sessionOptions: { points: 0 },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().question.content).toBe('<p>Updated slide</p>');
  });

  it('course instructors can update a slide linked to their session even when question session metadata is blank', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { course, session } = await setupCourseAndSession();

    const legacyCreator = await createTestUser({ email: 'session-linked-owner@example.com', roles: ['professor'] });
    const legacyCreatorToken = await getAuthToken(app, legacyCreator);
    const prof = await createTestUser({ email: 'linked-course-prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);

    await Course.findByIdAndUpdate(course._id, {
      $addToSet: { instructors: prof._id.toString() },
    });

    const qRes = await createQuestionAsProf(legacyCreatorToken, {
      type: 6,
      content: '<p>Linked slide</p>',
      plainText: 'Linked slide',
      sessionId: '',
      courseId: '',
      sessionOptions: { points: 0 },
    });
    const question = qRes.json().question;

    const addRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    expect(addRes.statusCode).toBe(200);

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/questions/${question._id}`, {
      token: profToken,
      payload: {
        type: 6,
        content: '<p>Updated linked slide</p>',
        plainText: 'Updated linked slide',
        sessionOptions: { points: 0 },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().question.content).toBe('<p>Updated linked slide</p>');
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

  it('rejects changing the number of options when the question already has responses', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, session } = await setupCourseAndSession();
    const qRes = await createQuestionAsProf(profToken, {
      type: 0,
      content: 'Choose one',
      sessionId: session._id,
      courseId: course._id,
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
    });
    const question = qRes.json().question;

    await Response.create({
      attempt: 1,
      questionId: question._id,
      studentUserId: 'student-1',
      answer: '0',
    });

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/questions/${question._id}`, {
      token: profToken,
      payload: {
        type: 0,
        content: 'Choose one',
        options: [
          { answer: 'A', correct: true },
          { answer: 'B', correct: false },
          { answer: 'C', correct: false },
        ],
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toBe('Question options cannot be added or removed because this question has response data');
  });

  it('broadcasts a granular question update when a linked session question changes', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, session } = await setupCourseAndSession();
    const wsSendToUsersSpy = vi.spyOn(app, 'wsSendToUsers');

    const qRes = await createQuestionAsProf(profToken, {
      type: 6,
      content: '<p>Slide</p>',
      plainText: 'Slide',
      sessionId: '',
      courseId: '',
      sessionOptions: { points: 0 },
    });
    const question = qRes.json().question;

    const addRes = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: question._id },
    });
    expect(addRes.statusCode).toBe(200);

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/questions/${question._id}`, {
      token: profToken,
      payload: {
        type: 6,
        content: '<p>Updated slide</p>',
        plainText: 'Updated slide',
        sessionOptions: { points: 0 },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(wsSendToUsersSpy).toHaveBeenLastCalledWith(
      expect.arrayContaining([String(course.instructors[0])]),
      'session:question-updated',
      expect.objectContaining({
        courseId: course._id,
        sessionId: session._id,
        questionId: question._id,
      })
    );
  });

  it('sanitizes current-question updates for students in a live session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, session } = await setupCourseAndSession();
    const student = await createTestUser({ email: 'student@example.com', roles: ['student'] });
    const studentToken = await getAuthToken(app, student);
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const wsSendToUsersSpy = vi.spyOn(app, 'wsSendToUsers');
    const qRes = await createQuestionAsProf(profToken, {
      type: 0,
      content: '<p>Current question</p>',
      plainText: 'Current question',
      options: [
        { answer: 'A', correct: false },
        { answer: 'B', correct: true },
      ],
      sessionOptions: {
        hidden: false,
        correct: false,
        stats: true,
        points: 1,
      },
    });
    const question = qRes.json().question;

    await Session.findByIdAndUpdate(session._id, {
      $set: {
        currentQuestion: question._id,
        status: 'running',
      },
      $addToSet: {
        questions: question._id,
      },
    });

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/questions/${question._id}`, {
      token: profToken,
      payload: {
        type: 0,
        content: '<p>Updated current question</p>',
        plainText: 'Updated current question',
        options: [
          { answer: 'A', correct: true },
          { answer: 'B', correct: false },
        ],
        sessionOptions: {
          hidden: false,
          correct: false,
          stats: true,
          points: 1,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(wsSendToUsersSpy).toHaveBeenCalledWith(
      [String(course.instructors[0])],
      'session:question-updated',
      expect.objectContaining({
        courseId: course._id,
        sessionId: session._id,
        questionId: question._id,
        question: expect.objectContaining({
          content: '<p>Updated current question</p>',
          options: expect.arrayContaining([
            expect.objectContaining({ answer: 'A', correct: true }),
            expect.objectContaining({ answer: 'B', correct: false }),
          ]),
        }),
      })
    );
    expect(wsSendToUsersSpy).toHaveBeenCalledWith(
      [String(student._id)],
      'session:question-updated',
      expect.objectContaining({
        courseId: course._id,
        sessionId: session._id,
        questionId: question._id,
        questionHidden: false,
        showStats: true,
        showCorrect: false,
        question: expect.objectContaining({
          content: '<p>Updated current question</p>',
          options: expect.arrayContaining([
            expect.objectContaining({ answer: 'A', correct: undefined }),
            expect.objectContaining({ answer: 'B', correct: undefined }),
          ]),
        }),
      })
    );
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
    expect(body.question.creator).toBe(prof._id.toString());
    expect(body.question.owner).toBe(other._id.toString());
    expect(body.question.sessionId).toBe('');
    expect(body.question.courseId).toBe(question.courseId);
    expect(body.question.originalQuestion).toBe(question._id);
    expect(body.question.originalCourse).toBe(question.courseId);
  });
});

// ---------- GET /api/v1/courses/:courseId/questions ----------
describe('GET /api/v1/courses/:courseId/questions', () => {
  it('lists filtered course questions with linked-session and response metadata', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, session } = await setupCourseAndSession();

    const olderRes = await createQuestionAsProf(profToken, {
      type: 2,
      content: 'Older algebra prompt',
      plainText: 'Older algebra prompt',
      courseId: course._id,
      tags: [{ value: 'algebra', label: 'algebra' }],
    });
    const newerRes = await createQuestionAsProf(profToken, {
      type: 0,
      content: 'Session algebra prompt',
      plainText: 'Session algebra prompt',
      courseId: course._id,
      sessionId: session._id,
      tags: [{ value: 'algebra', label: 'algebra' }],
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
    });
    const hiddenRes = await createQuestionAsProf(profToken, {
      type: 2,
      content: 'Hidden calculus prompt',
      plainText: 'Hidden calculus prompt',
      courseId: course._id,
      tags: [{ value: 'calculus', label: 'calculus' }],
    });

    const olderQuestion = olderRes.json().question;
    const newerQuestion = newerRes.json().question;
    const hiddenQuestion = hiddenRes.json().question;

    await Session.findByIdAndUpdate(session._id, {
      $set: { questions: [newerQuestion._id] },
    });
    await Question.findByIdAndUpdate(olderQuestion._id, {
      $set: { createdAt: new Date('2024-01-01T00:00:00.000Z') },
    });
    await Question.findByIdAndUpdate(newerQuestion._id, {
      $set: { createdAt: new Date('2025-01-01T00:00:00.000Z') },
    });
    await Question.findByIdAndUpdate(hiddenQuestion._id, {
      $set: { approved: false },
    });
    await Response.create({
      attempt: 1,
      questionId: newerQuestion._id,
      studentUserId: 'student-1',
      answer: '0',
    });

    const res = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/questions?tags=algebra&approved=true`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.questions.map((question) => question._id)).toEqual([newerQuestion._id, olderQuestion._id]);
    expect(body.questions[0].hasResponses).toBe(true);
    expect(body.questions[0].linkedSessions).toEqual([
      expect.objectContaining({ _id: session._id, name: session.name }),
    ]);
    expect(body.questionTypes).toEqual(expect.arrayContaining([0, 2]));
  });

  it('returns autocomplete tag suggestions for a course library', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course } = await setupCourseAndSession();

    await createQuestionAsProf(profToken, {
      courseId: course._id,
      tags: [
        { value: 'algebra', label: 'Algebra' },
        { value: 'imported', label: 'imported' },
      ],
    });
    await createQuestionAsProf(profToken, {
      courseId: course._id,
      tags: [{ value: 'algorithms', label: 'Algorithms' }],
    });

    const res = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}/question-tags?q=alg`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().tags).toEqual([
      { value: 'algebra', label: 'Algebra' },
      { value: 'algorithms', label: 'Algorithms' },
    ]);
  });
});

// ---------- POST /api/v1/questions/:id/approve ----------
describe('POST /api/v1/questions/:id/approve', () => {
  it('approves an unapproved course question', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course } = await setupCourseAndSession();

    const qRes = await createQuestionAsProf(profToken, {
      courseId: course._id,
      content: 'Needs approval',
    });
    const question = qRes.json().question;
    await Question.findByIdAndUpdate(question._id, { $set: { approved: false } });

    const res = await authenticatedRequest(app, 'POST', `/api/v1/questions/${question._id}/approve`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().question.approved).toBe(true);
  });
});

// ---------- POST /api/v1/questions/bulk-copy ----------
describe('POST /api/v1/questions/bulk-copy', () => {
  it('copies selected questions into another course session while preserving lineage metadata', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'bulkcopy@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);

    const sourceCourse = (await createCourseAsProf(profToken, { name: 'Source Course' })).json().course;
    const sourceSession = (await createSessionInCourse(profToken, sourceCourse._id, { name: 'Source Session' })).json().session;
    const targetCourse = (await createCourseAsProf(profToken, { name: 'Target Course' })).json().course;
    const targetSession = (await createSessionInCourse(profToken, targetCourse._id, { name: 'Target Session' })).json().session;

    const questionRes = await createQuestionAsProf(profToken, {
      type: 0,
      courseId: sourceCourse._id,
      sessionId: sourceSession._id,
      content: 'Copy me',
      plainText: 'Copy me',
      options: [
        { answer: 'Yes', correct: true },
        { answer: 'No', correct: false },
      ],
    });
    const question = questionRes.json().question;

    const res = await authenticatedRequest(app, 'POST', '/api/v1/questions/bulk-copy', {
      token: profToken,
      payload: {
        questionIds: [question._id],
        targetCourseId: targetCourse._id,
        targetSessionId: targetSession._id,
      },
    });

    expect(res.statusCode).toBe(201);
    const copiedQuestion = res.json().questions[0];
    expect(copiedQuestion._id).not.toBe(question._id);
    expect(copiedQuestion.creator).toBe(prof._id.toString());
    expect(copiedQuestion.owner).toBe(prof._id.toString());
    expect(copiedQuestion.originalQuestion).toBe(question._id);
    expect(copiedQuestion.originalCourse).toBe(sourceCourse._id);
    expect(copiedQuestion.courseId).toBe(targetCourse._id);
    expect(copiedQuestion.sessionId).toBe(targetSession._id);

    const updatedTargetSession = await Session.findById(targetSession._id).lean();
    expect(updatedTargetSession.questions).toContain(copiedQuestion._id);
  });
});

// ---------- POST /api/v1/questions/export + POST /api/v1/courses/:courseId/questions/import ----------
describe('question import/export endpoints', () => {
  it('exports selected questions and re-imports them into another course session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { prof, profToken, course } = await setupCourseAndSession();
    const targetCourse = (await createCourseAsProf(profToken, { name: 'Imported Course' })).json().course;
    const targetSession = (await createSessionInCourse(profToken, targetCourse._id, { name: 'Imported Session' })).json().session;

    const qRes = await createQuestionAsProf(profToken, {
      type: 2,
      courseId: course._id,
      content: 'Exportable question',
      plainText: 'Exportable question',
      tags: [{ value: 'review', label: 'Review' }],
      solution: '<p>Worked solution</p>',
      solution_plainText: 'Worked solution',
    });
    const question = qRes.json().question;

    const exportRes = await authenticatedRequest(app, 'POST', '/api/v1/questions/export', {
      token: profToken,
      payload: { questionIds: [question._id] },
    });

    expect(exportRes.statusCode).toBe(200);
    const [exportedQuestion] = exportRes.json().questions;
    expect(exportedQuestion._id).toBeUndefined();

    const importRes = await authenticatedRequest(app, 'POST', `/api/v1/courses/${targetCourse._id}/questions/import`, {
      token: profToken,
      payload: {
        questions: [exportedQuestion],
        sessionId: targetSession._id,
      },
    });

    expect(importRes.statusCode).toBe(201);
    const importedQuestion = importRes.json().questions[0];
    expect(importedQuestion.courseId).toBe(targetCourse._id);
    expect(importedQuestion.sessionId).toBe(targetSession._id);
    expect(importedQuestion.owner).toBe(prof._id.toString());
    expect(importedQuestion.approved).toBe(true);
    expect(importedQuestion.tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'review', label: 'Review' }),
      expect.objectContaining({ value: 'imported', label: 'imported' }),
    ]));

    const importedSession = await Session.findById(targetSession._id).lean();
    expect(importedSession.questions).toContain(importedQuestion._id);
  });
});

// ---------- POST /api/v1/questions/bulk-delete ----------
describe('POST /api/v1/questions/bulk-delete', () => {
  it('blocks deleting any selected question that has responses', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course } = await setupCourseAndSession();

    const removable = (await createQuestionAsProf(profToken, {
      courseId: course._id,
      content: 'Removable',
    })).json().question;
    const responseBacked = (await createQuestionAsProf(profToken, {
      type: 0,
      courseId: course._id,
      content: 'Locked',
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
    })).json().question;

    await Response.create({
      attempt: 1,
      questionId: responseBacked._id,
      studentUserId: 'student-1',
      answer: '0',
    });

    const res = await authenticatedRequest(app, 'POST', '/api/v1/questions/bulk-delete', {
      token: profToken,
      payload: { questionIds: [removable._id, responseBacked._id] },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().questionIds).toEqual([responseBacked._id]);
    expect(await Question.findById(removable._id)).not.toBeNull();
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

  it('keeps the session questions array authoritative when adding a question to session', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const { profToken, course, session } = await setupCourseAndSession();

    const q1Res = await createQuestionAsProf(profToken, {
      type: 0,
      content: 'Q1',
      sessionId: session._id,
      courseId: course._id,
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
    });
    const slideRes = await createQuestionAsProf(profToken, {
      type: 6,
      content: '<p>Slide</p>',
      plainText: 'Slide',
      sessionId: session._id,
      courseId: course._id,
      sessionOptions: { points: 0 },
    });
    const libraryRes = await createQuestionAsProf(profToken, {
      type: 2,
      content: 'Library question',
    });

    const q1 = q1Res.json().question;
    const slide = slideRes.json().question;
    const libraryQuestion = libraryRes.json().question;

    await Session.findByIdAndUpdate(session._id, {
      $set: { questions: [q1._id, slide._id] },
    });

    const res = await authenticatedRequest(app, 'POST', `/api/v1/sessions/${session._id}/questions`, {
      token: profToken,
      payload: { questionId: libraryQuestion._id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.questions).toEqual([q1._id, slide._id, libraryQuestion._id]);
    expect(body.session.activities).toBeUndefined();
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
