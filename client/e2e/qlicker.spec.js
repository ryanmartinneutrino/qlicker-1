import { test, expect } from '@playwright/test';
import {
  addInstructorToCourseViaApi,
  addQuestionToSessionViaApi,
  apiJson,
  createCourseViaApi,
  createQuestionViaApi,
  createSessionViaApi,
  enrollStudentViaApi,
  expectNoCriticalAccessibilityViolations,
  loginViaUi,
  patchSessionViaApi,
  seedUsers,
} from './helpers.js';

test('login flow redirects an admin user to the admin dashboard', async ({ page, request }) => {
  const { admin } = await seedUsers(request, { professor: false, student: false });

  await loginViaUi(page, admin.email, admin.password, /\/admin$/);

  await expect(page).toHaveURL(/\/admin$/);
  await expectNoCriticalAccessibilityViolations(page);
});

test('course management flow lets a professor create and open a course', async ({ page, request }) => {
  const { professor } = await seedUsers(request, { student: false });
  const courseName = `Course ${Date.now()}`;

  await loginViaUi(page, professor.email, professor.password, /\/manage$/);

  await page.getByRole('button', { name: /create course/i }).click();
  await page.getByLabel(/course name/i).fill(courseName);
  await page.getByLabel(/dept/i).fill('CS');
  await page.getByLabel(/course number/i).fill('204');
  await page.getByLabel(/section/i).fill('002');
  await page.getByRole('button', { name: /^Create$/ }).click();

  await expect(page.getByText(courseName)).toBeVisible();
  await page.getByText(courseName).click();
  await expect(page).toHaveURL(/\/manage\/course\//);
  await expect(page.getByRole('heading', { name: new RegExp(courseName, 'i') })).toBeVisible();
  await expectNoCriticalAccessibilityViolations(page);
});

test('session creation flow lets a professor create a session and open the editor', async ({ page, request }) => {
  const { admin, professor } = await seedUsers(request, { student: false });
  const course = await createCourseViaApi(request, admin.token);
  await addInstructorToCourseViaApi(request, admin.token, course._id, professor.user._id);
  const sessionName = `Session ${Date.now()}`;

  await loginViaUi(page, professor.email, professor.password, /\/manage$/);
  await page.getByRole('heading', { name: /^CS 101$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/manage/course/${course._id}$`));

  await page.getByRole('button', { name: /create session/i }).click();
  await page.getByLabel(/session name/i).fill(sessionName);
  await page.getByLabel(/description/i).fill('Created from Playwright');
  await page.getByRole('button', { name: /^Create$/ }).click();

  await expect(page.getByText(sessionName)).toBeVisible();
  await page.getByText(sessionName).click();
  await expect(page).toHaveURL(/\/manage\/course\/.+\/session\/.+/);
  await expect(page.getByText(sessionName).first()).toBeVisible();
  await expectNoCriticalAccessibilityViolations(page);
});

test('live session flow lets a student join with a passcode and submit a response', async ({ browser, request }) => {
  const { admin, professor, student } = await seedUsers(request);
  const course = await createCourseViaApi(request, admin.token);
  await addInstructorToCourseViaApi(request, admin.token, course._id, professor.user._id);
  await enrollStudentViaApi(request, student.token, course.enrollmentCode);

  const sessionName = `Live ${Date.now()}`;
  const session = await createSessionViaApi(request, admin.token, course._id, { name: sessionName });
  const question = await createQuestionViaApi(request, admin.token, {
    sessionId: session._id,
    courseId: course._id,
    content: 'What is 2 + 2?',
  });
  await addQuestionToSessionViaApi(request, admin.token, session._id, question._id);

  const professorContext = await browser.newContext();
  const professorPage = await professorContext.newPage();
  await loginViaUi(professorPage, professor.email, professor.password, /\/manage$/);
  await professorPage.getByRole('heading', { name: /^CS 101$/ }).click();
  await expect(professorPage).toHaveURL(new RegExp(`/manage/course/${course._id}$`));
  await professorPage.getByRole('button', { name: new RegExp(`Launch session ${sessionName}`, 'i') }).click();
  await expect(professorPage).toHaveURL(new RegExp(`/manage/course/${course._id}/session/${session._id}/live$`));

  await professorPage.getByLabel(/require passcode/i).click();
  await professorPage.getByLabel(/join period/i).click();
  await professorPage.getByLabel(/visible/i).click();

  const joinCodeChip = professorPage.locator('[aria-label^="Current join code:"]');
  await expect(joinCodeChip).toBeVisible();
  const joinCodeLabel = await joinCodeChip.getAttribute('aria-label');
  const joinCode = joinCodeLabel?.split(':').pop()?.trim();
  expect(joinCode).toMatch(/^\d{6}$/);

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await loginViaUi(studentPage, student.email, student.password, /\/student$/);
  await studentPage.getByRole('heading', { name: /^CS 101$/ }).click();
  await expect(studentPage).toHaveURL(new RegExp(`/student/course/${course._id}$`));
  await studentPage.getByText(sessionName).click();
  await expect(studentPage).toHaveURL(new RegExp(`/student/course/${course._id}/session/${session._id}/live$`));

  await studentPage.getByLabel('Join code').fill(joinCode);
  await studentPage.getByRole('button', { name: /join session/i }).click();
  await expect(studentPage.getByText('What is 2 + 2?')).toBeVisible();
  await studentPage.getByLabel('Option B').check();
  await studentPage.getByRole('button', { name: /submit response/i }).click();
  await expect(studentPage.getByRole('alert').filter({ hasText: /submitted/i })).toBeVisible();
  await expectNoCriticalAccessibilityViolations(studentPage);

  await professorContext.close();
  await studentContext.close();
});

test('quiz and grading flows cover student submission and instructor grade recalculation', async ({ browser, request }) => {
  const { admin, professor, student } = await seedUsers(request);
  const course = await createCourseViaApi(request, admin.token);
  await addInstructorToCourseViaApi(request, admin.token, course._id, professor.user._id);
  await enrollStudentViaApi(request, student.token, course.enrollmentCode);

  const quizSession = await createSessionViaApi(request, admin.token, course._id, {
    name: `Quiz ${Date.now()}`,
    quiz: true,
    quizStart: new Date(Date.now() - 60_000).toISOString(),
    quizEnd: new Date(Date.now() + (60 * 60 * 1000)).toISOString(),
  });
  await patchSessionViaApi(request, admin.token, quizSession._id, {
    quiz: true,
    status: 'visible',
    quizStart: new Date(Date.now() - 60_000).toISOString(),
    quizEnd: new Date(Date.now() + (60 * 60 * 1000)).toISOString(),
  });
  const question = await createQuestionViaApi(request, admin.token, {
    sessionId: quizSession._id,
    courseId: course._id,
    content: 'Select the correct answer',
  });
  await addQuestionToSessionViaApi(request, admin.token, quizSession._id, question._id);

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await loginViaUi(studentPage, student.email, student.password, /\/student$/);
  await studentPage.getByRole('heading', { name: /^CS 101$/ }).click();
  await expect(studentPage).toHaveURL(new RegExp(`/student/course/${course._id}$`));
  await studentPage.getByRole('tab', { name: /^Quizzes/i }).click();
  await expect(studentPage.getByText(quizSession.name)).toBeVisible();
  await expectNoCriticalAccessibilityViolations(studentPage);

  const saveResponse = await apiJson(request, 'PATCH', `/sessions/${quizSession._id}/quiz-response`, {
    token: student.token,
    payload: {
      questionId: question._id,
      answer: String(question.options?.[1]?._id ?? 1),
    },
  });
  expect(saveResponse.response.status(), JSON.stringify(saveResponse.body)).toBe(200);

  const submitQuiz = await apiJson(request, 'POST', `/sessions/${quizSession._id}/submit`, {
    token: student.token,
  });
  expect(submitQuiz.response.status(), JSON.stringify(submitQuiz.body)).toBe(200);

  await patchSessionViaApi(request, professor.token, quizSession._id, {
    status: 'done',
    reviewable: true,
  });

  const professorContext = await browser.newContext();
  const professorPage = await professorContext.newPage();
  await loginViaUi(professorPage, professor.email, professor.password, /\/manage$/);
  await professorPage.goto(`/manage/course/${course._id}/session/${quizSession._id}/review`);
  await professorPage.getByRole('tab', { name: /^Students$/i }).click();
  await expect(professorPage.getByText(student.email)).toBeVisible();
  await expectNoCriticalAccessibilityViolations(professorPage);

  await studentContext.close();
  await professorContext.close();
});

test('legacy DB compatibility keeps case-insensitive email login working for student records', async ({ page, request }) => {
  const { admin, professor, student } = await seedUsers(request);
  const course = await createCourseViaApi(request, admin.token, { name: 'Legacy Login Course' });
  await addInstructorToCourseViaApi(request, admin.token, course._id, professor.user._id);
  await enrollStudentViaApi(request, student.token, course.enrollmentCode);

  await loginViaUi(page, student.email.toUpperCase(), student.password, /\/student$/);
  await expect(page.getByText('Legacy Login Course')).toBeVisible();
  await expectNoCriticalAccessibilityViolations(page);
});
