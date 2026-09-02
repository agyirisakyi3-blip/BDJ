const {
  launchBrowser, bootPage, loginAdmin, expandAdminSection, safeClick, apiRoutes, apiCapture,
  adminFixture, todayStr, shiftDateStr
} = require('./helpers');

let browser;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  if (browser) await browser.close();
});

async function adminSession(opts = {}) {
  const cap = apiCapture(apiRoutes(Object.assign({
    admin_check: { ok: true, isAdmin: true },
    admin: body => ({
      ok: true,
      sessionToken: 'tok-123',
      admin: adminFixture({ range: { from: body.from || todayStr(), to: body.to || todayStr() } })
    }),
    employees: { ok: true, employees: [] },
    admins_list: { ok: true, admins: [] },
    leave_list: { ok: true, leaves: [] },
    holiday_list: { ok: true, holidays: [] }
  }, opts.routes || {})));
  const page = await bootPage(browser, {
    profile: true,
    api: body => cap.handler(body),
    hash: '#admin'
  });
  await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
  await loginAdmin(page);
  return { page, cap };
}

/* ==========================================
   1. DASHBOARD RENDER
   ========================================== */
describe('Admin Dashboard', () => {
  test('renders KPIs, summary, chart and lists', async () => {
    const { page } = await adminSession();
    const kpis = await page.evaluate(() => ({
      staff: document.getElementById('kpi-staff').textContent,
      onsite: document.getElementById('kpi-onsite').textContent,
      inToday: document.getElementById('kpi-in').textContent,
      outToday: document.getElementById('kpi-out').textContent,
      rpHours: document.getElementById('rp-hours').textContent,
      rpDays: document.getElementById('rp-days').textContent,
      rpLate: document.getElementById('rp-late').textContent,
      onsiteCount: document.getElementById('on-site-count').textContent,
      absentCount: document.getElementById('absent-count').textContent
    }));
    expect(kpis.staff).toBe('2');
    expect(kpis.onsite).toBe('2');
    expect(kpis.inToday).toBe('3');
    expect(kpis.outToday).toBe('1');
    expect(kpis.rpHours).toBe('7h 30m');
    expect(kpis.rpDays).toBe('3');
    expect(kpis.rpLate).toBe('1');
    expect(kpis.onsiteCount).toContain('2 sur place');
    expect(kpis.absentCount).toContain('1 non pointe');

    const chips = await page.$$eval('#on-site-list .chip', els => els.map(e => e.textContent));
    expect(chips).toEqual(['A', 'B']);
    const absentChips = await page.$$eval('#absent-list .chip.absent', els => els.map(e => e.textContent));
    expect(absentChips[0]).toContain('Cara');

    const bars = await page.$$eval('#hours-chart .bar-col', els => els.length);
    expect(bars).toBe(2);
    const pill = await page.$eval('#chart-pill', el => el.textContent);
    expect(pill).toBe('7.5 h');

    const avatars = await page.$$eval('#people-table .avatar', els => els.length);
    expect(avatars).toBe(2);

    const rangeLabel = await page.$eval('#dash-range-label', el => el.textContent);
    expect(rangeLabel).toContain(todayStr());
    await page.close();
  });

  test('collapsible cards toggle open and closed', async () => {
    const { page } = await adminSession();
    const result = await page.evaluate(() => {
      const header = document.querySelector('.card.collapsed .block-head.collapsible');
      if (!header) return null;
      const card = header.closest('.card');
      header.click();
      return card.classList.contains('collapsed');
    });
    expect(result).toBe(false);
    await page.close();
  });

  test('collapsed cards hide their block-body', async () => {
    const { page } = await adminSession();
    const bodyHidden = await page.evaluate(() => {
      const card = document.querySelector('.card.collapsed');
      if (!card) return null;
      const body = card.querySelector('.block-body');
      return body ? getComputedStyle(body).display === 'none' : null;
    });
    expect(bodyHidden).toBe(true);
    await page.close();
  });
});

/* ==========================================
   2. PEOPLE TABLE SEARCH & SORT
   ========================================== */
describe('People Table', () => {
  test('search filters rows and updates the count pill', async () => {
    const { page } = await adminSession();
    await page.waitForFunction(() => document.querySelectorAll('#people-table .avatar').length === 2, { timeout: 10000 });

    await page.type('#people-search', 'Alice');
    await page.waitForFunction(() => document.getElementById('people-count').textContent === '1 / 2');
    let names = await page.$$eval('#people-table .person-name', els => els.map(e => e.textContent));
    expect(names).toEqual(['Alice']);

    await page.evaluate(() => { document.getElementById('people-search').value = ''; });
    await page.type('#people-search', 'zzz-no-match');
    await page.waitForFunction(() => document.getElementById('people-count').textContent === '0 / 2');
    const emptyText = await page.$eval('#people-table tbody td.empty', el => el.textContent);
    expect(emptyText).toContain('Aucun resultat');
    await page.close();
  });

  test('sorting by hours toggles asc then desc', async () => {
    const { page } = await adminSession();
    await page.waitForFunction(() => document.querySelectorAll('#people-table .avatar').length === 2, { timeout: 10000 });

    await page.click('#people-table th[data-key="totalHours"]');
    let first = await page.$eval('#people-table .person-name', el => el.textContent);
    expect(first).toBe('Bob');

    await page.click('#people-table th[data-key="totalHours"]');
    first = await page.$eval('#people-table .person-name', el => el.textContent);
    expect(first).toBe('Alice');
    const desc = await page.$eval('#people-table th[data-key="totalHours"]', el => el.classList.contains('desc'));
    expect(desc).toBe(true);
    await page.close();
  });

  test('report table sorts newest first by default', async () => {
    const routes = {
      admin: () => ({ ok: true, sessionToken: 'tok-123', admin: adminFixture({
        pairs: [
          { date: shiftDateStr(-2), name: 'Zoe', email: 'z@x.com', in: '08:00', out: '12:00', hours: 4, late: false, missing: false },
          { date: todayStr(), name: 'Amy', email: 'a@x.com', in: '08:30', out: '12:30', hours: 4, late: false, missing: false },
          { date: shiftDateStr(-1), name: 'Max', email: 'm@x.com', in: '09:10', out: null, hours: null, late: false, missing: true }
        ]
      }) })
    };
    const { page } = await adminSession({ routes });
    await page.waitForFunction(() => document.querySelectorAll('#report-table tbody tr').length === 3, { timeout: 10000 });
    const dates = await page.$$eval('#report-table tbody tr', trs => trs.map(tr => tr.cells[0].textContent));
    expect(dates[0]).toBe(todayStr());
    expect(dates[2]).toBe(shiftDateStr(-2));

    const missingClass = await page.$$eval('#report-table tbody tr.row-missing', trs => trs.length);
    expect(missingClass).toBe(1);
    const reportCount = await page.$eval('#report-count', el => el.textContent);
    expect(reportCount).toBe('3 entrees');
    await page.close();
  });
});

/* ==========================================
   3. QUICK RANGES
   ========================================== */
describe('Quick Ranges', () => {
  test('7-day chip sets dates, flags active and reloads data', async () => {
    const { page, cap } = await adminSession();
    await page.click('.qr-chip[data-range="7d"]');
    await page.waitForFunction(
      () => document.getElementById('rng-from').value !== '' &&
            document.querySelector('.qr-chip[data-range="7d"]').classList.contains('active'),
      { timeout: 10000 }
    );
    const from = await page.$eval('#rng-from', el => el.value);
    const to = await page.$eval('#rng-to', el => el.value);
    expect(from).toBe(shiftDateStr(-6));
    expect(to).toBe(todayStr());

    const lastAdminCall = cap.ofAction('admin').pop();
    expect(lastAdminCall.from).toBe(shiftDateStr(-6));
    expect(lastAdminCall.to).toBe(todayStr());
    expect(lastAdminCall.token).toBeTruthy();

    const todayActive = await page.$eval('.qr-chip[data-range="today"]', el => el.classList.contains('active'));
    expect(todayActive).toBe(false);
    await page.close();
  });
});

/* ==========================================
   4. EMPLOYEE MANAGEMENT
   ========================================== */
describe('Employee Management', () => {
  function employeeApi() {
    const list = [];
    return apiCapture(apiRoutes({
      admin_check: { ok: true, isAdmin: true },
      admin: body => ({
        ok: true,
        sessionToken: 'tok-123',
        admin: adminFixture({ range: { from: body.from || todayStr(), to: body.to || todayStr() } })
      }),
      employees: () => ({ ok: true, employees: list }),
      employee_add: body => {
        const emp = {
          name: body.name, email: body.email,
          department: body.department || '',
          shiftStart: body.shiftStart || '', shiftEnd: body.shiftEnd || ''
        };
        list.push(emp);
        return { ok: true, employee: emp };
      },
      employee_delete: body => {
        const i = list.findIndex(e => e.email === body.email);
        if (i !== -1) list.splice(i, 1);
        return { ok: true };
      }
    }));
  }

  test('add employee refreshes table and clears the form', async () => {
    const cap = employeeApi();
    const page = await bootPage(browser, { profile: true, api: b => cap.handler(b), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    await loginAdmin(page);
    await expandAdminSection(page, 'Employes');

    await page.waitForFunction(() => document.getElementById('emp-count').textContent.indexOf('0') === 0, { timeout: 10000 });
    const emptyText = await page.$eval('#emp-table tbody td.empty', el => el.textContent);
    expect(emptyText).toContain('Aucun employe');

    await page.type('#emp-name', 'Alice Dubois');
    await page.type('#emp-email', 'alice@bdj.com');
    await page.type('#emp-dept', 'Informatique');
    await page.evaluate(() => {
      document.getElementById('emp-shift-start').value = '08:00';
      document.getElementById('emp-shift-end').value = '17:00';
    });
    await safeClick(page, '#btn-emp-add');

    await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll('#emp-table tbody tr'));
      return rows.some(tr => tr.textContent.indexOf('Alice Dubois') !== -1);
    }, { timeout: 10000 });
    const row = await page.$eval('#emp-table tbody tr', tr => tr.textContent);
    expect(row).toContain('Alice Dubois');
    expect(row).toContain('alice@bdj.com');
    expect(row).toContain('Informatique');
    expect(row).toContain('08:00 - 17:00');
    const count = await page.$eval('#emp-count', el => el.textContent);
    expect(count).toBe('1 employe');
    const nameVal = await page.$eval('#emp-name', el => el.value);
    expect(nameVal).toBe('');

    await page.waitForFunction(() => document.getElementById('feedback').textContent.indexOf('enregistre') !== -1, { timeout: 5000 });
    await page.close();
  });

  test('client-side validation blocks empty or invalid entries', async () => {
    const cap = employeeApi();
    const page = await bootPage(browser, { profile: true, api: b => cap.handler(b), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    await loginAdmin(page);
    await expandAdminSection(page, 'Employes');

    await page.click('#btn-emp-add');
    let err = await page.$eval('#emp-error', el => el.textContent);
    expect(err).toContain('nom');

    await page.type('#emp-name', 'No Email');
    await page.click('#btn-emp-add');
    err = await page.$eval('#emp-error', el => el.textContent);
    expect(err).toContain('email');
    const added = cap.ofAction('employee_add').length;
    expect(added).toBe(0);
    await page.close();
  });

  test('delete asks for confirmation then removes the row', async () => {
    const list = [{ name: 'Bob Martin', email: 'bob@bdj.com', department: '', shiftStart: '', shiftEnd: '' }];
    const cap = apiCapture(apiRoutes({
      admin_check: { ok: true, isAdmin: true },
      admin: body => ({
        ok: true,
        sessionToken: 'tok-123',
        admin: adminFixture({ range: { from: body.from || todayStr(), to: body.to || todayStr() } })
      }),
      employees: () => ({ ok: true, employees: list }),
      employee_delete: body => {
        const i = list.findIndex(e => e.email === body.email);
        if (i !== -1) list.splice(i, 1);
        return { ok: true };
      }
    }));
    const page = await bootPage(browser, { profile: true, api: b => cap.handler(b), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    await loginAdmin(page);
    await expandAdminSection(page, 'Employes');
    await page.waitForFunction(() => document.querySelectorAll('#emp-table tbody tr').length === 1, { timeout: 10000 });

    page.once('dialog', d => d.accept());
    await page.click('#emp-table tbody .ghost-btn');
    await page.waitForFunction(() => !!document.querySelector('#emp-table tbody td.empty'), { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('feedback').textContent.indexOf('supprime') !== -1, { timeout: 5000 });
    await page.close();
  });

  test('send codes to all emails in the roster', async () => {
    const list = [
      { name: 'Alice Dubois', email: 'alice@bdj.com', department: 'IT', code: '111111', shiftStart: '', shiftEnd: '' },
      { name: 'Bob Martin', email: 'bob@bdj.com', department: '', code: '222222', shiftStart: '', shiftEnd: '' }
    ];
    const cap = apiCapture(apiRoutes({
      admin_check: { ok: true, isAdmin: true },
      admin: body => ({
        ok: true,
        sessionToken: 'tok-123',
        admin: adminFixture({ range: { from: body.from || todayStr(), to: body.to || todayStr() } })
      }),
      employees: () => ({ ok: true, employees: list }),
      send_codes: () => ({ ok: true, sent: 2, total: 2, failed: [] })
    }));
    const page = await bootPage(browser, { profile: true, api: b => cap.handler(b), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    await loginAdmin(page);
    await expandAdminSection(page, 'Employes');
    await page.waitForFunction(() => document.querySelectorAll('#emp-table tbody tr').length === 2, { timeout: 10000 });

    page.once('dialog', d => d.accept());
    await page.click('#btn-emp-send-codes');
    await page.waitForFunction(() => document.getElementById('feedback').textContent.indexOf('codes') !== -1, { timeout: 10000 });

    const call = cap.ofAction('send_codes')[0];
    expect(call).toBeTruthy();
    expect(call.token).toBe('tok-123');
    const fb = await page.$eval('#feedback', el => el.textContent);
    expect(fb).toContain('2 codes');
    await page.close();
  });
});

/* ==========================================
   5. SESSION EXPIRY
   ========================================== */
describe('Admin Session', () => {
  test('expired session returns to the login card', async () => {
    let expired = false;
    const cap = apiCapture(apiRoutes({
      admin_check: { ok: true, isAdmin: true },
      admin: () => expired
        ? { ok: false, message: 'Admin login required' }
        : { ok: true, sessionToken: 'tok-123', admin: adminFixture() }
    }));
    const page = await bootPage(browser, { profile: true, api: b => cap.handler(b), hash: '#admin' });
    await page.waitForFunction(() => !document.getElementById('view-admin').classList.contains('hidden'), { timeout: 10000 });
    await loginAdmin(page);
    await page.waitForFunction(() => !document.getElementById('admin-dash').classList.contains('hidden'), { timeout: 10000 });

    expired = true;
    await page.click('#btn-refresh');
    await page.waitForFunction(() => !document.getElementById('admin-login').classList.contains('hidden'), { timeout: 10000 });
    const dashHidden = await page.$eval('#admin-dash', el => el.classList.contains('hidden'));
    expect(dashHidden).toBe(true);
    const err = await page.$eval('#admin-error', el => el.textContent);
    expect(err.length).toBeGreaterThan(0);
    await page.close();
  });
});

/* ==========================================
   6. CORRECTIONS FORM
   ========================================== */
describe('Corrections Form', () => {
  test('mode switch shows and hides time fields', async () => {
    const { page } = await adminSession();
    await page.select('#co-mode', 'add_pair');
    await page.waitForFunction(() => !document.querySelector('.co-in-field').classList.contains('hidden'));
    let outVisible = await page.evaluate(() => !document.getElementById('co-out').parentElement.classList.contains('hidden'));
    expect(outVisible).toBe(true);

    await page.select('#co-mode', 'set_out');
    await page.waitForFunction(() => document.querySelector('.co-in-field').classList.contains('hidden'));
    outVisible = await page.evaluate(() => !document.getElementById('co-out').parentElement.classList.contains('hidden'));
    expect(outVisible).toBe(true);

    await page.select('#co-mode', 'remove_last');
    await page.waitForFunction(() => document.getElementById('co-out').parentElement.classList.contains('hidden'));
    await page.close();
  });

  test('apply validates email and date before calling the API', async () => {
    const { page, cap } = await adminSession({
      routes: { correction_apply: { ok: true, applied: 'Sortie ajoutee.' } }
    });
    await expandAdminSection(page, 'Corrections de pointage');

    await page.type('#co-email', 'not-an-email');
    await page.click('#btn-co-apply');
    let err = await page.$eval('#co-error', el => el.textContent);
    expect(err).toContain('email');

    await page.evaluate(() => { document.getElementById('co-email').value = ''; });
    await page.type('#co-email', 'a@x.com');
    await page.click('#btn-co-apply');
    err = await page.$eval('#co-error', el => el.textContent);
    expect(err).toContain('date');

    await page.evaluate(dateStr => {
      document.getElementById('co-date').value = dateStr;
      document.getElementById('co-out').value = '18:00';
    }, todayStr());
    await page.click('#btn-co-apply');
    await page.waitForFunction(() => document.getElementById('feedback').textContent.indexOf('Correction appliquee') !== -1, { timeout: 10000 });
    const call = cap.ofAction('correction_apply')[0];
    expect(call.email).toBe('a@x.com');
    expect(call.out).toBe('18:00');
    expect(call.fixMode).toBe('set_out');
    await page.close();
  });
});

/* ==========================================
   7. PROVISION VALIDATION
   ========================================== */
describe('Provision Form', () => {
  test('rejects empty and malformed tenant codes client-side', async () => {
    const { page, cap } = await adminSession();
    await expandAdminSection(page, 'Creer un espace');

    await page.click('#btn-provision');
    let err = await page.$eval('#prov-error', el => el.textContent);
    expect(err).toContain('Saisissez un code espace');

    await page.type('#prov-code', 'BAD CODE!');
    await page.click('#btn-provision');
    err = await page.$eval('#prov-error', el => el.textContent);
    expect(err).toContain('Code espace :');

    expect(cap.ofAction('provision').length).toBe(0);
    await page.close();
  });
});

/* ==========================================
   8. ADMINS PANEL VALIDATION
   ========================================== */
describe('Admins Panel', () => {
  test('blocks empty and invalid admin emails client-side', async () => {
    const { page, cap } = await adminSession();
    await expandAdminSection(page, 'Admins');

    await page.click('#btn-adm-add');
    let err = await page.$eval('#adm-error', el => el.textContent);
    expect(err).toContain('email');

    await page.type('#adm-email', 'nope');
    await page.click('#btn-adm-add');
    err = await page.$eval('#adm-error', el => el.textContent);
    expect(err).toContain('email');
    expect(cap.ofAction('admin_add').length).toBe(0);
    await page.close();
  });
});
