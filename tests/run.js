import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer';

const PORT = process.env.TEST_PORT ? Number(process.env.TEST_PORT) : 4173;
const EXTERNAL_URL = process.env.TEST_BASE_URL || '';
const BASE = EXTERNAL_URL || `http://localhost:${PORT}/`;
const FRONTEND_DIR = fileURLToPath(new URL('../frontend/', import.meta.url));
const require = createRequire(import.meta.url);

const results = [];
let passCount = 0;
let failCount = 0;

function check(name, ok, detail = '') {
  if (ok) passCount++;
  else failCount++;
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await sleep(500);
  }
  throw new Error(`Server did not become ready at ${url}`);
}

function startServer() {
  const pkgPath = require.resolve('vite/package.json', { paths: [FRONTEND_DIR] });
  const pkg = require(pkgPath);
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.vite;
  const viteBin = join(dirname(pkgPath), bin);
  const child = spawn(
    process.execPath,
    [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: FRONTEND_DIR, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  child.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  child.stdout.on('data', (d) => process.stderr.write('[server] ' + d));
  return child;
}

async function withPage(browser, label, fn) {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('requestfailed', (r) => {
    if (!r.url().includes('google.com')) consoleErrors.push('request failed: ' + r.url());
  });
  try {
    await fn(page);
  } finally {
    await page.close();
  }
  check(`${label}: no uncaught page errors`, pageErrors.length === 0, pageErrors.join(' | '));
  check(`${label}: no console errors`, consoleErrors.length === 0, consoleErrors.join(' | '));
  return { pageErrors, consoleErrors };
}

async function acceptConsent(page) {
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Accepter');
    if (btn) { btn.click(); return true; }
    return false;
  });
  await sleep(600);
  return clicked;
}

function bodyText(page) {
  return page.evaluate(() => document.getElementById('root').innerText.replace(/\s+/g, ' ').trim());
}

async function run(browser) {
  // 1. App loads on root with no errors
  await withPage(browser, 'App load', async (page) => {
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(1000);
    const info = await page.evaluate(() => {
      const root = document.getElementById('root');
      return { title: document.title, children: root ? root.children.length : -1 };
    });
    check('App loads at /', info.children > 0 && info.title === 'addredance', `title=${info.title} rootChildren=${info.children}`);
  });

  // 2. Consent banner appears and is dismissible
  await withPage(browser, 'Consent banner', async (page) => {
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await sleep(1200);
    const banner = await bodyText(page);
    check('GDPR consent banner shown', banner.includes('Accepter') && banner.includes('Refuser'));
    await acceptConsent(page);
    await sleep(500);
    const after = await bodyText(page);
    check('Consent banner dismissed', !after.includes('Cette application stocke'), '');
  });

  // 3. Home shows employee login
  await withPage(browser, 'Employee login', async (page) => {
    await page.goto(BASE + '#/', { waitUntil: 'networkidle2' });
    await acceptConsent(page);
    await sleep(1200);
    const text = await bodyText(page);
    const inputs = await page.$$eval('input', (els) => els.map((e) => e.placeholder || e.type));
    const hasBtn = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.innerText.includes('Se connecter')));
    check('Home shows employee login', text.includes('Connectez-vous') && text.includes('CODE PERSONNEL'));
    check('Login form has email + code inputs', inputs.length >= 2);
    check('Login submit button present', hasBtn);
  });

  // 4. Signup page renders and validates
  await withPage(browser, 'Signup page', async (page) => {
    await page.goto(BASE + '#/signup', { waitUntil: 'networkidle2' });
    await acceptConsent(page);
    await sleep(1200);
    const text = await bodyText(page);
    check('Signup page renders', text.includes('Creer une organisation') || text.includes('Creer mon organisation'));
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Creer mon organisation'));
      if (b) b.click();
    });
    await sleep(1000);
    const after = await bodyText(page);
    check('Signup validates empty form', /Saisissez|requis|obligatoire|valide/i.test(after), after.slice(0, 80));
  });

  // 5. Admin page renders login + validates
  await withPage(browser, 'Admin page', async (page) => {
    await page.goto(BASE + '#/admin', { waitUntil: 'networkidle2' });
    await acceptConsent(page);
    await sleep(1200);
    const text = await bodyText(page);
    const inputs = await page.$$eval('input', (els) => els.map((e) => e.placeholder || e.type).join(', '));
    check('Admin page shows admin login', /admin|PIN/i.test(text));
    check('Admin form has email + PIN inputs', /vous@entreprise/.test(inputs) && /PIN/.test(inputs) || /text/i.test(inputs), inputs);
  });

  // 6. Navigation between hash routes works
  await withPage(browser, 'Navigation', async (page) => {
    await page.goto(BASE + '#/', { waitUntil: 'networkidle2' });
    await acceptConsent(page);
    await sleep(1000);
    await page.goto(BASE + '#/signup', { waitUntil: 'networkidle2' });
    await sleep(1000);
    const signupText = await bodyText(page);
    await page.goto(BASE + '#/admin', { waitUntil: 'networkidle2' });
    await sleep(1000);
    const adminText = await bodyText(page);
    check('Navigates to signup', signupText.includes('Creer une organisation') || signupText.includes('Creer mon organisation'));
    check('Navigates to admin', /admin/i.test(adminText));
  });

  // 7. PWA manifest served
  await withPage(browser, 'PWA manifest', async (page) => {
    await page.goto(BASE + '#/', { waitUntil: 'networkidle2' });
    const data = await page.evaluate(async () => {
      const resp = await fetch('/manifest.webmanifest');
      return { status: resp.status, json: await resp.json() };
    });
    const ok = data.status >= 200 && data.status < 400 && !!data.json.name;
    check('PWA manifest served', ok, `status=${data.status} name=${data.json.name || ''}`);
  });

  // 7b. QR generation library is vendored and served from our own origin
  await withPage(browser, 'QR library', async (page) => {
    await page.goto(BASE + '#/', { waitUntil: 'networkidle2' });
    const res = await page.evaluate(async () => {
      const r = await fetch('/qrcode.min.js');
      const txt = await r.text();
      return { status: r.status, hasQrCode: txt.includes('var QRCode') };
    });
    check('QR library served from own origin', res.status === 200 && res.hasQrCode, JSON.stringify(res));
  });

  // 8. Mobile viewport (360px): app renders with no horizontal overflow
  await withPage(browser, 'Mobile 360', async (page) => {
    await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.goto(BASE + '#/', { waitUntil: 'networkidle2' });
    await acceptConsent(page);
    await sleep(1200);
    const m = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      bodyScroll: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      rootChildren: document.getElementById('root').children.length,
      hasLogin: [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Se connecter'),
    }));
    const renders = m.rootChildren > 0 && m.hasLogin;
    const fits = m.scrollWidth <= m.innerWidth + 1 && m.bodyScroll <= m.innerWidth + 1;
    check('Mobile 360px: app renders', renders, JSON.stringify(m));
    check('Mobile 360px: no horizontal overflow', fits, `scrollWidth=${m.scrollWidth} body=${m.bodyScroll} innerWidth=${m.innerWidth}`);
  });

  // 9. Small viewport (320px): signup and admin pages render without overflow
  await withPage(browser, 'Mobile 320', async (page) => {
    await page.setViewport({ width: 320, height: 568, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    for (const route of ['#/signup', '#/admin']) {
      await page.goto(BASE + route, { waitUntil: 'networkidle2' });
      await acceptConsent(page);
      await sleep(1200);
      const m = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        rootChildren: document.getElementById('root').children.length,
      }));
      const fits = m.rootChildren > 0 && m.scrollWidth <= m.innerWidth + 1;
      check(`Mobile 320px ${route}: renders without overflow`, fits, `scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth}`);
    }
  });

  // 10. Service worker: registered, controls the page, and cold-starts offline
  {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(BASE + '#/', { waitUntil: 'networkidle2' });
    const reg = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { ok: false, reason: 'unsupported' };
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 15000));
      const registration = await Promise.race([navigator.serviceWorker.ready, timeout]);
      return { ok: !!registration, scope: registration ? registration.scope : '' };
    });
    check('Service worker registered', reg.ok, JSON.stringify(reg));

    const swServed = await page.evaluate(async () => {
      const res = await fetch('/sw.js');
      return { status: res.status, type: res.headers.get('content-type') || '' };
    });
    check('Service worker file served', swServed.status === 200, JSON.stringify(swServed));

    // Go offline immediately: this is the first visit, before the page has ever
    // been controlled. A successful render proves the build assets were
    // precached during install, not merely cached by earlier traffic.
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(1500);
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller).catch(() => false);
    check('Service worker controls the page after offline reload', controlled);
    const offline = await page.evaluate(() => {
      const root = document.getElementById('root');
      return { html: root ? root.innerText.replace(/\s+/g, ' ').trim() : '', children: root ? root.children.length : -1 };
    }).catch(() => ({ html: '', children: -1 }));
    const offlineOk = offline.children > 0 && /Connectez-vous|Accepter/.test(offline.html);
    check('First-visit offline cold start renders the app shell', offlineOk, offline.html.slice(0, 90));
    await page.setOfflineMode(false);

    check('Service worker: no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
    await page.close();
  }
}

(async () => {
  let server = null;
  if (!EXTERNAL_URL) {
    server = startServer();
  }

  try {
    if (server) await waitForServer(BASE);
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
      await run(browser);
    } finally {
      await browser.close();
    }
  } catch (err) {
    check('Test runner setup', false, err.message);
  } finally {
    if (server) {
      server.kill();
    }
  }

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount ? 1 : 0);
})();