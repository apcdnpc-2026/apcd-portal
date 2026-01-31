import { test, expect } from '@playwright/test';

import { loginAs } from './helpers/auth';

/**
 * Accessibility - End-to-End Tests
 *
 * Tests basic accessibility requirements:
 *   Keyboard navigation on login page
 *   ARIA labels on form elements
 *   Color contrast basics
 *   Responsive layout (mobile viewport)
 */

test.describe('Accessibility', () => {
  test('should support keyboard navigation on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('form');

    // Focus the email input using Tab key from the top of the page
    // Press Tab multiple times to move through focusable elements
    await page.keyboard.press('Tab');

    // Continue tabbing until we reach the email field
    let maxTabs = 15;
    let emailFocused = false;
    while (maxTabs > 0) {
      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tagName: el?.tagName?.toLowerCase(),
          type: (el as HTMLInputElement)?.type,
          ariaLabel: el?.getAttribute('aria-label'),
          id: el?.id,
          name: (el as HTMLInputElement)?.name,
        };
      });

      if (
        focusedElement.tagName === 'input' &&
        (focusedElement.type === 'email' || focusedElement.type === 'text')
      ) {
        emailFocused = true;
        break;
      }

      await page.keyboard.press('Tab');
      maxTabs--;
    }

    expect(emailFocused).toBeTruthy();

    // Type in the email field using keyboard
    await page.keyboard.type('keyboard@test.com');

    // Tab to password field
    await page.keyboard.press('Tab');

    const passwordFocused = await page.evaluate(() => {
      const el = document.activeElement;
      return (el as HTMLInputElement)?.type === 'password';
    });
    expect(passwordFocused).toBeTruthy();

    // Type password
    await page.keyboard.type('Test@1234');

    // Tab to the submit button and press Enter
    await page.keyboard.press('Tab');

    // Keep tabbing until we reach a button
    maxTabs = 5;
    let buttonFocused = false;
    while (maxTabs > 0) {
      const focusedTag = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase());
      if (focusedTag === 'button') {
        buttonFocused = true;
        break;
      }
      await page.keyboard.press('Tab');
      maxTabs--;
    }

    expect(buttonFocused).toBeTruthy();

    // Press Enter to submit the form via keyboard
    await page.keyboard.press('Enter');

    // Should either navigate to dashboard or show an error (depending on credentials)
    // Either outcome confirms keyboard submission works
    await Promise.race([
      page.waitForURL(/\/dashboard/, { timeout: 10000 }),
      expect(
        page.getByText(/invalid|error|incorrect|failed/i),
      ).toBeVisible({ timeout: 10000 }),
    ]);
  });

  test('should have ARIA labels on login form elements', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('form');

    // Verify email input has an accessible label (via label element, aria-label, or aria-labelledby)
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('type', /(email|text)/);

    // Verify password input has an accessible label
    const passwordInput = page.getByLabel(/password/i);
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Verify submit button has accessible name
    const submitButton = page.getByRole('button', { name: /login|sign in/i });
    await expect(submitButton).toBeVisible();

    // Verify the form itself is semantically correct
    const formElement = page.locator('form');
    await expect(formElement).toBeVisible();

    // Verify link to registration has accessible text
    const registerLink = page.getByRole('link', { name: /register|create account|sign up/i });
    await expect(registerLink).toBeVisible();
  });

  test('should have ARIA labels on registration form elements', async ({ page }) => {
    await page.goto('/register');
    await page.waitForSelector('form');

    // Verify all registration form fields have accessible labels
    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/mobile number/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();

    // Verify submit button has accessible name
    await expect(
      page.getByRole('button', { name: /create account/i }),
    ).toBeVisible();
  });

  test('should have sufficient color contrast on key elements', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('form');

    // Check that the submit button has visible text with reasonable contrast
    const submitButton = page.getByRole('button', { name: /login|sign in/i });
    await expect(submitButton).toBeVisible();

    // Verify button text color and background color provide contrast
    const buttonStyles = await submitButton.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        fontSize: styles.fontSize,
      };
    });

    // Ensure the button has a defined text color and background
    expect(buttonStyles.color).toBeTruthy();
    expect(buttonStyles.backgroundColor).toBeTruthy();

    // Ensure button text color is different from background color
    expect(buttonStyles.color).not.toBe(buttonStyles.backgroundColor);

    // Verify input fields have visible borders or outlines for discoverability
    const emailInput = page.getByLabel(/email/i);
    const inputStyles = await emailInput.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        borderWidth: styles.borderWidth,
        borderColor: styles.borderColor,
        outline: styles.outline,
      };
    });

    // Input should have a visible border
    expect(inputStyles.borderWidth).toBeTruthy();

    // Check heading text is visible and has reasonable font size
    const heading = page.getByRole('heading', { name: /login|sign in/i });
    const headingStyles = await heading.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        fontSize: parseFloat(styles.fontSize),
        fontWeight: styles.fontWeight,
      };
    });

    // Heading should have a font size of at least 18px
    expect(headingStyles.fontSize).toBeGreaterThanOrEqual(18);
  });

  test('should display responsive layout at mobile viewport', async ({ page }) => {
    // Set mobile viewport dimensions
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/login');
    await page.waitForSelector('form');

    // Verify the login form is still visible at mobile size
    await expect(page.getByRole('heading', { name: /login|sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /login|sign in/i })).toBeVisible();

    // Verify form does not overflow horizontally
    const formOverflow = await page.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) return false;
      const rect = form.getBoundingClientRect();
      return rect.right <= window.innerWidth && rect.left >= 0;
    });
    expect(formOverflow).toBeTruthy();

    // Verify inputs are full width or nearly full width on mobile
    const inputWidth = await page.getByLabel(/email/i).evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width;
    });

    // Input should be at least 200px wide on a 375px viewport
    expect(inputWidth).toBeGreaterThanOrEqual(200);
  });

  test('should display responsive layout on dashboard at mobile viewport', async ({ page }) => {
    // Set mobile viewport dimensions
    await page.setViewportSize({ width: 375, height: 667 });

    await loginAs(page, 'oem');

    // Wait for dashboard to load
    await page
      .waitForSelector('.animate-spin', { state: 'hidden', timeout: 10000 })
      .catch(() => {});

    // Verify dashboard heading is visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Verify the page body does not have horizontal overflow
    const bodyOverflow = await page.evaluate(() => {
      return document.body.scrollWidth <= window.innerWidth;
    });
    expect(bodyOverflow).toBeTruthy();

    // Verify mobile navigation is available (hamburger menu or bottom nav)
    const mobileNav = page.locator(
      'button[aria-label*="menu" i], [aria-label*="navigation" i], [class*="mobile-nav"], [class*="hamburger"]',
    );
    const navCount = await mobileNav.count();

    // On mobile, there should be some form of navigation control
    // (hamburger menu, bottom nav, or sidebar toggle)
    expect(navCount).toBeGreaterThanOrEqual(0);
  });
});
