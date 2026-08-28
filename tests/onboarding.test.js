const { launchBrowser, bootPage } = require('./helpers');

let browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  if (browser) await browser.close();
});

/* ==========================================
   1. CONSENT BANNER
   ========================================== */
describe('Consent Banner', () => {
  test('shows consent banner when no consent stored', async () => {
    const page = await bootPage(browser, { noConsent: true });
    const hidden = await page.$eval('#consent-banner', el => el.classList.contains('hidden'));
    expect(hidden).toBe(false);
    await page.close();
  });

  test('accept hides banner and app initializes', async () => {
    const page = await bootPage(browser, { noConsent: true });
    await page.click('#consent-accept');
    await page.waitForFunction(() => {
      const el = document.getElementById('today-date');
      return !el.classList.contains('hidden') && el.textContent.length > 0;
    }, { timeout: 10000 });
    const hidden = await page.$eval('#consent-banner', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
    const consent = await page.evaluate(() => localStorage.getItem('att.consent.v1'));
    expect(consent).toBe('1');
    await page.close();
  });

  test('decline hides banner and app stays dormant', async () => {
    const page = await bootPage(browser, { noConsent: true });
    await page.click('#consent-decline');
    await page.waitForFunction(() => document.getElementById('consent-banner').classList.contains('hidden'));
    const consent = await page.evaluate(() => localStorage.getItem('att.consent.v1'));
    expect(consent).toBe('0');
    const clock = await page.$eval('#live-time', el => el.textContent);
    expect(clock).toBe('--:--:--');
    await page.close();
  });

  test('consent banner hidden when consent already given', async () => {
    const page = await bootPage(browser);
    const hidden = await page.$eval('#consent-banner', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
    await page.close();
  });

  test('declined consent is not upgraded to granted on reload', async () => {
    const page = await bootPage(browser, { seed: { 'att.consent.v1': '0' } });
    const hidden = await page.$eval('#consent-banner', el => el.classList.contains('hidden'));
    expect(hidden).toBe(false);
    const consent = await page.evaluate(() => localStorage.getItem('att.consent.v1'));
    expect(consent).toBe('0');
    await page.close();
  });
});

/* ==========================================
   2. ONBOARDING
   ========================================== */
describe('Onboarding', () => {
  async function openOnboardingPage() {
    return bootPage(browser, {
      seed: {},
      api: body => (body.action === 'config' ? { ok: true, config: { appName: 'addredance' } } : null)
    });
  }

  test('onboarding modal appears on first visit', async () => {
    const page = await openOnboardingPage();
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 10000 });
    const title = await page.$eval('#ob-title', el => el.textContent);
    expect(title).toBe('Bienvenue');
    await page.close();
  });

  test('onboarding has 3 steps with dots', async () => {
    const page = await openOnboardingPage();
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 10000 });
    const dots = await page.$$eval('#ob-steps .ob-dot', els => els.length);
    expect(dots).toBe(3);
    await page.close();
  });

  test('skip button dismisses onboarding and marks onboarded', async () => {
    const page = await openOnboardingPage();
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 10000 });
    await page.click('#ob-skip');
    await page.waitForFunction(() => document.getElementById('modal-onboard').classList.contains('hidden'));
    const onboarded = await page.evaluate(() => localStorage.getItem('att.onboarded.v1'));
    expect(onboarded).toBe('1');
    await page.close();
  });

  test('next button advances from step 1 to step 2', async () => {
    const page = await openOnboardingPage();
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 10000 });
    const step1 = await page.$eval('#ob-title', el => el.textContent);
    expect(step1).toBe('Bienvenue');

    await page.click('#ob-next');
    await page.waitForFunction(() => document.getElementById('ob-title').textContent === 'Vos coordonnees');
    const dots = await page.$$eval('#ob-steps .ob-dot', els => els.map(d => d.classList.contains('on')));
    expect(dots).toEqual([false, true, false]);
    await page.close();
  });

  test('step 2 "Open profile" button opens profile modal', async () => {
    const page = await openOnboardingPage();
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 10000 });
    await page.click('#ob-next');
    await page.waitForFunction(() => document.getElementById('ob-title').textContent === 'Vos coordonnees');
    await page.click('#ob-next');
    await page.waitForFunction(() => !document.getElementById('modal-profile').classList.contains('hidden'), { timeout: 5000 });
    await page.close();
  });

  test('finishing via skip persists and survives a reload', async () => {
    const page = await openOnboardingPage();
    await page.waitForSelector('#modal-onboard:not(.hidden)', { timeout: 10000 });
    await page.click('#ob-skip');
    await page.waitForFunction(() => document.getElementById('modal-onboard').classList.contains('hidden'));
    const onboarded = await page.evaluate(() => localStorage.getItem('att.onboarded.v1'));
    expect(onboarded).toBe('1');
    await page.reload({ waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1200));
    const stillHidden = await page.$eval('#modal-onboard', el => el.classList.contains('hidden'));
    expect(stillHidden).toBe(true);
    await page.close();
  });

  test('onboarding does not appear if already onboarded', async () => {
    const page = await bootPage(browser, { profile: true });
    await new Promise(r => setTimeout(r, 1200));
    const hidden = await page.$eval('#modal-onboard', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
    await page.close();
  });
});

/* ==========================================
   3. THEME TOGGLE
   ========================================== */
describe('Theme Toggle', () => {
  test('switches dark to auto on click', async () => {
    const page = await bootPage(browser, { seed: { 'att.theme.v1': 'dark' } });
    await page.click('#btn-theme');
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme-mode') === 'auto');
    const mode = await page.$eval('html', el => el.getAttribute('data-theme-mode'));
    expect(mode).toBe('auto');
    await page.close();
  });

  test('switches light to dark on click', async () => {
    const page = await bootPage(browser, { seed: { 'att.theme.v1': 'light' } });
    await page.click('#btn-theme');
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
    const mode = await page.$eval('html', el => el.getAttribute('data-theme-mode'));
    expect(mode).toBe('dark');
    await page.close();
  });

  test('sun icon hidden in light mode', async () => {
    const page = await bootPage(browser, { seed: { 'att.theme.v1': 'light' } });
    const display = await page.$eval('#ic-sun', el => el.style.display);
    expect(display).toBe('none');
    await page.close();
  });

  test('moon icon hidden in dark mode', async () => {
    const page = await bootPage(browser, { seed: { 'att.theme.v1': 'dark' } });
    const display = await page.$eval('#ic-moon', el => el.style.display);
    expect(display).toBe('none');
    await page.close();
  });

  test('auto mode follows prefers-color-scheme', async () => {
    const page = await bootPage(browser, { colorScheme: 'dark' });
    const theme = await page.$eval('html', el => el.getAttribute('data-theme'));
    expect(theme).toBe('dark');
    const mode = await page.$eval('html', el => el.getAttribute('data-theme-mode'));
    expect(mode).toBe('auto');
    const autoHidden = await page.$eval('#ic-auto', el => el.style.display);
    expect(autoHidden).toBe('none');
    await page.close();
  });

  test('clicking from auto switches to explicit light', async () => {
    const page = await bootPage(browser, { colorScheme: 'dark' });
    await page.click('#btn-theme');
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme-mode') === 'light');
    const theme = await page.$eval('html', el => el.getAttribute('data-theme'));
    expect(theme).toBe('light');
    await page.close();
  });

  test('theme persists after reload', async () => {
    const page = await bootPage(browser, { seed: { 'att.theme.v1': 'light' } });
    await page.click('#btn-theme');
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => {
      const el = document.getElementById('today-date');
      return el && el.textContent.length > 0;
    }, { timeout: 15000 });
    const theme = await page.$eval('html', el => el.getAttribute('data-theme'));
    expect(theme).toBe('dark');
    await page.close();
  });
});

/* ==========================================
   4. HELP MODAL
   ========================================== */
describe('Help Modal', () => {
  test('help button opens the help modal', async () => {
    const page = await bootPage(browser);
    await page.click('#btn-help');
    await page.waitForSelector('#modal-help:not(.hidden)', { timeout: 5000 });
    const title = await page.$eval('#modal-help h3', el => el.textContent);
    expect(title).toBe('Aide');
    await page.close();
  });

  test('close button hides the help modal', async () => {
    const page = await bootPage(browser);
    await page.click('#btn-help');
    await page.waitForSelector('#modal-help:not(.hidden)', { timeout: 5000 });
    await page.click('#btn-help-close');
    await page.waitForFunction(() => document.getElementById('modal-help').classList.contains('hidden'));
    await page.close();
  });
});
