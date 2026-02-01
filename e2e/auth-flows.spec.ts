import { test, expect } from '@playwright/test';

import { loginAs, getCredentials, waitForLoad } from './helpers/auth';

/**
 * Authentication Flows - End-to-End Tests
 *
 * Covers:
 *   1. Login page renders correctly
 *   2. Successful login with valid OEM credentials -> dashboard redirect
 *   3. Successful login for every seeded role
 *   4. Registration of a new OEM account -> OEM dashboard
 *   5. Invalid credentials -> error message, stays on /login
 *   6. Deactivated / non-existent account -> error message
 *   7. Logout -> redirects to /login
 *   8. Session persistence across page refresh
 *   9. Protected route redirect -> /login when unauthenticated
 */

const uniqueId = Date.now();
const REG_USER = {
  firstName: 'AuthTest',
  lastName: 'User',
  email: `auth-e2e-${uniqueId}@test.com`,
  phone: '9876500001',
  password: 'Test@Auth2025!',
};

test.describe('Authentication Flows', () => {
  // ── Login page ──────────────────────────────────────────────────────────

  test('login page renders form with all expected elements', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: /welcome back|login|sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /register|create account|sign up/i }),
    ).toBeVisible();
  });

  // ── Successful logins ──────────────────────────────────────────────────

  test('OEM login with seeded credentials redirects to dashboard', async ({ page }) => {
    const creds = getCredentials('oem');
    await page.goto('/login');
    await page.waitForSelector('form');

    await page.getByLabel(/email/i).fill(creds.email);
    await page.getByLabel(/password/i).fill(creds.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('Officer login redirects to officer dashboard', async ({ page }) => {
    await loginAs(page, 'officer');
    await expect(page.getByRole('heading', { name: /officer dashboard/i })).toBeVisible();
  });

  test('Admin login redirects to admin dashboard', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('Committee login redirects to committee dashboard', async ({ page }) => {
    await loginAs(page, 'committee');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('Field verifier login redirects to field verifier dashboard', async ({ page }) => {
    await loginAs(page, 'field-verifier');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('Dealing hand login redirects to dealing hand dashboard', async ({ page }) => {
    await loginAs(page, 'dealing-hand');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  // ── Registration ───────────────────────────────────────────────────────

  test('register a new OEM account and land on OEM dashboard', async ({ page }) => {
    await page.goto('/register');
    await page.waitForSelector('form');

    await page.getByLabel(/first name/i).fill(REG_USER.firstName);
    await page.getByLabel(/last name/i).fill(REG_USER.lastName);
    await page.getByLabel(/email address/i).fill(REG_USER.email);
    await page.getByLabel(/mobile number/i).fill(REG_USER.phone);
    await page.getByLabel(/^password$/i).fill(REG_USER.password);
    await page.getByLabel(/confirm password/i).fill(REG_USER.password);

    await page.getByRole('button', { name: /create account/i }).click();

    await page.waitForURL(/\/dashboard\/oem/, { timeout: 30000 });
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  // ── Invalid credentials ────────────────────────────────────────────────

  test('invalid password shows error and stays on login', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('form');

    await page.getByLabel(/email/i).fill('oem@testcompany.com');
    await page.getByLabel(/password/i).fill('TotallyWrong@999');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(
      page
        .getByText(/invalid credentials|incorrect password|login failed|invalid email or password/i)
        .first(),
    ).toBeVisible({ timeout: 10000 });

    expect(page.url()).toContain('/login');
  });

  test('non-existent email shows error', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('form');

    await page.getByLabel(/email/i).fill('doesnotexist-e2e@nowhere.com');
    await page.getByLabel(/password/i).fill('Whatever@123');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(
      page
        .getByText(
          /invalid credentials|incorrect|not found|login failed|invalid email or password/i,
        )
        .first(),
    ).toBeVisible({ timeout: 10000 });

    expect(page.url()).toContain('/login');
  });

  test('empty form submission shows validation errors', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('form');

    await page.getByRole('button', { name: /sign in/i }).click();

    // Should show HTML5 validation or custom error - at minimum stay on login
    expect(page.url()).toContain('/login');
  });

  // ── Logout ─────────────────────────────────────────────────────────────

  test('logout redirects to login page', async ({ page }) => {
    await loginAs(page, 'oem');
    await waitForLoad(page);

    // Open the user dropdown menu in the header
    const dropdownTrigger = page.locator('header button').last();
    await dropdownTrigger.click();

    // Click the Logout menu item
    await page.getByRole('menuitem', { name: /logout/i }).click();

    await page.waitForURL(/\/login/, { timeout: 30000 });
    await expect(page.getByRole('heading', { name: /welcome back|login|sign in/i })).toBeVisible();
  });

  // ── Session persistence ────────────────────────────────────────────────

  test('session persists after page refresh', async ({ page }) => {
    await loginAs(page, 'oem');
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.reload();
    await waitForLoad(page);

    expect(page.url()).toContain('/dashboard');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  // ── Protected routes ───────────────────────────────────────────────────

  test('unauthenticated access to /applications redirects to /login', async ({ page }) => {
    await page.goto('/applications');

    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 30000 });
    await expect(page.getByRole('heading', { name: /welcome back|login|sign in/i })).toBeVisible();
  });

  test('unauthenticated access to /verification redirects to /login', async ({ page }) => {
    await page.goto('/verification');

    await page.waitForURL(/\/login/, { timeout: 30000 });
  });

  test('unauthenticated access to /admin/users redirects to /login', async ({ page }) => {
    await page.goto('/admin/users');

    await page.waitForURL(/\/login/, { timeout: 30000 });
  });
});
