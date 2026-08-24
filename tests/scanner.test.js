const {
  launchBrowser, bootPage, scanManualQr, safeClick, apiRoutes, apiCapture,
  todayStr, HANDLED
} = require('./helpers');

let browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  if (browser) await browser.close();
});

const TODAY = todayStr();
const PROFILE = { name: 'Test User', email: 'test@bdj.com' };

/* ==========================================
   1. SCANNER MODAL BASICS
   ========================================== */
describe('QR Scanner Modal', () => {
  test('scan click without profile opens profile modal instead', async () => {
    const page = await bootPage(browser);
    await page.click('#btn-scan');
    await page.waitForSelector('#modal-profile:not(.hidden)', { timeout: 5000 });
    const scanHidden = await page.$eval('#modal-scan', el => el.classList.contains('hidden'));
    expect(scanHidden).toBe(true);
    await page.close();
  });

  test('scan modal opens with profile set', async () => {
    const page = await bootPage(browser, { profile: true });
    await scanManualQrOpenOnly(page);
    const scanHidden = await page.$eval('#modal-scan', el => el.classList.contains('hidden'));
    expect(scanHidden).toBe(false);
    await page.close();
  });

  test('camera library unavailable shows error UI with retry', async () => {
    const page = await bootPage(browser, { profile: true });
    await scanManualQrOpenOnly(page);
    await page.waitForSelector('#qr-reader .cam-error', { timeout: 5000 });
    const msg = await page.$eval('#qr-reader .cam-error-msg', el => el.textContent);
    expect(msg).toContain('charger');
    const retry = await page.$('#cam-retry');
    expect(retry).not.toBeNull();
    await page.click('#cam-retry');
    await page.waitForFunction(() => !!document.querySelector('#qr-reader .cam-error'), { timeout: 5000 });
    await page.close();
  });

  test('cancel button closes scanner', async () => {
    const page = await bootPage(browser, { profile: true });
    await scanManualQrOpenOnly(page);
    await page.click('#btn-scan-cancel');
    await page.waitForFunction(() => document.getElementById('modal-scan').classList.contains('hidden'));
    await page.close();
  });

  test('manual QR input is available', async () => {
    const page = await bootPage(browser, { profile: true });
    await scanManualQrOpenOnly(page);
    const manualInput = await page.$('#manual-qr');
    expect(manualInput).not.toBeNull();
    await page.close();
  });

  test('manual QR with empty input shows error', async () => {
    const page = await bootPage(browser, { profile: true });
    await scanManualQr(page, '');
    await page.waitForFunction(() => document.getElementById('feedback').textContent.length > 0, { timeout: 5000 });
    const text = await page.$eval('#feedback', el => el.textContent);
    expect(text).toContain("d'abord");
    await page.close();
  });

  async function scanManualQrOpenOnly(page) {
    await page.click('#btn-scan');
    await page.waitForSelector('#modal-scan:not(.hidden)', { timeout: 5000 });
  }
});

/* ==========================================
   2. CHECK-IN / CHECK-OUT FLOW
   ========================================== */
describe('Attendance Flow', () => {
  function flowApi(cap) {
    return body => cap.handler(body);
  }

  test('manual QR checks in, updates UI, overlay and storage', async () => {
    const cap = apiCapture(apiRoutes({
      attendance: { ok: true, date: TODAY, action: 'Check-in', time: '09:15', office: 'HQ' },
      /* keep the post-check-in refreshes quiet so they don't overwrite the
         success feedback with the privacy notice */
      recent: { ok: true, recent: [] },
      week: { ok: true, week: [] },
      myattendance: { ok: true, attendance: { range: {}, summary: {}, pairs: [] } }
    }));
    const page = await bootPage(browser, { profile: true, api: flowApi(cap) });

    await scanManualQr(page, 'office-secret-token');

    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Pointe', { timeout: 10000 });
    const btnText = await page.$eval('#btn-scan-label', el => el.textContent);
    expect(btnText).toBe('Scanner QR pour la sortie');

    await page.waitForFunction(() => !document.getElementById('scan-success').classList.contains('hidden'), { timeout: 5000 });
    const title = await page.$eval('#ss-title', el => el.textContent);
    expect(title).toBe('Bon retour, Test!');
    const overlayTime = await page.$eval('#ss-time', el => el.textContent);
    expect(overlayTime).toBe('09:15');

    await page.waitForFunction(() => document.getElementById('feedback').textContent.indexOf('passe') !== -1, { timeout: 5000 });
    const feedback = await page.$eval('#feedback', el => el.textContent);
    expect(feedback).toContain('HQ');
    expect(feedback).toContain('09:15');

    const storedRaw = await page.evaluate(() => localStorage.getItem('att.status.v1'));
    expect(storedRaw.startsWith('enc1:')).toBe(true);

    const call = cap.ofAction('attendance')[0];
    expect(call.qr).toBe('office-secret-token');
    expect(call.email).toBe('test@bdj.com');
    expect(call.name).toBe('Test User');
    expect(call.action).toBe('attendance');
    await page.close();
  });

  test('second scan performs check-out', async () => {
    const cap = apiCapture(apiRoutes({
      attendance: { ok: true, date: TODAY, action: 'Check-out', time: '17:05', office: 'HQ' }
    }));
    const page = await bootPage(browser, {
      profile: true,
      api: flowApi(cap),
      seed: {
        'att.status.v1': JSON.stringify({
          date: TODAY, action: 'Check-in', time: '09:00', office: 'HQ', checkinTime: '09:00'
        })
      }
    });
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Pointe');

    await scanManualQr(page, 'office-secret-token');

    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Sorti', { timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('scan-success').classList.contains('hidden'), { timeout: 5000 });
    const title = await page.$eval('#ss-title', el => el.textContent);
    expect(title).toBe('Au revoir, Test!');
    const btnText = await page.$eval('#btn-scan-label', el => el.textContent);
    expect(btnText).toBe('Scanner QR pour pointer');
    await page.close();
  });

  test('server rejection surfaces an error message', async () => {
    const page = await bootPage(browser, {
      profile: true,
      api: apiRoutes({ attendance: { ok: false, message: 'QR invalide ou expire.' } })
    });
    await scanManualQr(page, 'bad-token');
    await page.waitForFunction(() => document.getElementById('feedback').textContent.indexOf('invalide') !== -1, { timeout: 10000 });
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Non pointe');
    await page.close();
  });

  test('tenant-aware QR payload routes tenant and token separately', async () => {
    const cap = apiCapture(apiRoutes({
      attendance: { ok: true, date: TODAY, action: 'Check-in', time: '09:15', office: 'HQ' }
    }));
    const page = await bootPage(browser, {
      profile: { name: 'Tena Test', email: 'tena@bdj.com', tenant: 'foo' },
      api: flowApi(cap)
    });

    await scanManualQr(page, 'acme|tok123');
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Pointe', { timeout: 10000 });
    let call = cap.ofAction('attendance')[0];
    expect(call.tenant).toBe('acme');
    expect(call.qr).toBe('tok123');

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('today-date').textContent.length > 0, { timeout: 15000 });
    await page.evaluate(() => localStorage.removeItem('att.status.v1'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Non pointe', { timeout: 15000 });

    await scanManualQr(page, 'plainToken');
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Pointe', { timeout: 10000 });
    call = cap.ofAction('attendance')[cap.ofAction('attendance').length - 1];
    expect(call.tenant).toBe('foo');
    expect(call.qr).toBe('plainToken');
    await page.close();
  });
});

/* ==========================================
   3. OFFLINE QUEUE
   ========================================== */
describe('Offline Queue', () => {
  test('scan while offline queues, then syncs when back online', async () => {
    let online = false;
    const cap = apiCapture(apiRoutes({
      attendance: { ok: true, date: TODAY, action: 'Check-in', time: '08:45', office: 'HQ' }
    }));
    const page = await bootPage(browser, {
      profile: true,
      interceptApi: true,
      api: (body, req) => {
        if (!online) {
          // Abort so the app's fetch actually rejects (req.respond would
          // succeed even under setOfflineMode and never trigger the queue).
          req.abort('internetdisconnected');
          return HANDLED;
        }
        return cap.handler(body);
      }
    });

    await page.setOfflineMode(true);
    const offlineFlag = await page.$eval('#offline-pill', el => !el.classList.contains('hidden'));
    expect(offlineFlag).toBe(true);

    await scanManualQr(page, 'offline-token');
    await page.waitForFunction(
      () => document.getElementById('feedback').textContent.indexOf('hors ligne') !== -1,
      { timeout: 10000 }
    );
    const queued = await page.evaluate(() => localStorage.getItem('att.queue.v1'));
    expect(queued.startsWith('enc1:')).toBe(true);

    online = true;
    await page.setOfflineMode(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Pointe', { timeout: 15000 });
    await page.waitForFunction(
      () => { try { return JSON.parse(localStorage.getItem('att.queue.v1') || '[]').length === 0; } catch (e) { return true; } },
      { timeout: 10000 }
    );
    const syncedCall = cap.ofAction('attendance')[0];
    expect(syncedCall.qr).toBe('offline-token');

    const pillHidden = await page.$eval('#offline-pill', el => el.classList.contains('hidden'));
    expect(pillHidden).toBe(true);
    await page.close();
  });
});

/* ==========================================
   4. SELFIE MODE
   ========================================== */
describe('Selfie Required Mode', () => {
  test('check-in with selfie required opens selfie modal and blocks scan', async () => {
    const cap = apiCapture(apiRoutes({
      config: { ok: true, config: { appName: 'BDJ Consulting', selfieMode: 'required' } }
    }));
    const page = await bootPage(browser, { profile: true, noCamera: true, api: body => cap.handler(body) });

    await scanManualQr(page, 'selfie-token');

    await page.waitForSelector('#modal-selfie:not(.hidden)', { timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('selfie-error').classList.contains('hidden'), { timeout: 10000 });
    const err = await page.$eval('#selfie-error', el => el.textContent);
    expect(/camera|appareil/.test(err)).toBe(true);

    const calls = cap.ofAction('attendance');
    expect(calls.length).toBe(0);

    await safeClick(page, '#btn-selfie-cancel');
    await page.waitForFunction(
      () => document.getElementById('feedback').textContent.indexOf('requis') !== -1,
      { timeout: 5000 }
    );
    await page.close();
  });
});

/* ==========================================
   5. UNCONFIGURED API
   ========================================== */
describe('Unconfigured API', () => {
  test('setup banner shows and scanning explains the problem', async () => {
    const page = await bootPage(browser, {
      profile: true,
      configOverride: {
        API_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
        APP_NAME: 'BDJ Consulting',
        DEFAULT_TENANT: ''
      }
    });

    await page.waitForFunction(() => {
      const b = document.getElementById('setup-banner');
      return b && !b.classList.contains('hidden');
    }, { timeout: 10000 });
    const bannerText = await page.$eval('#setup-banner', el => el.textContent);
    expect(bannerText).toContain('config.js');

    await scanManualQr(page, 'any-token');
    await page.waitForFunction(
      () => document.getElementById('feedback').textContent.indexOf('configuree') !== -1,
      { timeout: 10000 }
    );
    await page.close();
  });
});
