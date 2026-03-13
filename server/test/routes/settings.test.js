import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import Settings from '../../src/models/Settings.js';
import { createApp, createTestUser, getAuthToken, authenticatedRequest } from '../helpers.js';

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

async function createCourseAsProfessor(token, overrides = {}) {
  return authenticatedRequest(app, 'POST', '/api/v1/courses', {
    token,
    payload: {
      name: 'Test Course',
      deptCode: 'CS',
      courseNumber: '101',
      section: '001',
      semester: 'Fall 2025',
      ...overrides,
    },
  });
}

describe('PATCH /api/v1/settings', () => {
  it('updates SSO fields even when legacy settings contain invalid storageType', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    await Settings.collection.insertOne({
      _id: 'settings',
      storageType: 'legacy-storage',
      SSO_enabled: false,
    });

    const admin = await createTestUser({
      email: 'admin-settings@example.com',
      roles: ['admin'],
    });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/settings', {
      token,
      payload: { SSO_enabled: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.SSO_enabled).toBe(true);

    const stored = await Settings.collection.findOne({ _id: 'settings' });
    expect(stored.SSO_enabled).toBe(true);
    expect(stored.storageType).toBe('legacy-storage');
  });
});

describe('GET /api/v1/settings/jitsi-course/:courseId', () => {
  it('returns course-specific Jitsi availability for a professor', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const admin = await createTestUser({
      email: 'admin-jitsi-course@example.com',
      roles: ['admin'],
    });
    const professor = await createTestUser({
      email: 'prof-jitsi-course@example.com',
      roles: ['professor'],
    });

    const adminToken = await getAuthToken(app, admin);
    const professorToken = await getAuthToken(app, professor);

    const courseRes = await createCourseAsProfessor(professorToken);
    const courseId = courseRes.json().course._id;

    await authenticatedRequest(app, 'PATCH', '/api/v1/settings', {
      token: adminToken,
      payload: {
        Jitsi_Enabled: true,
        Jitsi_EnabledCourses: [courseId],
      },
    });

    const enabledRes = await authenticatedRequest(app, 'GET', `/api/v1/settings/jitsi-course/${courseId}`, {
      token: professorToken,
    });
    expect(enabledRes.statusCode).toBe(200);
    expect(enabledRes.json()).toEqual({ enabled: true });

    await authenticatedRequest(app, 'PATCH', '/api/v1/settings', {
      token: adminToken,
      payload: {
        Jitsi_Enabled: true,
        Jitsi_EnabledCourses: [],
      },
    });

    const disabledRes = await authenticatedRequest(app, 'GET', `/api/v1/settings/jitsi-course/${courseId}`, {
      token: professorToken,
    });
    expect(disabledRes.statusCode).toBe(200);
    expect(disabledRes.json()).toEqual({ enabled: false });
  });

  it('rejects users who are not enrolled in the course', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const professor = await createTestUser({
      email: 'prof-jitsi-owner@example.com',
      roles: ['professor'],
    });
    const outsider = await createTestUser({
      email: 'student-jitsi-outsider@example.com',
      roles: ['student'],
    });

    const professorToken = await getAuthToken(app, professor);
    const outsiderToken = await getAuthToken(app, outsider);

    const courseRes = await createCourseAsProfessor(professorToken);
    const courseId = courseRes.json().course._id;

    const res = await authenticatedRequest(app, 'GET', `/api/v1/settings/jitsi-course/${courseId}`, {
      token: outsiderToken,
    });
    expect(res.statusCode).toBe(403);
  });
});
