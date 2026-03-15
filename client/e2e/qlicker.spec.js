import { test, expect } from '@playwright/test';
import {
  addQuestionToSessionViaApi,
  apiJson,
  buildUser,
  createCourseViaApi,
  createQuestionViaApi,
  createSessionViaApi,
  enrollStudentViaApi,
  loginViaApi,
  loginViaUi,
  patchSessionViaApi,
  seedUsers,
} from './helpers.js';

test('login flow redirects an admin user to the admin dashboard', async ({ page, request }) => {
  const { admin } = await seedUsers(request, { professor: false, student: false });

  await loginViaUi(page, admin.email, admin.password, /\/admin$/);

  await expect(page).toHaveURL(/\/admin$/);
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
});

test('session creation flow lets a professor create a session and open the editor', async ({ page, request }) => {
  const { professor } = await seedUsers(request, { student: false });
  const course = await createCourseViaApi(request, professor.token);
  const sessionName = `Session ${Date.now()}`;

  await loginViaUi(page, professor.email, professor.password, /\/manage$/);
  await page.goto(`/manage/course/${course._id}`);

  await page.getByRole('button', { name: /create session/i }).click();
  await page.getByLabel(/session name/i).fill(sessionName);
  await page.getByLabel(/description/i).fill('Created from Playwright');
  await page.getByRole('button', { name: /^Create$/ }).click();

  await expect(page.getByText(sessionName)).toBeVisible();
  await page.getByText(sessionName).click();
  await expect(page).toHaveURL(/\/manage\/course\/.+\/session\/.+/);
  await expect(page.getByDisplayValue(sessionName)).toBeVisible();
});

test('live session flow lets a student join with a passcode and submit a response', async ({ browser, request }) => {
  const { professor, student } = await seedUsers(request);
  const course = await createCourseViaApi(request, professor.token);
  await enrollStudentViaApi(request, student.token, course.enrollmentCode);

  const sessionName = `Live ${Date.now()}`;
  const session = await createSessionViaApi(request, professor.token, course._id, { name: sessionName });
  const question = await createQuestionViaApi(request, professor.token, {
    sessionId: session._id,
    courseId: course._id,
    content: 'What is 2 + 2?',
  });
  await addQuestionToSessionViaApi(request, professor.token, session._id, question._id);

  const professorContext = await browser.newContext();
  const professorPage = await professorContext.newPage();
  await loginViaUi(professorPage, professor.email, professor.password, /\/manage$/);
  await professorPage.goto(`/manage/course/${course._id}`);
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
  await studentPage.goto(`/student/course/${course._id}`);
  await studentPage.getByText(sessionName).click();
  await expect(studentPage).toHaveURL(new RegExp(`/student/course/${course._id}/session/${session._id}/live$`));

  await studentPage.getByLabel('Join code').fill(joinCode);
  await studentPage.getByRole('button', { name: /join session/i }).click();
  await expect(studentPage.getByText('What is 2 + 2?')).toBeVisible();
  await studentPage.getByLabel('Option B').check();
  await studentPage.getByRole('button', { name: /submit response/i }).click();
  await expect(studentPage.getByText(/submitted/i)).toBeVisible();

  await professorContext.close();
  await studentContext.close();
});

test('quiz and grading flows cover student submission and instructor grade recalculation', async ({ browser, request }) => {
  const { professor, student } = await seedUsers(request);
  const course = await createCourseViaApi(request, professor.token);
  await enrollStudentViaApi(request, student.token, course.enrollmentCode);

  const quizSession = await createSessionViaApi(request, professor.token, course._id, {
    name: `Quiz ${Date.now()}`,
    quiz: true,
    status: 'visible',
    quizStart: new Date(Date.now() - 60_000).toISOString(),
    quizEnd: new Date(Date.now() + (60 * 60 * 1000)).toISOString(),
  });
  const question = await createQuestionViaApi(request, professor.token, {
    sessionId: quizSession._id,
    courseId: course._id,
    content: 'Select the correct answer',
  });
  await addQuestionToSessionViaApi(request, professor.token, quizSession._id, question._id);

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await loginViaUi(studentPage, student.email, student.password, /\/student$/);
  await studentPage.goto(`/student/course/${course._id}?tab=1`);
  await studentPage.getByText(quizSession.name).click();
  await expect(studentPage).toHaveURL(new RegExp(`/student/course/${course._id}/session/${quizSession._id}/quiz$`));
  await studentPage.getByLabel('Option B').check();
  await studentPage.getByRole('button', { name: /submit quiz/i }).click();
  await expect(studentPage).toHaveURL(new RegExp(`/student/course/${course._id}(\\?tab=1)?$`));

  await patchSessionViaApi(request, professor.token, quizSession._id, {
    status: 'done',
    reviewable: true,
  });

  const professorContext = await browser.newContext();
  const professorPage = await professorContext.newPage();
  await loginViaUi(professorPage, professor.email, professor.password, /\/manage$/);
  await professorPage.goto(`/manage/course/${course._id}?tab=2`);
  await professorPage.getByRole('button', { name: /show grade table/i }).click();
  await professorPage.getByText(quizSession.name).click();
  await professorPage.getByRole('button', { name: /^Show Table$/i }).click();
  await professorPage.getByRole('button', { name: /recalculate all/i }).click();
  await expect(professorPage.getByText(student.email)).toBeVisible();

  await studentContext.close();
  await professorContext.close();
});

test('legacy DB compatibility keeps case-insensitive email login working for student records', async ({ page, request }) => {
  const { admin } = await seedUsers(request, { professor: false, student: false });
  const professorSeed = buildUser('legacy-professor', 'Professor');
  const studentSeed = buildUser('legacy-student', 'Student');

  const createProfessor = await apiJson(request, 'POST', '/users', {
    token: admin.token,
    payload: {
      ...professorSeed,
      role: 'professor',
    },
  });
  expect(createProfessor.response.status(), JSON.stringify(createProfessor.body)).toBe(201);

  const createStudent = await apiJson(request, 'POST', '/users', {
    token: admin.token,
    payload: {
      ...studentSeed,
      role: 'student',
    },
  });
  expect(createStudent.response.status(), JSON.stringify(createStudent.body)).toBe(201);

  const professorLogin = await loginViaApi(request, professorSeed.email, professorSeed.password);
  const studentLogin = await loginViaApi(request, studentSeed.email, studentSeed.password);
  const course = await createCourseViaApi(request, professorLogin.token, { name: 'Legacy Login Course' });
  await enrollStudentViaApi(request, studentLogin.token, course.enrollmentCode);

  await loginViaUi(page, studentSeed.email.toUpperCase(), studentSeed.password, /\/student$/);
  await expect(page.getByText('Legacy Login Course')).toBeVisible();
});
