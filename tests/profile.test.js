const {
  launchBrowser, bootPage, apiRoutes, apiCapture, scanManualQr, todayStr
} = require('./helpers');

let browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  if (browser) await browser.close();
});

/* ==========================================
   1. PROFILE MODAL
   ========================================== */
describe('Profile Modal', () => {
  test('profile button opens modal', async () => {
    const page = await bootPage(browser, { seed: { 'att.onboarded.v1': '1' } });
    await page.click('#btn-profile');
    await page.waitForSelector('#modal-profile:not(.hidden)', { timeout: 5000 });
    await page.close();
  });

  test('shows error when saving empty name', async () => {
    const page = await bootPage(browser, { seed: { 'att.onboarded.v1': '1' } });
    await page.click('#btn-profile');
    await page.click('#btn-profile-save');
    const errText = await page.$eval('#profile-error', el => el.textContent);
    expect(errText).toContain('nom');
    await page.close();
  });

  test('shows error when saving invalid email', async () => {
    const page = await bootPage(browser, { seed: { 'att.onboarded.v1': '1' } });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'John Doe');
    await page.type('#pf-email', 'invalid');
    await page.click('#btn-profile-save');
    const errText = await page.$eval('#profile-error', el => el.textContent);
    expect(errText).toContain('email');
    await page.close();
  });

  test('valid profile saves and closes modal', async () => {
    const page = await bootPage(browser, { seed: { 'att.onboarded.v1': '1' } });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'John Doe');
    await page.type('#pf-email', 'john@test.com');
    await page.click('#btn-profile-save');
    await page.waitForFunction(() => document.getElementById('modal-profile').classList.contains('hidden'));
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Non pointe');
    await page.close();
  });

  test('saved profile data persists encrypted in localStorage', async () => {
    const page = await bootPage(browser, { seed: { 'att.onboarded.v1': '1' } });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'Jane Doe');
    await page.type('#pf-email', 'jane@test.com');
    await page.click('#btn-profile-save');
    await page.waitForFunction(() => document.getElementById('modal-profile').classList.contains('hidden'));
    const stored = await page.evaluate(() => localStorage.getItem('att.profile.v1'));
    expect(stored).toBeTruthy();
    expect(stored.startsWith('enc1:')).toBe(true);
    const payload = JSON.parse(stored.slice(5));
    expect(payload.iv).toBeTruthy();
    expect(payload.d).toBeTruthy();
    await page.close();
  });

  test('profile modal pre-fills existing data', async () => {
    const page = await bootPage(browser, { profile: { name: 'Existing', email: 'exist@test.com' } });
    await page.click('#btn-profile');
    const nameVal = await page.$eval('#pf-name', el => el.value);
    const emailVal = await page.$eval('#pf-email', el => el.value);
    expect(nameVal).toBe('Existing');
    expect(emailVal).toBe('exist@test.com');
    await page.close();
  });

  test('shows error for invalid tenant code', async () => {
    const page = await bootPage(browser, { seed: { 'att.onboarded.v1': '1' } });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'Test');
    await page.type('#pf-email', 'test@test.com');
    await page.type('#pf-tenant', 'INVALID CODE WITH SPACES');
    await page.click('#btn-profile-save');
    const errText = await page.$eval('#profile-error', el => el.textContent);
    expect(errText).toContain('espace');
    await page.close();
  });

  test('valid tenant code saves', async () => {
    const page = await bootPage(browser, { seed: { 'att.onboarded.v1': '1' } });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'Test');
    await page.type('#pf-email', 'test@test.com');
    await page.type('#pf-tenant', 'acme');
    await page.click('#btn-profile-save');
    await page.waitForFunction(() => document.getElementById('modal-profile').classList.contains('hidden'));
    await page.close();
  });
});

/* ==========================================
   2. ENCRYPTED LOCAL STORAGE
   ========================================== */
describe('Encrypted Local Storage', () => {
  test('profile is stored with enc1 prefix', async () => {
    const page = await bootPage(browser, { seed: { 'att.onboarded.v1': '1' } });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'Enc Test');
    await page.type('#pf-email', 'enc@test.com');
    await page.click('#btn-profile-save');
    await page.waitForFunction(() => document.getElementById('modal-profile').classList.contains('hidden'));
    const stored = await page.evaluate(() => localStorage.getItem('att.profile.v1'));
    expect(stored.startsWith('enc1:')).toBe(true);
    await page.close();
  });

  test('encryption key is created on first encrypted write', async () => {
    const page = await bootPage(browser, { seed: { 'att.onboarded.v1': '1' } });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'Key Test');
    await page.type('#pf-email', 'key@test.com');
    await page.click('#btn-profile-save');
    await page.waitForFunction(() => document.getElementById('modal-profile').classList.contains('hidden'));
    const key = await page.evaluate(() => localStorage.getItem('att.key.v1'));
    expect(key).toBeTruthy();
    expect(key.length).toBeGreaterThan(10);
    await page.close();
  });

  test('stale plaintext status is discarded, and a fresh scan is stored encrypted', async () => {
    const cap = apiCapture(apiRoutes({
      attendance: { ok: true, date: todayStr(), action: 'Check-in', time: '08:10', office: 'HQ' }
    }));
    const page = await bootPage(browser, {
      profile: true,
      api: body => cap.handler(body)
    });
    await page.evaluate(() => {
      localStorage.setItem('att.status.v1', JSON.stringify({
        date: '2020-01-01', action: 'Check-in', time: '09:00', office: 'HQ'
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Non pointe', { timeout: 10000 });
    const afterReload = await page.evaluate(() => localStorage.getItem('att.status.v1'));
    expect(afterReload).toBeNull();

    await scanManualQr(page, 'enc-token');
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Pointe', { timeout: 15000 });
    const statusStored = await page.evaluate(() => localStorage.getItem('att.status.v1'));
    expect(statusStored).toBeTruthy();
    expect(statusStored.startsWith('enc1:')).toBe(true);
    await page.close();
  });

  test('app accepts a legacy plaintext profile seed', async () => {
    const page = await bootPage(browser, { profile: true });
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Non pointe');
    await page.close();
  });
});

/* ==========================================
   3. REMINDERS AND TENANT PERSISTENCE
   ========================================== */
describe('Profile Extras', () => {
  test('reminder opt-in persists to localStorage', async () => {
    const page = await bootPage(browser, { seed: { 'att.onboarded.v1': '1' } });
    await page.click('#btn-profile');
    await page.click('#pf-remind');
    await page.type('#pf-name', 'Remi Test');
    await page.type('#pf-email', 'remi@test.com');
    await page.click('#btn-profile-save');
    await page.waitForFunction(() => document.getElementById('modal-profile').classList.contains('hidden'));
    const remind = await page.evaluate(() => localStorage.getItem('att.remind.v1'));
    expect(remind).toBe('1');

    await page.click('#btn-profile');
    const checked = await page.$eval('#pf-remind', el => el.checked);
    expect(checked).toBe(true);
    await page.close();
  });

  test('tenant code persists and pre-fills the modal', async () => {
    const page = await bootPage(browser, { seed: { 'att.onboarded.v1': '1' } });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'Tena Test');
    await page.type('#pf-email', 'tena@test.com');
    await page.type('#pf-tenant', 'acme');
    await page.click('#btn-profile-save');
    await page.waitForFunction(() => document.getElementById('modal-profile').classList.contains('hidden'));

    await page.click('#btn-profile');
    await page.waitForSelector('#modal-profile:not(.hidden)', { timeout: 5000 });
    const tenantVal = await page.$eval('#pf-tenant', el => el.value);
    expect(tenantVal).toBe('acme');
    await page.close();
  });
});
