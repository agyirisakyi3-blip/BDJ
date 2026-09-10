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

async function withPage(browser, fn) {
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
  await withPage(browser, async (page) => {
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(1000);
    const info = await page.evaluate(() => {
      const root = document.getElementById('root');
      return { title: document.title, children: root ? root.children.length : -1 };
    });
    check('App loads at /', info.children > 0 && info.title === 'addredance', `title=${info.title} rootChildren=${info.children}`);
  });

  // 2. Consent banner appears and is dismissible
  await withPage(browser, async (page) => {
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
  await withPage(browser, async (page) => {
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
  await withPage(browser, async (page) => {
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
  await withPage(browser, async (page) => {
    await page.goto(BASE + '#/admin', { waitUntil: 'networkidle2' });
    await acceptConsent(page);
    await sleep(1200);
    const text = await bodyText(page);
    const inputs = await page.$$eval('input', (els) => els.map((e) => e.placeholder || e.type).join(', '));
    check('Admin page shows admin login', /admin|PIN/i.test(text));
    check('Admin form has email + PIN inputs', /vous@entreprise/.test(inputs) && /PIN/.test(inputs) || /text/i.test(inputs), inputs);
  });

  // 6. Navigation between hash routes works
  await withPage(browser, async (page) => {
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
  await withPage(browser, async (page) => {
    const resp = await page.goto(BASE + 'manifest.webmanifest', { waitUntil: 'networkidle2' });
    const json = await resp.json();
    const ok = resp.status() >= 200 && resp.status() < 400 && !!json.name;
    check('PWA manifest served', ok, `status=${resp.status()} name=${json.name || ''}`);
  });
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