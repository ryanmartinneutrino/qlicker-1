import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  addInstructorToCourseViaApi,
  addQuestionToSessionViaApi,
  apiJson,
  clearCachedAuthState,
  createCourseViaApi,
  createQuestionViaApi,
  createSessionViaApi,
  enrollStudentViaApi,
  expectNoCriticalAccessibilityViolations,
  findUserByEmailViaApi,
  loginViaUi,
  patchSessionViaApi,
  seedUsers,
} from './helpers.js';

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * 60 * 1000;

async function closeContextSafely(context) {
  if (!context) return;
  try {
    await context.close();
  } catch (error) {
    const message = String(error?.message || error || '');
    if (!message.includes('ENOENT')) {
      throw error;
    }
  }
}

test('login flow redirects an admin user to the admin dashboard', async ({ page, request }) => {
  const { admin } = await seedUsers(request, { professor: false, student: false });

  await loginViaUi(page, admin.email, admin.password, /\/admin$/);

  await expect(page).toHaveURL(/\/admin$/);
  await expectNoCriticalAccessibilityViolations(page);
});

test('backup settings flow lets an admin save scheduled backup preferences', async ({ page, request }) => {
  const { admin } = await seedUsers(request, { professor: false, student: false });

  await loginViaUi(page, admin.email, admin.password, /\/admin$/);
  await page.getByRole('tab', { name: /^Backup$/i }).click();

  const backupEnabledCheckbox = page.getByRole('checkbox', { name: /enable scheduled backups/i });
  await expect(backupEnabledCheckbox).toBeVisible();
  await expect(page.getByLabel(/backup time \(local\)/i)).toBeVisible();
  await expect(page.getByText(/no backup runs recorded yet\./i)).toBeVisible();

  await backupEnabledCheckbox.check();
  await page.getByLabel(/backup time \(local\)/i).fill('03:45');
  await page.getByLabel(/daily backups to keep/i).fill('5');
  await page.getByLabel(/weekly backups to keep/i).fill('2');
  await page.getByLabel(/monthly backups to keep/i).fill('8');

  await expect.poll(async () => {
    const { response, body } = await apiJson(request, 'GET', '/settings', { token: admin.token });
    expect(response.status(), JSON.stringify(body)).toBe(200);
    return {
      backupEnabled: body.backupEnabled,
      backupRetentionDaily: body.backupRetentionDaily,
      backupRetentionMonthly: body.backupRetentionMonthly,
      backupRetentionWeekly: body.backupRetentionWeekly,
      backupTimeLocal: body.backupTimeLocal,
    };
  }).toEqual({
    backupEnabled: true,
    backupRetentionDaily: 5,
    backupRetentionMonthly: 8,
    backupRetentionWeekly: 2,
    backupTimeLocal: '03:45',
  });

  await page.reload();
  await page.getByRole('tab', { name: /^Backup$/i }).click();
  await expect(backupEnabledCheckbox).toBeChecked();
  await expect(page.getByLabel(/backup time \(local\)/i)).toHaveValue('03:45');
  await expect(page.getByLabel(/daily backups to keep/i)).toHaveValue('5');
  await expect(page.getByLabel(/weekly backups to keep/i)).toHaveValue('2');
  await expect(page.getByLabel(/monthly backups to keep/i)).toHaveValue('8');
  await expectNoCriticalAccessibilityViolations(page);
});

test('account disable flow blocks login until an admin restores the user', async ({ browser, page, request }) => {
  const { admin, student } = await seedUsers(request, { professor: false });

  await clearCachedAuthState(student.email);
  await loginViaUi(page, admin.email, admin.password, /\/admin$/);
  await page.getByRole('tab', { name: /^Users$/i }).click();

  const searchField = page.getByPlaceholder(/search by name or email/i);
  await searchField.fill(student.email);

  const studentRow = page.locator('tr', { hasText: student.email }).first();
  await expect(studentRow).toBeVisible();
  await studentRow.getByRole('button', { name: /^Disable user$/i }).click();
  await expect(page.getByText(/^User disabled$/i)).toBeVisible();

  await expect.poll(async () => {
    const user = await findUserByEmailViaApi(request, admin.token, student.email);
    return user?.disabled === true;
  }).toBe(true);

  const blockedApiResponse = await apiJson(request, 'GET', '/users/me', {
    token: student.token,
  });
  expect(blockedApiResponse.response.status(), JSON.stringify(blockedApiResponse.body)).toBe(403);
  expect(blockedApiResponse.body?.code).toBe('ACCOUNT_DISABLED');

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await clearCachedAuthState(student.email);
  await studentPage.goto('/login');
  await studentPage.getByLabel('Email').fill(student.email);
  await studentPage.getByLabel('Password').fill(student.password);
  await studentPage.getByRole('button', { name: /^Login$/ }).click();
  await expect(studentPage.getByRole('alert')).toContainText(/this account has been disabled/i);
  await expect(studentPage).toHaveURL(/\/login$/);
  await closeContextSafely(studentContext);

  await studentRow.getByRole('button', { name: /^Restore user$/i }).click();
  await expect(page.getByText(/^User restored$/i)).toBeVisible();

  await expect.poll(async () => {
    const user = await findUserByEmailViaApi(request, admin.token, student.email);
    return user?.disabled === true;
  }).toBe(false);

  await clearCachedAuthState(student.email);
  const restoredStudentContext = await browser.newContext();
  const restoredStudentPage = await restoredStudentContext.newPage();
  await loginViaUi(restoredStudentPage, student.email, student.password, /\/student$/);
  await expect(restoredStudentPage).toHaveURL(/\/student$/);
  await closeContextSafely(restoredStudentContext);
  await expectNoCriticalAccessibilityViolations(page);
});

test('course management flow lets a professor create and open a course', async ({ page, request }) => {
  const { professor } = await seedUsers(request, { student: false });
  const courseName = `Course ${Date.now()}`;

  await loginViaUi(page, professor.email, professor.password, /\/prof$/);

  await page.getByRole('button', { name: /create course/i }).click();
  await page.getByLabel(/course name/i).fill(courseName);
  await page.getByLabel(/dept/i).fill('CS');
  await page.getByLabel(/course number/i).fill('204');
  await page.getByLabel(/section/i).fill('002');
  await page.getByRole('button', { name: /^Create$/ }).click();

  await expect(page.getByText(courseName)).toBeVisible();
  await page.getByText(courseName).click();
  await expect(page).toHaveURL(/\/prof\/course\//);
  await expect(page.getByRole('heading', { name: new RegExp(courseName, 'i') })).toBeVisible();
  await expectNoCriticalAccessibilityViolations(page);
});

test('session creation flow lets a professor create a session and open the editor', async ({ page, request }) => {
  const { admin, professor } = await seedUsers(request, { student: false });
  const course = await createCourseViaApi(request, admin.token);
  await addInstructorToCourseViaApi(request, admin.token, course._id, professor.user._id);
  const sessionName = `Session ${Date.now()}`;

  await loginViaUi(page, professor.email, professor.password, /\/prof$/);
  await page.getByRole('heading', { name: /^CS 101$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/prof/course/${course._id}$`));

  await page.getByRole('button', { name: /create session/i }).click();
  await page.getByLabel(/session name/i).fill(sessionName);
  await page.getByLabel(/description/i).fill('Created from Playwright');
  await page.getByRole('button', { name: /^Create$/ }).click();

  await expect(page.getByText(sessionName)).toBeVisible();
  await page.getByText(sessionName).click();
  await expect(page).toHaveURL(/\/prof\/course\/.+\/session\/.+/);
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
  await loginViaUi(professorPage, professor.email, professor.password, /\/prof$/);
  await professorPage.goto(`/prof/course/${course._id}`);
  await expect(professorPage).toHaveURL(new RegExp(`/prof/course/${course._id}$`));
  await professorPage.getByRole('button', { name: new RegExp(`Launch session ${sessionName}`, 'i') }).click();
  await expect(professorPage).toHaveURL(new RegExp(`/prof/course/${course._id}/session/${session._id}/live$`));

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

  await closeContextSafely(professorContext);
  await closeContextSafely(studentContext);
});

test('quiz and grading flows cover student submission and instructor grade recalculation', async ({ browser, request }) => {
  const { admin, professor, student } = await seedUsers(request);
  const course = await createCourseViaApi(request, admin.token);
  await addInstructorToCourseViaApi(request, admin.token, course._id, professor.user._id);
  await enrollStudentViaApi(request, student.token, course.enrollmentCode);

  const quizSession = await createSessionViaApi(request, admin.token, course._id, {
    name: `Quiz ${Date.now()}`,
    quiz: true,
    quizStart: new Date(Date.now() - ONE_MINUTE_MS).toISOString(),
    quizEnd: new Date(Date.now() + ONE_HOUR_MS).toISOString(),
  });
  await patchSessionViaApi(request, admin.token, quizSession._id, {
    quiz: true,
    status: 'visible',
    quizStart: new Date(Date.now() - ONE_MINUTE_MS).toISOString(),
    quizEnd: new Date(Date.now() + ONE_HOUR_MS).toISOString(),
  });
  const question = await createQuestionViaApi(request, admin.token, {
    sessionId: quizSession._id,
    courseId: course._id,
    content: 'Select the correct answer',
  });
  const updatedQuizSession = await addQuestionToSessionViaApi(request, admin.token, quizSession._id, question._id);
  const quizQuestionId = String(updatedQuizSession.questions.at(-1));

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await loginViaUi(studentPage, student.email, student.password, /\/student$/);
  await studentPage.goto(`/student/course/${course._id}`);
  await expect(studentPage).toHaveURL(new RegExp(`/student/course/${course._id}$`));
  await studentPage.getByRole('tab', { name: /^Quizzes/i }).click();
  await expect(studentPage.getByText(quizSession.name)).toBeVisible();
  await expectNoCriticalAccessibilityViolations(studentPage);

  const saveResponse = await apiJson(request, 'PATCH', `/sessions/${quizSession._id}/quiz-response`, {
    token: student.token,
    payload: {
      questionId: quizQuestionId,
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
  });

  const professorContext = await browser.newContext();
  const professorPage = await professorContext.newPage();
  await loginViaUi(professorPage, professor.email, professor.password, /\/prof$/);
  await professorPage.goto(`/prof/course/${course._id}`);
  await expect(professorPage).toHaveURL(new RegExp(`/prof/course/${course._id}$`));
  await professorPage.getByRole('tab', { name: /^Quizzes/i }).click();
  await professorPage.getByText(quizSession.name).click();
  await expect(professorPage).toHaveURL(new RegExp(`/prof/course/${course._id}/session/${quizSession._id}/review`));
  await professorPage.getByRole('tab', { name: /^Students$/i }).click();
  await expect(professorPage.getByText(student.email)).toBeVisible();
  await expectNoCriticalAccessibilityViolations(professorPage);

  await closeContextSafely(studentContext);
  await closeContextSafely(professorContext);
});

test('manual grading flow lets a professor save a mark and export grades as CSV', async ({ page, request }) => {
  const { admin, professor, student } = await seedUsers(request);
  const course = await createCourseViaApi(request, admin.token, {
    name: `Grading ${Date.now()}`,
  });
  await addInstructorToCourseViaApi(request, admin.token, course._id, professor.user._id);
  await enrollStudentViaApi(request, student.token, course.enrollmentCode);

  const quizSession = await createSessionViaApi(request, admin.token, course._id, {
    name: `Manual Grade ${Date.now()}`,
    quiz: true,
    quizStart: new Date(Date.now() - ONE_MINUTE_MS).toISOString(),
    quizEnd: new Date(Date.now() + ONE_HOUR_MS).toISOString(),
  });
  await patchSessionViaApi(request, professor.token, quizSession._id, {
    quiz: true,
    status: 'visible',
    quizStart: new Date(Date.now() - ONE_MINUTE_MS).toISOString(),
    quizEnd: new Date(Date.now() + ONE_HOUR_MS).toISOString(),
  });
  const question = await createQuestionViaApi(request, admin.token, {
    type: 2,
    sessionId: quizSession._id,
    courseId: course._id,
    content: 'Explain why the answer is correct.',
    sessionOptions: { points: 5 },
  });
  const updatedQuizSession = await addQuestionToSessionViaApi(request, admin.token, quizSession._id, question._id);
  const quizQuestionId = String(updatedQuizSession.questions.at(-1));

  const saveResponse = await apiJson(request, 'PATCH', `/sessions/${quizSession._id}/quiz-response`, {
    token: student.token,
    payload: {
      questionId: quizQuestionId,
      answer: 'Because the balancing step preserves the equality.',
    },
  });
  expect(saveResponse.response.status(), JSON.stringify(saveResponse.body)).toBe(200);

  const submitQuiz = await apiJson(request, 'POST', `/sessions/${quizSession._id}/submit`, {
    token: student.token,
  });
  expect(submitQuiz.response.status(), JSON.stringify(submitQuiz.body)).toBe(200);

  await patchSessionViaApi(request, professor.token, quizSession._id, {
    status: 'done',
  });
  const recalcGrades = await apiJson(request, 'POST', `/sessions/${quizSession._id}/grades/recalculate`, {
    token: professor.token,
    payload: { missingOnly: false },
  });
  expect(recalcGrades.response.status(), JSON.stringify(recalcGrades.body)).toBe(200);

  await loginViaUi(page, professor.email, professor.password, /\/prof$/);
  await page.goto(`/prof/course/${course._id}`);
  await expect(page).toHaveURL(new RegExp(`/prof/course/${course._id}$`));

  await page.getByRole('tab', { name: /^Grades$/i }).click();
  await page.getByRole('button', { name: /^Show Grade Table$/i }).click();
  const gradeTableDialog = page.getByRole('dialog', { name: /select sessions for grade table/i });
  await gradeTableDialog.getByText(quizSession.name).click();
  await gradeTableDialog.getByRole('button', { name: /^Show Table$/i }).click();

  const studentRow = page.locator('tr', { hasText: student.email }).first();
  await expect(studentRow).toBeVisible();
  await studentRow.getByRole('button', { name: /^0%$/i }).click();
  await page.getByRole('button', { name: /^Q1\(SA\)$/i }).click();
  await expect(page.getByText(/because the balancing step preserves the equality\./i)).toBeVisible();
  await page.getByLabel(/^Manual points$/i).fill('4');
  await page.getByRole('button', { name: /^Save Mark$/i }).click();

  const gradeResponse = await apiJson(request, 'GET', `/courses/${course._id}/grades`, {
    token: professor.token,
  });
  expect(gradeResponse.response.status(), JSON.stringify(gradeResponse.body)).toBe(200);
  const savedGrade = (gradeResponse.body.rows || [])
    .find((row) => String(row.student?.studentId) === String(student.user._id))
    ?.grades?.find((grade) => String(grade.sessionId) === String(quizSession._id));
  const savedMark = (savedGrade?.marks || []).find((mark) => String(mark.questionId) === quizQuestionId);
  expect(savedMark?.points).toBe(4);
  expect(savedGrade?.value).toBe(80);

  await page.goto(`/prof/course/${course._id}`);
  await page.getByRole('tab', { name: /^Grades$/i }).click();

  const csvDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Export grades to CSV$/i }).click();
  const csvDialog = page.getByRole('dialog', { name: /select sessions for csv export/i });
  await csvDialog.getByText(quizSession.name).click();
  await csvDialog.getByRole('button', { name: /^Export CSV$/i }).click();
  const csvDownload = await csvDownloadPromise;
  const csvPath = path.join(os.tmpdir(), `${quizSession._id}-grades.csv`);
  await csvDownload.saveAs(csvPath);
  const csv = await fs.readFile(csvPath, 'utf8');
  expect(csv).toContain(student.email);
  expect(csv).toContain(quizSession.name);
  expect(csv).toContain('80');
  await expectNoCriticalAccessibilityViolations(page);
});

test('group management flow lets a professor create, populate, download, and import groups', async ({ page, request }) => {
  const { admin, professor, student } = await seedUsers(request);
  const course = await createCourseViaApi(request, admin.token, {
    name: `Groups ${Date.now()}`,
  });
  await addInstructorToCourseViaApi(request, admin.token, course._id, professor.user._id);
  await enrollStudentViaApi(request, student.token, course.enrollmentCode);

  await loginViaUi(page, professor.email, professor.password, /\/prof$/);
  await page.getByText(course.name).click();
  await expect(page).toHaveURL(new RegExp(`/prof/course/${course._id}$`));

  await page.getByRole('tab', { name: /^Groups$/i }).click();
  await page.getByRole('button', { name: /^Create Category$/i }).click();
  await page.getByLabel(/^Category Name$/i).fill('Lab Groups');
  await page.getByLabel(/^Number of Groups$/i).fill('2');
  await page.getByRole('button', { name: /^Create$/i }).click();
  await expect(page.getByText(/^Group 1$/i)).toBeVisible();

  await page.getByText(student.email).click();
  const createdGroups = await apiJson(request, 'GET', `/courses/${course._id}/groups`, {
    token: professor.token,
  });
  expect(createdGroups.response.status(), JSON.stringify(createdGroups.body)).toBe(200);
  const labGroups = (createdGroups.body.groupCategories || []).find((category) => category.categoryName === 'Lab Groups');
  expect(labGroups?.groups?.[0]?.members?.map(String)).toContain(String(student.user._id));

  const csvDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download CSV$/i }).click();
  const csvDownload = await csvDownloadPromise;
  const csvPath = path.join(os.tmpdir(), `${course._id}-groups.csv`);
  await csvDownload.saveAs(csvPath);
  const csv = await fs.readFile(csvPath, 'utf8');
  expect(csv).toContain(student.email);
  expect(csv).toContain('Lab Groups');
  expect(csv).toContain('Group 1');

  await page.getByRole('button', { name: /^Upload CSV$/i }).click();
  const uploadDialog = page.getByRole('dialog', { name: /^Upload CSV$/i });
  await uploadDialog.getByLabel(/^Category Name$/i).fill('Project Groups');
  await uploadDialog.getByLabel(/^CSV Content$/i).fill(`GroupName,Email\nTeam Red,${student.email}\n`);
  await uploadDialog.getByRole('button', { name: /^Import$/i }).click();
  await expect(uploadDialog.getByText(/Imported 1 group\(s\) with 1 student\(s\)\./i)).toBeVisible();

  const importedGroups = await apiJson(request, 'GET', `/courses/${course._id}/groups`, {
    token: professor.token,
  });
  expect(importedGroups.response.status(), JSON.stringify(importedGroups.body)).toBe(200);
  const projectGroups = (importedGroups.body.groupCategories || []).find((category) => category.categoryName === 'Project Groups');
  expect(projectGroups?.groups).toHaveLength(1);
  expect(projectGroups?.groups?.[0]?.name).toBe('Team Red');
  expect(projectGroups?.groups?.[0]?.members?.map(String)).toContain(String(student.user._id));
  await expectNoCriticalAccessibilityViolations(page);
});

test('question library flow lets a professor export, copy, and import questions', async ({ page, request }) => {
  const { admin, professor } = await seedUsers(request, { student: false });
  const sourceCourse = await createCourseViaApi(request, admin.token, {
    name: `Source Library ${Date.now()}`,
    deptCode: 'PH',
    courseNumber: '301',
    section: '010',
  });
  const targetCourse = await createCourseViaApi(request, admin.token, {
    name: `Target Library ${Date.now()}`,
    deptCode: 'MA',
    courseNumber: '202',
    section: '020',
  });
  await addInstructorToCourseViaApi(request, admin.token, sourceCourse._id, professor.user._id);
  await addInstructorToCourseViaApi(request, admin.token, targetCourse._id, professor.user._id);

  const questionContent = `Playwright library export ${Date.now()}`;
  await createQuestionViaApi(request, admin.token, {
    type: 2,
    courseId: sourceCourse._id,
    content: questionContent,
  });

  await loginViaUi(page, professor.email, professor.password, /\/prof$/);
  await page.goto(`/prof/course/${sourceCourse._id}`);
  await expect(page).toHaveURL(new RegExp(`/prof/course/${sourceCourse._id}$`));

  await page.getByRole('tab', { name: /^Question Library$/i }).click();
  await expect(page.getByText(questionContent)).toBeVisible();
  await page.getByRole('button', { name: /^Select all filtered$/i }).click();

  const exportDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Export JSON$/i }).click();
  const exportDownload = await exportDownloadPromise;
  const exportPath = path.join(os.tmpdir(), `${sourceCourse._id}-question-library.json`);
  await exportDownload.saveAs(exportPath);
  const exportedQuestionLibrary = JSON.parse(await fs.readFile(exportPath, 'utf8'));
  expect(exportedQuestionLibrary.questions).toHaveLength(1);
  expect(exportedQuestionLibrary.questions[0]?.plainText || exportedQuestionLibrary.questions[0]?.content).toContain(questionContent);

  await page.getByRole('button', { name: /^Copy to course\/session$/i }).click();
  const copyDialog = page.getByRole('dialog', { name: /^Copy question$/i });
  const courseCombobox = copyDialog.getByRole('combobox', { name: /^Course$/i });
  await courseCombobox.click();
  await courseCombobox.press('Control+A');
  await courseCombobox.fill('MA 202');
  await courseCombobox.press('ArrowDown');
  await courseCombobox.press('Enter');
  await copyDialog.getByRole('button', { name: /^Copy$/i }).click();

  const copiedQuestions = await apiJson(request, 'GET', `/courses/${targetCourse._id}/questions?page=1&limit=100`, {
    token: professor.token,
  });
  expect(copiedQuestions.response.status(), JSON.stringify(copiedQuestions.body)).toBe(200);
  const copiedMatches = (copiedQuestions.body.questions || []).filter((question) => (
    String(question.plainText || question.content || '').includes(questionContent)
  ));
  expect(copiedMatches).toHaveLength(1);

  await page.getByRole('button', { name: /^Import JSON$/i }).click();
  const importDialog = page.getByRole('dialog', { name: /^Import questions$/i });
  await importDialog.locator('input[type="file"]').setInputFiles(exportPath);
  await expect(importDialog.getByText(/^1 question ready to import$/i)).toBeVisible();
  await importDialog.getByRole('button', { name: /^Import 1 question$/i }).click();

  const importedQuestions = await apiJson(request, 'GET', `/courses/${sourceCourse._id}/questions?page=1&limit=100`, {
    token: professor.token,
  });
  expect(importedQuestions.response.status(), JSON.stringify(importedQuestions.body)).toBe(200);
  const importedMatches = (importedQuestions.body.questions || []).filter((question) => (
    String(question.plainText || question.content || '').includes(questionContent)
  ));
  expect(importedMatches).toHaveLength(2);
});

test('legacy DB compatibility keeps case-insensitive email login working for student records', async ({ page, request }) => {
  const { admin, professor, student } = await seedUsers(request);
  const course = await createCourseViaApi(request, admin.token, { name: 'Legacy Login Course' });
  await addInstructorToCourseViaApi(request, admin.token, course._id, professor.user._id);
  await enrollStudentViaApi(request, student.token, course.enrollmentCode);

  await clearCachedAuthState(student.email);
  await loginViaUi(page, student.email.toUpperCase(), student.password, /\/student$/);
  await expect(page.getByText('Legacy Login Course')).toBeVisible();
  await expectNoCriticalAccessibilityViolations(page);
});
