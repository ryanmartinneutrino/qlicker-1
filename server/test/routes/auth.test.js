import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, createTestUser, getAuthToken, authenticatedRequest } from '../helpers.js';

let app;

beforeEach(async () => {
  app = await createApp();
});

afterEach(async () => {
  await app.close();
});

// ---------- POST /api/v1/auth/register ----------
describe('POST /api/v1/auth/register', () => {
  it('creates a new user with valid data', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
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

  it('first user becomes admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
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

  it('second user becomes student', async () => {
    // Create first user (admin)
    await createTestUser({ email: 'first@example.com', roles: ['admin'] });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
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

  it('returns JWT token and user profile', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
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
    expect(body.token.split('.')).toHaveLength(3); // JWT has 3 parts
    expect(body.user.profile).toBeDefined();
    expect(body.user.services).toBeUndefined(); // sanitized
  });

  it('rejects duplicate email', async () => {
    await createTestUser({ email: 'dup@example.com' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
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

  it('rejects missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'missing@example.com',
      },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------- POST /api/v1/auth/login ----------
describe('POST /api/v1/auth/login', () => {
  it('returns JWT with valid credentials', async () => {
    await createTestUser({ email: 'login@example.com', password: 'password123' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
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

  it('rejects wrong password', async () => {
    await createTestUser({ email: 'wrong@example.com', password: 'password123' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'wrong@example.com',
        password: 'wrongpassword',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.message).toMatch(/invalid/i);
  });

  it('rejects non-existent email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'nonexistent@example.com',
        password: 'password123',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.message).toMatch(/invalid/i);
  });

  it('returns user profile without services field', async () => {
    await createTestUser({ email: 'profile@example.com', password: 'password123' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
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
});

// ---------- POST /api/v1/auth/logout ----------
describe('POST /api/v1/auth/logout', () => {
  it('returns success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });
});

// ---------- GET /api/v1/users/me ----------
describe('GET /api/v1/users/me', () => {
  it('returns current user profile', async () => {
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

  it('returns 401 without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ---------- PATCH /api/v1/users/me ----------
describe('PATCH /api/v1/users/me', () => {
  it('updates firstname and lastname', async () => {
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
  it('returns paginated user list for admin', async () => {
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

  it('returns 403 for non-admin', async () => {
    const student = await createTestUser({ email: 'student@example.com', roles: ['student'] });
    const token = await getAuthToken(app, student);

    const res = await authenticatedRequest(app, 'GET', '/api/v1/users', { token });

    expect(res.statusCode).toBe(403);
  });

  it('supports search parameter', async () => {
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
  it('changes user role', async () => {
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
});
