const { launchBrowser, bootPage, apiRoutes, todayStr, shiftDateStr } = require('./helpers');

let browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  if (browser) await browser.close();
});

const TODAY = todayStr();

function seedStatus(action, time) {
  return {
    date: TODAY,
    action,
    time,
    office: 'HQ',
    ...(action === 'Check-in' ? { checkinTime: time } : {})
  };
}

function homeApi(map) {
  return apiRoutes(Object.assign({
    recent: { ok: true, recent: [] },
    week: { ok: true, week: [] },
    myattendance: {
      ok: true,
      attendance: {
        range: { from: TODAY.slice(0, 8) + '01', to: TODAY },
        summary: { daysPresent: 0, totalHours: 0, lateCount: 0 },
        pairs: []
      }
    }
  }, map));
}

/* ==========================================
   1. STATUS CARD
   ========================================== */
describe('Status Card', () => {
  test('shows Welcome when no profile', async () => {
    const page = await bootPage(browser, { freshProfile: true });
    const label = await page.$eval('#status-label', el => el.textContent);
    expect(label).toBe('Bienvenue');
    const sub = await page.$eval('#status-sub', el => el.textContent);
    expect(sub).toContain('Definissez');
    const time = await page.$eval('#status-time', el => el.textContent);
    expect(time).toBe('--:--');
    await page.close();
  });

  test('shows "Non pointe" when profile exists but no status', async () => {
    const page = await bootPage(browser, { profile: true, api: homeApi({}) });
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Non pointe');
    const btnText = await page.$eval('#btn-scan-label', el => el.textContent);
    expect(btnText).toBe('Scanner QR pour pointer');
    await page.close();
  });

  test('shows checked-in state with check-out button and office', async () => {
    const page = await bootPage(browser, {
      profile: true,
      api: homeApi({}),
      seed: { 'att.status.v1': JSON.stringify(seedStatus('Check-in', '09:00')) }
    });
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Pointe');
    const btnText = await page.$eval('#btn-scan-label', el => el.textContent);
    expect(btnText).toContain('sortie');
    const avatar = await page.$eval('#status-avatar', el => el.textContent);
    expect(avatar).toBe('ENTREE');
    const sub = await page.$eval('#status-sub', el => el.textContent);
    expect(sub).toContain('HQ');
    const cardClass = await page.$eval('#status-card', el => el.className);
    expect(cardClass).toContain('checked-in');
    await page.close();
  });

  test('shows checked-out state after check-out', async () => {
    const page = await bootPage(browser, {
      profile: true,
      api: homeApi({}),
      seed: { 'att.status.v1': JSON.stringify(seedStatus('Check-out', '17:00')) }
    });
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Sorti');
    const avatar = await page.$eval('#status-avatar', el => el.textContent);
    expect(avatar).toBe('SORTIE');
    const time = await page.$eval('#status-time', el => el.textContent);
    expect(time).toBe('17:00');
    await page.close();
  });

  test('break state shows pause UI and resume action', async () => {
    const page = await bootPage(browser, {
      profile: true,
      api: homeApi({}),
      seed: { 'att.status.v1': JSON.stringify(seedStatus('Break-out', '12:00')) }
    });
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'En pause');
    const avatar = await page.$eval('#status-avatar', el => el.textContent);
    expect(avatar).toBe('PAUSE');
    const scanLabel = await page.$eval('#btn-scan-label', el => el.textContent);
    expect(scanLabel).toBe('Scanner QR pour reprendre');
    const breakLabel = await page.$eval('#btn-break-label', el => el.textContent);
    expect(breakLabel).toBe('Reprendre');
    await page.close();
  });

  test('old day status is cleared', async () => {
    const page = await bootPage(browser, {
      profile: true,
      api: homeApi({}),
      seed: {
        'att.status.v1': JSON.stringify({ date: '2020-01-01', action: 'Check-in', time: '09:00', office: 'HQ' })
      }
    });
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Non pointe');
    await page.close();
  });

  test('elapsed timer runs while checked in', async () => {
    const page = await bootPage(browser, {
      profile: true,
      api: homeApi({}),
      seed: { 'att.status.v1': JSON.stringify(seedStatus('Check-in', '00:01')) }
    });
    await page.waitForFunction(() => !document.getElementById('elapsed-wrap').classList.contains('hidden'));
    const txt = await page.$eval('#elapsed-timer', el => el.textContent);
    expect(txt).toMatch(/^\d+h \d+m \d+s$/);
    await page.close();
  });

  test('elapsed timer hidden when not checked in', async () => {
    const page = await bootPage(browser, { profile: true, api: homeApi({}) });
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Non pointe');
    const hidden = await page.$eval('#elapsed-wrap', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
    await page.close();
  });
});

/* ==========================================
   2. BREAK BUTTON
   ========================================== */
describe('Break Toggle', () => {
  test('pause then resume round-trip updates status', async () => {
    const page = await bootPage(browser, {
      profile: true,
      api: apiRoutes({
        attendance: body => body.mode === 'break'
          ? { ok: true, date: TODAY, action: 'Break-out', time: '12:00', office: 'HQ', breakMinToday: 0 }
          : { ok: true, date: TODAY, action: 'Break-in', time: '12:30', office: 'HQ', breakMinToday: 30 },
        week: { ok: true, week: [] },
        recent: { ok: true, recent: [] },
        myattendance: { ok: true, attendance: { range: {}, summary: {}, pairs: [] } }
      }),
      seed: { 'att.status.v1': JSON.stringify(seedStatus('Check-in', '08:00')) }
    });
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Pointe');

    await page.click('#btn-break');
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'En pause');
    let info = await page.$eval('#btn-break-label', el => el.textContent);
    expect(info).toBe('Reprendre');

    // the scan-success flash overlay auto-hides after ~1.7s and swallows clicks
    await page.waitForFunction(() => document.getElementById('scan-success').classList.contains('hidden'), { timeout: 5000 });
    await page.click('#btn-break');
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Pointe');
    info = await page.$eval('#btn-break-label', el => el.textContent);
    expect(info).toBe('Pause');
    const breakInfo = await page.$eval('#break-info', el => el.textContent);
    expect(breakInfo).toContain('30m');
    await page.close();
  }, 60000);

  test('break row hidden when not checked in', async () => {
    const page = await bootPage(browser, { profile: true, api: homeApi({}) });
    await page.waitForFunction(() => document.getElementById('status-label').textContent === 'Non pointe');
    const hidden = await page.$eval('#break-row', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
    await page.close();
  });
});

/* ==========================================
   3. STREAK BADGE
   ========================================== */
describe('Streak Badge', () => {
  test('visible with count for consecutive days including today', async () => {
    const week = [
      { date: shiftDateStr(-2), hours: 7 },
      { date: shiftDateStr(-1), hours: 6 },
      { date: TODAY, hours: 3 }
    ];
    const page = await bootPage(browser, { profile: true, api: homeApi({ week: { ok: true, week } }) });
    await page.waitForFunction(() => !document.getElementById('streak-badge').classList.contains('hidden'), { timeout: 10000 });
    const count = await page.$eval('#streak-count', el => el.textContent);
    expect(count).toBe('3');
    await page.close();
  });

  test('hidden with a single day of history', async () => {
    const week = [
      { date: shiftDateStr(-5), hours: 0 },
      { date: TODAY, hours: 2 }
    ];
    const page = await bootPage(browser, { profile: true, api: homeApi({ week: { ok: true, week } }) });
    await new Promise(r => setTimeout(r, 1500));
    const hidden = await page.$eval('#streak-badge', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
    await page.close();
  });
});

/* ==========================================
   4. RECENT ACTIVITY
   ========================================== */
describe('Recent Activity', () => {
  test('renders entries from the API', async () => {
    const recent = [
      { date: TODAY, action: 'Check-in', time: '08:59', office: 'HQ' },
      { date: shiftDateStr(-1), action: 'Check-out', time: '17:02', office: 'HQ' }
    ];
    const page = await bootPage(browser, { profile: true, api: homeApi({ recent: { ok: true, recent } }) });
    await page.waitForFunction(() => document.querySelectorAll('#recent-list li').length === 2, { timeout: 10000 });
    const tags = await page.$$eval('#recent-list .tag', els => els.map(e => e.textContent));
    expect(tags).toEqual(['ENTREE', 'SORTIE']);
    const meta = await page.$$eval('#recent-list .recent-meta', els => els.map(e => e.textContent));
    expect(meta[0]).toContain('HQ');
    expect(meta[0]).toContain('08:59');
    const emptyHidden = await page.$eval('#recent-empty', el => el.classList.contains('hidden'));
    expect(emptyHidden).toBe(true);
    await page.close();
  });

  test('empty history shows placeholder text', async () => {
    const page = await bootPage(browser, { profile: true, api: homeApi({}) });
    await page.waitForFunction(() => !document.getElementById('recent-empty').classList.contains('hidden'), { timeout: 10000 });
    const items = await page.$$eval('#recent-list li', els => els.length);
    expect(items).toBe(0);
    await page.close();
  });
});

/* ==========================================
   5. WEEK CHART
   ========================================== */
describe('Week Chart', () => {
  test('renders bars with values and today label', async () => {
    const week = [
      { date: shiftDateStr(-6), hours: 0 },
      { date: shiftDateStr(-5), hours: 7.5 },
      { date: shiftDateStr(-4), hours: 8 },
      { date: shiftDateStr(-3), hours: 0 },
      { date: shiftDateStr(-2), hours: 6 },
      { date: shiftDateStr(-1), hours: 7 },
      { date: TODAY, hours: 3 }
    ];
    const page = await bootPage(browser, { profile: true, api: homeApi({ week: { ok: true, week } }) });
    await page.waitForFunction(() => document.querySelectorAll('#week-chart .week-col').length === 7, { timeout: 10000 });
    const labels = await page.$$eval('#week-chart .week-label', els => els.map(e => e.textContent));
    expect(labels[6]).toBe("Aujourd'hui");
    const zeroBars = await page.$$eval('#week-chart .week-bar.zero', els => els.length);
    expect(zeroBars).toBe(2);
    const vals = await page.$$eval('#week-chart .week-val', els => els.map(e => e.textContent));
    expect(vals[1]).toBe('7h 30m');
    expect(vals[0]).toBe('');
    await page.close();
  });
});

/* ==========================================
   6. MONTH SUMMARY
   ========================================== */
describe('Month Summary', () => {
  function attendance(pairs) {
    return {
      ok: true,
      attendance: {
        range: { from: TODAY.slice(0, 8) + '01', to: TODAY },
        summary: { daysPresent: pairs.length, totalHours: 14, lateCount: 1 },
        pairs
      }
    };
  }

  test('aggregates current-month pairs into stats', async () => {
    const pairs = [
      { date: TODAY.slice(0, 8) + '03', in: '08:10', out: '12:10', hours: 4, late: true, missing: false, breakMin: 30 },
      { date: TODAY.slice(0, 8) + '04', in: '08:00', out: '15:30', hours: 7.5, late: false, missing: false, breakMin: 0 },
      { date: TODAY.slice(0, 8) + '05', in: '08:05', out: '10:35', hours: 2.5, late: false, missing: false, breakMin: 0 }
    ];
    const page = await bootPage(browser, { profile: true, api: homeApi({ myattendance: attendance(pairs) }) });
    await page.waitForFunction(() => document.getElementById('mo-days').textContent !== '0', { timeout: 10000 });
    const days = await page.$eval('#mo-days', el => el.textContent);
    const hours = await page.$eval('#mo-hours', el => el.textContent);
    const late = await page.$eval('#mo-late', el => el.textContent);
    const brk = await page.$eval('#mo-break', el => el.textContent);
    expect(days).toBe('3');
    expect(hours).toBe('14h 0m');
    expect(late).toBe('1');
    expect(brk).toBe('0h 30m');
    await page.close();
  });

  test('pairs outside the current month are ignored', async () => {
    const pairs = [
      { date: TODAY.slice(0, 8) + '03', in: '08:00', out: '12:00', hours: 4, late: false, missing: false },
      { date: '2020-01-15', in: '08:00', out: '16:00', hours: 8, late: false, missing: false }
    ];
    const page = await bootPage(browser, { profile: true, api: homeApi({ myattendance: attendance(pairs) }) });
    await page.waitForFunction(() => document.getElementById('mo-days').textContent !== '0', { timeout: 10000 });
    const days = await page.$eval('#mo-days', el => el.textContent);
    const hours = await page.$eval('#mo-hours', el => el.textContent);
    expect(days).toBe('1');
    expect(hours).toBe('4h 0m');
    await page.close();
  });
});

/* ==========================================
   7. HISTORY MODAL
   ========================================== */
describe('History Modal', () => {
  const PAIRS = [
    { date: TODAY.slice(0, 8) + '05', in: '08:05', out: '12:05', hours: 4, late: false, missing: false },
    { date: TODAY.slice(0, 8) + '04', in: '09:20', out: null, hours: null, late: false, missing: true },
    { date: TODAY.slice(0, 8) + '03', in: '08:00', out: '15:30', hours: 7.5, late: true, missing: false }
  ];

  function historyApi() {
    return homeApi({
      myattendance: {
        ok: true,
        attendance: {
          range: { from: TODAY.slice(0, 8) + '01', to: TODAY },
          summary: { daysPresent: 3, totalHours: 11.5, lateCount: 1 },
          pairs: PAIRS
        }
      }
    });
  }

  async function openHistory(page) {
    await page.click('#btn-history');
    await page.waitForSelector('#modal-history:not(.hidden)', { timeout: 10000 });
  }

  test('history button opens modal and renders full report', async () => {
    const page = await bootPage(browser, { profile: true, api: historyApi() });
    await openHistory(page);

    const range = await page.$eval('#hist-range', el => el.textContent);
    expect(range).toBe(TODAY.slice(0, 8) + '01 \u2192 ' + TODAY);
    const days = await page.$eval('#hist-days', el => el.textContent);
    const hours = await page.$eval('#hist-hours', el => el.textContent);
    const late = await page.$eval('#hist-late', el => el.textContent);
    expect(days).toBe('3');
    expect(hours).toBe('11h 30m');
    expect(late).toBe('1');

    const rows = await page.$$eval('#hist-table tbody tr', trs => trs.map(tr => tr.textContent));
    expect(rows.length).toBe(3);
    expect(rows[0]).toContain(TODAY.slice(0, 8) + '05');

    const missingRow = await page.$$eval('#hist-table tbody tr.row-missing', trs => trs.length);
    const lateRows = await page.$$eval('#hist-table tbody tr.row-late', trs => trs.length);
    expect(missingRow).toBe(1);
    expect(lateRows).toBe(1);

    const heatCells = await page.evaluate(() => {
      const grid = document.getElementById('history-heatmap');
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const lead = (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7;
      return { total: grid.children.length, expected: lead + daysInMonth };
    });
    expect(heatCells.total).toBe(heatCells.expected);

    const lvl3 = await page.$$eval('#history-heatmap .hm-cell.lvl-3', els => els.length);
    expect(lvl3).toBeGreaterThanOrEqual(1);
    await page.close();
  });

  test('history button without profile prompts for details', async () => {
    const page = await bootPage(browser, { freshProfile: true });
    await page.click('#btn-history');
    const feedbackEl = await page.$('#feedback');
    const text = await feedbackEl.evaluate(el => el.textContent);
    expect(text.toLowerCase()).toContain('coordonnees');
    await page.close();
  });

  test('history close button works', async () => {
    const page = await bootPage(browser, { profile: true, api: historyApi() });
    await openHistory(page);
    await page.click('#btn-hist-close');
    await page.waitForFunction(() => document.getElementById('modal-history').classList.contains('hidden'));
    await page.close();
  });

  test('CSV export reports exported record count', async () => {
    const page = await bootPage(browser, {
      profile: true,
      api: homeApi({
        myexport: {
          ok: true,
          rows: [
            { date: TODAY, time: '08:59', name: 'Test User', action: 'Check-in', status: 'OK', distance: 12, office: 'HQ' },
            { date: TODAY, time: '17:00', name: 'Test User', action: 'Check-out', status: 'OK', distance: 9, office: 'HQ' }
          ]
        }
      })
    });
    await openHistory(page);
    await page.click('#btn-hist-export');
    await page.waitForFunction(() => document.getElementById('feedback').textContent.indexOf('export') !== -1, { timeout: 10000 });
    const text = await page.$eval('#feedback', el => el.textContent);
    expect(text).toContain('2 enregistrement(s) exporte(s)');
    await page.close();
  });

  test('delete requires confirmation then clears records', async () => {
    const page = await bootPage(browser, {
      profile: true,
      api: homeApi({ mydelete: { ok: true, deleted: 7 } })
    });
    await openHistory(page);

    const dialogPromise = new Promise(resolve => page.once('dialog', async d => {
      resolve(d.message());
      await d.accept();
    }));
    await page.click('#btn-hist-delete');
    const confirmMsg = await dialogPromise;
    expect(confirmMsg).toContain('Effacer TOUS');

    await page.waitForFunction(() => document.getElementById('modal-history').classList.contains('hidden'), { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('feedback').textContent.indexOf('efface') !== -1, { timeout: 10000 });
    const text = await page.$eval('#feedback', el => el.textContent);
    expect(text).toContain('7 enregistrement(s) efface(s)');
    await page.close();
  });

  test('declining delete keeps data intact', async () => {
    const page = await bootPage(browser, {
      profile: true,
      api: Object.assign(historyApi(), { mydelete: { ok: true, deleted: 7 } })
    });
    await openHistory(page);

    page.once('dialog', d => d.dismiss());
    await page.click('#btn-hist-delete');
    await new Promise(r => setTimeout(r, 800));
    const visible = await page.$eval('#modal-history', el => !el.classList.contains('hidden'));
    expect(visible).toBe(true);
    const text = await page.$eval('#feedback', el => el.textContent);
    expect(text).not.toContain('efface');
    await page.close();
  });
});
