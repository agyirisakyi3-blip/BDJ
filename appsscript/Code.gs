/**
 * Attendance App - Google Apps Script backend (multi-tenant).
 *
 * Bound script of the "master" Google Sheet. Deploy as a Web App:
 *   Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Multi-tenant model
 * ------------------
 * - The bound spreadsheet is the MASTER (registry). Its "Tenants" sheet maps a
 *   tenant code -> tenant spreadsheet id.
 * - Every tenant lives in its own spreadsheet (own Config / Roster / Offices /
 *   Attendance / Audit). The web app routes each request to the right spreadsheet
 *   using the `tenant` field in the request body.
 * - Empty/unknown tenant -> routed to the master spreadsheet (legacy behaviour).
 * - Provision: POST {action:'provision', masterPin, code, appName} creates and
 *   registers a new tenant spreadsheet and returns its credentials once.
 * - Office QRs may be "code|token" so the app can auto-select the tenant.
 */

var SHEET_TENANTS = 'Tenants';
var SHEET_ATT = 'Attendance';
var SHEET_CFG = 'Config';
var SHEET_ROSTER = 'Roster';
var SHEET_AUDIT = 'Audit';
var SHEET_OFFICES = 'Offices';
var SHEET_EMPLOYEES = 'Employees';

function setup() {
  var master = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheets_(master);
  var cfg = getConfig_(master);
  if (cfg.adminPin && !getSecret_(master, 'adminPin')) setSecret_('adminPin', cfg.adminPin, master.getId());
  if (cfg.qrSecret && !getSecret_(master, 'qrSecret')) setSecret_('qrSecret', cfg.qrSecret, master.getId());
  Logger.log('Attendance app ready (master). Edit the Config sheet values.');
  Logger.log(JSON.stringify({ appName: cfg.appName, note: 'Secrets (adminPin/qrSecret) moved to script properties when present.' }, null, 2));
  return 'Sheets ready. Secrets are kept in script properties (not the sheet).';
}

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Attendance')
      .addItem('Enable daily digest (17:00)', 'enableDailyDigest')
      .addItem('Send digest now', 'sendDailyDigestNow')
      .addItem('Rotate admin PIN', 'rotateAdminPin')
      .addItem('Rotate QR secret', 'rotateQrSecret')
      .addItem('Enable auto-purge (retentionDays)', 'enableAutoPurge')
      .addItem('Run retention purge now', 'purgeOldData_')
      .addToUi();
  } catch (e) {}
}

function rotateAdminPin() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pin = 'PIN' + randomToken_().slice(0, 6);
  setSecret_('adminPin', pin, ss.getId());
  clearConfigCache_(ss);
  SpreadsheetApp.getUi().alert('New admin PIN: ' + pin + '\n\nStore it in a password manager. The old PIN no longer works.');
}

function rotateQrSecret() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var qr = 'ATT' + randomToken_();
  setSecret_('qrSecret', qr, ss.getId());
  clearConfigCache_(ss);
  SpreadsheetApp.getUi().alert('New QR secret: ' + qr + '\n\nPrint a new office QR with qr-generator.html using this value.');
}

function clearConfigCache_(ss) {
  CacheService.getScriptCache().remove('cfg:' + ss.getId());
}

/**
 * Read a secret from Apps Script properties (scoped to a spreadsheet id when
 * one is given), falling back to the Config sheet for legacy installs.
 * Keeps adminPin / qrSecret out of the spreadsheet so sheet collaborators
 * cannot see or change them.
 */
function getSecret_(ss, name) {
  var props = PropertiesService.getScriptProperties();
  var id = ss ? ss.getId() : '';
  var scoped = props.getProperty(name + ':' + id);
  if (scoped) return scoped;
  var global = props.getProperty(name);
  if (global) return global;
  if (ss) {
    var sheet = ss.getSheetByName(SHEET_CFG);
    if (sheet) {
      var rows = sheet.getDataRange().getValues();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0]).trim().toLowerCase() === String(name).toLowerCase()) {
          var v = String(rows[i][1]);
          if (v) return v;
        }
      }
    }
  }
  return null;
}

function setSecret_(name, value, id) {
  PropertiesService.getScriptProperties().setProperty(name + (id ? ':' + id : ''), value);
}

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  var payload = {};
  try {
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    return json_({ ok: false, message: 'Bad payload' });
  }

  var action = String(payload.action || 'config');
  var now = new Date();
  var tz = Session.getScriptTimeZone();
  var master = SpreadsheetApp.getActiveSpreadsheet();

  try {
    ensureSheets_(master);

    if (action === 'provision') {
      return json_(provisionTenant_(payload, getConfig_(master), now, tz));
    }

    var tenantCode = String(payload.tenant || '').trim();
    var ss = resolveSpreadsheet_(tenantCode);
    ensureSheets_(ss);
    var cfg = getConfig_(ss);

    if (action === 'config') {
      return json_({ ok: true, config: publicConfig_(cfg, ss) });
    }
    if (action === 'attendance') {
      return json_(recordAttendance_(payload, cfg, now, tz, ss));
    }
    if (action === 'admin') {
      return json_(adminData_(payload, cfg, now, tz, ss));
    }
    if (action === 'myattendance') {
      return json_(myAttendance_(payload, cfg, now, tz, ss));
    }
    if (action === 'recent') {
      return json_(recentAttendance_(payload, cfg, now, tz, ss));
    }
    if (action === 'week') {
      return json_(weekData_(payload, cfg, now, tz, ss));
    }
    if (action === 'myexport') {
      return json_(myExport_(payload, cfg, now, tz, ss));
    }
    if (action === 'mydelete') {
      return json_(myDelete_(payload, cfg, now, tz, ss));
    }
    if (action === 'employees') {
      return json_(employeesData_(payload, cfg, now, tz, ss));
    }
    if (action === 'employee_add') {
      return json_(employeeAdd_(payload, cfg, now, tz, ss));
    }
    if (action === 'employee_delete') {
      return json_(employeeDelete_(payload, cfg, now, tz, ss));
    }
    return json_(error_('Unknown action: ' + action));
  } catch (err) {
    return json_(error_('Server error: ' + err));
  }
}

/* ================= Tenant registry ================= */

function resolveSpreadsheet_(code) {
  var master = SpreadsheetApp.getActiveSpreadsheet();
  if (!code) return master;
  var id = lookupTenantId_(code);
  if (!id) return master;
  return SpreadsheetApp.openById(id);
}

function lookupTenantId_(code, skipCache) {
  var cache = CacheService.getScriptCache();
  var key = 'tenants';
  var map = null;
  if (!skipCache) {
    var cached = cache.get(key);
    if (cached) {
      try { map = JSON.parse(cached); } catch (e) {}
    }
  }
  if (!map) {
    map = {};
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TENANTS);
    if (sheet) {
      var rows = sheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var c = String(rows[i][0] || '').trim().toLowerCase();
        if (c) map[c] = String(rows[i][1] || '').trim();
      }
    }
    cache.put(key, JSON.stringify(map), 300);
  }
  return map[String(code).trim().toLowerCase()] || '';
}

function allTenants_() {
  var cache = CacheService.getScriptCache();
  var key = 'tenants';
  var map = null;
  var cached = cache.get(key);
  if (cached) {
    try { map = JSON.parse(cached); } catch (e) {}
  }
  if (!map) {
    map = {};
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TENANTS);
    if (sheet) {
      var rows = sheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var c = String(rows[i][0] || '').trim().toLowerCase();
        if (c) map[c] = String(rows[i][1] || '').trim();
      }
    }
    cache.put(key, JSON.stringify(map), 300);
  }
  return map;
}

function registerTenant_(code, spreadsheetId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TENANTS);
  sheet.appendRow([code.toLowerCase(), spreadsheetId, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')]);
  CacheService.getScriptCache().remove('tenants');
}

function provisionTenant_(payload, masterCfg, now, tz) {
  var mpin = String(payload.masterPin || '');
  if (mpin !== masterCfg.adminPin) {
    logAudit_(SpreadsheetApp.getActiveSpreadsheet(), '', 'Failed tenant creation (bad platform PIN)', 'BAD_MASTER_PIN', now, tz);
    return error_('Invalid platform PIN.');
  }

  var code = String(payload.code || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9\-]{1,23}$/.test(code)) {
    return error_('Tenant code must be 2-24 characters: letters, digits and hyphens.');
  }
  if (lookupTenantId_(code, true)) {
    return error_('Tenant code already exists: ' + code);
  }
  if (!writeBudget_('provq:master', 10, 3600000)) {
    logAudit_(SpreadsheetApp.getActiveSpreadsheet(), '', 'Tenant creation rate limit hit', 'QUOTA_PROVISION', now, tz);
    return error_('Too many tenants created this hour. Try again later.');
  }

  var appName = safeCell_(String(payload.appName || '').trim() || code);
  var tenant = SpreadsheetApp.create(appName);
  ensureSheets_(tenant);

  var tenantPin = 'PIN' + randomToken_().slice(0, 6);
  var tenantQr = 'ATT' + randomToken_();
  setSecret_('adminPin', tenantPin, tenant.getId());
  setSecret_('qrSecret', tenantQr, tenant.getId());
  setConfigValue_(tenant, 'appName', appName);
  registerTenant_(code, tenant.getId());

  return {
    ok: true,
    tenant: {
      code: code,
      spreadsheetId: tenant.getId(),
      url: tenant.getUrl(),
      appName: appName,
      qrSecret: tenantQr,
      adminPin: tenantPin
    }
  };
}

function setConfigValue_(ss, key, value) {
  var sheet = ss.getSheetByName(SHEET_CFG);
  if (!sheet) return;
  var rows = sheet.getDataRange().getValues();
  var found = false;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === String(key).toLowerCase()) {
      rows[i][1] = value;
      found = true;
      break;
    }
  }
  if (!found) {
    sheet.appendRow([key, value]);
    return;
  }
  sheet.getRange('B' + (i + 1)).setValue(value);
  CacheService.getScriptCache().remove('cfg:' + ss.getId());
}

/* ================= Sheets ================= */

function ensureSheets_(ss) {
  if (!ss.getSheetByName(SHEET_CFG)) {
    var c = ss.insertSheet(SHEET_CFG);
    c.appendRow(['key', 'value']);
    c.appendRow(['appName', 'Liste Des Presences']);
    c.appendRow(['officeName', 'Head Office']);
    c.appendRow(['officeLat', '5.6037168']);
    c.appendRow(['officeLng', '-0.1869644']);
    c.appendRow(['radiusMeters', '150']);
    c.appendRow(['qrSecret', 'ATT' + randomToken_()]);
    c.appendRow(['adminPin', '1234']);
    c.appendRow(['adminEmail', '']);
    c.appendRow(['rosterMode', 'open']);
    c.appendRow(['rosterDomain', '']);
    c.appendRow(['minScanIntervalSec', '60']);
    c.appendRow(['replayMaxAgeMs', '300000']);
    c.appendRow(['pinMaxAttempts', '5']);
    c.appendRow(['pinLockoutMs', '900000']);
    c.appendRow(['writeQuotaPerEmail', '60']);
    c.appendRow(['writeQuotaTenant', '600']);
    c.appendRow(['retentionDays', '0']);
    c.appendRow(['lateAfter', '']);
  }
  if (!ss.getSheetByName(SHEET_ATT)) {
    var a = ss.insertSheet(SHEET_ATT);
    a.appendRow(['Date', 'Time', 'Name', 'Email', 'Action', 'Status', 'Latitude', 'Longitude', 'Distance(m)', 'QR Token', 'Office']);
    a.getRange('A1:K1').setFontWeight('bold');
  }
  if (!ss.getSheetByName(SHEET_ROSTER)) {
    var r = ss.insertSheet(SHEET_ROSTER);
    r.appendRow(['Email']);
    r.getRange('A1').setFontWeight('bold');
  }
  if (!ss.getSheetByName(SHEET_EMPLOYEES)) {
    var e = ss.insertSheet(SHEET_EMPLOYEES);
    e.appendRow(['Name', 'Email', 'Department', 'Created']);
    e.getRange('A1:D1').setFontWeight('bold');
  }
  if (!ss.getSheetByName(SHEET_OFFICES)) {
    var o = ss.insertSheet(SHEET_OFFICES);
    o.appendRow(['Name', 'QR Token', 'Latitude', 'Longitude', 'Radius (m)']);
    o.getRange('A1:E1').setFontWeight('bold');
  }
  if (!ss.getSheetByName(SHEET_AUDIT)) {
    var u = ss.insertSheet(SHEET_AUDIT);
    u.appendRow(['Date', 'Time', 'Email', 'Reason', 'Code']);
    u.getRange('A1:E1').setFontWeight('bold');
  }
  if (!ss.getSheetByName(SHEET_TENANTS)) {
    var t = ss.insertSheet(SHEET_TENANTS);
    t.appendRow(['Code', 'Spreadsheet ID', 'Created']);
    t.getRange('A1:C1').setFontWeight('bold');
  }
}

function getConfig_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var cache = CacheService.getScriptCache();
  var key = 'cfg:' + ss.getId();
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  var cfg = {};
  var sheet = ss.getSheetByName(SHEET_CFG);
  if (sheet) {
    var rows = sheet.getDataRange().getValues();
    for (var i = 0; i < rows.length; i++) {
      var k = String(rows[i][0] || '').trim();
      if (k && k.toLowerCase() !== 'key' && rows[i][1] !== undefined && rows[i][1] !== '') {
        cfg[k] = String(rows[i][1]);
      }
    }
  }
  cfg.appName = cfg.appName || 'Liste Des Presences';
  cfg.officeName = cfg.officeName || 'Head Office';
  cfg.adminEmail = cfg.adminEmail || '';
  cfg.lateAfter = cfg.lateAfter || '';
  cfg.officeLat = Number(cfg.officeLat);
  cfg.officeLng = Number(cfg.officeLng);
  cfg.radiusMeters = Number(cfg.radiusMeters);
  cfg.minScanIntervalSec = Number(cfg.minScanIntervalSec || 60);
  cfg.replayMaxAgeMs = Number(cfg.replayMaxAgeMs || 300000);
  cfg.pinMaxAttempts = Number(cfg.pinMaxAttempts || 5);
  cfg.pinLockoutMs = Number(cfg.pinLockoutMs || 900000);
  cfg.writeQuotaPerEmail = Number(cfg.writeQuotaPerEmail || 60);
  cfg.writeQuotaTenant = Number(cfg.writeQuotaTenant || 600);
  cfg.retentionDays = Number(cfg.retentionDays || 0);

  var secPin = getSecret_(ss, 'adminPin');
  if (secPin) cfg.adminPin = secPin;
  var secQr = getSecret_(ss, 'qrSecret');
  if (secQr) cfg.qrSecret = secQr;

  cache.put(key, JSON.stringify(cfg), 300);
  return cfg;
}

function publicConfig_(cfg, ss) {
  var offices = (getOffices_(ss, cfg) || []).map(function (o) {
    return { name: o.name, token: o.token, lat: o.lat, lng: o.lng, radius: o.radius };
  });
  return {
    appName: cfg.appName,
    officeName: cfg.officeName,
    officeLat: cfg.officeLat,
    officeLng: cfg.officeLng,
    radiusMeters: cfg.radiusMeters,
    offices: offices
  };
}

/* ================= Offices ================= */

function getOffices_(ss, cfg) {
  var sheet = ss.getSheetByName(SHEET_OFFICES);
  var offices = [];
  if (sheet) {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var token = String(r[1] || '').trim();
      var lat = Number(r[2]);
      var lng = Number(r[3]);
      if (!token || isNaN(lat) || isNaN(lng)) continue;
      offices.push({
        name: String(r[0] || 'Office'),
        token: token,
        lat: lat,
        lng: lng,
        radius: Number(r[4] || cfg.radiusMeters)
      });
    }
  }
  if (offices.length === 0 && cfg.qrSecret) {
    offices.push({
      name: cfg.officeName,
      token: String(cfg.qrSecret),
      lat: cfg.officeLat,
      lng: cfg.officeLng,
      radius: cfg.radiusMeters
    });
  }
  return offices;
}

/* ================= Attendance ================= */

function recordAttendance_(payload, cfg, now, tz, ss) {
  var qr = String(payload.qr || '').trim();
  var name = String(payload.name || '').trim();
  var email = String(payload.email || '').trim().toLowerCase();

  if (!name || !email) return error_('Name and email are required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Invalid email address');

  var ts = Number(payload.ts);
  if (!isFinite(ts) || Math.abs(now.getTime() - ts) > cfg.replayMaxAgeMs) {
    logAudit_(ss, email, 'Request expired (stale timestamp)', 'STALE', now, tz);
    return error_('Request expired. Please scan again.');
  }

  var offices = getOffices_(ss, cfg);
  var office = null;
  for (var o = 0; o < offices.length; o++) {
    if (String(offices[o].token) === qr) { office = offices[o]; break; }
  }
  if (!office) {
    logAudit_(ss, email, 'Invalid QR token', 'INVALID_QR', now, tz);
    return error_('Invalid QR code. This does not match an office code.');
  }

  if (!isEmailAllowed_(ss, email, cfg)) {
    logAudit_(ss, email, 'Email not authorized by roster', 'ROSTER_DENIED', now, tz);
    return error_('Your email is not authorized for attendance. Contact your admin.');
  }

  var employee = findEmployee_(ss, email);
  if (employee && employee.name) name = employee.name;

  var status = 'On-site';
  var att = ss.getSheetByName(SHEET_ATT);
  var data = att.getDataRange().getValues();
  var dateStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var timeStr = Utilities.formatDate(now, tz, 'HH:mm:ss');

  var lastAction = null;
  var lastTimeSec = -1;
  for (var i = data.length - 1; i > 0; i--) {
    var row = data[i];
    var rowDate = cellDateStr_(row[0], tz);
    if (row[3] && String(row[3]).toLowerCase() === email && rowDate === dateStr) {
      lastAction = String(row[4]);
      lastTimeSec = timeToSec_(row[1]);
      break;
    }
  }

  var nowSec = timeToSec_(Utilities.formatDate(now, tz, 'HH:mm:ss'));
  if (lastTimeSec >= 0 && (nowSec - lastTimeSec) < cfg.minScanIntervalSec) {
    logAudit_(ss, email, 'Scan too soon after previous', 'TOO_QUICK', now, tz);
    return {
      ok: false,
      code: 'TOO_QUICK',
      message: 'Please wait ' + (cfg.minScanIntervalSec - (nowSec - lastTimeSec)) + 's before scanning again.'
    };
  }

  if (!writeBudget_('attq:' + ss.getId() + ':' + email, cfg.writeQuotaPerEmail, 3600000)) {
    logAudit_(ss, email, 'Hourly write quota hit (email)', 'QUOTA_EMAIL', now, tz);
    return error_('Too many check-ins this hour. Try again later.');
  }
  if (!writeBudget_('attq:' + ss.getId(), cfg.writeQuotaTenant, 3600000)) {
    logAudit_(ss, email, 'Hourly write quota hit (tenant)', 'QUOTA_TENANT', now, tz);
    return error_('Office is very busy right now. Try again in a few minutes.');
  }

  var action = (lastAction === 'Check-in') ? 'Check-out' : 'Check-in';
  att.appendRow([dateStr, timeStr, safeCell_(name), email, action, status, '', '', 0, qr, office.name]);

  return {
    ok: true,
    action: action,
    date: dateStr,
    time: timeStr,
    status: status,
    office: office.name
  };
}

function isEmailAllowed_(ss, email, cfg) {
  var mode = String(cfg.rosterMode || 'open');
  if (mode === 'open') return true;

  if (mode === 'domain') {
    var at = email.indexOf('@');
    if (at === -1) return false;
    return email.slice(at + 1).toLowerCase() === String(cfg.rosterDomain || '').toLowerCase();
  }

  if (mode === 'roster') {
    var sheet = ss.getSheetByName(SHEET_ROSTER);
    if (sheet) {
      var rows = sheet.getDataRange().getValues();
      var wanted = email.toLowerCase();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][0] || '').toLowerCase() === wanted) return true;
      }
    }
    return !!findEmployee_(ss, email);
  }

  return true;
}

function logAudit_(ss, email, reason, code, now, tz) {
  try {
    var sheet = ss.getSheetByName(SHEET_AUDIT);
    if (!sheet) return;
    var n = now || new Date();
    var t2 = tz || Session.getScriptTimeZone();
    sheet.appendRow([
      Utilities.formatDate(n, t2, 'yyyy-MM-dd'),
      Utilities.formatDate(n, t2, 'HH:mm:ss'),
      String(email || ''),
      String(reason || ''),
      String(code || '')
    ]);
  } catch (e) {}
}

/* ================= Reports ================= */

function adminData_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) {
    if (access.needOtp) {
      return { ok: false, code: 'NEED_OTP', needOtp: true, otpDev: access.otpDev, message: access.message };
    }
    return error_(access.message);
  }

  var att = ss.getSheetByName(SHEET_ATT);
  var data = att.getDataRange().getValues();
  var today = dateStr_(now, tz);
  var from = sanitizeDate_(payload.from, today);
  var to = sanitizeDate_(payload.to, today);
  if (from > to) { var tmp = from; from = to; to = tmp; }

  logAudit_(ss, '', 'Admin report viewed (' + from + ' to ' + to + ')', 'ADMIN_OK', now, tz);

  var onSite = {};
  var checkedInToday = 0;
  var checkedOutToday = 0;
  var checkedInSet = {};
  var rangeRows = [];

  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var d = cellDateStr_(r[0], tz);
    var email = String(r[3] || '').toLowerCase();
    var action = String(r[4] || '');
    if (d === today) {
      if (action === 'Check-in') {
        checkedInToday++;
        checkedInSet[email] = 1;
        onSite[email] = String(r[2] || '');
      } else if (action === 'Check-out') {
        checkedOutToday++;
        delete onSite[email];
      }
    }
    if (d >= from && d <= to) rangeRows.push(r);
  }

  var onSiteNames = [];
  for (var k in onSite) onSiteNames.push(onSite[k]);
  onSiteNames.sort();

  var absent = [];
  var staff = expectedStaff_(ss);
  for (var s = 0; s < staff.length; s++) {
    if (!checkedInSet[staff[s].email]) absent.push(staff[s]);
  }

  var lateSec = timeToSec_(cfg.lateAfter || '');
  var report = computeReport_(rangeRows, from, to, lateSec, tz);

  return {
    ok: true,
    sessionToken: access.token,
    admin: {
      appName: cfg.appName,
      sheetUrl: ss.getUrl(),
      today: today,
      range: { from: from, to: to },
      live: {
        checkedInToday: checkedInToday,
        checkedOutToday: checkedOutToday,
        onSite: onSiteNames.length,
        onSiteNames: onSiteNames,
        absent: absent
      },
      summary: report.summary,
      pairs: report.pairs
    }
  };
}

function expectedStaff_(ss) {
  var out = [];
  var seen = {};
  var emp = ss.getSheetByName(SHEET_EMPLOYEES);
  if (emp) {
    var rows = emp.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var email = String(rows[i][1] || '').trim().toLowerCase();
      if (!email || seen[email]) continue;
      seen[email] = 1;
      out.push({ name: String(rows[i][0] || ''), email: email });
    }
  }
  var roster = ss.getSheetByName(SHEET_ROSTER);
  if (roster) {
    var rows2 = roster.getDataRange().getValues();
    for (var j = 1; j < rows2.length; j++) {
      var e2 = String(rows2[j][0] || '').trim().toLowerCase();
      if (!e2 || seen[e2]) continue;
      seen[e2] = 1;
      out.push({ name: '', email: e2 });
    }
  }
  return out;
}

function myAttendance_(payload, cfg, now, tz, ss) {
  var email = String(payload.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Email required');
  var gate = privacyGate_(ss, email, now, tz);
  if (gate) return gate;

  var today = dateStr_(now, tz);
  var from = sanitizeDate_(payload.from, monthStart_(now));
  var to = sanitizeDate_(payload.to, today);
  if (from > to) { var tmp = from; from = to; to = tmp; }

  var att = ss.getSheetByName(SHEET_ATT);
  var data = att.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[3] || '').toLowerCase() === email) rows.push(r);
  }

  var lateSec = timeToSec_(cfg.lateAfter || '');
  var report = computeReport_(rows, from, to, lateSec, tz);

  return {
    ok: true,
    attendance: {
      range: { from: from, to: to },
      summary: report.summary,
      pairs: report.pairs
    }
  };
}

function myExport_(payload, cfg, now, tz, ss) {
  var email = String(payload.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Email required');
  var gate = privacyGate_(ss, email, now, tz);
  if (gate) return gate;

  var att = ss.getSheetByName(SHEET_ATT);
  var data = att.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[3] || '').trim().toLowerCase() !== email) continue;
    rows.push({
      date: cellDateStr_(r[0], tz),
      time: String(r[1] || ''),
      name: String(r[2] || ''),
      action: String(r[4] || ''),
      status: String(r[5] || ''),
      distance: isFinite(Number(r[8])) ? Number(r[8]) : '',
      office: String(r[10] || '')
    });
  }
  return { ok: true, rows: rows };
}

function myDelete_(payload, cfg, now, tz, ss) {
  var email = String(payload.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Email required');
  var gate = privacyGate_(ss, email, now, tz);
  if (gate) return gate;

  var att = ss.getSheetByName(SHEET_ATT);
  var data = att.getDataRange().getValues();
  var toDelete = [];
  for (var i = data.length - 1; i > 0; i--) {
    if (String(data[i][3] || '').trim().toLowerCase() === email) toDelete.push(i + 1);
  }
  for (var j = 0; j < toDelete.length; j++) att.deleteRow(toDelete[j]);
  logAudit_(ss, email, 'Employee erased own attendance data', 'DATA_ERASED', now, tz);
  return { ok: true, deleted: toDelete.length };
}

function purgeOldData_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = getConfig_(ss);
  var days = Number(cfg.retentionDays || 0);
  if (days <= 0) return 'retentionDays is 0 - purge disabled.';
  var tz = Session.getScriptTimeZone();
  var cutoff = Utilities.formatDate(new Date(Date.now() - days * 86400000), tz, 'yyyy-MM-dd');
  var att = ss.getSheetByName(SHEET_ATT);
  var data = att.getDataRange().getValues();
  var dels = [];
  for (var i = data.length - 1; i > 0; i--) {
    if (cellDateStr_(data[i][0], tz) < cutoff) dels.push(i + 1);
  }
  for (var j = 0; j < dels.length; j++) att.deleteRow(dels[j]);
  return 'Purged ' + dels.length + ' row(s) older than ' + days + ' days.';
}

function enableAutoPurge() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'purgeOldData_') {
      SpreadsheetApp.getUi().alert('Auto-purge already enabled.');
      return;
    }
  }
  ScriptApp.newTrigger('purgeOldData_').timeBased().everyDays(1).atHour(2).create();
  SpreadsheetApp.getUi().alert('Auto-purge enabled: runs daily at 02:00 using Config > retentionDays (0 disables).');
}

function recentAttendance_(payload, cfg, now, tz, ss) {
  var email = String(payload.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Email required');
  var gate = privacyGate_(ss, email, now, tz);
  if (gate) return gate;
  var att = ss.getSheetByName(SHEET_ATT);
  var data = att.getDataRange().getValues();
  var out = [];
  for (var i = data.length - 1; i > 0 && out.length < 5; i--) {
    var r = data[i];
    if (String(r[3] || '').trim().toLowerCase() === email) {
      out.push({
        date: cellDateStr_(r[0], tz),
        time: String(r[1] || ''),
        action: String(r[4] || ''),
        office: String(r[10] || '')
      });
    }
  }
  return { ok: true, recent: out };
}

function weekData_(payload, cfg, now, tz, ss) {
  var email = String(payload.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Email required');
  var gate = privacyGate_(ss, email, now, tz);
  if (gate) return gate;

  var fromDate = new Date(now.getTime() - 6 * 86400000);
  var from = dateStr_(fromDate, tz);
  var to = dateStr_(now, tz);

  var att = ss.getSheetByName(SHEET_ATT);
  var data = att.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[3] || '').trim().toLowerCase() !== email) continue;
    var d = cellDateStr_(r[0], tz);
    if (d >= from && d <= to) rows.push(r);
  }

  var lateSec = timeToSec_(cfg.lateAfter || '');
  var report = computeReport_(rows, from, to, lateSec, tz);

  var byDate = {};
  for (var j = 0; j < report.pairs.length; j++) {
    var p = report.pairs[j];
    byDate[p.date] = (byDate[p.date] || 0) + (p.hours || 0);
  }

  var days = [];
  for (var k = 0; k < 7; k++) {
    var ds = dateStr_(new Date(fromDate.getTime() + k * 86400000), tz);
    days.push({ date: ds, hours: Math.round((byDate[ds] || 0) * 100) / 100 });
  }

  return { ok: true, week: days };
}

/* ================= Employees ================= */

function findEmployee_(ss, email) {
  var sheet = ss.getSheetByName(SHEET_EMPLOYEES);
  if (!sheet) return null;
  var rows = sheet.getDataRange().getValues();
  email = String(email || '').trim().toLowerCase();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1] || '').trim().toLowerCase() === email) {
      return { name: String(rows[i][0] || ''), department: String(rows[i][2] || '') };
    }
  }
  return null;
}

function employeesData_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);

  var sheet = ss.getSheetByName(SHEET_EMPLOYEES);
  var list = [];
  if (sheet) {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var email = String(rows[i][1] || '').trim().toLowerCase();
      if (!email) continue;
      list.push({
        name: String(rows[i][0] || ''),
        email: email,
        department: String(rows[i][2] || ''),
        created: String(rows[i][3] || '')
      });
    }
  }
  list.sort(function (a, b) { return a.name.localeCompare(b.name) || a.email.localeCompare(b.email); });
  return { ok: true, employees: list };
}

function employeeAdd_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);

  var name = String(payload.name || '').trim();
  var email = String(payload.email || '').trim().toLowerCase();
  var department = String(payload.department || '').trim();
  if (!name || !email) return error_('Name and email are required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Invalid email address');
  name = safeCell_(name);
  department = safeCell_(department);

  var sheet = ss.getSheetByName(SHEET_EMPLOYEES);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1] || '').trim().toLowerCase() === email) {
      var created = String(rows[i][3] || Utilities.formatDate(now, tz, 'yyyy-MM-dd'));
      sheet.getRange(i + 1, 1, 1, 4).setValues([[name, email, department, created]]);
      return { ok: true, employee: { name: name, email: email, department: department } };
    }
  }
  sheet.appendRow([name, email, department, Utilities.formatDate(now, tz, 'yyyy-MM-dd')]);
  return { ok: true, employee: { name: name, email: email, department: department } };
}

function employeeDelete_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);

  var email = String(payload.email || '').trim().toLowerCase();
  if (!email) return error_('Email required');

  var sheet = ss.getSheetByName(SHEET_EMPLOYEES);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1] || '').trim().toLowerCase() === email) {
      sheet.deleteRow(i + 1);
      return { ok: true, deleted: email };
    }
  }
  return error_('Employee not found: ' + email);
}

/* ================= Reports ================= */

function computeReport_(rows, from, to, lateAfterSec, tz) {
  var byKey = {};
  var order = [];  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var d = cellDateStr_(r[0], tz);
    if (d < from || d > to) continue;
    var email = String(r[3] || '').toLowerCase();
    if (!email) continue;
    var action = String(r[4] || '');
    var sec = timeToSec_(String(r[1] || ''));
    if (sec < 0) continue;
    var key = email + '|' + d;
    if (!byKey[key]) {
      byKey[key] = { email: email, name: String(r[2] || ''), date: d, rows: [] };
      order.push(key);
    }
    byKey[key].rows.push({ time: String(r[1] || ''), sec: sec, action: action });
  }

  var pairs = [];
  var totalHours = 0;
  var lateCount = 0;
  var missingOut = 0;
  var daySet = {};
  var emailSet = {};

  for (i = 0; i < order.length; i++) {
    var rec = byKey[order[i]];
    rec.rows.sort(function (a, b) { return a.sec - b.sec; });
    var open = null;

    for (var j = 0; j < rec.rows.length; j++) {
      var row = rec.rows[j];
      if (row.action === 'Check-in') {
        if (open) {
          missingOut++;
          if (open.late) lateCount++;
          pairs.push({ date: rec.date, name: rec.name, email: rec.email, in: open.time, out: null, hours: null, late: open.late, missing: true });
        }
        open = { time: row.time, sec: row.sec, late: lateAfterSec >= 0 && row.sec > lateAfterSec };
        daySet[rec.email + '|' + rec.date] = 1;
        emailSet[rec.email] = 1;
      } else if (row.action === 'Check-out' && open) {
        var hours = Math.max(0, (row.sec - open.sec) / 3600);
        hours = Math.round(hours * 100) / 100;
        if (open.late) lateCount++;
        totalHours += hours;
        pairs.push({ date: rec.date, name: rec.name, email: rec.email, in: open.time, out: row.time, hours: hours, late: open.late, missing: false });
        open = null;
      }
    }

    if (open) {
      missingOut++;
      if (open.late) lateCount++;
      pairs.push({ date: rec.date, name: rec.name, email: rec.email, in: open.time, out: null, hours: null, late: open.late, missing: true });
    }
  }

  return {
    pairs: pairs,
    summary: {
      totalHours: Math.round(totalHours * 100) / 100,
      daysPresent: count_(daySet),
      lateCount: lateCount,
      missingOut: missingOut,
      people: count_(emailSet)
    }
  };
}

function count_(obj) {
  var n = 0;
  for (var k in obj) n++;
  return n;
}

/* ================= Daily digest (all tenants) ================= */

function sendDailyDigestNow() {
  var res = sendDailyDigest_();
  if (!res.ok) throw new Error(res.message);
  return 'Digest sent to ' + res.sent.length + ' tenant(s).';
}

function enableDailyDigest() {
  var cfg = getConfig_(SpreadsheetApp.getActiveSpreadsheet());
  if (!cfg.adminEmail) throw new Error('Set adminEmail first (master Config sheet).');
  var triggers = ScriptApp.getProjectTriggers();
  var exists = false;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailyDigestNow') exists = true;
  }
  if (!exists) {
    ScriptApp.newTrigger('sendDailyDigestNow')
      .timeBased()
      .atHour(17)
      .everyDays(1)
      .create();
  }
  return 'Daily digest enabled (17:00).';
}

function sendDailyDigest_() {
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var today = dateStr_(now, tz);
  var sent = [];
  var master = SpreadsheetApp.getActiveSpreadsheet();

  var targets = [{ code: '', ss: master }];
  var map = allTenants_();
  for (var code in map) {
    try {
      targets.push({ code: code, ss: SpreadsheetApp.openById(map[code]) });
    } catch (e) {}
  }

  for (var i = 0; i < targets.length; i++) {
    var target = targets[i];
    try {
      var cfg = getConfig_(target.ss);
      if (!cfg.adminEmail) continue;
      var att = target.ss.getSheetByName(SHEET_ATT);
      if (!att) continue;
      var data = att.getDataRange().getValues();
      var rows = [];
      for (var j = 1; j < data.length; j++) {
        if (String(data[j][0]) === today) rows.push(data[j]);
      }
      var lateSec = timeToSec_(cfg.lateAfter || '');
      var report = computeReport_(rows, today, today, lateSec, tz);
      var body = buildDigestBody_(today, cfg, report);
      MailApp.sendEmail({ to: cfg.adminEmail, subject: 'Attendance summary \u2014 ' + today, body: body });
      sent.push({ code: target.code, to: cfg.adminEmail });
    } catch (e) {}
  }

  if (sent.length === 0) return { ok: false, message: 'No adminEmail configured for any tenant.' };
  return { ok: true, sent: sent };
}

function buildDigestBody_(today, cfg, report) {
  var lines = [];
  lines.push('Attendance summary for ' + today + ' \u2014 ' + cfg.appName);
  lines.push('');

  var pairs = report.pairs;
  if (pairs.length === 0) {
    lines.push('No attendance recorded.');
  } else {
    var byEmail = {};
    var order = [];
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      if (!byEmail[p.email]) { byEmail[p.email] = { name: p.name, lines: [] }; order.push(p.email); }
      var inT = p.in || '--';
      var outT = p.out || '--';
      var hrs = p.hours != null ? formatHours_(p.hours) : 'no check-out';
      byEmail[p.email].lines.push('  ' + inT + ' \u2013 ' + outT + '  (' + hrs + (p.late ? ', late' : '') + ')');
    }
    for (i = 0; i < order.length; i++) {
      var e = order[i];
      lines.push(byEmail[e].name + ' <' + e + '>');
      for (var j = 0; j < byEmail[e].lines.length; j++) lines.push(byEmail[e].lines[j]);
      lines.push('');
    }
  }

  var s = report.summary;
  lines.push('Present: ' + s.people + ' \u00b7 Total hours: ' + formatHours_(s.totalHours) +
    ' \u00b7 Late: ' + s.lateCount + ' \u00b7 Missing check-out: ' + s.missingOut);
  return lines.join('\n');
}

function formatHours_(h) {
  if (h === null || h === undefined || isNaN(h)) return '0h 0m';
  var total = Math.round(h * 60);
  var hours = Math.floor(total / 60);
  var mins = total % 60;
  return hours + 'h ' + mins + 'm';
}

/* ================= Helpers ================= */

function dateStr_(d, tz) {
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

/**
 * Privacy gate for employee-facing data reads (recent / week / myattendance).
 * If the tenant has any Employees or Roster entries configured, only those
 * emails may read their own data. If no roster exists yet (legacy single-sheet
 * setup), reads stay open so the app keeps working until an admin adds staff.
 * Returns null when access is allowed, otherwise an error_() result.
 */
function privacyGate_(ss, email, now, tz) {
  email = String(email || '').trim().toLowerCase();

  var known = {};
  var emp = ss.getSheetByName(SHEET_EMPLOYEES);
  if (emp) {
    var rows = emp.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var e = String(rows[i][1] || '').trim().toLowerCase();
      if (e) known[e] = 1;
    }
  }
  var roster = ss.getSheetByName(SHEET_ROSTER);
  if (roster) {
    var rows2 = roster.getDataRange().getValues();
    for (var j = 1; j < rows2.length; j++) {
      var e2 = String(rows2[j][0] || '').trim().toLowerCase();
      if (e2) known[e2] = 1;
    }
  }

  var knownCount = 0;
  for (var k in known) knownCount++;

  if (knownCount === 0) return null;

  if (known[email]) return null;

  logAudit_(ss, email, 'Data access denied (email not on roster)', 'PRIVACY_DENY', now, tz);
  return error_('Access denied: this email is not on the roster. Ask an admin to add you in Employees.');
}

function sanitizeDate_(v, fallback) {
  var s = String(v || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return fallback;
}

function monthStart_(d) {
  var m = d.getMonth() + 1;
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-01';
}

function timeToSec_(t) {
  var s = String(t).trim();
  if (!s) return -1;
  var parts = s.split(':');
  if (parts.length !== 2 && parts.length !== 3) return -1;
  var h = Number(parts[0]), m = Number(parts[1]);
  var sec = parts.length === 3 ? Number(parts[2]) : 0;
  if (isNaN(h) || isNaN(m) || isNaN(sec)) return -1;
  return h * 3600 + m * 60 + sec;
}

/**
 * Defuse spreadsheet-formula injection before writing any user-supplied value.
 * A cell starting with = + - @ is treated as a formula by Sheets; prefixing it
 * with a single quote turns it into literal text. Also strips control chars and
 * caps the length so a payload can't bloat or break the sheet.
 */
function safeCell_(v) {
  var s = String(v == null ? '' : v).trim();
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 200);
}

/**
 * Sliding-window write budget using the script cache. Prevents flooding the
 * spreadsheet (and Apps Script quota) by a scripted attacker. Returns true
 * while under the limit.
 */
function writeBudget_(key, limit, windowMs) {
  var cache = CacheService.getScriptCache();
  var now = Date.now();
  var w = { t: now, c: 0 };
  var entry = cache.get(key);
  if (entry) {
    try { w = JSON.parse(entry); } catch (e) { w = { t: now, c: 0 }; }
  }
  if (now - Number(w.t) > windowMs) w = { t: now, c: 0 };
  w.c++;
  var ttl = Math.min(300, Math.ceil(windowMs / 1000));
  cache.put(key, JSON.stringify(w), ttl);
  return w.c <= limit;
}

function pinGuard_(cfg, now, ss) {
  var cache = CacheService.getScriptCache();
  var key = 'pinlock:' + ss.getId();
  var entry = cache.get(key);
  var state = {};
  if (entry) {
    try { state = JSON.parse(entry); } catch (e) { state = {}; }
  }
  if (now.getTime() < Number(state.until || 0)) {
    var remain = Math.ceil((Number(state.until) - now.getTime()) / 60000);
    return { locked: true, message: 'Too many failed attempts. Try again in ' + remain + ' min.' };
  }
  return { locked: false, state: state, cache: cache, key: key };
}

function pinCheck_(payload, cfg, now, tz, ss) {
  var pin = String(payload.pin || '').trim();
  var guard = pinGuard_(cfg, now, ss);

  if (guard.locked) return { ok: false, message: guard.message };

  if (pin !== cfg.adminPin) {
    var s = guard.state;
    s.count = (s.count || 0) + 1;
    logAudit_(ss, '', 'Invalid admin PIN attempt', 'BAD_PIN', now, tz);
    if (s.count >= cfg.pinMaxAttempts) {
      s.count = 0;
      s.until = now.getTime() + cfg.pinLockoutMs;
      guard.cache.put(guard.key, JSON.stringify(s), Math.ceil(cfg.pinLockoutMs / 1000));
      return { ok: false, message: 'Too many failed attempts. Admin locked for ' + Math.ceil(cfg.pinLockoutMs / 60000) + ' minutes.' };
    }
    guard.cache.put(guard.key, JSON.stringify(s), Math.ceil(cfg.pinLockoutMs / 1000));
    return { ok: false, message: 'Invalid PIN (' + s.count + '/' + cfg.pinMaxAttempts + ' attempts).' };
  }

  guard.cache.remove(guard.key);
  return { ok: true };
}

/**
 * Admin authentication: a valid in-memory session token, or PIN + one-time
 * code. The PIN alone only triggers an OTP email (step 1 of 2FA). Never
 * accepts a bare PIN for data access.
 */
function adminAccess_(payload, cfg, now, tz, ss) {
  if (validSession_(ss, String(payload.token || ''))) return { ok: true };

  var pin = String(payload.pin || '').trim();
  var otp = String(payload.otp || '').trim();
  if (!pin) return { ok: false, message: 'Admin login required.' };

  var auth = pinCheck_(payload, cfg, now, tz, ss);
  if (!auth.ok) return auth;

  if (!otp) {
    var sent = sendOtp_(cfg, now, ss);
    var msg = cfg.adminEmail
      ? 'A one-time code was emailed to ' + cfg.adminEmail + '.'
      : 'No admin email is configured, so a development code is shown below. Set adminEmail in Config for production.';
    return { ok: false, code: 'NEED_OTP', needOtp: true, otpDev: sent.dev, message: msg };
  }

  if (!verifyOtp_(cfg, now, ss, otp)) {
    logAudit_(ss, '', 'Bad admin one-time code', 'BAD_OTP', now, tz);
    return { ok: false, message: 'Invalid or expired one-time code.' };
  }
  logAudit_(ss, '', 'Admin signed in (2FA)', 'ADMIN_2FA', now, tz);
  return { ok: true, token: createSession_(ss, now) };
}

function sendOtp_(cfg, now, ss) {
  var cache = CacheService.getScriptCache();
  var key = 'otp:' + ss.getId();
  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put(key, JSON.stringify({ code: code, until: now.getTime() + 600000, tries: 0 }), 600);
  var email = String(cfg.adminEmail || '').trim();
  if (!email) return { dev: code };
  MailApp.sendEmail(email, 'Attendance admin one-time code',
    'Your admin one-time code is: ' + code + '\n\nIt is valid for 10 minutes.\nIf you did not request this, contact your administrator immediately.');
  return {};
}

function verifyOtp_(cfg, now, ss, code) {
  var cache = CacheService.getScriptCache();
  var key = 'otp:' + ss.getId();
  var entry = cache.get(key);
  if (!entry) return false;
  var o = {};
  try { o = JSON.parse(entry); } catch (e) { return false; }
  if (now.getTime() > Number(o.until || 0)) return false;
  if (Number(o.tries || 0) >= 5) return false;
  if (String(o.code) !== String(code || '').trim()) {
    o.tries = Number(o.tries || 0) + 1;
    cache.put(key, JSON.stringify(o), 600);
    return false;
  }
  cache.remove(key);
  return true;
}

function createSession_(ss, now) {
  var token = randomToken_() + randomToken_();
  CacheService.getScriptCache().put('adminsess:' + ss.getId() + ':' + token, '1', 1800);
  return token;
}

function validSession_(ss, token) {
  if (!token) return false;
  return !!CacheService.getScriptCache().get('adminsess:' + ss.getId() + ':' + token);
}

function randomToken_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function error_(message) {
  return { ok: false, message: message };
}

/**
 * Extract a yyyy-MM-dd string from a spreadsheet cell that may be a Date object
 * or a plain string.
 */
function cellDateStr_(cell, tz) {
  if (cell instanceof Date) return Utilities.formatDate(cell, tz, 'yyyy-MM-dd');
  var s = String(cell || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}
