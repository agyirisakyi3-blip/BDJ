const puppeteer = require('puppeteer');

const APP_URL = process.env.APP_URL || 'http://localhost:3456';

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
  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 15000 });
});

afterEach(async () => {
  if (page) { await page.close().catch(() => {}); page = null; }
});

describe('App Loading', () => {
  test('index.html loads successfully', async () => {
    const title = await page.title();
    expect(title).toBe('BDJ Consulting');
  });

  test('app-name displays correct text', async () => {
    const text = await page.$eval('#app-name', el => el.textContent);
    expect(text).toBe('BDJ Consulting');
  });

  test('live-time element shows time format', async () => {
    const text = await page.$eval('#live-time', el => el.textContent);
    expect(text).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  test('scan button is visible', async () => {
    const btn = await page.$('#btn-scan');
    expect(btn).not.toBeNull();
  });

  test('today-date shows formatted date', async () => {
    const text = await page.$eval('#today-date', el => el.textContent);
    expect(text.length).toBeGreaterThan(5);
  });
});

describe('Onboarding', () => {
  test('onboarding modal appears on first visit', async () => {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 5000 });
    const title = await page.$eval('#ob-title', el => el.textContent);
    expect(title).toBe('Welcome');
  });

  test('skip button dismisses onboarding', async () => {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 5000 });
    await page.click('#ob-skip');
    const hidden = await page.$eval('#modal-onboard', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
  });
});

describe('Theme Toggle', () => {
  test('theme toggle switches to light', async () => {
    await page.evaluate(() => localStorage.setItem('att.theme.v1', 'dark'));
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('#btn-theme');
    const theme = await page.$eval('html', el => el.getAttribute('data-theme'));
    expect(theme).toBe('light');
  });

  test('theme toggle switches back to dark', async () => {
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
});

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
    expect(errText).toContain('name');
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
});

describe('Routing / Navigation', () => {
  test('#admin hash shows admin view', async () => {
    await page.evaluate(() => localStorage.setItem('att.onboarded.v1', '1'));
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    const adminHidden = await page.$eval('#view-admin', el => el.classList.contains('hidden'));
    expect(adminHidden).toBe(false);
  });

  test('#home hash shows home view', async () => {
    await page.evaluate(() => localStorage.setItem('att.onboarded.v1', '1'));
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.click('#btn-back');
    const homeHidden = await page.$eval('#view-home', el => el.classList.contains('hidden'));
    expect(homeHidden).toBe(false);
  });
});

describe('Admin View', () => {
  test('admin login form is visible', async () => {
    await page.evaluate(() => localStorage.setItem('att.onboarded.v1', '1'));
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    const loginHidden = await page.$eval('#admin-login', el => el.classList.contains('hidden'));
    expect(loginHidden).toBe(false);
  });

  test('shows error when clicking go without PIN', async () => {
    await page.evaluate(() => localStorage.setItem('att.onboarded.v1', '1'));
    await page.goto(`${APP_URL}#admin`, { waitUntil: 'networkidle2' });
    await page.click('#btn-admin-go');
    const errText = await page.$eval('#admin-error', el => el.textContent);
    expect(errText).toContain('PIN');
  });
});

describe('Status Card', () => {
  test('shows Welcome when no profile', async () => {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.getElementById('status-label').textContent !== '--:--', { timeout: 5000 });
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Welcome');
  });

  test('shows Not checked in when profile exists but no status', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.setItem('att.profile.v1', JSON.stringify({ name: 'Test', email: 't@t.com' }));
      localStorage.removeItem('att.status.v1');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.getElementById('status-label').textContent !== 'Welcome', { timeout: 5000 });
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Not checked in');
  });

  test('shows Checked in with check-out button when checked in', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.setItem('att.profile.v1', JSON.stringify({ name: 'Test', email: 't@t.com' }));
      localStorage.setItem('att.status.v1', JSON.stringify({ date: new Date().toISOString().slice(0,10), action: 'Check-in', time: '09:00', office: 'HQ', distance: 50 }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.getElementById('status-label').textContent !== 'Welcome', { timeout: 5000 });
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Checked in');
    const btnText = await page.$eval('#btn-scan-label', el => el.textContent);
    expect(btnText).toContain('check out');
  });

  test('shows Checked out after check-out', async () => {
    await page.evaluate(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      localStorage.setItem('att.profile.v1', JSON.stringify({ name: 'Test', email: 't@t.com' }));
      localStorage.setItem('att.status.v1', JSON.stringify({ date: new Date().toISOString().slice(0,10), action: 'Check-out', time: '17:00', office: 'HQ', distance: 50 }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.getElementById('status-label').textContent !== 'Welcome', { timeout: 5000 });
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Checked out');
  });
});

describe('Setup Banner', () => {
  test('shows setup banner when API is not configured', async () => {
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('att.onboarded.v1', '1');
      Object.defineProperty(window, 'ATT_CONFIG', {
        value: {
          API_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
          DEFAULT_OFFICE_LAT: 5.6037,
          DEFAULT_OFFICE_LNG: -0.1869,
          DEFAULT_RADIUS_METERS: 150,
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
});

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
});

describe('Web Manifest', () => {
  test('manifest link tag exists', async () => {
    const manifestHref = await page.$eval('link[rel="manifest"]', el => el.getAttribute('href'));
    expect(manifestHref).toBe('manifest.webmanifest');
  });
});

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

describe('No JavaScript Errors', () => {
  test('loads without console errors', async () => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.evaluate(() => localStorage.setItem('att.onboarded.v1', '1'));
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    expect(errors).toEqual([]);
  });
});
