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

  it('ignores read-only backup metadata fields when legacy clients include null values', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    await Settings.findOneAndUpdate(
      { _id: 'settings' },
      {
        $set: {
          backupLastRunAt: new Date('2026-03-27T07:15:00.000Z'),
          backupLastRunType: 'weekly',
          backupLastRunStatus: 'success',
          backupLastRunFilename: 'keep-existing.tar.gz',
          backupLastRunMessage: 'Previous backup completed successfully.',
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    const admin = await createTestUser({
      email: 'admin-legacy-settings-payload@example.com',
      roles: ['admin'],
    });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/settings', {
      token,
      payload: {
        SSO_enabled: true,
        backupLastRunAt: null,
        backupLastRunType: '',
        backupLastRunStatus: 'idle',
        backupLastRunFilename: 'should-not-overwrite.tar.gz',
        backupLastRunMessage: 'Should be ignored.',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.SSO_enabled).toBe(true);
    expect(body.backupLastRunType).toBe('weekly');
    expect(body.backupLastRunStatus).toBe('success');
    expect(body.backupLastRunFilename).toBe('keep-existing.tar.gz');
    expect(body.backupLastRunMessage).toBe('Previous backup completed successfully.');

    const stored = await Settings.collection.findOne({ _id: 'settings' });
    expect(stored.SSO_enabled).toBe(true);
    expect(stored.backupLastRunType).toBe('weekly');
    expect(stored.backupLastRunStatus).toBe('success');
    expect(stored.backupLastRunFilename).toBe('keep-existing.tar.gz');
    expect(stored.backupLastRunMessage).toBe('Previous backup completed successfully.');
  });
});

describe('settings singleton hardening', () => {
  it('removes duplicate settings documents on app startup', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    await Settings.collection.updateOne(
      { _id: 'settings' },
      { $set: { backupTimeLocal: '02:00' } },
      { upsert: true }
    );
    await Settings.collection.insertOne({
      _id: 'legacy-settings',
      backupTimeLocal: '07:30',
      backupEnabled: true,
    });

    await app.close();
    app = await createApp();

    const docs = await Settings.collection.find({}).toArray();
    expect(docs).toHaveLength(1);
    expect(String(docs[0]._id)).toBe('settings');
    expect(docs[0].backupTimeLocal).toBe('07:30');
  });

  it('seeds canonical settings from a legacy document when canonical settings are missing', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    await Settings.collection.deleteMany({});
    await Settings.collection.insertOne({
      _id: 'legacy-settings',
      backupEnabled: true,
      backupTimeLocal: '04:10',
      storageType: 's3',
    });

    await app.close();
    app = await createApp();

    const canonical = await Settings.collection.findOne({ _id: 'settings' });
    const extras = await Settings.collection.countDocuments({ _id: { $ne: 'settings' } });
    expect(canonical).toBeTruthy();
    expect(canonical.backupEnabled).toBe(true);
    expect(canonical.backupTimeLocal).toBe('04:10');
    expect(canonical.storageType).toBe('s3');
    expect(extras).toBe(0);
  });

  it('promotes restored legacy settings when canonical is missing after startup', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    await Settings.collection.deleteMany({});
    await Settings.collection.insertOne({
      _id: 'legacy-restored-settings',
      SSO_enabled: true,
      storageType: 'AWS',
      AWS_bucket: 'legacy-backup-bucket',
      AWS_region: 'us-east-1',
      AWS_accessKey: 'legacy-access-key',
      AWS_secret: 'legacy-secret-key',
      AWS_endpoint: 'https://nyc3.example-storage.local',
      AWS_forcePathStyle: true,
      Azure_accountName: 'legacy-azure-account',
      Azure_accountKey: 'legacy-azure-key',
      Azure_containerName: 'legacy-azure-container',
    });

    const admin = await createTestUser({
      email: 'admin-legacy-restore@example.com',
      roles: ['admin'],
    });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/settings', { token });
    expect(res.statusCode).toBe(200);
    expect(res.json().SSO_enabled).toBe(true);
    expect(res.json().storageType).toBe('s3');
    expect(res.json().AWS_bucket).toBe('legacy-backup-bucket');
    expect(res.json().AWS_region).toBe('us-east-1');
    expect(res.json().AWS_accessKey).toBe('legacy-access-key');
    expect(res.json().AWS_secret).toBe('legacy-secret-key');
    expect(res.json().AWS_endpoint).toBe('https://nyc3.example-storage.local');
    expect(res.json().AWS_forcePathStyle).toBe(true);
    expect(res.json().resolvedAWSAccessKeyId).toBe('legacy-access-key');
    expect(res.json().resolvedAWSSecretAccessKey).toBe('legacy-secret-key');
    expect(res.json().Azure_accountName).toBe('legacy-azure-account');
    expect(res.json().Azure_accountKey).toBe('legacy-azure-key');
    expect(res.json().Azure_containerName).toBe('legacy-azure-container');
    expect(res.json().resolvedAzureStorageAccount).toBe('legacy-azure-account');
    expect(res.json().resolvedAzureStorageAccessKey).toBe('legacy-azure-key');
    expect(res.json().resolvedAzureStorageContainer).toBe('legacy-azure-container');

    const canonical = await Settings.collection.findOne({ _id: 'settings' });
    const extras = await Settings.collection.countDocuments({ _id: { $ne: 'settings' } });
    expect(canonical).toBeTruthy();
    expect(canonical.SSO_enabled).toBe(true);
    expect(canonical.storageType).toBe('s3');
    expect(canonical.AWS_bucket).toBe('legacy-backup-bucket');
    expect(canonical.AWS_region).toBe('us-east-1');
    expect(canonical.AWS_accessKey).toBe('legacy-access-key');
    expect(canonical.AWS_secret).toBe('legacy-secret-key');
    expect(canonical.AWS_endpoint).toBe('https://nyc3.example-storage.local');
    expect(canonical.AWS_forcePathStyle).toBe(true);
    expect(canonical.Azure_accountName).toBe('legacy-azure-account');
    expect(canonical.Azure_accountKey).toBe('legacy-azure-key');
    expect(canonical.Azure_containerName).toBe('legacy-azure-container');
    expect(extras).toBe(0);
  });

  it('merges restored legacy settings into a sparse canonical document created during restore', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    // Simulate backup-manager upsert creating only a sparse canonical record.
    await Settings.collection.deleteMany({});
    await Settings.collection.insertOne({
      _id: 'settings',
      backupManagerStatus: 'healthy',
      backupManagerMessage: 'Backup manager is running.',
    });
    // Simulate legacy restore adding a duplicate settings document afterward.
    await Settings.collection.insertOne({
      _id: 'legacy-restored-settings',
      SSO_enabled: true,
      storageType: 'AWS',
      AWS_bucket: 'legacy-bucket',
      AWS_region: 'us-east-1',
      AWS_accessKey: 'legacy-access-key',
      AWS_secret: 'legacy-secret-key',
    });

    await app.close();
    app = await createApp();

    const admin = await createTestUser({
      email: 'admin-sparse-canonical-merge@example.com',
      roles: ['admin'],
    });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/settings', { token });
    expect(res.statusCode).toBe(200);
    expect(res.json().SSO_enabled).toBe(true);
    expect(res.json().storageType).toBe('s3');
    expect(res.json().AWS_bucket).toBe('legacy-bucket');
    expect(res.json().resolvedAWSAccessKeyId).toBe('legacy-access-key');
    expect(res.json().resolvedAWSSecretAccessKey).toBe('legacy-secret-key');

    const canonical = await Settings.collection.findOne({ _id: 'settings' });
    const extras = await Settings.collection.countDocuments({ _id: { $ne: 'settings' } });
    expect(canonical).toBeTruthy();
    expect(canonical.SSO_enabled).toBe(true);
    expect(canonical.storageType).toBe('s3');
    expect(canonical.AWS_bucket).toBe('legacy-bucket');
    expect(canonical.AWS_accessKey).toBe('legacy-access-key');
    expect(canonical.AWS_secret).toBe('legacy-secret-key');
    expect(canonical.backupManagerStatus).toBe('healthy');
    expect(extras).toBe(0);
  });

  it('always serves the canonical settings document even if a duplicate appears later', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    await Settings.findOneAndUpdate(
      { _id: 'settings' },
      { $set: { backupLastRunMessage: 'canonical-settings-message' } },
      { upsert: true, returnDocument: 'after' }
    );
    await Settings.collection.insertOne({
      _id: 'rogue-settings',
      backupLastRunMessage: 'rogue-settings-message',
    });

    const admin = await createTestUser({
      email: 'admin-settings-singleton@example.com',
      roles: ['admin'],
    });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/settings', { token });
    expect(res.statusCode).toBe(200);
    expect(res.json().backupLastRunMessage).toBe('canonical-settings-message');
  });
});

describe('POST /api/v1/settings/backup-now', () => {
  it('queues a manual backup request for admins', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    await Settings.findOneAndUpdate(
      { _id: 'settings' },
      {
        $set: {
          backupManagerLastSeenAt: new Date(),
          backupManagerStatus: 'healthy',
          backupManagerMessage: 'Backup manager is running. Archives are written to ./backups on the host.',
          backupManagerHostPath: './backups',
          backupManagerCheckIntervalSeconds: 60,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

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

  it('rejects manual backup requests when the backup manager heartbeat is stale', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    await Settings.findOneAndUpdate(
      { _id: 'settings' },
      {
        $set: {
          backupManagerLastSeenAt: new Date(Date.now() - (10 * 60 * 1000)),
          backupManagerStatus: 'healthy',
          backupManagerMessage: 'Backup manager is running. Archives are written to ./backups on the host.',
          backupManagerHostPath: './backups',
          backupManagerCheckIntervalSeconds: 60,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    const admin = await createTestUser({
      email: 'admin-backup-stale@example.com',
      roles: ['admin'],
    });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'POST', '/api/v1/settings/backup-now', {
      token,
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().message).toMatch(/heartbeat is stale/i);

    const stored = await Settings.findOne({ _id: 'settings' }).lean();
    expect(stored.backupManualRequestId || '').toBe('');
  });
});

describe('POST /api/v1/settings/backup-reset', () => {
  it('clears stuck backup request state for admins', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    await Settings.findOneAndUpdate(
      { _id: 'settings' },
      {
        $set: {
          backupManualRequestId: 'manual-stuck-1',
          backupLastHandledManualRequestId: '',
          backupLastRunStatus: 'running',
          backupLastRunType: 'manual',
          backupLastRunMessage: 'Manual backup requested.',
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    const admin = await createTestUser({
      email: 'admin-backup-reset@example.com',
      roles: ['admin'],
    });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'POST', '/api/v1/settings/backup-reset', {
      token,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.backupLastRunStatus).toBe('idle');
    expect(body.backupLastRunType).toBe('');
    expect(body.backupLastRunMessage).toBe('Backup request state was reset by an admin.');

    const stored = await Settings.findOne({ _id: 'settings' }).lean();
    expect(stored.backupManualRequestId).toBe('');
    expect(stored.backupLastHandledManualRequestId).toBe('');
    expect(stored.backupLastRunStatus).toBe('idle');
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
      {
        $set: {
          timeFormat: '12h',
          maxImageWidth: 2400,
          avatarThumbnailSize: 640,
          registrationDisabled: true,
        },
      },
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
    expect(res.json().registrationDisabled).toBe(true);
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

  it('reports email-delivery status to admins and auto-enables verification when allowed domains are saved', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const admin = await createTestUser({
      email: 'admin-domain-settings@example.com',
      roles: ['admin'],
    });
    const token = await getAuthToken(app, admin);

    const patchRes = await authenticatedRequest(app, 'PATCH', '/api/v1/settings', {
      token,
      payload: {
        restrictDomain: false,
        allowedDomains: ['allowed.edu'],
        requireVerified: false,
      },
    });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().restrictDomain).toBe(true);
    expect(patchRes.json().requireVerified).toBe(true);
    expect(patchRes.json().emailDeliveryStatus).toBeTruthy();
    expect(typeof patchRes.json().emailDeliveryStatus.configured).toBe('boolean');

    const getRes = await authenticatedRequest(app, 'GET', '/api/v1/settings', { token });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().emailDeliveryStatus).toBeTruthy();
    expect(getRes.json().allowedDomains).toEqual(['allowed.edu']);
  });
});
