import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { createApp, createTestUser, getAuthToken, authenticatedRequest } from '../helpers.js';
import Course from '../../src/models/Course.js';
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

// ---------- POST /api/v1/courses ----------
describe('POST /api/v1/courses', () => {
  it('professor can create a course', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const token = await getAuthToken(app, prof);

    const res = await createCourseAsProf(token);

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.course).toBeDefined();
    expect(body.course.name).toBe('Test Course');
    expect(body.course.deptCode).toBe('CS');
    expect(body.course.owner).toBe(prof._id.toString());
    expect(body.course.instructors).toContain(prof._id.toString());
  });

  it('pure admin can create a course without being added as an instructor', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const admin = await createTestUser({ email: 'admin-course@example.com', roles: ['admin'] });
    const token = await getAuthToken(app, admin);

    const res = await createCourseAsProf(token, { name: 'Admin-owned Course' });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.course.owner).toBe(admin._id.toString());
    expect(body.course.instructors || []).toEqual([]);

    const persistedAdmin = await User.findById(admin._id).lean();
    expect(persistedAdmin.profile.courses || []).toEqual([]);
  });

  it('student cannot create a course', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const student = await createTestUser({ email: 'student@example.com', roles: ['student'] });
    const token = await getAuthToken(app, student);

    const res = await createCourseAsProf(token);

    expect(res.statusCode).toBe(403);
  });

  it('returns course with enrollment code', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const token = await getAuthToken(app, prof);

    const res = await createCourseAsProf(token);

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.course.enrollmentCode).toBeDefined();
    expect(typeof body.course.enrollmentCode).toBe('string');
    expect(body.course.enrollmentCode.length).toBe(6);
  });
});

// ---------- GET /api/v1/courses ----------
describe('GET /api/v1/courses', () => {
  it('professor sees their courses', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const token = await getAuthToken(app, prof);
    await createCourseAsProf(token, { name: 'Prof Course' });

    const res = await authenticatedRequest(app, 'GET', '/api/v1/courses', { token });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.courses).toBeDefined();
    expect(body.courses.length).toBe(1);
    expect(body.courses[0].name).toBe('Prof Course');
  });

  it('student sees enrolled courses', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const course = createRes.json().course;

    const student = await createTestUser({ email: 'student@example.com', roles: ['student'] });
    const studentToken = await getAuthToken(app, student);

    // Enroll the student
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const res = await authenticatedRequest(app, 'GET', '/api/v1/courses', { token: studentToken });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.courses.length).toBe(1);
  });

  it('admin sees all courses', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    await createCourseAsProf(profToken, { name: 'Course A' });
    await createCourseAsProf(profToken, { name: 'Course B', courseNumber: '102' });

    const admin = await createTestUser({ email: 'admin@example.com', roles: ['admin'] });
    const adminToken = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/courses', { token: adminToken });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.courses.length).toBe(2);
  });
});

// ---------- GET /api/v1/courses/:id ----------
describe('GET /api/v1/courses/:id', () => {
  it('instructor sees full details including students', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const course = createRes.json().course;

    const res = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.course).toBeDefined();
    expect(body.course.students).toBeDefined();
    expect(body.course.name).toBe('Test Course');
  });

  it('student sees course without student list', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
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

    const res = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}`, {
      token: studentToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.course).toBeDefined();
    expect(body.course.students).toBeUndefined();
    // Students now see limited groupCategories for video chat (but no full member lists)
    expect(body.course.currentUserId).toBeDefined();
  });

  it('non-enrolled user gets 403', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const course = createRes.json().course;

    const other = await createTestUser({ email: 'other@example.com', roles: ['student'] });
    const otherToken = await getAuthToken(app, other);

    const res = await authenticatedRequest(app, 'GET', `/api/v1/courses/${course._id}`, {
      token: otherToken,
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /api/v1/courses/:id', () => {
  it('allows instructors to override the course quiz time format', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const prof = await createTestUser({ email: 'prof-course-format@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const courseId = createRes.json().course._id;

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/courses/${courseId}`, {
      token: profToken,
      payload: { quizTimeFormat: '12h' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().course.quizTimeFormat).toBe('12h');

    const storedCourse = await Course.findById(courseId).lean();
    expect(storedCourse.quizTimeFormat).toBe('12h');
  });
});

// ---------- PATCH /api/v1/courses/:id ----------
describe('PATCH /api/v1/courses/:id', () => {
  it('instructor can update', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const course = createRes.json().course;

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/courses/${course._id}`, {
      token: profToken,
      payload: { name: 'Updated Course' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.course.name).toBe('Updated Course');
  });

  it('non-instructor gets 403', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const course = createRes.json().course;

    const other = await createTestUser({ email: 'other@example.com', roles: ['professor'] });
    const otherToken = await getAuthToken(app, other);

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/courses/${course._id}`, {
      token: otherToken,
      payload: { name: 'Hacked' },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------- DELETE /api/v1/courses/:id ----------
describe('DELETE /api/v1/courses/:id', () => {
  it('owner can delete', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const course = createRes.json().course;

    const res = await authenticatedRequest(app, 'DELETE', `/api/v1/courses/${course._id}`, {
      token: profToken,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('non-owner gets 403', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const course = createRes.json().course;

    const other = await createTestUser({ email: 'other@example.com', roles: ['professor'] });
    const otherToken = await getAuthToken(app, other);

    const res = await authenticatedRequest(app, 'DELETE', `/api/v1/courses/${course._id}`, {
      token: otherToken,
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------- POST /api/v1/courses/enroll ----------
describe('POST /api/v1/courses/enroll', () => {
  it('student can enroll with valid code', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const course = createRes.json().course;

    const student = await createTestUser({ email: 'student@example.com', roles: ['student'] });
    const studentToken = await getAuthToken(app, student);

    const res = await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.course).toBeDefined();
    expect(body.course._id).toBe(course._id);
  });

  it('invalid code returns 404', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const student = await createTestUser({ email: 'student@example.com', roles: ['student'] });
    const studentToken = await getAuthToken(app, student);

    const res = await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentToken,
      payload: { enrollmentCode: 'ZZZZZZ' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('duplicate enrollment returns 409', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
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

    const res = await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: studentToken,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    expect(res.statusCode).toBe(409);
  });
});

// ---------- DELETE /api/v1/courses/:id/students/:studentId ----------
describe('DELETE /api/v1/courses/:id/students/:studentId', () => {
  it('instructor can remove student', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
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

    const res = await authenticatedRequest(
      app,
      'DELETE',
      `/api/v1/courses/${course._id}/students/${student._id}`,
      { token: profToken }
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });
});

// ---------- POST /api/v1/courses/:id/instructors ----------
describe('POST /api/v1/courses/:id/instructors', () => {
  it('owner can add instructor', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const course = createRes.json().course;

    const newInstructor = await createTestUser({ email: 'ta@example.com', roles: ['professor'] });

    const res = await authenticatedRequest(
      app,
      'POST',
      `/api/v1/courses/${course._id}/instructors`,
      { token: profToken, payload: { userId: newInstructor._id.toString() } }
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });
});

// ---------- DELETE /api/v1/courses/:id/instructors/:instructorId ----------
describe('DELETE /api/v1/courses/:id/instructors/:instructorId', () => {
  it('cannot remove last instructor', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const course = createRes.json().course;

    const res = await authenticatedRequest(
      app,
      'DELETE',
      `/api/v1/courses/${course._id}/instructors/${prof._id}`,
      { token: profToken }
    );

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toMatch(/last instructor/i);
  });
});

// ---------- POST /api/v1/courses/:id/regenerate-code ----------
describe('POST /api/v1/courses/:id/regenerate-code', () => {
  it('instructor can regenerate', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const course = createRes.json().course;
    const oldCode = course.enrollmentCode;

    const res = await authenticatedRequest(
      app,
      'POST',
      `/api/v1/courses/${course._id}/regenerate-code`,
      { token: profToken }
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enrollmentCode).toBeDefined();
    expect(typeof body.enrollmentCode).toBe('string');
    expect(body.enrollmentCode.length).toBe(6);
    expect(body.enrollmentCode).not.toBe(oldCode);
  });
});

// ---------- PATCH /api/v1/courses/:id/active ----------
describe('PATCH /api/v1/courses/:id/active', () => {
  it('instructor can toggle', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const course = createRes.json().course;

    const res = await authenticatedRequest(
      app,
      'PATCH',
      `/api/v1/courses/${course._id}/active`,
      { token: profToken, payload: { inactive: true } }
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.course.inactive).toBe(true);
  });
});

// ---------- Student self-unenroll ----------
describe('DELETE /api/v1/courses/:id/students/:studentId (self-unenroll)', () => {
  it('student can unenroll themselves', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
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

    const res = await authenticatedRequest(
      app,
      'DELETE',
      `/api/v1/courses/${course._id}/students/${student._id}`,
      { token: studentToken }
    );

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('student cannot remove another student', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const prof = await createTestUser({ email: 'prof@example.com', roles: ['professor'] });
    const profToken = await getAuthToken(app, prof);
    const createRes = await createCourseAsProf(profToken);
    const course = createRes.json().course;

    const student1 = await createTestUser({ email: 'student1@example.com', roles: ['student'] });
    const student1Token = await getAuthToken(app, student1);
    const student2 = await createTestUser({ email: 'student2@example.com', roles: ['student'] });
    const student2Token = await getAuthToken(app, student2);

    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: student1Token,
      payload: { enrollmentCode: course.enrollmentCode },
    });
    await authenticatedRequest(app, 'POST', '/api/v1/courses/enroll', {
      token: student2Token,
      payload: { enrollmentCode: course.enrollmentCode },
    });

    const res = await authenticatedRequest(
      app,
      'DELETE',
      `/api/v1/courses/${course._id}/students/${student2._id}`,
      { token: student1Token }
    );

    expect(res.statusCode).toBe(403);
  });
});
