import { Page } from '@playwright/test';

const credentials: Record<string, { email: string; password: string }> = {
  oem: { email: 'oem@test.com', password: 'Test@1234' },
  officer: { email: 'officer@test.com', password: 'Test@1234' },
  admin: { email: 'admin@test.com', password: 'Test@1234' },
  committee: { email: 'committee@test.com', password: 'Test@1234' },
  'field-verifier': { email: 'verifier@test.com', password: 'Test@1234' },
  'dealing-hand': { email: 'dealing@test.com', password: 'Test@1234' },
};

export async function loginAs(
  page: Page,
  role: 'oem' | 'officer' | 'admin' | 'committee' | 'field-verifier' | 'dealing-hand',
) {
  const { email, password } = credentials[role];
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /login|sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
}
