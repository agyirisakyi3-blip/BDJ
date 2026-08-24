const { launchBrowser } = require('./helpers');

let browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  if (browser) await browser.close();
});

function newKioskPage(seedFn) {
  return browser.newPage().then(async page => {
    if (seedFn) await page.evaluateOnNewDocument(seedFn);
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url();
      if (url.indexOf('cdnjs.cloudflare.com') !== -1) { req.abort('failed'); return; }
      if (url.indexOf('script.google.com') !== -1) {
        let body = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
        const res = body.action === 'office_screen'
          ? {
              ok: true,
              screen: {
                appName: 'BDJ Consulting',
                token: 'rotating-token-1',
                secondsLeft: 20,
                intervalSec: 30,
                serverTime: '09:00:20'
              }
            }
          : { ok: true, token: 'sess-token-1' };
        req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(res)
        });
        return;
      }
      req.continue();
    });
    return page;
  });
}

describe('Office Screen (kiosk)', () => {
  test('login form is shown by default with email validation', async () => {
    const page = await newKioskPage();
    await page.goto('http://localhost:3456/office-screen.html', { waitUntil: 'load' });

    const loginVisible = await page.$eval('#login', el => !el.classList.contains('hidden'));
    const screenHidden = await page.$eval('#screen', el => el.classList.contains('hidden'));
    expect(loginVisible).toBe(true);
    expect(screenHidden).toBe(true);

    await page.click('#l-go');
    const status = await page.$eval('#l-status', el => el.textContent);
    expect(status).toContain('Email requis');
    await page.close();
  });

  test('admin login reveals the rotating QR screen', async () => {
    const page = await newKioskPage();
    await page.goto('http://localhost:3456/office-screen.html', { waitUntil: 'load' });
    await page.type('#l-email', 'admin@bdj.com');
    await page.click('#l-go');

    await page.waitForFunction(() => !document.getElementById('screen').classList.contains('hidden'), { timeout: 10000 });
    const title = await page.$eval('#app-title', el => el.textContent);
    expect(title).toBe('BDJ Consulting');

    const logoutVisible = await page.$eval('#logout-btn', el => !el.classList.contains('hidden'));
    expect(logoutVisible).toBe(true);

    await page.waitForFunction(() => document.getElementById('clock').textContent.indexOf('Heure serveur') !== -1, { timeout: 10000 });
    const clock = await page.$eval('#clock', el => el.textContent);
    expect(clock).toContain('09:00:20');

    const barWidth = await page.$eval('#cd-bar', el => parseFloat(el.style.width));
    expect(barWidth).toBeCloseTo(66.7, 0);
    await page.close();
  });

  test('stored session reopens the screen directly', async () => {
    const page = await newKioskPage(() => {
      localStorage.setItem('att_screen_token', 'saved-token');
      localStorage.setItem('att_screen_email', 'admin@bdj.com');
    });
    await page.goto('http://localhost:3456/office-screen.html', { waitUntil: 'load' });

    await page.waitForFunction(() => !document.getElementById('screen').classList.contains('hidden'), { timeout: 10000 });
    const loginHidden = await page.$eval('#login', el => el.classList.contains('hidden'));
    expect(loginHidden).toBe(true);
    await page.close();
  });
});

describe('QR Generator', () => {
  async function newGenPage() {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.url().indexOf('cdnjs.cloudflare.com') !== -1) { req.abort('failed'); return; }
      req.continue();
    });
    await page.goto('http://localhost:3456/qr-generator.html', { waitUntil: 'load' });
    return page;
  }

  test('empty secret shows a hint instead of a code', async () => {
    const page = await newGenPage();
    await page.click('#gen');
    const note = await page.$eval('#note', el => el.textContent);
    expect(note).toContain('Enter the secret first.');
    const canvases = await page.$$eval('#qrcode canvas', els => els.length);
    expect(canvases).toBe(0);
    await page.close();
  });

  test('missing QR library explains itself when a secret is set', async () => {
    const page = await newGenPage();
    await page.type('#secret', 'topsecret-token');
    await page.click('#gen');
    const note = await page.$eval('#note', el => el.textContent);
    expect(note).toContain('library failed to load');
    await page.close();
  });

  test('page exposes tenant, secret inputs and download/print buttons', async () => {
    const page = await newGenPage();
    for (const sel of ['#tenant', '#secret', '#dl', '#print']) {
      expect(await page.$(sel)).not.toBeNull();
    }
    const title = await page.title();
    expect(title).toBe('Office QR Generator');
    await page.close();
  });
});
