import { test, expect } from '@playwright/test';

import { loginAs } from './helpers/auth';

/**
 * Authentication Flows - End-to-End Tests
 *
 * Tests the core authentication workflows:
 *   Login -> Dashboard redirect
 *   Registration -> OEM dashboard
 *   Invalid credentials -> Error message
 *   Logout -> Login page
 *   Session persistence -> Refresh and remain logged in
 */

const uniqueId = Date.now();
const REG_USER = {
  firstName: 'AuthTest',
  lastName: 'User',
  email: `auth-e2e-${uniqueId}@test.com`,
  phone: '9876500001',
  password: 'Test@1234',
};

test.describe('Authentication Flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('should navigate to login page and see the login form', async ({ page }) => {
    await page.goto('/login');

    // Verify page loaded with correct heading
    await expect(page.getByRole('heading', { name: /login|sign in/i })).toBeVisible();

    // Verify all form fields are present
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();

    // Verify submit button is present
    await expect(page.getByRole('button', { name: /login|sign in/i })).toBeVisible();

    // Verify link to registration page exists
    await expect(page.getByRole('link', { name: /register|create account|sign up/i })).toBeVisible();
  });

  test('should login with valid credentials and redirect to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('form');

    // Fill login form with seeded OEM credentials
    await page.getByLabel(/email/i).fill('oem@test.com');
    await page.getByLabel(/password/i).fill('Test@1234');

    // Submit the form
    await page.getByRole('button', { name: /login|sign in/i }).click();

    // Should redirect to the dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('should register a new account and redirect to OEM dashboard', async ({ page }) => {
    await page.goto('/register');
    await page.waitForSelector('form');

    // Fill registration form
    await page.getByLabel(/first name/i).fill(REG_USER.firstName);
    await page.getByLabel(/last name/i).fill(REG_USER.lastName);
    await page.getByLabel(/email address/i).fill(REG_USER.email);
    await page.getByLabel(/mobile number/i).fill(REG_USER.phone);
    await page.getByLabel(/^password$/i).fill(REG_USER.password);
    await page.getByLabel(/confirm password/i).fill(REG_USER.password);

    // Submit the form
    await page.getByRole('button', { name: /create account/i }).click();

    // Should redirect to OEM dashboard after successful registration
    await page.waitForURL(/\/dashboard\/oem/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('should show error message for invalid login credentials', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('form');

    // Fill login form with wrong password
    await page.getByLabel(/email/i).fill('oem@test.com');
    await page.getByLabel(/password/i).fill('WrongPassword@999');

    // Submit the form
    await page.getByRole('button', { name: /login|sign in/i }).click();

    // Should show an error message and remain on login page
    await expect(
      page.getByText(/invalid credentials|incorrect password|login failed|invalid email or password/i),
    ).toBeVisible({ timeout: 10000 });

    // URL should still be on the login page
    expect(page.url()).toContain('/login');
  });

  test('should logout and redirect to login page', async ({ page }) => {
    // First login
    await loginAs(page, 'oem');

    // Verify we are on the dashboard
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Click on profile/user menu to reveal logout option
    const userMenuButton = page.locator(
      'button:has(svg), [aria-label*="menu" i], [aria-label*="user" i], [aria-label*="profile" i]',
    );
    const userMenus = await userMenuButton.count();

    if (userMenus > 0) {
      // Try clicking the last icon button (often the user avatar/menu in the header)
      await userMenuButton.last().click();
    }

    // Click the Logout button
    const logoutButton = page.getByRole('button', { name: /logout|sign out/i });
    const logoutLink = page.getByRole('link', { name: /logout|sign out/i });
    const logoutMenuItem = page.getByRole('menuitem', { name: /logout|sign out/i });

    if (await logoutButton.isVisible().catch(() => false)) {
      await logoutButton.click();
    } else if (await logoutLink.isVisible().catch(() => false)) {
      await logoutLink.click();
    } else if (await logoutMenuItem.isVisible().catch(() => false)) {
      await logoutMenuItem.click();
    }

    // Should redirect to login page
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /login|sign in/i })).toBeVisible();
  });

  test('should persist session after page refresh', async ({ page }) => {
    // Login first
    await loginAs(page, 'oem');

    // Verify we are on the dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Refresh the page
    await page.reload();

    // Wait for page to load after refresh
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Should still be on the dashboard (not redirected to login)
    expect(page.url()).toContain('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
