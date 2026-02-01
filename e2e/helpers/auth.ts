import { Page } from '@playwright/test';

/**
 * Seeded test user credentials from packages/database/prisma/seed.ts
 */
const credentials: Record<string, { email: string; password: string }> = {
  oem: { email: 'oem@testcompany.com', password: 'Oem@APCD2025!' },
  officer: { email: 'officer@npcindia.gov.in', password: 'Officer@APCD2025!' },
  admin: { email: 'admin@npcindia.gov.in', password: 'Admin@APCD2025!' },
  committee: { email: 'committee@npcindia.gov.in', password: 'Committee@APCD2025!' },
  'field-verifier': { email: 'fieldverifier@npcindia.gov.in', password: 'Field@APCD2025!' },
  'dealing-hand': { email: 'dealinghand@npcindia.gov.in', password: 'Dealing@APCD2025!' },
};

export type TestRole =
  | 'oem'
  | 'officer'
  | 'admin'
  | 'committee'
  | 'field-verifier'
  | 'dealing-hand';

/**
 * Log in as a seeded test user and wait for dashboard redirect.
 * Timeouts are generous to accommodate Railway cold-starts.
 */
export async function loginAs(page: Page, role: TestRole) {
  const { email, password } = credentials[role];
  await page.goto('/login');
  await page.waitForSelector('form', { timeout: 30000 });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Wait for dashboard or unauthorized redirect (dealing-hand role may not have routes yet)
  await page.waitForURL(/\/(dashboard|unauthorized)/, { timeout: 30000 });
}

/**
 * Return the credentials object for a given role (for tests that need email/password directly).
 */
export function getCredentials(role: TestRole) {
  return credentials[role];
}

/**
 * Helper to wait for any loading spinners to disappear.
 */
export async function waitForLoad(page: Page, timeout = 20000) {
  await page.waitForSelector('.animate-spin', { state: 'hidden', timeout }).catch(() => {});
}

/**
 * Check if the page is showing a Next.js Server Error overlay (dev mode).
 * Returns true if a server error is detected.
 */
export async function hasServerError(page: Page): Promise<boolean> {
  return page
    .getByRole('heading', { name: /Server Error/i })
    .isVisible({ timeout: 500 })
    .catch(() => false);
}
