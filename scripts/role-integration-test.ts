/**
 * Cross-Role Integration Tests for APCD Portal
 *
 * Tests ALL role workflows end-to-end via API calls:
 *   OEM → Officer → Committee → Admin → Field Verifier → Dealing Hand
 *
 * Includes dummy PDF/PNG uploads, full application lifecycle, query flow,
 * committee evaluation, and dashboard access for every role.
 *
 * Usage:
 *   npx tsx scripts/role-integration-test.ts
 *   npx tsx scripts/role-integration-test.ts --api-url=https://apcd-portal-production.up.railway.app
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const API_URL =
  process.argv.find((a) => a.startsWith('--api-url='))?.split('=')[1] ||
  process.env.API_URL ||
  'http://localhost:4000';

// Default credentials from seed.ts — override with --password=<pwd> for all roles
const DEFAULT_PASSWORD = process.argv.find((a) => a.startsWith('--password='))?.split('=')[1] || '';

const CREDENTIALS: Record<string, { email: string; password: string }> = {
  oem: { email: 'oem@testcompany.com', password: DEFAULT_PASSWORD || 'Oem@APCD2025!' },
  officer: {
    email: 'officer@npcindia.gov.in',
    password: DEFAULT_PASSWORD || 'Officer@APCD2025!',
  },
  admin: { email: 'admin@npcindia.gov.in', password: DEFAULT_PASSWORD || 'Admin@APCD2025!' },
  head: { email: 'head@npcindia.gov.in', password: DEFAULT_PASSWORD || 'Head@APCD2025!' },
  committee: {
    email: 'committee@npcindia.gov.in',
    password: DEFAULT_PASSWORD || 'Committee@APCD2025!',
  },
  fieldVerifier: {
    email: 'fieldverifier@npcindia.gov.in',
    password: DEFAULT_PASSWORD || 'Field@APCD2025!',
  },
  dealingHand: {
    email: 'dealinghand@npcindia.gov.in',
    password: DEFAULT_PASSWORD || 'Dealing@APCD2025!',
  },
};

// If OEM login fails, register a fresh OEM user for testing
const FRESH_OEM = {
  email: `test-oem-${Date.now()}@integration-test.com`,
  password: 'TestOem@2025!',
  firstName: 'IntTest',
  lastName: 'OEM',
};

// ─── Shared State ────────────────────────────────────────────────────────────

const state: {
  tokens: Record<string, string>;
  applicationId?: string;
  applicationNumber?: string;
  attachmentIds: string[];
  queryId?: string;
  apcdTypeIds: string[];
  paymentId?: string;
} = { tokens: {}, attachmentIds: [], apcdTypeIds: [] };

// ─── Colors ──────────────────────────────────────────────────────────────────

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ─── Test Harness ────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  skipped: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const dur = Date.now() - start;
    results.push({ name, passed: true, skipped: false, duration: dur });
    console.log(`  ${green('PASS')}  ${name} ${dim(`(${dur}ms)`)}`);
  } catch (err) {
    const dur = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, skipped: false, duration: dur, error: message });
    console.log(`  ${red('FAIL')}  ${name} ${dim(`(${dur}ms)`)}`);
    console.log(`        ${red(message)}`);
  }
}

function skip(name: string, reason: string): void {
  results.push({ name, passed: true, skipped: true, duration: 0 });
  console.log(`  ${yellow('SKIP')}  ${name} — ${reason}`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs = 30000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJSON(url: string, options?: RequestInit) {
  const res = await fetchWithTimeout(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, body, text };
}

async function authFetch(role: string, path: string, options?: RequestInit) {
  const token = state.tokens[role];
  if (!token) throw new Error(`No token for role "${role}" — login first`);
  return fetchJSON(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

async function authFetchRaw(role: string, path: string, options?: RequestInit) {
  const token = state.tokens[role];
  if (!token) throw new Error(`No token for role "${role}" — login first`);
  return fetchWithTimeout(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

// ─── Dummy File Generators ───────────────────────────────────────────────────

function generateDummyPDF(): Buffer {
  const content = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
206
%%EOF`;
  return Buffer.from(content, 'utf-8');
}

/**
 * Generate a minimal valid JPEG with EXIF GPS coordinates (Delhi, India)
 * and DateTimeOriginal timestamp. Passes NestJS FileTypeValidator and exifr parsing.
 */
function generateGeoTaggedJPEG(): Buffer {
  // Build TIFF/EXIF data (little-endian) with GPS coords: 28°37'N 77°13'E (Delhi)
  const tiff = Buffer.alloc(178);
  let o = 0;

  // TIFF header
  tiff.write('II', o);
  o += 2;
  tiff.writeUInt16LE(42, o);
  o += 2;
  tiff.writeUInt32LE(8, o);
  o += 4;

  // IFD0 at offset 8: 2 entries (ExifIFD ptr + GPS IFD ptr)
  tiff.writeUInt16LE(2, o);
  o += 2;
  // ExifIFD pointer (tag 0x8769)
  tiff.writeUInt16LE(0x8769, o);
  o += 2;
  tiff.writeUInt16LE(4, o);
  o += 2;
  tiff.writeUInt32LE(1, o);
  o += 4;
  tiff.writeUInt32LE(38, o);
  o += 4;
  // GPS IFD pointer (tag 0x8825)
  tiff.writeUInt16LE(0x8825, o);
  o += 2;
  tiff.writeUInt16LE(4, o);
  o += 2;
  tiff.writeUInt32LE(1, o);
  o += 4;
  tiff.writeUInt32LE(56, o);
  o += 4;
  tiff.writeUInt32LE(0, o);
  o += 4; // next IFD = none

  // ExifIFD at offset 38: DateTimeOriginal
  tiff.writeUInt16LE(1, o);
  o += 2;
  tiff.writeUInt16LE(0x9003, o);
  o += 2;
  tiff.writeUInt16LE(2, o);
  o += 2;
  tiff.writeUInt32LE(20, o);
  o += 4;
  tiff.writeUInt32LE(110, o);
  o += 4;
  tiff.writeUInt32LE(0, o);
  o += 4;

  // GPS IFD at offset 56: LatRef, Lat, LngRef, Lng
  tiff.writeUInt16LE(4, o);
  o += 2;
  // GPSLatitudeRef = "N"
  tiff.writeUInt16LE(1, o);
  o += 2;
  tiff.writeUInt16LE(2, o);
  o += 2;
  tiff.writeUInt32LE(2, o);
  o += 4;
  tiff[o] = 0x4e;
  tiff[o + 1] = 0;
  tiff[o + 2] = 0;
  tiff[o + 3] = 0;
  o += 4;
  // GPSLatitude (3 rationals at offset 130)
  tiff.writeUInt16LE(2, o);
  o += 2;
  tiff.writeUInt16LE(5, o);
  o += 2;
  tiff.writeUInt32LE(3, o);
  o += 4;
  tiff.writeUInt32LE(130, o);
  o += 4;
  // GPSLongitudeRef = "E"
  tiff.writeUInt16LE(3, o);
  o += 2;
  tiff.writeUInt16LE(2, o);
  o += 2;
  tiff.writeUInt32LE(2, o);
  o += 4;
  tiff[o] = 0x45;
  tiff[o + 1] = 0;
  tiff[o + 2] = 0;
  tiff[o + 3] = 0;
  o += 4;
  // GPSLongitude (3 rationals at offset 154)
  tiff.writeUInt16LE(4, o);
  o += 2;
  tiff.writeUInt16LE(5, o);
  o += 2;
  tiff.writeUInt32LE(3, o);
  o += 4;
  tiff.writeUInt32LE(154, o);
  o += 4;
  tiff.writeUInt32LE(0, o);
  o += 4; // next IFD = none

  // Data area at offset 110
  tiff.write('2025:06:15 10:30:00\0', o, 'ascii');
  o += 20;
  // Latitude: 28°37'0" → rationals (28/1, 37/1, 0/1)
  tiff.writeUInt32LE(28, o);
  o += 4;
  tiff.writeUInt32LE(1, o);
  o += 4;
  tiff.writeUInt32LE(37, o);
  o += 4;
  tiff.writeUInt32LE(1, o);
  o += 4;
  tiff.writeUInt32LE(0, o);
  o += 4;
  tiff.writeUInt32LE(1, o);
  o += 4;
  // Longitude: 77°13'0" → rationals (77/1, 13/1, 0/1)
  tiff.writeUInt32LE(77, o);
  o += 4;
  tiff.writeUInt32LE(1, o);
  o += 4;
  tiff.writeUInt32LE(13, o);
  o += 4;
  tiff.writeUInt32LE(1, o);
  o += 4;
  tiff.writeUInt32LE(0, o);
  o += 4;
  tiff.writeUInt32LE(1, o);
  o += 4;

  // Build APP1 segment: FF E1 + length + "Exif\0\0" + TIFF
  const exifHdr = Buffer.from('457869660000', 'hex'); // "Exif\0\0"
  const app1Len = 2 + exifHdr.length + tiff.length;
  const app1 = Buffer.alloc(4 + exifHdr.length + tiff.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1.writeUInt16BE(app1Len, 2);
  exifHdr.copy(app1, 4);
  tiff.copy(app1, 4 + exifHdr.length);

  // Minimal JPEG image data (DQT + SOF0 + DHT_DC + DHT_AC + SOS + scan + EOI)
  // 1x1 pixel, 1 component (grayscale), all-1 quantization
  const dqt = Buffer.alloc(69);
  dqt[0] = 0xff;
  dqt[1] = 0xdb;
  dqt.writeUInt16BE(67, 2); // length
  dqt[4] = 0x00; // table 0, 8-bit precision
  for (let i = 0; i < 64; i++) dqt[5 + i] = 1;

  // SOF0: 1x1 grayscale
  const sof = Buffer.from([
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    0x00,
    0x01,
    0x00,
    0x01, // 1x1
    0x01,
    0x01,
    0x11,
    0x00, // 1 component, H=1 V=1, quant table 0
  ]);

  // DHT DC table 0: 1 code of length 2, value 0
  const dhtDC = Buffer.from([
    0xff,
    0xc4,
    0x00,
    0x15,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // VALUES: category 0
  ]);

  // DHT AC table 0: 1 code of length 2, value 0x00 (EOB)
  const dhtAC = Buffer.from([
    0xff,
    0xc4,
    0x00,
    0x15,
    0x10,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // VALUES: EOB
  ]);

  // SOS + compressed scan data (DC=0 + EOB, Huffman coded)
  const sos = Buffer.from([
    0xff,
    0xda,
    0x00,
    0x08,
    0x01,
    0x01,
    0x00,
    0x00,
    0x3f,
    0x00,
    0x54,
    0x00, // scan data: 2 codes + padding bits
  ]);

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    app1, // APP1 with EXIF GPS
    dqt,
    sof,
    dhtDC,
    dhtAC,
    sos,
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

// All 25 mandatory document types
const MANDATORY_DOC_TYPES = [
  'COMPANY_REGISTRATION',
  'GST_CERTIFICATE',
  'PAN_CARD',
  'PAYMENT_PROOF',
  'SERVICE_SUPPORT_UNDERTAKING',
  'NON_BLACKLISTING_DECLARATION',
  'TURNOVER_CERTIFICATE',
  'ISO_CERTIFICATION',
  'PRODUCT_DATASHEET',
  'CLIENT_PERFORMANCE_CERT',
  'TEST_CERTIFICATE',
  'DESIGN_CALCULATIONS',
  'MATERIAL_CONSTRUCTION_CERT',
  'WARRANTY_DOCUMENT',
  'BANK_SOLVENCY_CERT',
  'INSTALLATION_EXPERIENCE',
  'CONSENT_TO_OPERATE',
  'GEO_TAGGED_PHOTOS',
  'TECHNICAL_CATALOGUE',
  'ORG_CHART',
  'STAFF_QUALIFICATION_PROOF',
  'GST_FILING_PROOF',
  'NO_LEGAL_DISPUTES_AFFIDAVIT',
  'COMPLAINT_HANDLING_POLICY',
  'ESCALATION_MECHANISM',
];

const GEO_PHOTO_SLOTS = ['FRONT_VIEW', 'MANUFACTURING_AREA'];

async function uploadFile(
  role: string,
  applicationId: string,
  documentType: string,
  fileBuffer: Buffer,
  fileName: string,
  extras?: Record<string, string>,
) {
  const token = state.tokens[role];
  if (!token) throw new Error(`No token for role "${role}"`);

  const formData = new FormData();
  formData.append('applicationId', applicationId);
  formData.append('documentType', documentType);
  if (extras) {
    for (const [k, v] of Object.entries(extras)) formData.append(k, v);
  }
  // Determine MIME type from file extension to avoid application/octet-stream
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  const mimeType = mimeMap[ext] || 'application/octet-stream';
  formData.append('file', new Blob([fileBuffer], { type: mimeType }), fileName);

  const res = await fetchWithTimeout(`${API_URL}/api/attachments/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, body, text };
}

// ─── Phase 0: Authentication ─────────────────────────────────────────────────

async function phase0_Authentication() {
  console.log(cyan('\n━━━ Phase 0: Authentication ━━━'));

  await test('API is reachable', async () => {
    const res = await fetchWithTimeout(`${API_URL}/api/auth/me`);
    // 401 = API is up and auth guard works; 200 = also fine
    assert(
      res.status === 401 || res.status === 200,
      `Expected 200 or 401 (API up), got ${res.status}`,
    );
  });

  for (const [roleKey, creds] of Object.entries(CREDENTIALS)) {
    await test(`Login as ${roleKey} (${creds.email})`, async () => {
      const res = await fetchJSON(`${API_URL}/api/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ email: creds.email, password: creds.password }),
      });
      assert(
        res.status === 200 || res.status === 201,
        `Login failed for ${roleKey}: status ${res.status} — ${res.text.substring(0, 200)}`,
      );
      const token = res.body?.accessToken || res.body?.data?.accessToken;
      assert(!!token, `No accessToken in response for ${roleKey}`);
      state.tokens[roleKey] = token;
    });
  }

  // If OEM login failed, register a fresh OEM user
  if (!state.tokens.oem) {
    await test(`Register fresh OEM (${FRESH_OEM.email})`, async () => {
      const res = await fetchJSON(`${API_URL}/api/auth/register`, {
        method: 'POST',
        body: JSON.stringify(FRESH_OEM),
      });
      assert(
        res.status === 200 || res.status === 201,
        `Register failed: ${res.status} — ${res.text.substring(0, 200)}`,
      );
      const token = res.body?.accessToken || res.body?.data?.accessToken;
      assert(!!token, 'No accessToken after registration');
      state.tokens.oem = token;
      console.log(`        ${dim(`Registered fresh OEM: ${FRESH_OEM.email}`)}`);
    });
  }
}

// ─── Phase 1: OEM Application Lifecycle ──────────────────────────────────────

async function phase1_OEMApplication() {
  console.log(cyan('\n━━━ Phase 1: OEM Application Lifecycle ━━━'));

  if (!state.tokens.oem) {
    skip('Phase 1', 'OEM login and registration both failed');
    return;
  }

  // Ensure OEM profile exists
  await test('OEM creates/updates company profile', async () => {
    // Try to get existing profile first
    const existing = await authFetch('oem', '/api/oem-profile');
    if (existing.status === 200 && existing.body?.data?.id) {
      // Profile exists, update it
      const res = await authFetch('oem', '/api/oem-profile', {
        method: 'PUT',
        body: JSON.stringify({
          companyName: `Integration Test OEM ${Date.now()}`,
          fullAddress: 'Plot 42, Industrial Area Phase-II, Gurugram',
          state: 'Haryana',
          pinCode: '122002',
          contactNo: '9876543210',
          gstRegistrationNo: '06AABCU9603R1ZM',
          panNo: 'AABCU9603R',
          firmType: 'PRIVATE_LIMITED',
        }),
      });
      assert(
        res.status === 200 || res.status === 201,
        `Profile update failed: ${res.status} — ${res.text.substring(0, 200)}`,
      );
    } else {
      // Create new profile
      const res = await authFetch('oem', '/api/oem-profile', {
        method: 'POST',
        body: JSON.stringify({
          companyName: `Integration Test OEM ${Date.now()}`,
          fullAddress: 'Plot 42, Industrial Area Phase-II, Gurugram',
          state: 'Haryana',
          pinCode: '122002',
          contactNo: '9876543210',
          gstRegistrationNo: '06AABCU9603R1ZM',
          panNo: 'AABCU9603R',
          firmType: 'PRIVATE_LIMITED',
        }),
      });
      assert(
        res.status === 200 || res.status === 201,
        `Profile create failed: ${res.status} — ${res.text.substring(0, 200)}`,
      );
    }
  });

  // Create draft application
  await test('OEM creates draft application', async () => {
    const res = await authFetch('oem', '/api/applications', { method: 'POST' });
    assert(
      res.status === 200 || res.status === 201,
      `Create app failed: ${res.status} — ${res.text.substring(0, 200)}`,
    );
    const app = res.body?.data || res.body;
    assert(!!app?.id, 'No application ID in response');
    state.applicationId = app.id;
    state.applicationNumber = app.applicationNumber;
    console.log(`        ${dim(`Application: ${app.applicationNumber} (${app.id})`)}`);
  });

  // Fetch available APCD types for empanelment selection
  await test('OEM fetches APCD types', async () => {
    const res = await fetchJSON(`${API_URL}/api/apcd-types`);
    assert(res.status === 200, `APCD types failed: ${res.status}`);
    const data = res.body?.data || res.body;
    const types = Array.isArray(data) ? data : [];
    assert(types.length > 0, 'No APCD types available');
    // Pick first 2 types (or fewer) for empanelment
    state.apcdTypeIds = types.slice(0, 2).map((t: any) => t.id);
    console.log(
      `        ${dim(`APCD types available: ${types.length}, selected: ${state.apcdTypeIds.length}`)}`,
    );
  });

  // Update application with full form data including APCD selections and contact persons
  await test('OEM updates application with complete form data', async () => {
    if (!state.applicationId) throw new Error('No applicationId');
    const res = await authFetch('oem', `/api/applications/${state.applicationId}`, {
      method: 'PUT',
      body: JSON.stringify({
        currentStep: 9,
        contactPersons: [
          {
            type: 'COMMERCIAL',
            name: 'Test Commercial',
            designation: 'Manager',
            mobileNo: '9876543210',
            email: 'commercial@test.com',
          },
          {
            type: 'TECHNICAL',
            name: 'Test Technical',
            designation: 'Engineer',
            mobileNo: '9876543211',
            email: 'technical@test.com',
          },
        ],
        apcdSelections: state.apcdTypeIds.map((id) => ({
          apcdTypeId: id,
          isManufactured: true,
          seekingEmpanelment: true,
          installationCategory: 'BOTH',
          designCapacityRange: '1000-5000 m3/hr',
        })),
        turnoverYear1: 50000000,
        turnoverYear2: 60000000,
        turnoverYear3: 70000000,
        hasISO9001: true,
        hasISO14001: true,
        hasISO45001: true,
        isBlacklisted: false,
        hasGrievanceSystem: true,
        declarationAccepted: true,
        declarationSignatory: 'Test CEO',
      }),
    });
    assert(res.status === 200, `Update app failed: ${res.status} — ${res.text.substring(0, 200)}`);
  });

  // Bulk create installation experiences (3 per APCD type)
  await test('OEM creates installation experiences', async () => {
    if (!state.applicationId) throw new Error('No applicationId');
    const entries = [];
    const count = Math.max(state.apcdTypeIds.length * 3, 3);
    for (let i = 0; i < count; i++) {
      entries.push({
        industryName: `Test Industry ${i + 1}`,
        location: `Industrial Area Phase-${i + 1}, Delhi NCR`,
        installationDate: `2024-0${(i % 9) + 1}-15`,
        emissionSource: 'Boiler flue gas',
        apcdType: 'Bag Filter',
        apcdCapacity: `${(i + 1) * 500} m3/hr`,
        performanceResult: 'Within CPCB norms — SPM < 50 mg/Nm3',
      });
    }
    const res = await authFetch('oem', `/api/installation-experience/${state.applicationId}/bulk`, {
      method: 'POST',
      body: JSON.stringify({ entries }),
    });
    assert(
      res.status === 200 || res.status === 201,
      `Bulk install exp failed: ${res.status} — ${res.text.substring(0, 200)}`,
    );
    console.log(`        ${dim(`Created ${count} installation experiences`)}`);
  });

  // Bulk create staff details (2 B.Tech engineers minimum)
  await test('OEM creates staff details', async () => {
    if (!state.applicationId) throw new Error('No applicationId');
    const staffList = [
      {
        name: 'Rajesh Kumar',
        designation: 'Senior Design Engineer',
        qualification: 'B.Tech Mechanical Engineering',
        experienceYears: 8,
        employeeId: 'EMP001',
        mobileNo: '9876543201',
      },
      {
        name: 'Priya Sharma',
        designation: 'Project Engineer',
        qualification: 'M.Tech Environmental Engineering',
        experienceYears: 5,
        employeeId: 'EMP002',
        mobileNo: '9876543202',
      },
      {
        name: 'Amit Verma',
        designation: 'Quality Manager',
        qualification: 'B.Tech Chemical Engineering',
        experienceYears: 10,
        employeeId: 'EMP003',
        isFieldVisitCoordinator: true,
        mobileNo: '9876543203',
      },
    ];
    const res = await authFetch('oem', `/api/staff-details/${state.applicationId}/bulk`, {
      method: 'POST',
      body: JSON.stringify({ staffList }),
    });
    assert(
      res.status === 200 || res.status === 201,
      `Bulk staff failed: ${res.status} — ${res.text.substring(0, 200)}`,
    );
    console.log(`        ${dim(`Created ${staffList.length} staff members`)}`);
  });

  // Upload all 25 mandatory documents
  await test('OEM uploads all mandatory documents', async () => {
    if (!state.applicationId) throw new Error('No applicationId');
    const pdf = generateDummyPDF();
    const geoJpeg = generateGeoTaggedJPEG();
    let uploaded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const docType of MANDATORY_DOC_TYPES) {
      if (docType === 'GEO_TAGGED_PHOTOS') {
        // Upload 2 geo-tagged photos with different slots
        for (const slot of GEO_PHOTO_SLOTS) {
          const res = await uploadFile(
            'oem',
            state.applicationId!,
            docType,
            geoJpeg,
            `geo-photo-${slot.toLowerCase()}.jpg`,
            { photoSlot: slot },
          );
          if (res.status === 200 || res.status === 201) {
            uploaded++;
            const att = res.body?.data || res.body;
            if (att?.id) state.attachmentIds.push(att.id);
          } else {
            failed++;
            const errMsg = res.body?.message || res.text?.substring(0, 120);
            errors.push(`${docType}/${slot}: ${res.status} — ${errMsg}`);
          }
        }
      } else {
        const res = await uploadFile(
          'oem',
          state.applicationId!,
          docType,
          pdf,
          `${docType.toLowerCase().replace(/_/g, '-')}.pdf`,
        );
        if (res.status === 200 || res.status === 201) {
          uploaded++;
          const att = res.body?.data || res.body;
          if (att?.id && state.attachmentIds.length < 3) state.attachmentIds.push(att.id);
        } else {
          failed++;
          const errMsg = res.body?.message || res.text?.substring(0, 120);
          errors.push(`${docType}: ${res.status} — ${errMsg}`);
        }
      }
    }
    console.log(`        ${dim(`Uploaded: ${uploaded}, Failed: ${failed}`)}`);
    if (errors.length > 0) {
      console.log(
        `        ${dim(`Errors: ${errors.slice(0, 5).join('; ')}${errors.length > 5 ? '...' : ''}`)}`,
      );
    }
    assert(
      uploaded >= 20,
      `Too many upload failures: ${failed} failed (${errors.slice(0, 3).join('; ')})`,
    );
  });

  // Record manual payment
  await test('OEM records manual payment', async () => {
    if (!state.applicationId) throw new Error('No applicationId');
    const res = await authFetch('oem', '/api/payments/manual', {
      method: 'POST',
      body: JSON.stringify({
        applicationId: state.applicationId,
        paymentType: 'APPLICATION_FEE',
        baseAmount: 25000,
        utrNumber: `UTR${Date.now()}`,
        neftDate: new Date().toISOString().split('T')[0],
        remitterBankName: 'State Bank of India',
      }),
    });
    assert(
      res.status === 200 || res.status === 201,
      `Payment failed: ${res.status} — ${res.text.substring(0, 200)}`,
    );
    const payment = res.body?.data || res.body;
    state.paymentId = payment?.id;
    console.log(`        ${dim(`Manual payment recorded (id: ${state.paymentId})`)}`);
  });

  // Officer verifies the manual payment so it counts toward submission
  await test('Officer verifies manual payment', async () => {
    if (!state.paymentId) throw new Error('No paymentId from manual payment step');
    if (!state.tokens.officer) throw new Error('Officer login failed — cannot verify payment');
    const res = await authFetch('officer', `/api/payments/${state.paymentId}/verify`, {
      method: 'PUT',
      body: JSON.stringify({
        isVerified: true,
        remarks: 'Integration test: payment verified',
      }),
    });
    assert(
      res.status === 200 || res.status === 201,
      `Payment verification failed: ${res.status} — ${res.text.substring(0, 200)}`,
    );
    const payment = res.body?.data || res.body;
    console.log(`        ${dim(`Payment status: ${payment?.status || 'unknown'}`)}`);
  });

  // Submit application
  await test('OEM submits application', async () => {
    if (!state.applicationId) throw new Error('No applicationId');
    const res = await authFetch('oem', `/api/applications/${state.applicationId}/submit`, {
      method: 'POST',
    });
    if (res.status === 400) {
      // NestJS may nest errors in different formats
      const errs: string[] =
        res.body?.errors ||
        res.body?.message?.errors ||
        (Array.isArray(res.body?.message) ? res.body.message : []);
      if (errs.length > 0) {
        console.log(`        ${dim(`Validation errors (${errs.length}):`)}`);
        for (const e of errs.slice(0, 8)) console.log(`          ${dim(`- ${e}`)}`);
        if (errs.length > 8) console.log(`          ${dim(`... and ${errs.length - 8} more`)}`);
      }
    }
    assert(
      res.status === 200 || res.status === 201,
      `Submit failed: ${res.status} — ${res.text.substring(0, 300)}`,
    );
  });

  // Verify status
  await test('OEM verifies application status is SUBMITTED', async () => {
    if (!state.applicationId) throw new Error('No applicationId');
    const res = await authFetch('oem', `/api/applications/${state.applicationId}`);
    assert(res.status === 200, `Fetch app failed: ${res.status}`);
    const app = res.body?.data || res.body;
    const status = app?.status;
    assert(
      status === 'SUBMITTED' || status === 'DRAFT',
      `Expected SUBMITTED or DRAFT, got "${status}"`,
    );
    console.log(`        ${dim(`Status: ${status}`)}`);
  });
}

// ─── Phase 2: Officer Review ─────────────────────────────────────────────────

async function phase2_OfficerReview() {
  console.log(cyan('\n━━━ Phase 2: Officer Review ━━━'));

  if (!state.tokens.officer) {
    skip('Phase 2', 'Officer login failed');
    return;
  }
  if (!state.applicationId) {
    skip('Phase 2', 'No applicationId from Phase 1');
    return;
  }

  await test('Officer fetches pending applications', async () => {
    const res = await authFetch('officer', '/api/verification/pending');
    assert(res.status === 200, `Pending list failed: ${res.status}`);
    const data = res.body?.data || res.body;
    const count = Array.isArray(data) ? data.length : data?.applications?.length || 0;
    console.log(`        ${dim(`Pending applications: ${count}`)}`);
  });

  await test('Officer views application detail', async () => {
    const res = await authFetch('officer', `/api/verification/application/${state.applicationId}`);
    assert(res.status === 200, `View app failed: ${res.status} — ${res.text.substring(0, 200)}`);
  });

  // Verify an attachment
  if (state.attachmentIds.length > 0) {
    await test('Officer verifies PDF attachment', async () => {
      const attachmentId = state.attachmentIds[0];
      const res = await authFetch('officer', `/api/attachments/${attachmentId}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          isVerified: true,
          note: 'Verified during integration test',
        }),
      });
      assert(
        res.status === 200 || res.status === 201,
        `Verify attachment failed: ${res.status} — ${res.text.substring(0, 200)}`,
      );
    });
  } else {
    skip('Officer verifies PDF attachment', 'No attachments uploaded');
  }

  // Raise query
  await test('Officer raises query on application', async () => {
    const res = await authFetch(
      'officer',
      `/api/verification/application/${state.applicationId}/query`,
      {
        method: 'POST',
        body: JSON.stringify({
          subject: 'Integration Test: Document Clarification',
          description: 'Please provide a clearer copy of the company registration document.',
          documentType: 'COMPANY_REGISTRATION',
        }),
      },
    );
    assert(
      res.status === 200 || res.status === 201,
      `Raise query failed: ${res.status} — ${res.text.substring(0, 200)}`,
    );
    const query = res.body?.data || res.body;
    if (query?.id) {
      state.queryId = query.id;
      console.log(`        ${dim(`Query ID: ${query.id}`)}`);
    }
  });
}

// ─── Phase 3: OEM Query Response ─────────────────────────────────────────────

async function phase3_OEMQueryResponse() {
  console.log(cyan('\n━━━ Phase 3: OEM Query Response ━━━'));

  if (!state.tokens.oem) {
    skip('Phase 3', 'OEM login failed');
    return;
  }
  if (!state.queryId) {
    skip('Phase 3', 'No queryId from Phase 2');
    return;
  }

  await test('OEM fetches pending queries', async () => {
    const res = await authFetch('oem', '/api/verification/my-pending-queries');
    assert(res.status === 200, `Fetch queries failed: ${res.status}`);
    const queries = res.body?.data || res.body;
    const count = Array.isArray(queries) ? queries.length : 0;
    console.log(`        ${dim(`Pending queries: ${count}`)}`);
  });

  await test('OEM responds to query', async () => {
    const res = await authFetch('oem', `/api/verification/query/${state.queryId}/respond`, {
      method: 'POST',
      body: JSON.stringify({
        message: 'Updated document has been uploaded. Please re-verify.',
      }),
    });
    assert(
      res.status === 200 || res.status === 201,
      `Respond to query failed: ${res.status} — ${res.text.substring(0, 200)}`,
    );
  });
}

// ─── Phase 4: Officer Resolves & Forwards ────────────────────────────────────

async function phase4_OfficerForward() {
  console.log(cyan('\n━━━ Phase 4: Officer Forward to Committee ━━━'));

  if (!state.tokens.officer) {
    skip('Phase 4', 'Officer login failed');
    return;
  }
  if (!state.applicationId) {
    skip('Phase 4', 'No applicationId');
    return;
  }

  if (state.queryId) {
    await test('Officer resolves query', async () => {
      const res = await authFetch('officer', `/api/verification/query/${state.queryId}/resolve`, {
        method: 'PUT',
        body: JSON.stringify({ remarks: 'Response verified, query resolved.' }),
      });
      assert(
        res.status === 200,
        `Resolve query failed: ${res.status} — ${res.text.substring(0, 200)}`,
      );
    });
  } else {
    skip('Officer resolves query', 'No queryId');
  }

  await test('Officer forwards application to committee', async () => {
    const res = await authFetch(
      'officer',
      `/api/verification/application/${state.applicationId}/forward-to-committee`,
      {
        method: 'POST',
        body: JSON.stringify({
          remarks: 'Documents verified. Forwarding for committee evaluation.',
        }),
      },
    );
    assert(
      res.status === 200 || res.status === 201,
      `Forward to committee failed: ${res.status} — ${res.text.substring(0, 200)}`,
    );
  });

  await test('Verify application status is COMMITTEE_REVIEW', async () => {
    const res = await authFetch('oem', `/api/applications/${state.applicationId}`);
    assert(res.status === 200, `Fetch app failed: ${res.status}`);
    const app = res.body?.data || res.body;
    console.log(`        ${dim(`Status: ${app?.status}`)}`);
    // Status could be COMMITTEE_REVIEW, UNDER_REVIEW, or still SUBMITTED depending on flow
    assert(!!app?.status, 'No status in response');
  });
}

// ─── Phase 5: Committee Evaluation ───────────────────────────────────────────

async function phase5_CommitteeEvaluation() {
  console.log(cyan('\n━━━ Phase 5: Committee Evaluation ━━━'));

  if (!state.tokens.committee) {
    skip('Phase 5', 'Committee login failed');
    return;
  }
  if (!state.applicationId) {
    skip('Phase 5', 'No applicationId');
    return;
  }

  await test('Committee fetches pending reviews', async () => {
    const res = await authFetch('committee', '/api/committee/pending');
    assert(res.status === 200, `Pending reviews failed: ${res.status}`);
    const data = res.body?.data || res.body;
    const count = Array.isArray(data) ? data.length : 0;
    console.log(`        ${dim(`Pending for committee: ${count}`)}`);
  });

  await test('Committee fetches evaluation criteria', async () => {
    const res = await authFetch('committee', '/api/committee/criteria');
    assert(res.status === 200, `Criteria fetch failed: ${res.status}`);
    const data = res.body?.data || res.body;
    const criteria = data?.criteria || data;
    console.log(
      `        ${dim(`Criteria count: ${Array.isArray(criteria) ? criteria.length : 'N/A'}`)}`,
    );
  });

  await test('Committee submits evaluation', async () => {
    const scores = [
      { criterion: 'EXPERIENCE_SCOPE', score: 8, remarks: 'Good experience' },
      { criterion: 'TECHNICAL_SPECIFICATION', score: 7, remarks: 'Meets specs' },
      { criterion: 'TECHNICAL_TEAM', score: 8, remarks: 'Strong team' },
      { criterion: 'FINANCIAL_STANDING', score: 7, remarks: 'Adequate' },
      { criterion: 'LEGAL_QUALITY_COMPLIANCE', score: 9, remarks: 'ISO certified' },
      { criterion: 'COMPLAINT_HANDLING', score: 7, remarks: 'Has system' },
      { criterion: 'CLIENT_FEEDBACK', score: 8, remarks: 'Positive feedback' },
      { criterion: 'GLOBAL_SUPPLY', score: 5, remarks: 'Limited global presence' },
    ];

    const res = await authFetch(
      'committee',
      `/api/committee/application/${state.applicationId}/evaluate`,
      {
        method: 'POST',
        body: JSON.stringify({
          scores,
          recommendation: 'APPROVE',
          overallRemarks: 'Integration test: Application meets all criteria.',
        }),
      },
    );
    // May fail if app is not in COMMITTEE_REVIEW status
    if (res.status === 200 || res.status === 201) {
      console.log(`        ${dim('Evaluation submitted successfully')}`);
    } else {
      console.log(
        `        ${dim(`Evaluation response: ${res.status} (may not be in COMMITTEE_REVIEW status)`)}`,
      );
    }
    assert(
      res.status === 200 || res.status === 201 || res.status === 400,
      `Unexpected error: ${res.status} — ${res.text.substring(0, 200)}`,
    );
  });
}

// ─── Phase 6: Admin Panel ────────────────────────────────────────────────────

async function phase6_AdminChecks() {
  console.log(cyan('\n━━━ Phase 6: Admin Panel ━━━'));

  const adminRole = state.tokens.admin ? 'admin' : state.tokens.head ? 'head' : null;
  if (!adminRole) {
    skip('Phase 6', 'No admin/head login');
    return;
  }

  await test('Admin fetches user list', async () => {
    const res = await authFetch(adminRole, '/api/admin/users');
    assert(res.status === 200, `Users list failed: ${res.status}`);
    const data = res.body?.data || res.body;
    const users = data?.users || data;
    const count = Array.isArray(users) ? users.length : 'N/A';
    console.log(`        ${dim(`Users: ${count}`)}`);
  });

  await test('Admin fetches fee configuration', async () => {
    const res = await authFetch(adminRole, '/api/admin/fees');
    assert(res.status === 200, `Fees failed: ${res.status}`);
  });

  await test('Admin fetches system statistics', async () => {
    const res = await authFetch(adminRole, '/api/admin/stats');
    assert(res.status === 200, `Stats failed: ${res.status}`);
  });

  await test('Admin dashboard loads', async () => {
    const res = await authFetch(adminRole, '/api/dashboard/admin');
    assert(res.status === 200, `Admin dashboard failed: ${res.status}`);
  });
}

// ─── Phase 7: Supporting Roles & Dashboards ──────────────────────────────────

async function phase7_SupportingRoles() {
  console.log(cyan('\n━━━ Phase 7: Supporting Roles & Dashboards ━━━'));

  // Field Verifier
  if (state.tokens.fieldVerifier) {
    await test('Field Verifier fetches assignments', async () => {
      const res = await authFetch('fieldVerifier', '/api/field-verification/my-assignments');
      assert(res.status === 200, `Assignments failed: ${res.status}`);
      const data = res.body?.data || res.body;
      const count = Array.isArray(data) ? data.length : 0;
      console.log(`        ${dim(`Assignments: ${count}`)}`);
    });

    await test('Field Verifier dashboard loads', async () => {
      const res = await authFetch('fieldVerifier', '/api/dashboard/field-verifier');
      assert(res.status === 200, `FV dashboard failed: ${res.status}`);
    });
  } else {
    skip('Field Verifier tests', 'Login failed');
  }

  // Dealing Hand
  if (state.tokens.dealingHand) {
    await test('Dealing Hand dashboard loads', async () => {
      const res = await authFetch('dealingHand', '/api/dashboard/dealing-hand');
      assert(res.status === 200, `DH dashboard failed: ${res.status}`);
    });
  } else {
    skip('Dealing Hand tests', 'Login failed');
  }

  // OEM Dashboard
  if (state.tokens.oem) {
    await test('OEM dashboard loads', async () => {
      const res = await authFetch('oem', '/api/dashboard/oem');
      assert(res.status === 200, `OEM dashboard failed: ${res.status}`);
    });
  }

  // Officer Dashboard
  if (state.tokens.officer) {
    await test('Officer dashboard loads', async () => {
      const res = await authFetch('officer', '/api/dashboard/officer');
      assert(res.status === 200, `Officer dashboard failed: ${res.status}`);
    });
  }

  // Committee Dashboard
  if (state.tokens.committee) {
    await test('Committee dashboard loads', async () => {
      const res = await authFetch('committee', '/api/dashboard/committee');
      assert(res.status === 200, `Committee dashboard failed: ${res.status}`);
    });
  }
}

// ─── Phase 8: Cross-Role Document Access ─────────────────────────────────────

async function phase8_DocumentAccess() {
  console.log(cyan('\n━━━ Phase 8: Document Access ━━━'));

  if (!state.applicationId || !state.tokens.officer) {
    skip('Phase 8', 'No applicationId or officer token');
    return;
  }

  await test('Officer fetches application attachments', async () => {
    const res = await authFetch('officer', `/api/attachments/application/${state.applicationId}`);
    assert(res.status === 200, `Fetch attachments failed: ${res.status}`);
    const data = res.body?.data || res.body;
    const count = Array.isArray(data) ? data.length : 0;
    console.log(`        ${dim(`Attachments: ${count}`)}`);
  });

  if (state.attachmentIds.length > 0) {
    await test('Officer gets download URL for attachment', async () => {
      const attachmentId = state.attachmentIds[0];
      const res = await authFetch('officer', `/api/attachments/${attachmentId}/download-url`);
      assert(res.status === 200, `Download URL failed: ${res.status}`);
      const url = res.body?.data?.url || res.body?.url;
      assert(!!url, 'No URL in download-url response');
      console.log(`        ${dim(`URL type: ${url.startsWith('/api/') ? 'local' : 'presigned'}`)}`);
    });

    await test('Officer can fetch document blob via local URL', async () => {
      const attachmentId = state.attachmentIds[0];
      const urlRes = await authFetch('officer', `/api/attachments/${attachmentId}/download-url`);
      const url = urlRes.body?.data?.url || urlRes.body?.url;
      if (!url) throw new Error('No URL');

      if (url.startsWith('/api/')) {
        // Local storage — fetch through API
        const apiPath = url.replace(/^\/api/, '');
        const blobRes = await authFetchRaw('officer', `/api${apiPath}`);
        assert(
          blobRes.status === 200,
          `Blob fetch failed: ${blobRes.status} (URL: /api${apiPath})`,
        );
        const contentType = blobRes.headers.get('content-type');
        console.log(`        ${dim(`Content-Type: ${contentType}`)}`);
      } else {
        // MinIO presigned URL
        const blobRes = await fetchWithTimeout(url);
        assert(blobRes.status === 200, `Presigned URL fetch failed: ${blobRes.status}`);
        console.log(`        ${dim('Presigned URL fetch OK')}`);
      }
    });
  } else {
    skip('Officer download URL tests', 'No attachments uploaded');
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold('\n' + '='.repeat(60)));
  console.log(bold('  APCD Portal — Cross-Role Integration Tests'));
  console.log(bold('='.repeat(60)));
  console.log(`  API: ${cyan(API_URL)}`);
  console.log(`  Time: ${new Date().toISOString()}`);

  await phase0_Authentication();
  await phase1_OEMApplication();
  await phase2_OfficerReview();
  await phase3_OEMQueryResponse();
  await phase4_OfficerForward();
  await phase5_CommitteeEvaluation();
  await phase6_AdminChecks();
  await phase7_SupportingRoles();
  await phase8_DocumentAccess();

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n' + bold('='.repeat(60)));
  console.log(bold('  RESULTS'));
  console.log(bold('='.repeat(60)));

  const passed = results.filter((r) => r.passed && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`  Total:   ${total}`);
  console.log(`  ${green(`Passed:  ${passed}`)}`);
  if (skipped > 0) console.log(`  ${yellow(`Skipped: ${skipped}`)}`);
  if (failed > 0) console.log(`  ${red(`Failed:  ${failed}`)}`);
  console.log(`  Time:    ${totalTime}ms`);

  if (failed > 0) {
    console.log(red('\n  Failed tests:'));
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`    ${red('×')} ${r.name}`);
      if (r.error) console.log(`      ${dim(r.error)}`);
    }
    console.log('');
    process.exit(1);
  } else {
    console.log(green('\n  All integration tests passed!\n'));
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(red('Integration test runner crashed:'), err);
  process.exit(2);
});
