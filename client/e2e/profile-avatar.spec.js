import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  loginViaUi,
  seedUsers,
} from './helpers.js';

const fixtureImagePath = fileURLToPath(new URL('../public/manuals/admin-dashboard.png', import.meta.url));

test('profile avatar editor saves a rotated existing profile image', async ({ page, request }) => {
  const { student } = await seedUsers(request, { admin: false, professor: false });

  await loginViaUi(page, student.email, student.password, /\/student$/);

  await page.getByLabel(/open account menu/i).click();
  await page.getByRole('menuitem', { name: /^profile$/i }).click();
  await expect(page).toHaveURL(/\/profile$/);

  await page.locator('input[type="file"]').setInputFiles(fixtureImagePath);
  await expect(page.getByRole('dialog', { name: /adjust profile photo/i })).toBeVisible();

  const initialImageUploadResponse = page.waitForResponse((response) => (
    response.url().includes('/api/v1/images') && response.request().method() === 'POST'
  ));
  const initialProfilePatchResponse = page.waitForResponse((response) => (
    response.url().includes('/api/v1/users/me/image') && response.request().method() === 'PATCH'
  ));
  await page.getByRole('button', { name: /^save$/i }).click();

  expect((await initialImageUploadResponse).status()).toBe(201);
  expect((await initialProfilePatchResponse).status()).toBe(200);
  await expect(page.getByRole('dialog', { name: /adjust profile photo/i })).toBeHidden();
  const profileAvatarImage = page.locator('button[aria-label="Open profile photo editor"] img').first();
  const avatarSrcBeforeRotate = await profileAvatarImage.getAttribute('src');
  expect(avatarSrcBeforeRotate).toMatch(/\/uploads\//);

  await page.getByRole('button', { name: /open profile photo editor/i }).click();
  await expect(page.getByRole('dialog', { name: /adjust profile photo/i })).toBeVisible();
  const rotateButton = page.getByRole('button', { name: /rotate image right/i });
  await rotateButton.click();

  const rotatedThumbnailUploadResponse = page.waitForResponse((response) => (
    response.url().includes('/api/v1/images') && response.request().method() === 'POST'
  ));
  const rotatedProfilePatchResponse = page.waitForResponse((response) => (
    response.url().includes('/api/v1/users/me/image') && response.request().method() === 'PATCH'
  ));
  await page.getByRole('button', { name: /^save$/i }).click();

  expect((await rotatedThumbnailUploadResponse).status()).toBe(201);
  expect((await rotatedProfilePatchResponse).status()).toBe(200);
  await expect(page.getByRole('dialog', { name: /adjust profile photo/i })).toBeHidden();
  await expect(profileAvatarImage).toHaveAttribute('src', /\/uploads\//);
  const avatarSrcAfterRotate = await profileAvatarImage.getAttribute('src');
  expect(avatarSrcAfterRotate).not.toBe(avatarSrcBeforeRotate);
});
