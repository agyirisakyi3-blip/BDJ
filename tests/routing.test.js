const { launchBrowser, bootPage, apiRoutes, apiCapture, adminFixture } = require('./helpers');

let browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  if (browser) await browser.close();
});

function adminCheckApi(isAdmin) {
  return apiRoutes({
    admin_check: { ok: true, isAdmin },
    /* quiet background loaders so they never overwrite #feedback with errors */
    recent: { ok: true, recent: [] },
    week: { ok: true, week: [] },
    myattendance: { ok: true, attendance: { range: {}, summary: {}, pairs: [] } }
  });
}

/* ==========================================
   1. ROUTING / NAVIGATION
   ========================================== */
describe('Routing / Navigation', () => {
  test('#admin hash shows admin view for admins', async () => {
    const page = await bootPage(browser, { profile: true, api: adminCheckApi(true), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    await page.close();
  });

  test('#admin redirects home for employees', async () => {
    const page = await bootPage(browser, { profile: true, api: adminCheckApi(false), hash: '#admin' });
    await page.waitForFunction(() => location.hash !== '#admin', { timeout: 10000 });
    const hash = await page.evaluate(() => location.hash);
    expect(hash).toBe('#home');
    const warn = await page.$eval('#feedback', el => el.textContent);
    expect(warn).toContain('reserve');
    await page.close();
  });

  test('#admin redirects home without profile', async () => {
    const page = await bootPage(browser, { hash: '#admin' });
    await page.waitForFunction(() => location.hash !== '#admin', { timeout: 10000 });
    const hash = await page.evaluate(() => location.hash);
    expect(hash).toBe('#home');
    await page.close();
  });

  test('admin button hidden for employees', async () => {
    const page = await bootPage(browser, { profile: true, api: adminCheckApi(false) });
    await page.waitForFunction(() => document.getElementById('btn-admin').classList.contains('hidden'), { timeout: 10000 });
    await page.close();
  });

  test('admin button visible for admins', async () => {
    const page = await bootPage(browser, { profile: true, api: adminCheckApi(true) });
    await page.waitForFunction(() => !document.getElementById('btn-admin').classList.contains('hidden'), { timeout: 10000 });
    await page.close();
  });

  test('#home hash shows home view', async () => {
    const page = await bootPage(browser, { profile: true, api: adminCheckApi(true), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    await page.click('#btn-back');
    await page.waitForFunction(() => !document.getElementById('view-home').classList.contains('hidden'));
    const homeHidden = await page.$eval('#view-home', el => el.classList.contains('hidden'));
    expect(homeHidden).toBe(false);
    await page.close();
  });

  test('admin button navigates to admin', async () => {
    const page = await bootPage(browser, { profile: true, api: adminCheckApi(true) });
    await page.waitForFunction(() => !document.getElementById('btn-admin').classList.contains('hidden'), { timeout: 10000 });
    await page.evaluate(() => document.getElementById('btn-admin').click());
    await page.waitForFunction(() => location.hash === '#admin', { timeout: 10000 });
    await page.close();
  });

  test('back button navigates to home', async () => {
    const page = await bootPage(browser, { profile: true, api: adminCheckApi(true), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    await page.click('#btn-back');
    await page.waitForFunction(() => location.hash === '#home');
    await page.close();
  });

  test('nav home button scrolls home and returns from admin', async () => {
    const page = await bootPage(browser, { profile: true, api: adminCheckApi(true), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    await page.click('#nav-home');
    await page.waitForFunction(() => location.hash === '#home');
    const homeVisible = await page.$eval('#view-home', el => !el.classList.contains('hidden'));
    expect(homeVisible).toBe(true);
    await page.close();
  });

  test('admin_check network failure keeps admin hidden', async () => {
    const page = await bootPage(browser, {
      profile: true,
      api: body => (body.action === 'admin_check'
        ? { ok: false, message: 'boom' }
        : (body.action === 'config' ? { ok: true, config: { appName: 'addredance' } } : null))
    });
    await new Promise(r => setTimeout(r, 1200));
    const hidden = await page.$eval('#btn-admin', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
    await page.close();
  });
});

/* ==========================================
   2. ADMIN LOGIN
   ========================================== */
describe('Admin Login', () => {
  function loginApi(cap) {
    return body => cap.handler(body);
  }

  function makeCap() {
    return apiCapture(apiRoutes({
      admin_check: { ok: true, isAdmin: true },
      admin: () => ({ ok: true, sessionToken: 'tok-123', admin: adminFixture() })
    }));
  }

  test('admin login form is visible on #admin', async () => {
    const page = await bootPage(browser, { profile: true, api: apiRoutes({ admin_check: { ok: true, isAdmin: true } }), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    const loginHidden = await page.$eval('#admin-login', el => el.classList.contains('hidden'));
    expect(loginHidden).toBe(false);
    const dashHidden = await page.$eval('#admin-dash', el => el.classList.contains('hidden'));
    expect(dashHidden).toBe(true);
    await page.close();
  });

  test('shows error when clicking go without credentials', async () => {
    const page = await bootPage(browser, { profile: true, api: adminCheckApi(true), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    await page.click('#btn-admin-go');
    const errText = await page.$eval('#admin-error', el => el.textContent);
    expect(errText).toContain('PIN');
    await page.close();
  });

  test('PIN-only login opens the dashboard', async () => {
    const cap = makeCap();
    const page = await bootPage(browser, { profile: true, api: loginApi(cap), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    await page.type('#admin-pin', '4242');
    await page.click('#btn-admin-go');
    await page.waitForFunction(() => !document.getElementById('admin-dash').classList.contains('hidden'), { timeout: 15000 });
    const call = cap.ofAction('admin')[0];
    expect(call.pin).toBe('4242');
    await page.close();
  });

  test('admin PIN input accepts Enter key', async () => {
    const cap = makeCap();
    const page = await bootPage(browser, { profile: true, api: loginApi(cap), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    await page.type('#admin-pin', '4242');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('admin-dash').classList.contains('hidden'), { timeout: 15000 });
    await page.close();
  });

  test('wrong PIN shows server error message', async () => {
    const page = await bootPage(browser, {
      profile: true,
      api: apiRoutes({ admin_check: { ok: true, isAdmin: true }, admin: { ok: false, message: 'PIN invalide.' } }),
      hash: '#admin'
    });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    await page.type('#admin-pin', '0000');
    await page.click('#btn-admin-go');
    await page.waitForFunction(() => document.getElementById('admin-error').textContent.indexOf('PIN') !== -1, { timeout: 10000 });
    const dashHidden = await page.$eval('#admin-dash', el => el.classList.contains('hidden'));
    expect(dashHidden).toBe(true);
    await page.close();
  });

  test('pin toggle switches visibility', async () => {
    const page = await bootPage(browser, { profile: true, api: adminCheckApi(true), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    let type = await page.$eval('#admin-pin', el => el.type);
    expect(type).toBe('password');
    await page.click('#pin-toggle');
    type = await page.$eval('#admin-pin', el => el.type);
    expect(type).toBe('text');
    const toggledOn = await page.$eval('#pin-toggle', el => el.classList.contains('on'));
    expect(toggledOn).toBe(true);
    await page.click('#pin-toggle');
    type = await page.$eval('#admin-pin', el => el.type);
    expect(type).toBe('password');
    await page.close();
  });
});

/* ==========================================
   3. OTP LOGIN FLOW
   ========================================== */
describe('OTP Login Flow', () => {
  function otpApi() {
    return apiRoutes({
      admin_check: { ok: true, isAdmin: true },
      admin_login: body => {
        if (body.otp === '654321') return { ok: true, sessionToken: 'tok-otp', admin: adminFixture() };
        return { needOtp: true, message: 'Code envoye par email.' };
      },
      admin: () => ({ ok: true, sessionToken: 'tok-otp', admin: adminFixture() })
    });
  }

  test('email login requests OTP then completes with the code', async () => {
    const page = await bootPage(browser, { profile: true, api: otpApi(), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });

    await page.type('#admin-email', 'test@bdj.com');
    await page.type('#admin-pin', 'irrelevant');
    await page.click('#btn-admin-go');

    await page.waitForFunction(() => !document.getElementById('otp-row').classList.contains('hidden'), { timeout: 10000 });
    const note = await page.$eval('#admin-otp-note', el => el.textContent);
    expect(note).toContain('Code envoye');

    await page.type('#otp-seg .otp-box:first-child', '654321');

    await page.waitForFunction(() => !document.getElementById('admin-dash').classList.contains('hidden'), { timeout: 15000 });
    const otpRowHidden = await page.$eval('#otp-row', el => el.classList.contains('hidden'));
    expect(otpRowHidden).toBe(false);
    await page.close();
  });

  test('partial OTP does not submit automatically', async () => {
    const page = await bootPage(browser, { profile: true, api: otpApi(), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });

    await page.type('#admin-email', 'test@bdj.com');
    await page.type('#admin-pin', 'x');
    await page.click('#btn-admin-go');
    await page.waitForFunction(() => !document.getElementById('otp-row').classList.contains('hidden'), { timeout: 10000 });

    await page.type('#otp-seg .otp-box:first-child', '65');
    await new Promise(r => setTimeout(r, 600));
    const dashHidden = await page.$eval('#admin-dash', el => el.classList.contains('hidden'));
    expect(dashHidden).toBe(true);
    await page.close();
  });
});
