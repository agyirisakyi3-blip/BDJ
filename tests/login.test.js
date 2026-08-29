const {
  launchBrowser, bootPage, apiRoutes, apiCapture, loginUser, todayStr
} = require('./helpers');

let browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  if (browser) await browser.close();
});

/* ==========================================
   1. LOGIN GATE & DISPLAY
   ========================================== */
describe('Login Gate', () => {
  test('signed-out boot displays login view and hides home and nav', async () => {
    const page = await bootPage(browser);
    const loginHidden = await page.$eval('#view-login', el => el.classList.contains('hidden'));
    expect(loginHidden).toBe(false);

    const homeHidden = await page.$eval('#view-home', el => el.classList.contains('hidden'));
    expect(homeHidden).toBe(true);

    const navHidden = await page.$eval('.bottom-nav', el => el.classList.contains('hidden'));
    expect(navHidden).toBe(true);
    await page.close();
  });

  test('navigating to #admin when signed out warns and stays on login', async () => {
    const page = await bootPage(browser, { hash: '#admin' });
    await page.waitForFunction(() => {
      const fb = document.getElementById('feedback');
      return fb && fb.textContent.indexOf('Connectez-vous') !== -1;
    }, { timeout: 10000 });

    const hash = await page.evaluate(() => location.hash);
    expect(hash).toBe('#home');

    const loginHidden = await page.$eval('#view-login', el => el.classList.contains('hidden'));
    expect(loginHidden).toBe(false);
    await page.close();
  });
});

/* ==========================================
   2. LOGIN VALIDATION
   ========================================== */
describe('Login Validation', () => {
  test('empty email displays error message', async () => {
    const page = await bootPage(browser);
    await page.click('#btn-login-go');
    await page.waitForFunction(() => !document.getElementById('login-error').classList.contains('hidden'));
    const err = await page.$eval('#login-error', el => el.textContent);
    expect(err.toLowerCase()).toContain('email');
    await page.close();
  });

  test('invalid email format displays error message', async () => {
    const page = await bootPage(browser);
    await page.type('#login-email', 'not-an-email');
    await page.click('#btn-login-go');
    await page.waitForFunction(() => !document.getElementById('login-error').classList.contains('hidden'));
    const err = await page.$eval('#login-error', el => el.textContent);
    expect(err.toLowerCase()).toContain('valide');
    await page.close();
  });

  test('invalid tenant format displays error message', async () => {
    const page = await bootPage(browser);
    await page.type('#login-email', 'user@company.com');
    await page.type('#login-tenant', 'INVALID TENANT WITH SPACES');
    await page.click('#btn-login-go');
    await page.waitForFunction(() => !document.getElementById('login-error').classList.contains('hidden'));
    const err = await page.$eval('#login-error', el => el.textContent);
    expect(err.toLowerCase()).toContain('espace');
    await page.close();
  });
});

/* ==========================================
   3. DIRECT LOGIN FLOW (NO OTP)
   ========================================== */
describe('Direct Login Flow', () => {
  test('successful direct login enters home view and saves session', async () => {
    const cap = apiCapture(apiRoutes({
      user_login: body => ({
        ok: true,
        user: { name: 'Alice Smith', email: body.email, tenant: 'acme', isAdmin: false },
        sessionToken: 'sess_123'
      }),
      config: { ok: true, config: { appName: 'addredance' } },
      recent: { ok: true, recent: [] },
      week: { ok: true, week: [] },
      myattendance: { ok: true, attendance: { range: {}, summary: {}, pairs: [] } }
    }));

    const page = await bootPage(browser, { api: body => cap.handler(body) });
    await page.type('#login-email', 'alice@company.com');
    await page.type('#login-tenant', 'acme');
    await page.click('#btn-login-go');

    await page.waitForFunction(() => document.getElementById('view-login').classList.contains('hidden'), { timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('view-home').classList.contains('hidden'), { timeout: 10000 });

    const storedSession = await page.evaluate(() => localStorage.getItem('att.session.v1'));
    expect(storedSession).toBeTruthy();

    const storedProfile = await page.evaluate(() => localStorage.getItem('att.profile.v1'));
    expect(storedProfile).toBeTruthy();

    const loginCall = cap.ofAction('user_login')[0];
    expect(loginCall.email).toBe('alice@company.com');
    expect(loginCall.tenant).toBe('acme');
    await page.close();
  });

  test('server rejection displays error message', async () => {
    const page = await bootPage(browser, {
      api: apiRoutes({
        user_login: { ok: false, message: 'Utilisateur introuvable.' }
      })
    });

    await page.type('#login-email', 'unknown@company.com');
    await page.click('#btn-login-go');

    await page.waitForFunction(() => !document.getElementById('login-error').classList.contains('hidden'), { timeout: 10000 });
    const err = await page.$eval('#login-error', el => el.textContent);
    expect(err).toContain('introuvable');
    await page.close();
  });
});

/* ==========================================
   4. TWO-STEP OTP LOGIN FLOW
   ========================================== */
describe('OTP Login Flow', () => {
  test('requesting OTP displays 6 segmented boxes and completes verification', async () => {
    let step = 1;
    const cap = apiCapture(apiRoutes({
      user_login: body => {
        if (!body.otp) {
          step = 2;
          return { ok: true, needOtp: true, message: 'Code envoye par email.' };
        }
        if (body.otp === '123456') {
          return {
            ok: true,
            user: { name: 'Bob Jones', email: body.email, tenant: '', isAdmin: false },
            sessionToken: 'sess_bob'
          };
        }
        return { ok: false, message: 'Code incorrect.' };
      },
      config: { ok: true, config: { appName: 'addredance' } },
      recent: { ok: true, recent: [] },
      week: { ok: true, week: [] },
      myattendance: { ok: true, attendance: { range: {}, summary: {}, pairs: [] } }
    }));

    const page = await bootPage(browser, { api: body => cap.handler(body) });
    await page.type('#login-email', 'bob@company.com');
    await page.click('#btn-login-go');

    await page.waitForSelector('#login-otp-row:not(.hidden)', { timeout: 10000 });
    const note = await page.$eval('#login-otp-note', el => el.textContent);
    expect(note).toContain('Code envoye');

    const boxes = await page.$$('#login-otp-seg .otp-box');
    expect(boxes.length).toBe(6);

    for (let i = 0; i < 6; i++) {
      await boxes[i].type(String(i + 1));
    }

    await page.waitForFunction(() => document.getElementById('view-login').classList.contains('hidden'), { timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('view-home').classList.contains('hidden'), { timeout: 10000 });

    const storedSession = await page.evaluate(() => localStorage.getItem('att.session.v1'));
    expect(storedSession).toBeTruthy();
    await page.close();
  });

  test('incorrect OTP displays error', async () => {
    const page = await bootPage(browser, {
      api: apiRoutes({
        user_login: body => {
          if (!body.otp) {
            return { ok: true, needOtp: true, message: 'Code envoye.' };
          }
          return { ok: false, message: 'Code OTP invalide.' };
        }
      })
    });

    await page.type('#login-email', 'bob@company.com');
    await page.click('#btn-login-go');

    await page.waitForSelector('#login-otp-row:not(.hidden)', { timeout: 10000 });
    const boxes = await page.$$('#login-otp-seg .otp-box');
    for (let i = 0; i < 6; i++) {
      await boxes[i].type('9');
    }

    await page.waitForFunction(() => !document.getElementById('login-error').classList.contains('hidden'), { timeout: 10000 });
    const err = await page.$eval('#login-error', el => el.textContent);
    expect(err).toContain('invalide');
    await page.close();
  });
});

/* ==========================================
   5. LOGOUT FLOW
   ========================================== */
describe('Logout Flow', () => {
  test('logout button in profile modal clears session and returns to login view', async () => {
    const page = await bootPage(browser, { profile: true });

    await page.click('#btn-profile');
    await page.waitForSelector('#modal-profile:not(.hidden)', { timeout: 5000 });

    const dialogPromise = new Promise(resolve => page.once('dialog', async d => {
      resolve(d.message());
      await d.accept();
    }));

    await page.click('#btn-logout');
    const msg = await dialogPromise;
    expect(msg.toLowerCase()).toContain('deconnecter');

    await page.waitForFunction(() => !document.getElementById('view-login').classList.contains('hidden'), { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('modal-profile').classList.contains('hidden'), { timeout: 5000 });

    const session = await page.evaluate(() => localStorage.getItem('att.session.v1'));
    expect(session).toBeNull();

    const profile = await page.evaluate(() => localStorage.getItem('att.profile.v1'));
    expect(profile).toBeNull();

    const status = await page.evaluate(() => localStorage.getItem('att.status.v1'));
    expect(status).toBeNull();
    await page.close();
  });

  test('cancelling logout keeps session active', async () => {
    const page = await bootPage(browser, { profile: true });

    await page.click('#btn-profile');
    await page.waitForSelector('#modal-profile:not(.hidden)', { timeout: 5000 });

    page.once('dialog', async d => {
      await d.dismiss();
    });

    await page.click('#btn-logout');
    await new Promise(r => setTimeout(r, 600));

    const loginHidden = await page.$eval('#view-login', el => el.classList.contains('hidden'));
    expect(loginHidden).toBe(true);

    const session = await page.evaluate(() => localStorage.getItem('att.session.v1'));
    expect(session).toBeTruthy();
    await page.close();
  });
});
