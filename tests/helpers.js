const puppeteer = require('puppeteer');

const APP_URL = 'http://localhost:3456';
const MOCK_PORT = 3456;
const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];

/* Node-side replicas of utils.js date helpers (same machine/timezone as the browser). */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function shiftDateStr(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function launchBrowser() {
  return puppeteer.launch({ headless: true, args: LAUNCH_ARGS });
}

/* Sentinel a custom api fn can return after handling a request itself
   (e.g. req.abort) so bootPage skips synthesizing a response. */
const HANDLED = Symbol('handled');

/* Build an API responder from an action -> response|fn(body) map.
   Unmapped 'config' gets a sane default; anything else returns a deterministic error. */
function apiRoutes(map) {
  return function handler(body) {
    if (Object.prototype.hasOwnProperty.call(map, body.action)) {
      const h = map[body.action];
      return typeof h === 'function' ? h(body) : h;
    }
    if (body.action === 'config') return { ok: true, config: { appName: 'addredance' } };
    return { ok: false, message: 'Unhandled action in test mock: ' + body.action };
  };
}

/* Quiet background answers used when a test provides no api (or its fn returns
   nothing): read-only loaders succeed empty so they never pollute #feedback. */
const DEFAULT_API = apiRoutes({
  recent: { ok: true, recent: [] },
  week: { ok: true, week: [] },
  myattendance: { ok: true, attendance: { range: {}, summary: {}, pairs: [] } }
});

/* Mutable responder that records every request body for later assertions. */
function apiCapture(responder) {
  const cap = { calls: [], responder: responder || null };
  cap.handler = function (body) {
    cap.calls.push(body);
    if (cap.responder) return cap.responder(body);
    if (body.action === 'config') return { ok: true, config: { appName: 'addredance' } };
    return { ok: false, message: 'Unhandled action in test mock: ' + body.action };
  };
  cap.set = fn => { cap.responder = fn; };
  cap.ofAction = action => cap.calls.filter(b => b.action === action);
  return cap;
}

function adminFixture(overrides) {
  const base = {
    appName: 'addredance',
    sheetUrl: '',
    today: todayStr(),
    range: { from: todayStr(), to: todayStr() },
    live: {
      checkedInToday: 3,
      checkedOutToday: 1,
      onSite: 2,
      onSiteNames: ['A', 'B'],
      onBreakNames: [],
      absent: [{ name: 'Cara', email: 'c@x.com' }]
    },
    summary: { totalHours: 7.5, daysPresent: 3, lateCount: 1, missingOut: 0, people: 2 },
    pairs: [
      { date: todayStr(), name: 'A', email: 'a@x.com', in: '08:00', out: '12:00', hours: 4, late: false, missing: false },
      { date: shiftDateStr(-1), name: 'B', email: 'b@x.com', in: '09:00', out: '12:30', hours: 3.5, late: true, missing: false }
    ],
    people: [
      { email: 'a@x.com', name: 'Alice', department: 'IT', daysPresent: 2, totalHours: 4, avgHours: 4, lateCount: 0, missingOut: 0, statusToday: 'onsite' },
      { email: 'b@x.com', name: 'Bob', department: '', daysPresent: 1, totalHours: 3.5, avgHours: 3.5, lateCount: 1, missingOut: 0, statusToday: '' }
    ],
    admins: []
  };
  return Object.assign(base, overrides || {});
}

/* Create a fresh page with localStorage seeded BEFORE the app boots (single page load),
   the CDN QR library blocked (deterministic camera-error path), and script.google.com
   answered by opts.api(body, req). */
/* Attach the local HTTP API mock to a page: binds a token-scoped handler on
   this worker and overrides ATT_CONFIG.API_URL before app scripts run.
   apiFn(body) -> response object | null (null falls back to DEFAULT_API). */
async function attachHttpMock(page, apiFn, cfgExtra) {
  const http = require('http');
  if (!global.__ATT_MOCK_SERVER__) {
    const handlers = new Map();
    const srv = http.createServer((req, res) => {
      let data = '';
      req.on('data', c => { data += c; });
      req.on('end', () => {
        let body = {};
        try { body = JSON.parse(data || '{}'); } catch (e) {}
        const m = req.url.match(/t=([A-Za-z0-9]+)/);
        const h = handlers.get(m ? m[1] : '');
        Promise.resolve()
          .then(() => h ? h(body) : { ok: false, message: 'No API mock installed.' })
          .then(r => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(r === undefined || r === null ? { ok: false } : r));
          })
          .catch(e => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ ok: false, message: String((e && e.message) || e) }));
          });
      });
    });
    srv.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      srv.once('listening', resolve);
      srv.once('error', reject);
    });
    global.__ATT_MOCK_SERVER__ = { srv, handlers };
  }
  const { srv, handlers } = global.__ATT_MOCK_SERVER__;
  const token = 'pg' + Math.random().toString(36).slice(2, 10);
  handlers.set(token, apiFn);
  page.once('close', () => handlers.delete(token));
  await fetch(`http://127.0.0.1:${MOCK_PORT}/__mock/bind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, port: srv.address().port })
  }).catch(e => { throw new Error('Failed to bind API mock: ' + e.message); });
  await page.evaluateOnNewDocument((url, cfgExtra) => {
    Object.defineProperty(window, 'ATT_CONFIG', {
      /* explicit configOverride entries (e.g. a placeholder API_URL for
         unconfigured-mode tests) must win over the mock endpoint URL */
      value: Object.assign({}, window.ATT_CONFIG, { API_URL: url }, cfgExtra || {}),
      writable: false,
      configurable: false
    });
  }, `${APP_URL}/exec?t=${token}`, cfgExtra || null);
}

async function bootPage(browser, opts = {}) {
  const page = await browser.newPage();
  try { await page.bringToFront(); } catch (e0) {}
  /* Headless pages can starve requestAnimationFrame-based waiting; force
     interval polling so waitForFunction behaves deterministically. */
  const origWaitForFunction = page.waitForFunction.bind(page);
  page.waitForFunction = (fn, options, ...args) =>
    origWaitForFunction(fn, Object.assign({ polling: 50 }, typeof options === 'number' ? { timeout: options } : options), ...args);
  if (opts.colorScheme) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opts.colorScheme }]);
  }

  const seed = Object.assign({}, opts.seed);
  if (!opts.noConsent && seed['att.consent.v1'] === undefined) seed['att.consent.v1'] = '1';
  if (opts.profile) {
    seed['att.onboarded.v1'] = '1';
    seed['att.profile.v1'] = JSON.stringify(
      opts.profile === true ? { name: 'Test User', email: 'test@bdj.com' } : opts.profile
    );
  }
  if (opts.freshProfile) {
    /* Signed-in session with an empty profile, so the profile modal opens
       empty and its validation tests keep their pre-login behaviour. */
    seed['att.onboarded.v1'] = '1';
    seed['att.profile.v1'] = JSON.stringify({ name: '', email: '', tenant: '' });
  }
  /* A session is required before any data loads. Derive one from the seeded
     profile unless the test explicitly opts out (opts.noSession) or supplies
     its own (opts.session / a raw entry in seed). */
  let signedIn = !!(opts.profile || opts.freshProfile || opts.session) && !opts.noSession;
  const seededSession = opts.seed && Object.prototype.hasOwnProperty.call(opts.seed, 'att.session.v1');
  if (signedIn) {
    const fromProfile = opts.session ? opts.session
      : (opts.freshProfile ? { name: '', email: '', tenant: '' }
        : (opts.profile === true ? { name: 'Test User', email: 'test@bdj.com', tenant: '' }
          : Object.assign({ name: 'Test User', email: 'test@bdj.com', tenant: '' }, opts.profile)));
    seed['att.session.v1'] = JSON.stringify(Object.assign({ token: '', isAdmin: false }, fromProfile));
  } else if (seededSession) {
    /* explicit seed.session opts in to the signed-in boot path */
    signedIn = true;
  }
  const pairs = Object.keys(seed).map(k => [k, seed[k]]);
  await page.evaluateOnNewDocument(p => {
    try {
      /* One-shot: a mid-test reload must keep runtime mutations, so only
         clear+seed on the first document of this tab. */
      if (sessionStorage.getItem('__att_test_seeded')) return;
      sessionStorage.setItem('__att_test_seeded', '1');
      localStorage.clear();
      p.forEach(([k, v]) => localStorage.setItem(k, v));
    } catch (e) {}
  }, pairs);

  if (opts.blockBeforeInstall) {
    await page.evaluateOnNewDocument(() => {
      window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        e.stopImmediatePropagation();
      });
    });
  }

  if (opts.noCamera) {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'mediaDevices', { get: () => undefined });
    });
  }

  /* Disable service-worker registration: SW claim/caching races with CDP
     request interception and intermittently corrupts mocked API responses.
     Tests that specifically verify SW registration opt out via
     opts.allowServiceWorker. */
  if (!opts.allowServiceWorker) {
    await page.evaluateOnNewDocument(() => {
      try {
        if (navigator.serviceWorker) {
          Object.defineProperty(navigator.serviceWorker, 'register', {
            value: () => Promise.reject(new Error('sw disabled in tests')),
            configurable: true
          });
        }
      } catch (e) {}
    });
  }

  const api = opts.api || null;
  let resolveConfig;
  const configSettled = new Promise(r => { resolveConfig = r; });

  if (!opts.interceptApi) {
    /* Preferred mode: API calls go to the local mock endpoint served by
       tests/server.js (POST /exec?t=<token>), which proxies the body to this
       worker's HTTP listener where opts.api runs. Deterministic, fast, SW-proof.
       HANDLED/req.abort semantics are unavailable in this mode. */
    await attachHttpMock(page, body => {
      let res = null;
      try { res = api ? api(body) : null; } catch (e) { res = { ok: false, message: String((e && e.message) || e) }; }
      if (res === HANDLED) res = null;
      if (!res) res = DEFAULT_API(body);
      if (body && body.action === 'config') resolveConfig();
      return res;
    }, opts.configOverride || null);
  } else if (opts.configOverride) {
    const cfg = opts.configOverride;
    await page.evaluateOnNewDocument(c => {
      Object.defineProperty(window, 'ATT_CONFIG', { value: c, writable: false, configurable: false });
    }, cfg);
  }

  /* Single request interceptor for every page: keeps the CDN QR library
     unavailable (deterministic camera-error path on internet-connected hosts)
     and, in interceptApi mode, answers script.google.com via opts.api so a
     test can abort requests (e.g. simulating offline with req.abort). */
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    const finish = fn => { try { fn(); } catch (e) { /* already handled (e.g. offline abort race) */ } };
    if (url.indexOf('cdnjs.cloudflare.com') !== -1) { finish(() => req.abort('failed')); return; }
    if (opts.interceptApi && url.indexOf('script.google.com') !== -1) {
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      /* resolve boot readiness even if the test aborts this very request */
      if (body.action === 'config') resolveConfig();
      let res = api ? api(body, req) : null;
      if (res === HANDLED) return;
      if (!res) res = DEFAULT_API(body);
      finish(() => req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(res)
      }));
      return;
    }
    finish(() => req.continue());
  });

  await page.goto(APP_URL + (opts.hash || ''), { waitUntil: 'load', timeout: 20000 });

  if (!opts.noConsent && !opts.skipReadyWait) {
    if (seed['att.consent.v1'] === '0') {
      await page.waitForSelector('#consent-banner:not(.hidden)', { timeout: 15000 });
    } else if (opts.configOverride && opts.configOverride.API_URL) {
      /* unconfigured mode: the app never calls the API, it raises the banner */
      await page.waitForFunction(() => {
        const b = document.getElementById('setup-banner');
        return !!(b && !b.classList.contains('hidden'));
      }, { timeout: 15000 });
    } else if (signedIn) {
      await configSettled;
      await page.waitForFunction(() => {
        const el = document.getElementById('today-date');
        return !!(el && el.textContent.length > 0);
      }, { timeout: 15000 });
    } else {
      /* Signed out: the app shows only the login view and never calls the API. */
      await page.waitForFunction(() => {
        const el = document.getElementById('view-login');
        return !!(el && !el.classList.contains('hidden'));
      }, { timeout: 15000 });
    }
  }
  return page;
}

/* Open the scanner modal and submit a code through the manual input. */
async function scanManualQr(page, code) {
  await safeClick(page, '#btn-scan');
  await page.waitForSelector('#modal-scan:not(.hidden)', { timeout: 5000 });
  await page.evaluate(() => {
    const d = document.querySelector('#modal-scan details');
    if (d) d.open = true;
  });
  if (code) await page.type('#manual-qr', code);
  await safeClick(page, '#btn-manual-ok');
}

/* Click that survives fixed overlays and closed containers (the mobile bottom
   nav covers the lower viewport at test size, and modals are position:fixed
   so they cannot be scrolled away from it): dispatch a DOM click directly. */
async function safeClick(page, selector) {
  const handle = await page.$(selector);
  if (!handle) throw new Error('safeClick target not found: ' + selector);
  await handle.evaluate(el => {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    el.click();
  });
}

/* Log into the admin dashboard using PIN only (leaves state.pin set for provision tests).
   The caller must be on #admin and must mock action 'admin'. */
async function loginAdmin(page, pin) {
  await page.type('#admin-pin', pin || '4242');
  await page.click('#btn-admin-go');
  await page.waitForFunction(
    () => !document.getElementById('admin-dash').classList.contains('hidden'),
    { timeout: 15000 }
  );
}

/* Management cards (Employes, Admins, Conges, ...) start collapsed; expand one
   by its heading text so its form/table becomes visible and clickable. */
async function expandAdminSection(page, title) {
  const clickHead = t => {
    const cards = Array.from(document.querySelectorAll('#admin-dash .card'));
    const card = cards.find(c => {
      const h = c.querySelector('.block-head h3');
      return h && h.textContent.trim() === t;
    });
    if (!card) return 'missing';
    if (card.classList.contains('collapsed')) {
      const head = card.querySelector('.block-head.collapsible');
      if (head) head.click();
      return 'clicked';
    }
    return 'open';
  };
  const state = await page.evaluate(clickHead, title);
  if (state === 'missing') throw new Error('Admin section not found: ' + title);
  if (state === 'clicked') {
    await page.waitForFunction(t => {
      const cards = Array.from(document.querySelectorAll('#admin-dash .card'));
      const card = cards.find(c => {
        const h = c.querySelector('.block-head h3');
        return h && h.textContent.trim() === t;
      });
      return !!card && !card.classList.contains('collapsed');
    }, { timeout: 5000, polling: 50 }, title);
  }
}

async function loginUser(page, email = 'test@bdj.com', tenant = '', code = '123456') {
  await page.type('#login-email', email);
  if (tenant) await page.type('#login-tenant', tenant);
  if (code) await page.type('#login-code', code);
  await page.click('#btn-login-go');
  await page.waitForFunction(
    () => document.getElementById('view-login').classList.contains('hidden'),
    { timeout: 15000 }
  );
}

module.exports = {
  APP_URL,
  launchBrowser,
  bootPage,
  attachHttpMock,
  scanManualQr,
  safeClick,
  loginAdmin,
  loginUser,
  expandAdminSection,
  apiRoutes,
  apiCapture,
  adminFixture,
  todayStr,
  shiftDateStr,
  HANDLED
};
