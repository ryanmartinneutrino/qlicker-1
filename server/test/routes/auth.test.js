import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
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

// ---------- POST /api/v1/auth/register ----------
describe('POST /api/v1/auth/register', () => {
  it('creates a new user with valid data', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...csrfHeaders },
      payload: {
        email: 'new@example.com',
        password: 'password123',
        firstname: 'New',
        lastname: 'User',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.user).toBeDefined();
    expect(body.user.profile.firstname).toBe('New');
    expect(body.user.profile.lastname).toBe('User');
    expect(body.user.emails[0].address).toBe('new@example.com');
  });

  it('first user becomes admin', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...csrfHeaders },
      payload: {
        email: 'admin@example.com',
        password: 'password123',
        firstname: 'Admin',
        lastname: 'User',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.profile.roles).toContain('admin');
  });

  it('second user becomes student', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    await createTestUser({ email: 'first@example.com', roles: ['admin'] });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...csrfHeaders },
      payload: {
        email: 'second@example.com',
        password: 'password123',
        firstname: 'Second',
        lastname: 'User',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.profile.roles).toContain('student');
    expect(body.user.profile.roles).not.toContain('admin');
  });

  it('returns JWT token and user profile', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...csrfHeaders },
      payload: {
        email: 'jwt@example.com',
        password: 'password123',
        firstname: 'JWT',
        lastname: 'Test',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.split('.')).toHaveLength(3);
    expect(body.user.profile).toBeDefined();
    expect(body.user.services).toBeUndefined();
  });

  it('rejects duplicate email', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    await createTestUser({ email: 'dup@example.com' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...csrfHeaders },
      payload: {
        email: 'dup@example.com',
        password: 'password123',
        firstname: 'Dup',
        lastname: 'User',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.message).toMatch(/already registered/i);
  });

  it('rejects missing required fields', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...csrfHeaders },
      payload: {
        email: 'missing@example.com',
      },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------- POST /api/v1/auth/login ----------
describe('POST /api/v1/auth/login', () => {
  it('returns JWT with valid credentials', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    await createTestUser({ email: 'login@example.com', password: 'password123' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...csrfHeaders },
      payload: {
        email: 'login@example.com',
        password: 'password123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe('string');
  });

  it('rejects wrong password', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    await createTestUser({ email: 'wrong@example.com', password: 'password123' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...csrfHeaders },
      payload: {
        email: 'wrong@example.com',
        password: 'wrongpassword',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.message).toMatch(/invalid/i);
  });

  it('rejects non-existent email', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...csrfHeaders },
      payload: {
        email: 'nonexistent@example.com',
        password: 'password123',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.message).toMatch(/invalid/i);
  });

  it('returns user profile without services field', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    await createTestUser({ email: 'profile@example.com', password: 'password123' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...csrfHeaders },
      payload: {
        email: 'profile@example.com',
        password: 'password123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toBeDefined();
    expect(body.user.services).toBeUndefined();
    expect(body.user.profile).toBeDefined();
  });

  it('finds mixed-case email user (case-insensitive lookup)', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    // Simulate a user stored with mixed-case email
    const User = (await import('../../src/models/User.js')).default;
    const hashedPassword = await User.hashPassword('password123');
    await User.create({
      emails: [{ address: 'John.Doe@University.Edu', verified: true }],
      services: { password: { hash: hashedPassword } },
      profile: { firstname: 'John', lastname: 'Doe', roles: ['student'] },
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...csrfHeaders },
      payload: {
        email: 'john.doe@university.edu',
        password: 'password123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.user).toBeDefined();
    expect(body.user.profile.firstname).toBe('John');
  });

  it('requires password reset for legacy bcrypt users', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const User = (await import('../../src/models/User.js')).default;
    await User.create({
      emails: [{ address: 'legacy@example.com', verified: true }],
      services: { password: { bcrypt: '$2a$10$RpS898ow7xM8/7VsgV.CRO07nMYdzt5t62DZXEejz75DbUIH.clgm' } },
      profile: { firstname: 'Legacy', lastname: 'User', roles: ['student'] },
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...csrfHeaders },
      payload: {
        email: 'legacy@example.com',
        password: 'anything',
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe('PASSWORD_RESET_REQUIRED');
    expect(body.requiresPasswordReset).toBe(true);
    expect(body.reason).toBe('legacy_hash');
    expect(body.message).toMatch(/reset/i);
  });

  it('requires password reset when no local password is set', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const User = (await import('../../src/models/User.js')).default;
    await User.create({
      emails: [{ address: 'nopass@example.com', verified: true }],
      services: {},
      profile: { firstname: 'No', lastname: 'Password', roles: ['student'] },
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...csrfHeaders },
      payload: {
        email: 'nopass@example.com',
        password: 'anything',
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe('PASSWORD_RESET_REQUIRED');
    expect(body.requiresPasswordReset).toBe(true);
    expect(body.reason).toBe('no_local_password');
    expect(body.message).toMatch(/reset/i);
  });

  it('allows login when argon2 hash exists even if legacy bcrypt field is present', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const User = (await import('../../src/models/User.js')).default;
    const hashedPassword = await User.hashPassword('password123');
    await User.create({
      emails: [{ address: 'dual@example.com', verified: true }],
      services: {
        password: {
          hash: hashedPassword,
          bcrypt: '$2a$10$RpS898ow7xM8/7VsgV.CRO07nMYdzt5t62DZXEejz75DbUIH.clgm',
        },
      },
      profile: { firstname: 'Dual', lastname: 'Mode', roles: ['student'] },
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...csrfHeaders },
      payload: {
        email: 'dual@example.com',
        password: 'password123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.user).toBeDefined();
  });
});

// ---------- POST /api/v1/auth/logout ----------
describe('POST /api/v1/auth/logout', () => {
  it('returns success', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { ...csrfHeaders },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });
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
    expect(body.user.emails[0].address).toBe('me@example.com');
    expect(body.user.services).toBeUndefined();
  });

  it('returns 401 without token', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ---------- PATCH /api/v1/users/me ----------
describe('PATCH /api/v1/users/me', () => {
  it('updates firstname and lastname', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const user = await createTestUser({ email: 'update@example.com' });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'PATCH', '/api/v1/users/me', {
      token,
      payload: { firstname: 'Updated', lastname: 'Name' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.profile.firstname).toBe('Updated');
    expect(body.profile.lastname).toBe('Name');
  });
});

// ---------- GET /api/v1/users (admin only) ----------
describe('GET /api/v1/users', () => {
  it('returns paginated user list for admin', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const admin = await createTestUser({ email: 'admin@example.com', roles: ['admin'] });
    await createTestUser({ email: 'user1@example.com' });
    await createTestUser({ email: 'user2@example.com' });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/users', { token });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.users).toBeDefined();
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.total).toBe(3);
    expect(body.page).toBe(1);
    expect(body.pages).toBeGreaterThanOrEqual(1);
  });

  it('returns 403 for non-admin', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const student = await createTestUser({ email: 'student@example.com', roles: ['student'] });
    const token = await getAuthToken(app, student);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/users', { token });

    expect(res.statusCode).toBe(403);
  });

  it('supports search parameter', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const admin = await createTestUser({
      email: 'admin@example.com',
      roles: ['admin'],
      firstname: 'Admin',
    });
    await createTestUser({ email: 'alice@example.com', firstname: 'Alice', lastname: 'Smith' });
    await createTestUser({ email: 'bob@example.com', firstname: 'Bob', lastname: 'Jones' });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/users?search=Alice', { token });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0].profile.firstname).toBe('Alice');
  });
});

// ---------- PATCH /api/v1/users/:id/role (admin) ----------
describe('PATCH /api/v1/users/:id/role', () => {
  it('changes user role', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const admin = await createTestUser({ email: 'admin@example.com', roles: ['admin'] });
    const student = await createTestUser({ email: 'student@example.com', roles: ['student'] });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(
      app,
      'PATCH',
      `/api/v1/users/${student._id}/role`,
      { token, payload: { role: 'professor' } }
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.profile.roles).toContain('professor');
    expect(body.profile.roles).not.toContain('student');
  });

  it('admin cannot change their own role', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();
    const admin = await createTestUser({ email: 'admin@example.com', roles: ['admin'] });
    const token = await getAuthToken(app, admin);

    const res = await authenticatedRequest(
      app,
      'PATCH',
      `/api/v1/users/${admin._id}/role`,
      { token, payload: { role: 'student' } }
    );

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.message).toMatch(/cannot change their own role/i);
  });
});
