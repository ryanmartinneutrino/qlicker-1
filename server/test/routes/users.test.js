import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import { generateMeteorId } from '../../src/utils/meteorId.js';
import { createApp, createTestUser, getAuthToken, authenticatedRequest, csrfHeaders } from '../helpers.js';

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

// ---------- GET /api/v1/users/me ----------
describe('GET /api/v1/users/me', () => {
  it('returns current user profile', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await createTestUser({ email: 'me@example.com' });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/users/me', { token });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toBeDefined();
    expect(body.user.profile.firstname).toBe('Test');
    expect(body.user.profile.lastname).toBe('User');
    expect(body.user.services).toBeUndefined(); // services stripped
  });

  it('includes SSO auth metadata for profile restrictions', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await User.create({
      emails: [{ address: 'sso-meta@example.com', verified: true }],
      services: {
        password: { hash: await User.hashPassword('password123') },
        sso: { id: 'sso-meta-1', email: 'sso-meta@example.com' },
      },
      profile: { firstname: 'SSO', lastname: 'Meta', roles: ['student'] },
      ssoCreated: true,
      allowEmailLogin: false,
      lastAuthProvider: 'sso',
      createdAt: new Date(),
    });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/users/me', { token });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.isSSOUser).toBe(true);
    expect(body.user.isSSOCreatedUser).toBe(true);
    expect(body.user.allowEmailLogin).toBe(false);
    expect(body.user.lastAuthProvider).toBe('sso');
  });

  it('includes locale field when set', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await createTestUser({ email: 'locale@example.com' });
    await User.findByIdAndUpdate(user._id, { locale: 'fr' });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/users/me', { token });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.locale).toBe('fr');
  });

  it('returns empty locale for legacy users without locale field', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    // Simulate a legacy user that has no locale field at all
    const user = await createTestUser({ email: 'legacy@example.com' });
    // Unset locale entirely to simulate legacy doc
    await User.collection.updateOne({ _id: user._id }, { $unset: { locale: '' } });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/users/me', { token });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Should default to empty string (use app default)
    expect(body.user.locale === '' || body.user.locale === undefined || body.user.locale === null).toBe(true);
  });

  it('rejects unauthenticated request', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const res = await app.inject({ method: 'GET', url: '/api/v1/users/me' });
    expect(res.statusCode).toBe(401);
  });
});

// ---------- PATCH /api/v1/users/me ----------
describe('PATCH /api/v1/users/me', () => {
  it('updates profile fields', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await createTestUser({ email: 'patch@example.com' });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/users/me', {
      token,
      payload: { firstname: 'Updated', lastname: 'Name', studentNumber: 'S12345' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.profile.firstname).toBe('Updated');
    expect(body.profile.lastname).toBe('Name');
    expect(body.profile.studentNumber).toBe('S12345');
  });

  it('does not let SSO-created users change their names', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await User.create({
      emails: [{ address: 'sso-name@example.com', verified: true }],
      services: {
        password: { hash: await User.hashPassword('password123') },
        sso: { id: 'sso-name-1', email: 'sso-name@example.com' },
      },
      profile: { firstname: 'Managed', lastname: 'Name', studentNumber: 'S1', roles: ['student'] },
      ssoCreated: true,
      allowEmailLogin: false,
      lastAuthProvider: 'sso',
      createdAt: new Date(),
    });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/users/me', {
      token,
      payload: { firstname: 'Changed', lastname: 'User', studentNumber: 'S2' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.profile.firstname).toBe('Managed');
    expect(body.profile.lastname).toBe('Name');
    expect(body.profile.studentNumber).toBe('S2');
  });

  it('updates locale preference', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await createTestUser({ email: 'locale-patch@example.com' });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/users/me', {
      token,
      payload: { locale: 'fr' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.locale).toBe('fr');

    // Verify persisted
    const stored = await User.findById(user._id);
    expect(stored.locale).toBe('fr');
  });

  it('clears locale to empty string (use app default)', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await createTestUser({ email: 'locale-clear@example.com' });
    await User.findByIdAndUpdate(user._id, { locale: 'fr' });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/users/me', {
      token,
      payload: { locale: '' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.locale).toBe('');
  });

  it('updates profile and locale together', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await createTestUser({ email: 'combo@example.com' });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/users/me', {
      token,
      payload: { firstname: 'NewFirst', locale: 'fr' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.profile.firstname).toBe('NewFirst');
    expect(body.locale).toBe('fr');
  });

  it('does not expose services field', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await createTestUser({ email: 'safe@example.com' });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/users/me', {
      token,
      payload: { firstname: 'Safe' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().services).toBeUndefined();
  });
});

// ---------- PATCH /api/v1/users/me/password ----------
describe('PATCH /api/v1/users/me/password', () => {
  it('changes password with valid current password', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await createTestUser({ email: 'pwchange@example.com', password: 'oldpassword123' });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/users/me/password', {
      token,
      payload: { currentPassword: 'oldpassword123', newPassword: 'newpassword456' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify new password works
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...csrfHeaders },
      payload: { email: 'pwchange@example.com', password: 'newpassword456' },
    });
    expect(loginRes.statusCode).toBe(200);
  });

  it('blocks password changes while signed in through SSO', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await User.create({
      emails: [{ address: 'sso-password@example.com', verified: true }],
      services: {
        password: { hash: await User.hashPassword('password123') },
        sso: { id: 'sso-password-1', email: 'sso-password@example.com' },
      },
      profile: { firstname: 'SSO', lastname: 'Password', roles: ['student'] },
      ssoCreated: true,
      allowEmailLogin: false,
      lastAuthProvider: 'sso',
      createdAt: new Date(),
    });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/users/me/password', {
      token,
      payload: { currentPassword: 'password123', newPassword: 'newpassword456' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('SSO_PASSWORD_CHANGE_DISABLED');
  });

  it('rejects wrong current password', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await createTestUser({ email: 'wrongpw@example.com', password: 'correctpassword' });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/users/me/password', {
      token,
      payload: { currentPassword: 'wrongpassword', newPassword: 'newpassword456' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects short new password', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await createTestUser({ email: 'shortpw@example.com', password: 'password123' });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/users/me/password', {
      token,
      payload: { currentPassword: 'password123', newPassword: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------- Admin user management ----------
describe('Admin user management', () => {
  it('admin can list users', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const admin = await createTestUser({ email: 'admin-list@example.com', roles: ['admin'] });
    await createTestUser({ email: 'student1@example.com', roles: ['student'] });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/users', { token });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.users).toBeDefined();
    expect(body.total).toBeGreaterThanOrEqual(2);
    // Services should be stripped
    body.users.forEach((u) => expect(u.services).toBeUndefined());
  });

  it('non-admin cannot list users', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const student = await createTestUser({ email: 'student-list@example.com', roles: ['student'] });
    const token = await getAuthToken(app, student);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/users', { token });
    expect(res.statusCode).toBe(403);
  });

  it('admin can create a user', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const admin = await createTestUser({ email: 'admin-create@example.com', roles: ['admin'] });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'POST', '/api/v1/users', {
      token,
      payload: {
        email: 'newuser@example.com',
        password: 'password123',
        firstname: 'Created',
        lastname: 'User',
        role: 'student',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.profile.firstname).toBe('Created');
    expect(body.profile.roles).toContain('student');
  });

  it('admin can delete a user', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const admin = await createTestUser({ email: 'admin-delete@example.com', roles: ['admin'] });
    const target = await createTestUser({ email: 'deleteme@example.com', roles: ['student'] });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'DELETE', `/api/v1/users/${target._id}`, { token });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const deleted = await User.findById(target._id);
    expect(deleted).toBeNull();
  });

  it('admin can change user role', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const admin = await createTestUser({ email: 'admin-role@example.com', roles: ['admin'] });
    const student = await createTestUser({ email: 'promote@example.com', roles: ['student'] });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/users/${student._id}/role`, {
      token,
      payload: { role: 'professor' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().profile.roles).toContain('professor');
  });

  it('admin cannot change own role', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const admin = await createTestUser({ email: 'admin-self@example.com', roles: ['admin'] });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/users/${admin._id}/role`, {
      token,
      payload: { role: 'student' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin can verify user email', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const admin = await createTestUser({ email: 'admin-verify@example.com', roles: ['admin'] });
    const unverified = await User.create({
      emails: [{ address: 'unverified@example.com', verified: false }],
      services: { password: { hash: await User.hashPassword('password123') } },
      profile: { firstname: 'Unverified', lastname: 'User', roles: ['student'] },
    });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'PATCH', `/api/v1/users/${unverified._id}/verify-email`, { token });
    expect(res.statusCode).toBe(200);

    const updated = await User.findById(unverified._id);
    expect(updated.emails[0].verified).toBe(true);
  });

  it('admin can toggle user properties for SSO approval and promotion', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const admin = await createTestUser({ email: 'admin-properties@example.com', roles: ['admin'] });
    const target = await User.create({
      emails: [{ address: 'sso-target@example.com', verified: true }],
      services: {
        password: { hash: await User.hashPassword('password123') },
        sso: { id: 'sso-target-1', email: 'sso-target@example.com' },
        resetPassword: {
          token: 'pending-reset',
          email: 'sso-target@example.com',
          when: new Date(),
          reason: 'reset',
        },
      },
      profile: { firstname: 'Toggle', lastname: 'Target', roles: ['professor'], canPromote: false },
      ssoCreated: true,
      allowEmailLogin: false,
      createdAt: new Date(),
    });
    const token = await getAuthToken(app, admin);

    const enableRes = await authenticatedRequest(app, 'PATCH', `/api/v1/users/${target._id}/properties`, {
      token,
      payload: { canPromote: true, allowEmailLogin: true },
    });
    expect(enableRes.statusCode).toBe(200);
    expect(enableRes.json().profile.canPromote).toBe(true);
    expect(enableRes.json().allowEmailLogin).toBe(true);

    const disableRes = await authenticatedRequest(app, 'PATCH', `/api/v1/users/${target._id}/properties`, {
      token,
      payload: { allowEmailLogin: false },
    });
    expect(disableRes.statusCode).toBe(200);
    expect(disableRes.json().allowEmailLogin).toBe(false);

    const updated = await User.findById(target._id);
    expect(updated.profile.canPromote).toBe(true);
    expect(updated.allowEmailLogin).toBe(false);
    expect(updated.services?.resetPassword).toBeUndefined();
  });

  it('keeps canPromote disabled for student-only accounts and clears it when a user is demoted to student', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const admin = await createTestUser({ email: 'admin-student-props@example.com', roles: ['admin'] });
    const target = await User.create({
      emails: [{ address: 'student-props@example.com', verified: true }],
      services: { password: { hash: await User.hashPassword('password123') } },
      profile: { firstname: 'Student', lastname: 'Props', roles: ['student'], canPromote: true },
      createdAt: new Date(),
    });
    const token = await getAuthToken(app, admin);

    const propsRes = await authenticatedRequest(app, 'PATCH', `/api/v1/users/${target._id}/properties`, {
      token,
      payload: { canPromote: true },
    });
    expect(propsRes.statusCode).toBe(200);
    expect(propsRes.json().profile.canPromote).toBe(false);

    const professorRes = await authenticatedRequest(app, 'PATCH', `/api/v1/users/${target._id}/role`, {
      token,
      payload: { role: 'professor' },
    });
    expect(professorRes.statusCode).toBe(200);

    const promoteRes = await authenticatedRequest(app, 'PATCH', `/api/v1/users/${target._id}/properties`, {
      token,
      payload: { canPromote: true },
    });
    expect(promoteRes.statusCode).toBe(200);
    expect(promoteRes.json().profile.canPromote).toBe(true);

    const demoteRes = await authenticatedRequest(app, 'PATCH', `/api/v1/users/${target._id}/role`, {
      token,
      payload: { role: 'student' },
    });
    expect(demoteRes.statusCode).toBe(200);
    expect(demoteRes.json().profile.roles).toEqual(['student']);
    expect(demoteRes.json().profile.canPromote).toBe(false);

    const updated = await User.findById(target._id);
    expect(updated.profile.roles).toEqual(['student']);
    expect(updated.profile.canPromote).toBe(false);
  });
});

// ---------- Legacy database compatibility ----------
describe('Legacy database compatibility', () => {
  it('handles legacy user documents without locale field', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    // Insert a legacy-style document directly into MongoDB (no locale field)
    const legacyId = generateMeteorId();
    await User.collection.insertOne({
      _id: legacyId,
      emails: [{ address: 'legacy-no-locale@example.com', verified: true }],
      services: {
        password: { hash: await User.hashPassword('password123') },
        resume: { loginTokens: [] },
      },
      profile: {
        firstname: 'Legacy',
        lastname: 'User',
        roles: ['student'],
        courses: [],
      },
      createdAt: new Date(),
      // No locale field at all
    });

    const user = await User.findById(legacyId);
    const token = await getAuthToken(app, user);

    // GET /me should work fine
    const res = await authenticatedRequest(app, 'GET', '/api/v1/users/me', { token });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.profile.firstname).toBe('Legacy');
    // locale may be empty or undefined — both are valid for "use app default"
    const locale = body.user.locale;
    expect(locale === '' || locale === undefined || locale === null).toBe(true);

    // PATCH /me with locale should work (upgrade legacy doc)
    const patchRes = await authenticatedRequest(app, 'PATCH', '/api/v1/users/me', {
      token,
      payload: { locale: 'fr' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().locale).toBe('fr');
  });

  it('handles legacy user with missing profile sub-fields', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    // Insert minimal legacy document
    const legacyId = generateMeteorId();
    await User.collection.insertOne({
      _id: legacyId,
      emails: [{ address: 'minimal-legacy@example.com', verified: false }],
      services: {
        password: { hash: await User.hashPassword('password123') },
      },
      profile: {
        firstname: 'Min',
        lastname: 'Leg',
        roles: ['student'],
        // No courses, no studentNumber, no profileImage, no profileThumbnail
      },
      createdAt: new Date(),
    });

    const user = await User.findById(legacyId);
    const token = await getAuthToken(app, user);

    // Should handle missing sub-fields gracefully
    const res = await authenticatedRequest(app, 'GET', '/api/v1/users/me', { token });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.profile.firstname).toBe('Min');
  });
});

// ---------- Settings locale tests ----------
describe('Settings locale and dateFormat', () => {
  it('admin can update locale and dateFormat settings', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const Settings = (await import('../../src/models/Settings.js')).default;

    // Create initial settings
    await Settings.collection.insertOne({
      _id: 'settings',
      locale: 'en',
      dateFormat: 'DD-MMM-YYYY',
    });

    const admin = await createTestUser({ email: 'admin-locale@example.com', roles: ['admin'] });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/settings', {
      token,
      payload: { locale: 'fr', dateFormat: 'YYYY-MM-DD' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.locale).toBe('fr');
    expect(body.dateFormat).toBe('YYYY-MM-DD');
  });

  it('settings locale defaults to en for legacy settings without locale', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const Settings = (await import('../../src/models/Settings.js')).default;

    // Insert a legacy settings doc without locale
    await Settings.collection.insertOne({
      _id: 'settings',
      restrictDomain: false,
      // No locale or dateFormat fields
    });

    const admin = await createTestUser({ email: 'admin-legacy-settings@example.com', roles: ['admin'] });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/settings', { token });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Mongoose defaults should apply
    expect(body.locale).toBe('en');
    expect(body.dateFormat).toBe('DD-MMM-YYYY');
  });
});
