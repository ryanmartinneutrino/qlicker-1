import fs from 'fs/promises';
import { expect } from '@playwright/test';

const STATE_FILE = process.env.QCLICKER_E2E_STATE_FILE || '/tmp/qlicker-e2e-state.json';
const CSRF_HEADERS = { 'X-Requested-With': 'XMLHttpRequest' };

let cachedState = null;

export const PASSWORD = 'Password123!';

function buildHeaders(token) {
  return token
    ? { ...CSRF_HEADERS, Authorization: `Bearer ${token}` }
    : { ...CSRF_HEADERS };
}

export async function readE2eState() {
  if (cachedState) return cachedState;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const raw = await fs.readFile(STATE_FILE, 'utf8');
      cachedState = JSON.parse(raw);
      return cachedState;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Timed out waiting for E2E state file: ${STATE_FILE}`);
}

export async function apiJson(request, method, path, { token, payload } = {}) {
  const { serverBaseUrl } = await readE2eState();
  const response = await request.fetch(`${serverBaseUrl}/api/v1${path}`, {
    method,
    headers: buildHeaders(token),
    data: payload,
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

export function uniqueSuffix(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildUser(prefix, roleLabel = prefix) {
  const suffix = uniqueSuffix(prefix);
  return {
    firstname: 'E2E',
    lastname: roleLabel,
    email: `${suffix}@example.com`,
    password: PASSWORD,
  };
}

export async function seedUsers(request, options = {}) {
  const adminUser = buildUser('admin', 'Admin');
  const { response: registerResponse, body: registerBody } = await apiJson(request, 'POST', '/auth/register', {
    payload: adminUser,
  });
  expect(registerResponse.status(), JSON.stringify(registerBody)).toBe(201);

  const admin = {
    ...adminUser,
    token: registerBody.token,
    user: registerBody.user,
  };

  const result = { admin };

  if (options.professor !== false) {
    const professorUser = buildUser('professor', 'Professor');
    const { response, body } = await apiJson(request, 'POST', '/users', {
      token: admin.token,
      payload: {
        ...professorUser,
        role: 'professor',
      },
    });
    expect(response.status(), JSON.stringify(body)).toBe(201);
    const professorLogin = await loginViaApi(request, professorUser.email, professorUser.password);
    result.professor = {
      ...professorUser,
      token: professorLogin.token,
      user: body,
    };
  }

  if (options.student !== false) {
    const studentUser = buildUser('student', 'Student');
    const { response, body } = await apiJson(request, 'POST', '/users', {
      token: admin.token,
      payload: {
        ...studentUser,
        role: 'student',
      },
    });
    expect(response.status(), JSON.stringify(body)).toBe(201);
    const studentLogin = await loginViaApi(request, studentUser.email, studentUser.password);
    result.student = {
      ...studentUser,
      token: studentLogin.token,
      user: body,
    };
  }

  return result;
}

export async function loginViaUi(page, email, password, expectedPathPattern) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^Login$/ }).click();
  await expect(page).toHaveURL(expectedPathPattern);
}

export async function loginViaApi(request, email, password) {
  const { response, body } = await apiJson(request, 'POST', '/auth/login', {
    payload: { email, password },
  });
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body;
}

export async function createCourseViaApi(request, token, overrides = {}) {
  const payload = {
    name: overrides.name || `Course ${uniqueSuffix('course')}`,
    deptCode: overrides.deptCode || 'CS',
    courseNumber: overrides.courseNumber || '101',
    section: overrides.section || '001',
    semester: overrides.semester || 'Fall 2026',
  };
  const { response, body } = await apiJson(request, 'POST', '/courses', {
    token,
    payload,
  });
  expect(response.status(), JSON.stringify(body)).toBe(201);
  return body.course;
}

export async function createSessionViaApi(request, token, courseId, overrides = {}) {
  const payload = {
    name: overrides.name || `Session ${uniqueSuffix('session')}`,
    ...overrides,
  };
  const { response, body } = await apiJson(request, 'POST', `/courses/${courseId}/sessions`, {
    token,
    payload,
  });
  expect(response.status(), JSON.stringify(body)).toBe(201);
  return body.session;
}

export async function patchSessionViaApi(request, token, sessionId, payload) {
  const { response, body } = await apiJson(request, 'PATCH', `/sessions/${sessionId}`, {
    token,
    payload,
  });
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body.session || body;
}

export async function createQuestionViaApi(request, token, payload = {}) {
  const { response, body } = await apiJson(request, 'POST', '/questions', {
    token,
    payload: {
      type: 0,
      content: payload.content || 'What is 2 + 2?',
      options: payload.options || [
        { answer: '3', correct: false },
        { answer: '4', correct: true },
      ],
      ...payload,
    },
  });
  expect(response.status(), JSON.stringify(body)).toBe(201);
  return body.question;
}

export async function addQuestionToSessionViaApi(request, token, sessionId, questionId) {
  const { response, body } = await apiJson(request, 'POST', `/sessions/${sessionId}/questions`, {
    token,
    payload: { questionId },
  });
  expect(response.status(), JSON.stringify(body)).toBe(200);
}

export async function enrollStudentViaApi(request, token, enrollmentCode) {
  const { response, body } = await apiJson(request, 'POST', '/courses/enroll', {
    token,
    payload: { enrollmentCode },
  });
  expect(response.status(), JSON.stringify(body)).toBe(200);
}
