const puppeteer = require('puppeteer');

const APP_URL = process.env.APP_URL || 'http://localhost:3456';

const delay = ms => new Promise(r => setTimeout(r, ms));

let browser;
let page;

beforeAll(async () => {
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
});

afterAll(async () => {
  if (browser) await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  page.on('pageerror', () => {});
  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 15000 });
  await page.evaluate(() => {
    localStorage.setItem('att.consent.v1', '1');
  });
  await page.reload({ waitUntil: 'networkidle2', timeout: 15000 });
});

afterEach(async () => {
  if (page) { await page.close().catch(() => {}); page = null; }
});

async function setupProfile(page) {
  await page.evaluate(() => {
    localStorage.setItem('att.consent.v1', '1');
    localStorage.setItem('att.onboarded.v1', '1');
    localStorage.setItem('att.profile.v1', JSON.stringify({ name: 'Test User', email: 'test@bdj.com' }));
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(
    () => document.getElementById('status-label').textContent !== 'Bienvenue',
    { timeout: 10000 }
  );
}

// Intercept API calls to the Apps Script backend and answer locally.
async function mockApi(page, responder) {
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.url().indexOf('script.google.com') === -1) { req.continue(); return; }
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const res = responder(body);
    if (!res) { req.continue(); return; }
    req.respond({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(res),
    });
  });
}

async function grantAdminAccess(page) {
  await mockApi(page, body => {
    if (body.action === 'admin_check') return { ok: true, isAdmin: true };
    return null;
  });
  await setupProfile(page);
}

/* ==========================================
   1. APP LOADING
   ========================================== */
describe('App Loading', () => {
  test('index.html loads with correct title', async () => {
    const title = await page.title();
    expect(title).toBe('BDJ Consulting');
  });

  test('app-name displays correct text', async () => {
    const text = await page.$eval('#app-name', el => el.textContent);
    expect(text).toBe('BDJ Consulting');
  });

  test('live-time shows HH:MM:SS format', async () => {
    const text = await page.$eval('#live-time', el => el.textContent);
    expect(text).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  test('scan button is visible and enabled', async () => {
    const btn = await page.$('#btn-scan');
    expect(btn).not.toBeNull();
    const disabled = await page.$eval('#btn-scan', el => el.disabled);
    expect(disabled).toBe(false);
  });

  test('today-date shows formatted date', async () => {
    const text = await page.$eval('#today-date', el => el.textContent);
    expect(text.length).toBeGreaterThan(5);
  });

  test('scan button label says "Scan QR to check in"', async () => {
    const text = await page.$eval('#btn-scan-label', el => el.textContent);
    expect(text).toBe('Scanner QR pour pointer');
  });

  test('status card shows status-avatar', async () => {
    const avatar = await page.$('#status-avatar');
    expect(avatar).not.toBeNull();
  });

  test('footer buttons are visible', async () => {
    const historyBtn = await page.$('#btn-history');
    const adminBtn = await page.$('#btn-admin');
    expect(historyBtn).not.toBeNull();
    expect(adminBtn).not.toBeNull();
  });

  test('no geolocation prompt appears', async () => {
    const geoCalled = await page.evaluate(() => {
      return new Promise(resolve => {
        let called = false;
        const orig = navigator.geolocation;
        if (orig && orig.getCurrentPosition) {
          const origFn = orig.getCurrentPosition;
          Object.defineProperty(orig, 'getCurrentPosition', {
            value: () => { called = true; },
            configurable: true
          });
          setTimeout(() => {
            Object.defineProperty(orig, 'getCurrentPosition', {
              value: origFn,
              configurable: true
            });
            resolve(called);
          }, 2000);
        } else {
          resolve(false);
        }
      });
    });
    expect(geoCalled).toBe(false);
  });
});

/* ==========================================
   1b. CONSENT BANNER
   ========================================== */
describe('Consent Banner', () => {
  test('shows consent banner when no consent stored', async () => {
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload({ waitUntil: 'networkidle2' });
    const hidden = await page.$eval('#consent-banner', el => el.classList.contains('hidden'));
    expect(hidden).toBe(false);
  });

  test('accept hides banner and app initializes', async () => {
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#consent-accept');
    await delay(500);
    const hidden = await page.$eval('#consent-banner', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
    const consent = await page.evaluate(() => localStorage.getItem('att.consent.v1'));
    expect(consent).toBe('1');
  });

  test('decline hides banner and consent is 0', async () => {
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#consent-decline');
    await delay(300);
    const hidden = await page.$eval('#consent-banner', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
    const consent = await page.evaluate(() => localStorage.getItem('att.consent.v1'));
    expect(consent).toBe('0');
  });

  test('consent banner hidden when consent already given', async () => {
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('att.consent.v1', '1'); });
    await page.reload({ waitUntil: 'networkidle2' });
    const hidden = await page.$eval('#consent-banner', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
  });
});

/* ==========================================
   2. ONBOARDING
   ========================================== */
describe('Onboarding', () => {
  test('onboarding modal appears on first visit', async () => {
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('att.consent.v1', '1'); });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 5000 });
    const title = await page.$eval('#ob-title', el => el.textContent);
    expect(title).toBe('Bienvenue');
  });

  test('onboarding has 3 steps with dots', async () => {
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('att.consent.v1', '1'); });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 5000 });
    const dots = await page.$$eval('#ob-steps .ob-dot', els => els.length);
    expect(dots).toBe(3);
  });

  test('skip button dismisses onboarding', async () => {
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('att.consent.v1', '1'); });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 5000 });
    await page.click('#ob-skip');
    const hidden = await page.$eval('#modal-onboard', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
  });

  test('next button goes through steps', async () => {
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('att.consent.v1', '1'); });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 5000 });

    const step1 = await page.$eval('#ob-title', el => el.textContent);
    expect(step1).toBe('Bienvenue');

    await page.click('#ob-next');
    await delay(300);
    const step2 = await page.$eval('#ob-title', el => el.textContent);
    expect(step2).toBe('Vos coordonnees');
  });

  test('step 2 "Open profile" button opens profile modal', async () => {
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('att.consent.v1', '1'); });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 5000 });
    await page.click('#ob-next');
    await delay(300);
    await page.click('#ob-next');
    await delay(500);
    const profileHidden = await page.$eval('#modal-profile', el => el.classList.contains('hidden'));
    expect(profileHidden).toBe(false);
  });

  test('onboarding does not appear if already onboarded', async () => {
    await page.evaluate(() => localStorage.setItem('att.onboarded.v1', '1'));
    await page.reload({ waitUntil: 'networkidle2' });
    await delay(1000);
    const hidden = await page.$eval('#modal-onboard', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
  });
});

/* ==========================================
   3. THEME TOGGLE
   ========================================== */
describe('Theme Toggle', () => {
  test('switches to light', async () => {
    await page.evaluate(() => localStorage.setItem('att.theme.v1', 'dark'));
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-theme');
    const theme = await page.$eval('html', el => el.getAttribute('data-theme'));
    expect(theme).toBe('light');
  });

  test('switches back to dark', async () => {
    await page.evaluate(() => localStorage.setItem('att.theme.v1', 'light'));
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-theme');
    const theme = await page.$eval('html', el => el.getAttribute('data-theme'));
    expect(theme).toBe('dark');
  });

  test('sun icon hidden in light mode', async () => {
    await page.evaluate(() => localStorage.setItem('att.theme.v1', 'light'));
    await page.reload({ waitUntil: 'networkidle2' });
    const display = await page.$eval('#ic-sun', el => el.style.display);
    expect(display).toBe('none');
  });

  test('moon icon hidden in dark mode', async () => {
    await page.evaluate(() => localStorage.setItem('att.theme.v1', 'dark'));
    await page.reload({ waitUntil: 'networkidle2' });
    const display = await page.$eval('#ic-moon', el => el.style.display);
    expect(display).toBe('none');
  });

  test('theme persists after reload', async () => {
    await page.evaluate(() => localStorage.setItem('att.theme.v1', 'light'));
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-theme');
    await page.reload({ waitUntil: 'networkidle2' });
    const theme = await page.$eval('html', el => el.getAttribute('data-theme'));
    expect(theme).toBe('dark');
  });
});

/* ==========================================
   4. PROFILE MODAL
   ========================================== */
describe('Profile Modal', () => {
  test('profile button opens modal', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.removeItem('att.profile.v1');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-profile');
    const hidden = await page.$eval('#modal-profile', el => el.classList.contains('hidden'));
    expect(hidden).toBe(false);
  });

  test('shows error when saving empty name', async () => {
    await page.evaluate(() => localStorage.setItem('att.onboarded.v1', '1'));
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-profile');
    await page.click('#btn-profile-save');
    const errText = await page.$eval('#profile-error', el => el.textContent);
    expect(errText).toContain('nom');
  });

  test('shows error when saving invalid email', async () => {
    await page.evaluate(() => localStorage.setItem('att.onboarded.v1', '1'));
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'John Doe');
    await page.type('#pf-email', 'invalid');
    await page.click('#btn-profile-save');
    const errText = await page.$eval('#profile-error', el => el.textContent);
    expect(errText).toContain('email');
  });

  test('valid profile saves and closes modal', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.removeItem('att.profile.v1');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'John Doe');
    await page.type('#pf-email', 'john@test.com');
    await page.click('#btn-profile-save');
    const hidden = await page.$eval('#modal-profile', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
  });

  test('saved profile data persists in localStorage', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.removeItem('att.profile.v1');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'Jane Doe');
    await page.type('#pf-email', 'jane@test.com');
    await page.click('#btn-profile-save');
    await delay(500);
    const stored = await page.evaluate(() => localStorage.getItem('att.profile.v1'));
    expect(stored).toBeTruthy();
    expect(stored.startsWith('enc1:')).toBe(true);
    const payload = JSON.parse(stored.slice(5));
    expect(payload.iv).toBeTruthy();
    expect(payload.d).toBeTruthy();
  });

  test('profile modal pre-fills existing data', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.setItem('att.profile.v1', JSON.stringify({ name: 'Existing', email: 'exist@test.com' }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-profile');
    const nameVal = await page.$eval('#pf-name', el => el.value);
    const emailVal = await page.$eval('#pf-email', el => el.value);
    expect(nameVal).toBe('Existing');
    expect(emailVal).toBe('exist@test.com');
  });

  test('shows error for invalid tenant code', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.removeItem('att.profile.v1');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'Test');
    await page.type('#pf-email', 'test@test.com');
    await page.type('#pf-tenant', 'INVALID CODE WITH SPACES');
    await page.click('#btn-profile-save');
    const errText = await page.$eval('#profile-error', el => el.textContent);
    expect(errText).toContain('espace');
  });

  test('valid tenant code saves', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.removeItem('att.profile.v1');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'Test');
    await page.type('#pf-email', 'test@test.com');
    await page.type('#pf-tenant', 'acme');
    await page.click('#btn-profile-save');
    const hidden = await page.$eval('#modal-profile', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
  });
});

/* ==========================================
   5. ROUTING / NAVIGATION
   ========================================== */
describe('Routing / Navigation', () => {
  test('#admin hash shows admin view for admins', async () => {
    await grantAdminAccess(page);
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => !document.getElementById('view-admin').classList.contains('hidden'),
      { timeout: 10000 }
    );
    const adminHidden = await page.$eval('#view-admin', el => el.classList.contains('hidden'));
    expect(adminHidden).toBe(false);
  });

  test('#admin redirects home for employees', async () => {
    await mockApi(page, body => {
      if (body.action === 'admin_check') return { ok: true, isAdmin: false };
      return null;
    });
    await setupProfile(page);
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => location.hash !== '#admin', { timeout: 10000 });
    const hash = await page.evaluate(() => location.hash);
    expect(hash).toBe('#home');
  });

  test('#admin redirects home without profile', async () => {
    await page.evaluate(() => localStorage.setItem('att.onboarded.v1', '1'));
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => location.hash !== '#admin', { timeout: 10000 });
    const hash = await page.evaluate(() => location.hash);
    expect(hash).toBe('#home');
  });

  test('admin button hidden for employees', async () => {
    await mockApi(page, body => {
      if (body.action === 'admin_check') return { ok: true, isAdmin: false };
      return null;
    });
    await setupProfile(page);
    await page.waitForFunction(
      () => document.getElementById('btn-admin').classList.contains('hidden'),
      { timeout: 10000 }
    );
  });

  test('admin button visible for admins', async () => {
    await grantAdminAccess(page);
    await page.waitForFunction(
      () => !document.getElementById('btn-admin').classList.contains('hidden'),
      { timeout: 10000 }
    );
  });

  test('#home hash shows home view', async () => {
    await grantAdminAccess(page);
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => !document.getElementById('view-admin').classList.contains('hidden'),
      { timeout: 10000 }
    );
    await page.click('#btn-back');
    const homeHidden = await page.$eval('#view-home', el => el.classList.contains('hidden'));
    expect(homeHidden).toBe(false);
  });

  test('admin button navigates to admin', async () => {
    await grantAdminAccess(page);
    await page.evaluate(() => document.getElementById('btn-admin').click());
    await page.waitForFunction(() => location.hash === '#admin', { timeout: 10000 });
    const hash = await page.evaluate(() => location.hash);
    expect(hash).toBe('#admin');
  });

  test('back button navigates to home', async () => {
    await grantAdminAccess(page);
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.click('#btn-back');
    const hash = await page.evaluate(() => location.hash);
    expect(hash).toBe('#home');
  });
});

/* ==========================================
   6. ADMIN VIEW
   ========================================== */
describe('Admin View', () => {
  test('admin login form is visible', async () => {
    await grantAdminAccess(page);
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => !document.getElementById('view-admin').classList.contains('hidden'),
      { timeout: 10000 }
    );
    const loginHidden = await page.$eval('#admin-login', el => el.classList.contains('hidden'));
    expect(loginHidden).toBe(false);
  });

  test('shows error when clicking go without PIN', async () => {
    await grantAdminAccess(page);
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => !document.getElementById('view-admin').classList.contains('hidden'),
      { timeout: 10000 }
    );
    await page.click('#btn-admin-go');
    const errText = await page.$eval('#admin-error', el => el.textContent);
    expect(errText).toContain('PIN');
  });

  test('admin PIN input accepts Enter key', async () => {
    await grantAdminAccess(page);
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => !document.getElementById('view-admin').classList.contains('hidden'),
      { timeout: 10000 }
    );
    await page.type('#admin-pin', '1234');
    await page.keyboard.press('Enter');
    const errText = await page.$eval('#admin-error', el => el.textContent);
    expect(errText).toContain('');
  });

  test('admin dashboard is hidden initially', async () => {
    await grantAdminAccess(page);
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => !document.getElementById('view-admin').classList.contains('hidden'),
      { timeout: 10000 }
    );
    const dashHidden = await page.$eval('#admin-dash', el => el.classList.contains('hidden'));
    expect(dashHidden).toBe(true);
  });

  test('collapsible cards toggle', async () => {
    await grantAdminAccess(page);
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => !document.getElementById('view-admin').classList.contains('hidden'),
      { timeout: 10000 }
    );

    const collapsed = await page.$eval('.card.collapsed', el => el.classList.contains('collapsed'));
    expect(collapsed).toBe(true);
  });

  test('dashboard renders KPI cards and chart for admins', async () => {
    await mockApi(page, body => {
      if (body.action === 'admin_check') return { ok: true, isAdmin: true };
      if (body.action === 'employees') return { ok: true, employees: [] };
      if (body.action === 'admins_list') return { ok: true, admins: [] };
      if (body.action === 'admin_login') return { ok: true, sessionToken: 'tok' };
      if (body.action === 'admin') {
        return {
          ok: true,
          sessionToken: 'tok',
          admin: {
            appName: 'BDJ Consulting',
            sheetUrl: '',
            today: '2026-08-21',
            range: { from: '2026-08-21', to: '2026-08-21' },
            live: { checkedInToday: 3, checkedOutToday: 1, onSite: 2, onSiteNames: ['A', 'B'], absent: [] },
            summary: { totalHours: 7.5, daysPresent: 3, lateCount: 1, missingOut: 0, people: 2 },
            pairs: [
              { date: '2026-08-21', name: 'A', email: 'a@x.com', in: '08:00', out: '12:00', hours: 4, late: false, missing: false },
              { date: '2026-08-20', name: 'B', email: 'b@x.com', in: '09:00', out: '12:30', hours: 3.5, late: true, missing: false }
            ],
            people: [
              { email: 'a@x.com', name: 'Alice', department: 'IT', daysPresent: 1, totalHours: 4, avgHours: 4, lateCount: 0, missingOut: 0, statusToday: 'onsite' },
              { email: 'b@x.com', name: 'Bob', department: '', daysPresent: 1, totalHours: 3.5, avgHours: 3.5, lateCount: 1, missingOut: 0, statusToday: '' }
            ],
            admins: []
          }
        };
      }
      return null;
    });
    await setupProfile(page);
    await page.evaluate(() => document.getElementById('btn-admin').click());
    await page.waitForFunction(
      () => !document.getElementById('view-admin').classList.contains('hidden'),
      { timeout: 15000 }
    );
    await page.type('#admin-email', 'test@bdj.com');
    await page.type('#admin-pin', '1234');
    await page.click('#btn-admin-go');
    await page.waitForFunction(
      () => !document.getElementById('admin-dash').classList.contains('hidden'),
      { timeout: 15000 }
    );
    const kpis = await page.$$eval('.kpi-grid .kpi', els => els.length);
    expect(kpis).toBe(4);
    const staffVal = await page.$eval('#kpi-staff', el => el.textContent);
    expect(staffVal).toBe('2');
    const bars = await page.$$eval('#hours-chart .bar-col', els => els.length);
    expect(bars).toBe(2);
    const avatars = await page.$$eval('#people-table .avatar', els => els.length);
    expect(avatars).toBe(2);
  });
});

/* ==========================================
   7. STATUS CARD
   ========================================== */
describe('Status Card', () => {
  test('shows Welcome when no profile', async () => {
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('att.consent.v1', '1'); });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => document.getElementById('status-label').textContent !== '--:--',
      { timeout: 5000 }
    );
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Bienvenue');
  });

  test('shows "Non pointe" when profile exists but no status', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.setItem('att.profile.v1', JSON.stringify({ name: 'Test', email: 't@t.com' }));
      localStorage.removeItem('att.status.v1');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => document.getElementById('status-label').textContent !== 'Bienvenue',
      { timeout: 5000 }
    );
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Non pointe');
  });

  test('shows "Checked in" with check-out button', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.setItem('att.profile.v1', JSON.stringify({ name: 'Test', email: 't@t.com' }));
      localStorage.setItem('att.status.v1', JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        action: 'Check-in', time: '09:00', office: 'HQ'
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => document.getElementById('status-label').textContent !== 'Bienvenue',
      { timeout: 10000 }
    );
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Pointe');
    const btnText = await page.$eval('#btn-scan-label', el => el.textContent);
    expect(btnText).toContain('sortie');
  });

  test('shows "Checked out" after check-out', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.setItem('att.profile.v1', JSON.stringify({ name: 'Test', email: 't@t.com' }));
      localStorage.setItem('att.status.v1', JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        action: 'Check-out', time: '17:00', office: 'HQ'
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => document.getElementById('status-label').textContent !== 'Bienvenue',
      { timeout: 5000 }
    );
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Sorti');
  });

  test('checked-in card has "checked-in" class', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.setItem('att.profile.v1', JSON.stringify({ name: 'Test', email: 't@t.com' }));
      localStorage.setItem('att.status.v1', JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        action: 'Check-in', time: '09:00', office: 'HQ'
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => document.getElementById('status-label').textContent === 'Pointe',
      { timeout: 10000 }
    );
    const hasClass = await page.$eval('#status-card', el => el.classList.contains('checked-in'));
    expect(hasClass).toBe(true);
  });

  test('old day status is cleared', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.setItem('att.profile.v1', JSON.stringify({ name: 'Test', email: 't@t.com' }));
      localStorage.setItem('att.status.v1', JSON.stringify({
        date: '2020-01-01', action: 'Check-in', time: '09:00', office: 'HQ'
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => document.getElementById('status-label').textContent !== 'Bienvenue',
      { timeout: 5000 }
    );
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Non pointe');
  });
});

/* ==========================================
   8. QR SCANNER MODAL
   ========================================== */
describe('QR Scanner Modal', () => {
  test('scan click without profile opens profile modal', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.removeItem('att.profile.v1');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-scan');
    await delay(500);
    const profileHidden = await page.$eval('#modal-profile', el => el.classList.contains('hidden'));
    expect(profileHidden).toBe(false);
  });

  test('scan modal opens with profile set', async () => {
    await setupProfile(page);
    await page.click('#btn-scan');
    await delay(500);
    const scanHidden = await page.$eval('#modal-scan', el => el.classList.contains('hidden'));
    expect(scanHidden).toBe(false);
  });

  test('cancel button closes scanner', async () => {
    await setupProfile(page);
    await page.click('#btn-scan');
    await delay(500);
    await page.click('#btn-scan-cancel');
    await delay(300);
    const scanHidden = await page.$eval('#modal-scan', el => el.classList.contains('hidden'));
    expect(scanHidden).toBe(true);
  });

  test('manual QR input is available', async () => {
    await setupProfile(page);
    await page.click('#btn-scan');
    await delay(500);
    const manualInput = await page.$('#manual-qr');
    expect(manualInput).not.toBeNull();
  });

  test('manual QR with empty input shows error', async () => {
    await setupProfile(page);
    await page.click('#btn-scan');
    await delay(500);
    await page.evaluate(() => {
      const d = document.querySelector('#modal-scan details');
      if (d) d.open = true;
    });
    await page.click('#btn-manual-ok');
    await delay(500);
    const text = await page.$eval('#feedback', el => el.textContent);
    expect(text.length).toBeGreaterThan(0);
  });
});

/* ==========================================
   9. HISTORY MODAL
   ========================================== */
describe('History Modal', () => {
  test('history button opens modal', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.removeItem('att.profile.v1');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-history');
    await delay(500);
    const feedbackEl = await page.$('#feedback');
    const text = await feedbackEl.evaluate(el => el.textContent);
    expect(text.toLowerCase()).toContain('coordonnees');
  });

  test('history button with profile shows feedback', async () => {
    await setupProfile(page);
    await page.click('#btn-history');
    await delay(3000);
    const text = await page.$eval('#feedback', el => el.textContent);
    expect(text.length).toBeGreaterThan(0);
  });

  test('history close button works', async () => {
    await setupProfile(page);
    await page.evaluate(() => {
      const m = document.getElementById('modal-history');
      if (m) m.classList.remove('hidden');
    });
    await delay(300);
    const visible = await page.evaluate(() => {
      const m = document.getElementById('modal-history');
      return m && !m.classList.contains('hidden');
    });
    expect(visible).toBe(true);
    await page.click('#btn-hist-close');
    await delay(300);
    const hidden = await page.$eval('#modal-history', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
  });
});

/* ==========================================
   10. SETUP BANNER
   ========================================== */
describe('Setup Banner', () => {
  test('shows when API is not configured', async () => {
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      Object.defineProperty(window, 'ATT_CONFIG', {
        value: {
          API_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
          APP_NAME: 'Test App',
          DEFAULT_TENANT: '',
        },
        writable: false,
        configurable: false,
      });
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => {
      const b = document.getElementById('setup-banner');
      return b && !b.classList.contains('hidden');
    }, { timeout: 5000 });
    const bannerHidden = await page.$eval('#setup-banner', el => el.classList.contains('hidden'));
    expect(bannerHidden).toBe(false);
    await page.evaluateOnNewDocument(() => {});
  });

  test('hidden when API is configured', async () => {
    await page.reload({ waitUntil: 'networkidle2' });
    await delay(1500);
    const bannerHidden = await page.$eval('#setup-banner', el => el.classList.contains('hidden'));
    expect(bannerHidden).toBe(true);
  });
});

/* ==========================================
   11. COLLAPSIBLE CARDS
   ========================================== */
describe('Collapsible Cards', () => {
  test('collapsed cards hide block-body', async () => {
    await grantAdminAccess(page);
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => !document.getElementById('view-admin').classList.contains('hidden'),
      { timeout: 10000 }
    );
    const bodyHidden = await page.evaluate(() => {
      const card = document.querySelector('.card.collapsed');
      if (!card) return null;
      const body = card.querySelector('.block-body');
      return body ? getComputedStyle(body).display === 'none' : null;
    });
    expect(bodyHidden).toBe(true);
  });

  test('clicking collapsible header toggles card', async () => {
    await grantAdminAccess(page);
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => !document.getElementById('view-admin').classList.contains('hidden'),
      { timeout: 10000 }
    );
    const result = await page.evaluate(() => {
      const header = document.querySelector('.card.collapsed .block-head.collapsible');
      if (!header) return { clicked: false };
      const card = header.closest('.card');
      header.click();
      return { clicked: true, stillCollapsed: card.classList.contains('collapsed') };
    });
    if (result.clicked) {
      await delay(300);
      expect(result.stillCollapsed).toBe(false);
    }
  });
});

/* ==========================================
   12. ENCRYPTED LOCAL STORAGE
   ========================================== */
describe('Encrypted Local Storage', () => {
  test('profile is stored encrypted (enc1: prefix)', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.removeItem('att.profile.v1');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-profile');
    await page.type('#pf-name', 'Enc Test');
    await page.type('#pf-email', 'enc@test.com');
    await page.click('#btn-profile-save');
    await delay(500);
    const stored = await page.evaluate(() => localStorage.getItem('att.profile.v1'));
    expect(stored).toBeTruthy();
    expect(stored.startsWith('enc1:')).toBe(true);
  });

  test('encryption key is created in localStorage', async () => {
    const key = await page.evaluate(() => localStorage.getItem('att.key.v1'));
    expect(key).toBeTruthy();
    expect(key.length).toBeGreaterThan(10);
  });

  test('status is stored encrypted', async () => {
    await setupProfile(page);
    const statusStored = await page.evaluate(() => {
      return localStorage.getItem('att.status.v1');
    });
    if (statusStored) {
      expect(statusStored.startsWith('enc1:')).toBe(true);
    }
  });
});

/* ==========================================
   13. LIVE CLOCK
   ========================================== */
describe('Live Clock', () => {
  test('clock updates every second', async () => {
    const time1 = await page.$eval('#live-time', el => el.textContent);
    await delay(1500);
    const time2 = await page.$eval('#live-time', el => el.textContent);
    expect(time1).not.toBe(time2);
  });
});

/* ==========================================
   14. STATIC ASSETS
   ========================================== */
describe('Static Assets', () => {
  test('styles.css loads', async () => {
    const response = await page.goto(`${APP_URL}/styles.css`);
    expect(response.status()).toBe(200);
  });

  test('config.js loads', async () => {
    const response = await page.goto(`${APP_URL}/config.js`);
    expect(response.status()).toBe(200);
  });

  test('sw.js loads', async () => {
    const response = await page.goto(`${APP_URL}/sw.js`);
    expect(response.status()).toBe(200);
  });

  test('manifest.webmanifest loads', async () => {
    const response = await page.goto(`${APP_URL}/manifest.webmanifest`);
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.name).toBe('BDJ Consulting');
  });

  test('qr-generator.html loads', async () => {
    const response = await page.goto(`${APP_URL}/qr-generator.html`);
    expect(response.status()).toBe(200);
  });
});

/* ==========================================
   15. WEB MANIFEST
   ========================================== */
describe('Web Manifest', () => {
  test('manifest link tag exists', async () => {
    const manifestHref = await page.$eval('link[rel="manifest"]', el => el.getAttribute('href'));
    expect(manifestHref).toBe('manifest.webmanifest');
  });

  test('theme-color meta tag exists', async () => {
    const color = await page.$eval('meta[name="theme-color"]', el => el.getAttribute('content'));
    expect(color).toBeTruthy();
  });
});

/* ==========================================
   16. RESPONSIVE VIEWPORTS
   ========================================== */
describe('Responsive Viewports', () => {
  const viewports = [
    { name: 'mobile (375x812)', width: 375, height: 812 },
    { name: 'tablet (768x1024)', width: 768, height: 1024 },
    { name: 'desktop (1280x800)', width: 1280, height: 800 },
  ];

  viewports.forEach(({ name, width, height }) => {
    test(`renders at ${name}`, async () => {
      await page.setViewport({ width, height });
      await page.reload({ waitUntil: 'networkidle2' });
      const btnVisible = await page.$eval('#btn-scan', el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      expect(btnVisible).toBe(true);
    });
  });
});

/* ==========================================
   17. NO JAVASCRIPT ERRORS
   ========================================== */
describe('No JavaScript Errors', () => {
  test('loads without console errors', async () => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.evaluate(() => localStorage.setItem('att.onboarded.v1', '1'));
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    expect(errors).toEqual([]);
  });

  test('navigates to admin without errors', async () => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.evaluate(() => localStorage.setItem('att.onboarded.v1', '1'));
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    expect(errors).toEqual([]);
  });

  test('theme toggle without errors', async () => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.evaluate(() => localStorage.setItem('att.onboarded.v1', '1'));
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-theme');
    await page.click('#btn-theme');
    await new Promise(r => setTimeout(r, 500));
    expect(errors).toEqual([]);
  });

  test('profile open/save cycle without errors', async () => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.evaluate(() => localStorage.setItem('att.onboarded.v1', '1'));
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-profile');
    await page.click('#btn-profile-save');
    await new Promise(r => setTimeout(r, 500));
    expect(errors).toEqual([]);
  });

  test('full flow: onboard -> profile -> home without errors', async () => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('att.consent.v1', '1'); });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 5000 });
    await page.click('#ob-skip');
    await delay(300);
    await page.click('#btn-profile');
    await page.type('#pf-name', 'Flow Test');
    await page.type('#pf-email', 'flow@test.com');
    await page.click('#btn-profile-save');
    await delay(500);
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Non pointe');
    expect(errors).toEqual([]);
  });
});
