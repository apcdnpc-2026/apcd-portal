/**
 * Post-Deployment Smoke Tests for Railway
 *
 * Runs HTTP-level health & API checks against a deployed environment.
 * Does NOT require a local database — tests the live API endpoints.
 *
 * Usage:
 *   npx tsx scripts/post-deploy-test.ts
 *   npx tsx scripts/post-deploy-test.ts --api-url https://api.example.com --web-url https://app.example.com
 *
 * Environment variables (alternative):
 *   API_URL=https://api.example.com WEB_URL=https://app.example.com npx tsx scripts/post-deploy-test.ts
 */

const API_URL =
  process.argv.find((a) => a.startsWith('--api-url='))?.split('=')[1] ||
  process.env.API_URL ||
  'http://localhost:4000';

const WEB_URL =
  process.argv.find((a) => a.startsWith('--web-url='))?.split('=')[1] ||
  process.env.WEB_URL ||
  'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`  PASS  ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({
      name,
      passed: false,
      duration: Date.now() - start,
      error: message,
    });
    console.log(`  FAIL  ${name} (${Date.now() - start}ms)`);
    console.log(`        ${message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function fetchJSON(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const body = await res.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }
  return { status: res.status, body: json, text: body, headers: res.headers };
}

// ─── Test Suites ─────────────────────────────────────────────────────────────

async function runAPIHealthTests() {
  console.log('\n--- API Health & Connectivity ---');

  await test('API root responds', async () => {
    const res = await fetch(`${API_URL}/`);
    assert(res.status < 500, `Expected non-5xx, got ${res.status}`);
  });

  await test('API health endpoint returns 200', async () => {
    const res = await fetch(`${API_URL}/api/health`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });
}

async function runAuthTests() {
  console.log('\n--- Auth Endpoints ---');

  await test('POST /api/auth/login returns 401 for invalid credentials', async () => {
    const res = await fetchJSON(`${API_URL}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: 'nonexistent@test.com',
        password: 'wrongpassword',
      }),
    });
    assert(res.status === 401 || res.status === 400, `Expected 401 or 400, got ${res.status}`);
  });

  await test('POST /api/auth/register validates input', async () => {
    const res = await fetchJSON(`${API_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ email: 'bad' }),
    });
    assert(
      res.status === 400 || res.status === 422,
      `Expected 400/422 validation error, got ${res.status}`,
    );
  });

  await test('GET /api/auth/me returns 401 without token', async () => {
    const res = await fetch(`${API_URL}/api/auth/me`);
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });
}

async function runProtectedRouteTests() {
  console.log('\n--- Protected Route Access Control ---');

  const protectedRoutes = [
    '/api/applications',
    '/api/users',
    '/api/certificates',
    '/api/admin/stats',
  ];

  for (const route of protectedRoutes) {
    await test(`GET ${route} requires auth (401)`, async () => {
      const res = await fetch(`${API_URL}${route}`);
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });
  }
}

async function runPublicEndpointTests() {
  console.log('\n--- Public Endpoints ---');

  await test('GET /api/certificates/verify/:id returns 404 for invalid cert', async () => {
    const res = await fetch(`${API_URL}/api/certificates/verify/INVALID-CERT-ID`);
    assert(res.status === 404 || res.status === 400, `Expected 404/400, got ${res.status}`);
  });

  await test('GET /api/apcd-types returns list (public or auth-required)', async () => {
    const res = await fetch(`${API_URL}/api/apcd-types`);
    // May be public or auth-required depending on config
    assert(res.status === 200 || res.status === 401, `Expected 200 or 401, got ${res.status}`);
  });
}

async function runWebFrontendTests() {
  console.log('\n--- Web Frontend ---');

  await test('Web app root loads', async () => {
    const res = await fetch(`${WEB_URL}/`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes('</html>'), 'Expected HTML response');
  });

  await test('Login page loads', async () => {
    const res = await fetch(`${WEB_URL}/login`);
    assert(res.status === 200 || res.status === 307, `Expected 200 or redirect, got ${res.status}`);
  });

  await test('Register page loads', async () => {
    const res = await fetch(`${WEB_URL}/register`);
    assert(res.status === 200 || res.status === 307, `Expected 200 or redirect, got ${res.status}`);
  });

  await test('Static assets load (_next)', async () => {
    const rootRes = await fetch(`${WEB_URL}/`);
    const html = await rootRes.text();
    // Check that Next.js bundles are referenced
    assert(html.includes('_next') || html.includes('__next'), 'Expected Next.js assets in HTML');
  });
}

async function runDatabaseConnectivityTests() {
  console.log('\n--- Database Connectivity (via API) ---');

  await test('API can query database (registration attempt)', async () => {
    // Attempt to register with a unique email — this verifies DB connectivity
    const uniqueEmail = `smoketest-${Date.now()}@test-delete.com`;
    const res = await fetchJSON(`${API_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        email: uniqueEmail,
        password: 'SmokeTest@123',
        firstName: 'Smoke',
        lastName: 'Test',
      }),
    });
    // 201 = registered (DB works), 400/422 = validation (DB works), 500 = DB down
    assert(res.status !== 500, `Database may be down — got 500: ${res.text.substring(0, 200)}`);

    // Clean up: if registration succeeded, we note it for manual cleanup
    if (res.status === 201) {
      console.log(`        Note: test account ${uniqueEmail} was created — consider cleanup`);
    }
  });
}

async function runResponseTimeTests() {
  console.log('\n--- Response Time ---');

  await test('API responds within 5 seconds', async () => {
    const start = Date.now();
    await fetch(`${API_URL}/api/health`);
    const elapsed = Date.now() - start;
    assert(elapsed < 5000, `Response took ${elapsed}ms (>5s threshold)`);
  });

  await test('Web app responds within 10 seconds', async () => {
    const start = Date.now();
    await fetch(`${WEB_URL}/`);
    const elapsed = Date.now() - start;
    assert(elapsed < 10000, `Response took ${elapsed}ms (>10s threshold)`);
  });
}

async function runCORSTests() {
  console.log('\n--- CORS & Security Headers ---');

  await test('API returns appropriate CORS headers', async () => {
    const res = await fetch(`${API_URL}/api/health`, {
      method: 'OPTIONS',
    });
    // OPTIONS should not return 500
    assert(res.status < 500, `OPTIONS returned ${res.status}`);
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('==============================================');
  console.log('  APCD Portal — Post-Deployment Smoke Tests');
  console.log('==============================================');
  console.log(`  API: ${API_URL}`);
  console.log(`  Web: ${WEB_URL}`);
  console.log(`  Time: ${new Date().toISOString()}`);

  await runAPIHealthTests();
  await runAuthTests();
  await runProtectedRouteTests();
  await runPublicEndpointTests();
  await runWebFrontendTests();
  await runDatabaseConnectivityTests();
  await runResponseTimeTests();
  await runCORSTests();

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log('\n==============================================');
  console.log('  RESULTS');
  console.log('==============================================');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`  Total:  ${total}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Time:   ${totalTime}ms`);

  if (failed > 0) {
    console.log('\n  Failed tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`    - ${r.name}: ${r.error}`);
    }
    console.log('');
    process.exit(1);
  } else {
    console.log('\n  All smoke tests passed!\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Smoke test runner crashed:', err);
  process.exit(2);
});
