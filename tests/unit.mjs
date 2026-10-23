import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../', import.meta.url);
const utils = await import(new URL('frontend/src/utils.js', ROOT).href);

let passCount = 0;
let failCount = 0;
function check(name, ok, detail = '') {
  if (ok) passCount++;
  else failCount++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

/* ---------- pure frontend helpers ---------- */
check('parseQr splits tenant|token', JSON.stringify(utils.parseQr('acme|SECRET')) === JSON.stringify({ tenant: 'acme', token: 'SECRET' }));
check('parseQr without tenant returns token', utils.parseQr('  ONLYTOKEN ').token === 'ONLYTOKEN' && utils.parseQr('ONLYTOKEN').tenant === '');
check('parseQr keeps extra pipes in token', utils.parseQr('a|b|c').token === 'b|c');
check('fmtHours formats 1.5 -> 1h 30m', utils.fmtHours(1.5) === '1h 30m');
check('fmtHours handles null/NaN', utils.fmtHours(null) === '\u2014' && utils.fmtHours(NaN) === '\u2014');
check('timeToMinutes parses HH:MM', utils.timeToMinutes('09:00') === 540 && utils.timeToMinutes('9:05') === 545);
check('timeToMinutes rejects invalid', utils.timeToMinutes('nope') === -1 && utils.timeToMinutes('') === -1);
check('escapeHtml neutralizes tags/quotes', utils.escapeHtml('<img src="x" onerror="y">') === '&lt;img src=&quot;x&quot; onerror=&quot;y&quot;&gt;');
check('cmpVals compares numbers numerically', utils.cmpVals(2, 10) === -1 && utils.cmpVals(10, 2) === 1 && utils.cmpVals(5, 5) === 0);
check('cmpVals falls back to strings', utils.cmpVals('a', 'b') < 0);
check('avatarInitials from name and email', utils.avatarInitials('Ada Lovelace', '') === 'AL' && utils.avatarInitials('', 'ada.lovelace@x.z') === 'AL');
check('todayStr/shiftDateStr are YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(utils.todayStr()) && utils.shiftDateStr(-1) < utils.todayStr());
check('dayLabel maps date to weekday', utils.dayLabel('2026-10-23') === 'Ve');
check('avatarHue is deterministic and in palette', utils.avatarHue('a@b.c') === utils.avatarHue('a@b.c') && [258, 160, 199, 24, 340, 42, 120, 286].includes(utils.avatarHue('a@b.c')));

/* ---------- printReportPDF must survive the production CSP ---------- */
{
  const html = [];
  const handlers = {};
  let printed = 0;
  const fakeWindow = {
    document: {
      write: (chunk) => html.push(chunk),
      close: () => {},
      getElementById: (id) => (id === 'print-btn'
        ? { addEventListener: (event, fn) => { handlers[event] = fn; } }
        : null),
    },
    focus: () => {},
    print: () => { printed++; },
  };
  const savedWindow = globalThis.window;
  const savedAlert = globalThis.alert;
  globalThis.window = { ...savedWindow, open: () => fakeWindow };
  globalThis.alert = () => {};
  try {
    utils.printReportPDF('Rapport <script>alert(1)</script>', '01/10 - 31/10', ['Nom', 'Heures'], [['<img src=x onerror=alert(2)>', '8h 00m']]);
    await sleep(450);
    const doc = html.join('');
    check('printReportPDF contains no inline <script>', !/<script/i.test(doc), doc.slice(0, 60));
    check('printReportPDF contains no inline event handlers', !/\son[a-z]+\s*=\s*["']/i.test(doc));
    check('printReportPDF escapes user content', doc.includes('&lt;script&gt;') && doc.includes('&lt;img src=x onerror=alert(2)&gt;'));
    check('printReportPDF opens the print dialog itself', printed >= 1, `printed=${printed}`);
    check('printReportPDF wires the print button', typeof handlers.click === 'function');
    if (typeof handlers.click === 'function') {
      const before = printed;
      handlers.click();
      check('print button triggers printing', printed === before + 1);
    }
  } finally {
    globalThis.window = savedWindow;
    globalThis.alert = savedAlert;
  }
}

/* ---------- real backend helpers extracted from Code.gs ---------- */
const gs = readFileSync(new URL('appsscript/Code.gs', ROOT), 'utf8');
function extract(name) {
  const start = gs.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('missing ' + name);
  let i = gs.indexOf('{', start);
  let depth = 0;
  for (; i < gs.length; i++) {
    if (gs[i] === '{') depth++;
    else if (gs[i] === '}') {
      depth--;
      if (depth === 0) return gs.slice(start, i + 1);
    }
  }
  throw new Error('unterminated ' + name);
}
const haversineM_ = new Function(extract('haversineM_') + '; return haversineM_;')();
const safeCell_ = new Function(extract('safeCell_') + '; return safeCell_;')();

check('haversine same point is 0 m', haversineM_(5.6037168, -0.1869644, 5.6037168, -0.1869644) === 0);
check('haversine 1 degree latitude ~111.2 km', Math.abs(haversineM_(0, 0, 1, 0) - 111194.9) < 50);
check('haversine 0.001 degree ~111 m', Math.abs(haversineM_(5.6037168, -0.1869644, 5.6047168, -0.1869644) - 111.2) < 1);
check('safeCell_ defuses formula injection', safeCell_('=SUM(A1)').startsWith("'=") && safeCell_('+1').startsWith("'+") && safeCell_('-1').startsWith("'-") && safeCell_('@x').startsWith("'@"));
check('safeCell_ leaves plain text intact', safeCell_('Ada Lovelace') === 'Ada Lovelace');
check('safeCell_ strips control characters', safeCell_('a\u0000b\u0007c') === 'abc');
check('safeCell_ caps length at 200', safeCell_('x'.repeat(500)).length === 200);
check('safeCell_ handles null', safeCell_(null) === '');

console.log(`\n${passCount} passed, ${failCount} failed`);
process.exit(failCount ? 1 : 0);
