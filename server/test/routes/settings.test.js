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

  it('persists backup scheduling settings', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const admin = await createTestUser({
      email: 'admin-backup-settings@example.com',
      roles: ['admin'],
    });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/settings', {
      token,
      payload: {
        backupEnabled: true,
        backupTimeLocal: '03:15',
        backupRetentionDaily: 9,
        backupRetentionWeekly: 5,
        backupRetentionMonthly: 14,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.backupEnabled).toBe(true);
    expect(body.backupTimeLocal).toBe('03:15');
    expect(body.backupRetentionDaily).toBe(9);
    expect(body.backupRetentionWeekly).toBe(5);
    expect(body.backupRetentionMonthly).toBe(14);

    const stored = await Settings.collection.findOne({ _id: 'settings' });
    expect(stored.backupEnabled).toBe(true);
    expect(stored.backupTimeLocal).toBe('03:15');
    expect(stored.backupRetentionMonthly).toBe(14);
  });
});

describe('POST /api/v1/settings/backup-now', () => {
  it('queues a manual backup request for admins', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const admin = await createTestUser({
      email: 'admin-backup-now@example.com',
      roles: ['admin'],
    });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'POST', '/api/v1/settings/backup-now', {
      token,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.backupLastRunStatus).toBe('running');
    expect(body.backupLastRunType).toBe('manual');
    expect(body.backupLastRunMessage).toBe('Manual backup requested.');

    const stored = await Settings.findOne({ _id: 'settings' }).lean();
    expect(stored.backupManualRequestId).toMatch(/^manual-/);
    expect(stored.backupLastRunStatus).toBe('running');
    expect(stored.backupLastRunType).toBe('manual');
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

describe('GET /api/v1/settings/public', () => {
  it('includes normalized public defaults including time format and image settings', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    await Settings.findOneAndUpdate(
      { _id: 'settings' },
      { $set: { timeFormat: '12h', maxImageWidth: 2400, avatarThumbnailSize: 640 } },
      { upsert: true, returnDocument: 'after' }
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/settings/public',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().timeFormat).toBe('12h');
    expect(res.json().maxImageWidth).toBe(2400);
    expect(res.json().avatarThumbnailSize).toBe(640);
  });

  it('falls back to documented default image settings when values are missing or invalid', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    await Settings.findOneAndUpdate(
      { _id: 'settings' },
      { $set: { maxImageWidth: 0, avatarThumbnailSize: 0 } },
      { upsert: true, returnDocument: 'after' }
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/settings/public',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().maxImageWidth).toBe(1920);
    expect(res.json().avatarThumbnailSize).toBe(512);
  });

  it('normalizes backup defaults when values are missing or invalid', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    await Settings.collection.updateOne(
      { _id: 'settings' },
      {
        $set: {
          backupEnabled: true,
          backupTimeLocal: '25:99',
          backupRetentionDaily: -1,
          backupRetentionWeekly: 'not-a-number',
          backupRetentionMonthly: null,
        },
      },
      { upsert: true }
    );

    const admin = await createTestUser({
      email: 'admin-backup-defaults@example.com',
      roles: ['admin'],
    });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/settings', { token });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.backupEnabled).toBe(true);
    expect(body.backupTimeLocal).toBe('02:00');
    expect(body.backupRetentionDaily).toBe(7);
    expect(body.backupRetentionWeekly).toBe(4);
    expect(body.backupRetentionMonthly).toBe(12);
  });
});
