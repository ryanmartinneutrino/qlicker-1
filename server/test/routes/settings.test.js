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
