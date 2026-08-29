const { launchBrowser, bootPage, attachHttpMock, APP_URL } = require('./helpers');

let browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  if (browser) await browser.close();
});

/* ==========================================
   1. APP LOADING
   ========================================== */
describe('App Loading', () => {
  test('index.html loads with correct title', async () => {
    const page = await bootPage(browser);
    expect(await page.title()).toBe('addredance');
    await page.close();
  });

  test('app-name displays correct text', async () => {
    const page = await bootPage(browser, { profile: true });
    const text = await page.$eval('#app-name', el => el.textContent);
    expect(text).toBe('addredance');
    await page.close();
  });

  test('live-time shows HH:MM:SS format', async () => {
    const page = await bootPage(browser, { profile: true });
    const text = await page.$eval('#live-time', el => el.textContent);
    expect(text).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    await page.close();
  });

  test('scan button is visible and enabled', async () => {
    const page = await bootPage(browser, { profile: true });
    const btn = await page.$('#btn-scan');
    expect(btn).not.toBeNull();
    const disabled = await page.$eval('#btn-scan', el => el.disabled);
    expect(disabled).toBe(false);
    await page.close();
  });

  test('today-date shows formatted date', async () => {
    const page = await bootPage(browser, { profile: true });
    const text = await page.$eval('#today-date', el => el.textContent);
    expect(text.length).toBeGreaterThan(5);
    await page.close();
  });

  test('scan button label says "Scan QR to check in"', async () => {
    const page = await bootPage(browser, { profile: true });
    const text = await page.$eval('#btn-scan-label', el => el.textContent);
    expect(text).toBe('Scanner QR pour pointer');
    await page.close();
  });

  test('status card shows status-avatar', async () => {
    const page = await bootPage(browser, { profile: true });
    const avatar = await page.$('#status-avatar');
    expect(avatar).not.toBeNull();
    await page.close();
  });

  test('footer buttons are visible', async () => {
    const page = await bootPage(browser, { profile: true });
    const historyBtn = await page.$('#btn-history');
    const adminBtn = await page.$('#btn-admin');
    const helpBtn = await page.$('#btn-help');
    expect(historyBtn).not.toBeNull();
    expect(adminBtn).not.toBeNull();
    expect(helpBtn).not.toBeNull();
    await page.close();
  });

  test('install button is hidden until the browser offers install', async () => {
    const page = await bootPage(browser, { profile: true, blockBeforeInstall: true });
    const hidden = await page.$eval('#btn-install', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
    await page.close();
  });

  test('no geolocation prompt appears', async () => {
    const page = await bootPage(browser, { profile: true });
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
          }, 1500);
        } else {
          resolve(false);
        }
      });
    });
    expect(geoCalled).toBe(false);
    await page.close();
  });

  test('service worker registers on localhost', async () => {
    const page = await bootPage(browser, { profile: true, allowServiceWorker: true });
    const hasSw = await page.evaluate(async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < 9000) {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) return true;
        }
        await new Promise(r => setTimeout(r, 250));
      }
      return false;
    });
    expect(hasSw).toBe(true);
    await page.close();
  });
});

/* ==========================================
   2. HEAD / META
   ========================================== */
describe('Head and Meta', () => {
  test('manifest link tag exists', async () => {
    const page = await bootPage(browser);
    const href = await page.$eval('link[rel="manifest"]', el => el.getAttribute('href'));
    expect(href).toBe('manifest.webmanifest');
    await page.close();
  });

  test('theme-color meta tag exists', async () => {
    const page = await bootPage(browser);
    const color = await page.$eval('meta[name="theme-color"]', el => el.getAttribute('content'));
    expect(color).toBeTruthy();
    await page.close();
  });

  test('document language is French with favicon set', async () => {
    const page = await bootPage(browser);
    const info = await page.evaluate(() => ({
      lang: document.documentElement.getAttribute('lang'),
      icon: document.querySelector('link[rel="icon"]') ? document.querySelector('link[rel="icon"]').getAttribute('href') : null,
      description: document.querySelector('meta[name="description"]') ? true : false
    }));
    expect(info.lang).toBe('fr');
    expect(info.icon === 'icons/icon-192.png' || info.icon.indexOf('data:image/') === 0).toBe(true);
    expect(info.description).toBe(true);
    await page.close();
  });
});

/* ==========================================
   3. STATIC ASSETS
   ========================================== */
const http = require('http');

function assetStatus(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 3456, path: '/' + path }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
}

function assetBody(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 3456, path: '/' + path }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

describe('Static Assets', () => {
  test('styles.css loads', async () => {
    expect(await assetStatus('styles.css')).toBe(200);
  });

  test('config.js loads', async () => {
    expect(await assetStatus('config.js')).toBe(200);
  });

  test('sw.js loads', async () => {
    expect(await assetStatus('sw.js')).toBe(200);
  });

  test('utils.js loads', async () => {
    expect(await assetStatus('utils.js')).toBe(200);
  });

  test('office-screen.js loads (kiosk script is external for CSP)', async () => {
    expect(await assetStatus('office-screen.js')).toBe(200);
  });

  test('manifest.webmanifest loads with app metadata', async () => {
    const { status, body } = await assetBody('manifest.webmanifest');
    expect(status).toBe(200);
    const json = JSON.parse(body);
    expect(json.name).toBe('addredance');
    expect(json.short_name).toBe('addredance');
    expect(json.display).toBe('standalone');
    expect(json.icons.length).toBeGreaterThanOrEqual(3);
  });

  test('all manifest icons resolve', async () => {
    for (const icon of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png']) {
      expect(await assetStatus(icon)).toBe(200);
    }
  });

  test('office-screen.html and qr-generator.html load', async () => {
    expect(await assetStatus('office-screen.html')).toBe(200);
    expect(await assetStatus('qr-generator.html')).toBe(200);
  });
});

/* ==========================================
   4. LIVE CLOCK
   ========================================== */
describe('Live Clock', () => {
  test('clock updates every second', async () => {
    const page = await bootPage(browser, { profile: true });
    const time1 = await page.$eval('#live-time', el => el.textContent);
    await page.waitForFunction(prev => {
      return document.getElementById('live-time').textContent !== prev;
    }, { timeout: 5000 }, time1);
    const time2 = await page.$eval('#live-time', el => el.textContent);
    expect(time1).not.toBe(time2);
    await page.close();
  });
});

/* ==========================================
   5. RESPONSIVE VIEWPORTS
   ========================================== */
describe('Responsive Viewports', () => {
  const viewports = [
    { name: 'mobile (375x812)', width: 375, height: 812 },
    { name: 'tablet (768x1024)', width: 768, height: 1024 },
    { name: 'desktop (1280x800)', width: 1280, height: 800 }
  ];

  viewports.forEach(({ name, width, height }) => {
    test(`renders at ${name}`, async () => {
      const page = await bootPage(browser, { profile: true });
      await page.setViewport({ width, height });
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => {
        const el = document.getElementById('btn-scan');
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }, { timeout: 10000 });
      await page.close();
    });
  });
});

/* ==========================================
   6. NO JAVASCRIPT ERRORS
   ========================================== */
describe('No JavaScript Errors', () => {
  async function collectErrors(run) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await run(page);
    await page.close();
    return errors;
  }

  test('loads without console errors', async () => {
    const errors = await collectErrors(async page => {
      await bootExisting(page, {});
      await new Promise(r => setTimeout(r, 1500));
    });
    expect(errors).toEqual([]);
  });

  test('navigates to admin without errors', async () => {
    const errors = await collectErrors(async page => {
      await bootExisting(page, { hash: '#admin' });
      await new Promise(r => setTimeout(r, 800));
    });
    expect(errors).toEqual([]);
  });

  test('theme toggle without errors', async () => {
    const errors = await collectErrors(async page => {
      await bootExisting(page, {});
      await page.click('#btn-theme');
      await page.click('#btn-theme');
      await new Promise(r => setTimeout(r, 400));
    });
    expect(errors).toEqual([]);
  });

  test('profile open/save cycle without errors', async () => {
    const errors = await collectErrors(async page => {
      await bootExisting(page, {});
      await page.click('#btn-profile');
      await page.click('#btn-profile-save');
      await new Promise(r => setTimeout(r, 400));
    });
    expect(errors).toEqual([]);
  });

  test('full flow: login -> onboard -> profile -> home without errors', async () => {
    const errors = await collectErrors(async page => {
      await bootExisting(page, {}, true);
      await page.waitForSelector('#view-login:not(.hidden)', { timeout: 10000 });
      await page.type('#login-email', 'flow@test.com');
      await page.click('#btn-login-go');
      await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 10000 });
      await page.click('#ob-skip');
      await page.waitForFunction(() => document.getElementById('modal-onboard').classList.contains('hidden'));
      await page.click('#btn-profile');
      await page.type('#pf-name', 'Flow Test');
      await page.click('#btn-profile-save');
      await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Non pointe', { timeout: 10000 });
    });
    expect(errors).toEqual([]);
  });

  /* boots a raw page (created here so pageerror listeners catch everything) */
  async function bootExisting(page, opts, fresh) {
    const seedPairs = fresh
      ? [['att.consent.v1', '1']]
      : [
          ['att.consent.v1', '1'],
          ['att.onboarded.v1', '1'],
          ['att.session.v1', JSON.stringify({ name: 'Test User', email: 'test@bdj.com', tenant: '', isAdmin: false, token: '' })],
          ['att.profile.v1', JSON.stringify({ name: 'Test User', email: 'test@bdj.com', tenant: '' })]
        ];
    await page.evaluateOnNewDocument(p => {
      try {
        if (sessionStorage.getItem('__att_test_seeded')) return;
        sessionStorage.setItem('__att_test_seeded', '1');
        localStorage.clear();
        p.forEach(([k, v]) => localStorage.setItem(k, v));
      } catch (e) {}
    }, seedPairs);
    await attachHttpMock(page, body => {
      if (body.action === 'admin_check') return { ok: true, isAdmin: false };
      if (body.action === 'user_login') return { ok: true, user: { name: 'Flow Test', email: body.email || 'flow@test.com' }, token: 't1' };
      return null; /* DEFAULT_API answers config/recent/week/myattendance quietly */
    });
    await page.goto(APP_URL + (opts.hash || ''), { waitUntil: 'load', timeout: 20000 });
    if (!fresh) {
      await page.waitForFunction(() => {
        const el = document.getElementById('today-date');
        return !!(el && el.textContent.length > 0);
      }, { timeout: 15000 });
    }
  }
});
