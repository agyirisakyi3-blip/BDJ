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
var SHEET_ADMINS = 'Admins';
var SHEET_LEAVE = 'Leave';
var SHEET_HOLIDAYS = 'Holidays';
var SHEET_ANNOUNCEMENTS = 'Announcements';

/* Break state machine: OUT -> Check-in -> Break-out -> Break-in -> Check-out.
   A scan while on break resumes work (Break-in); a second button press while
   checked in starts a break. */
var ROT_INTERVAL_SEC = 30;
var SELFIE_MAX_BYTES = 400000;

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
      .addItem('Restrict login to roster emails', 'enableRosterMode')
      .addItem('Allow any email to login', 'disableRosterMode')
      .addItem('Enable daily digest (17:00)', 'enableDailyDigest')
      .addItem('Send digest now', 'sendDailyDigestNow')
      .addItem('Enable check-out reminders', 'enableCheckoutReminders')
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
    if (action === 'employee_bio_update') {
      return json_(employeeBioUpdate_(payload, cfg, now, tz, ss));
    }
    if (action === 'employee_code_reset') {
      return json_(employeeCodeReset_(payload, cfg, now, tz, ss));
    }
    if (action === 'admin_login') {
      return json_(adminLogin_(payload, cfg, now, tz, ss));
    }
    if (action === 'admin_check') {
      return json_(adminCheck_(payload, ss));
    }
    if (action === 'admins_list') {
      return json_(adminsList_(payload, cfg, now, tz, ss));
    }
    if (action === 'admin_add') {
      return json_(adminAdd_(payload, cfg, now, tz, ss));
    }
    if (action === 'admin_remove') {
      return json_(adminRemove_(payload, cfg, now, tz, ss));
    }
    if (action === 'office_screen') {
      return json_(officeScreen_(payload, cfg, now, tz, ss));
    }
    if (action === 'leave_list') {
      return json_(leaveList_(payload, cfg, now, tz, ss));
    }
    if (action === 'leave_add') {
      return json_(leaveAdd_(payload, cfg, now, tz, ss));
    }
    if (action === 'leave_delete') {
      return json_(leaveDelete_(payload, cfg, now, tz, ss));
    }
    if (action === 'holiday_list') {
      return json_(holidayList_(payload, cfg, now, tz, ss));
    }
    if (action === 'holiday_add') {
      return json_(holidayAdd_(payload, cfg, now, tz, ss));
    }
    if (action === 'holiday_delete') {
      return json_(holidayDelete_(payload, cfg, now, tz, ss));
    }
    if (action === 'announcements') {
      return json_(announcements_(payload, cfg, now, tz, ss));
    }
    if (action === 'announcement_list') {
      return json_(announcementList_(payload, cfg, now, tz, ss));
    }
    if (action === 'announcement_add') {
      return json_(announcementAdd_(payload, cfg, now, tz, ss));
    }
    if (action === 'announcement_delete') {
      return json_(announcementDelete_(payload, cfg, now, tz, ss));
    }
    if (action === 'correction_apply') {
      return json_(correctionApply_(payload, cfg, now, tz, ss));
    }
    if (action === 'send_codes') {
      return json_(sendCodes_(payload, cfg, now, tz, ss));
    }
    if (action === 'user_login') {
      return json_(userLogin_(payload, cfg, now, tz, ss));
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
    c.appendRow(['rosterMode', 'roster']);
    c.appendRow(['rosterDomain', '']);
    c.appendRow(['minScanIntervalSec', '60']);
    c.appendRow(['replayMaxAgeMs', '300000']);
    c.appendRow(['pinMaxAttempts', '5']);
    c.appendRow(['pinLockoutMs', '900000']);
    c.appendRow(['writeQuotaPerEmail', '60']);
    c.appendRow(['writeQuotaTenant', '600']);
    c.appendRow(['retentionDays', '0']);
    c.appendRow(['lateAfter', '']);
    c.appendRow(['selfieMode', 'off']);
    c.appendRow(['reminderCheckInAfter', '']);
    c.appendRow(['reminderCheckOutAfter', '']);
    c.appendRow(['weekendsOff', 'on']);
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
    e.appendRow(['Name', 'Email', 'Department', 'Created', 'ShiftStart', 'ShiftEnd', 'Role', 'Phone', 'BirthDate', 'Photo', 'Code']);
    e.getRange('A1:K1').setFontWeight('bold');
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
  if (!ss.getSheetByName(SHEET_ADMINS)) {
    var ad = ss.insertSheet(SHEET_ADMINS);
    ad.appendRow(['Email', 'Name', 'Added On', 'Added By']);
    ad.getRange('A1:D1').setFontWeight('bold');
  }
  if (!ss.getSheetByName(SHEET_LEAVE)) {
    var lv = ss.insertSheet(SHEET_LEAVE);
    lv.appendRow(['Email', 'StartDate', 'EndDate', 'Reason', 'Created', 'CreatedBy']);
    lv.getRange('A1:F1').setFontWeight('bold');
  }
  if (!ss.getSheetByName(SHEET_HOLIDAYS)) {
    var ho = ss.insertSheet(SHEET_HOLIDAYS);
    ho.appendRow(['Date', 'Name']);
    ho.getRange('A1:B1').setFontWeight('bold');
  }
  if (!ss.getSheetByName(SHEET_ANNOUNCEMENTS)) {
    var an = ss.insertSheet(SHEET_ANNOUNCEMENTS);
    an.appendRow(['Title', 'Body', 'PostedOn', 'PostedBy', 'Pinned']);
    an.getRange('A1:E1').setFontWeight('bold');
  }
  migrateAttendanceSheet_(ss);
  migrateEmployeesSheet_(ss);
  ensureEmployeeCodes_(ss);
}

/**
 * Add the Selfie column (L) to older Attendance sheets that predate selfies.
 */
function migrateAttendanceSheet_(ss) {
  var att = ss.getSheetByName(SHEET_ATT);
  if (!att) return;
  var lastCol = att.getLastColumn();
  if (lastCol >= 12) return;
  if (String(att.getRange(1, lastCol).getValue()).trim() !== 'Selfie') {
    att.insertColumnsAfter(lastCol, 12 - lastCol);
    att.getRange(1, 12).setValue('Selfie');
    att.getRange(1, 12).setFontWeight('bold');
  }
}

/**
 * Older Employees sheets have Name, Email, Department, Created. Append the
 * ShiftStart / ShiftEnd columns (E, F) used for per-person shift times.
 */
function migrateEmployeesSheet_(ss) {
  var emp = ss.getSheetByName(SHEET_EMPLOYEES);
  if (!emp) return;
  var lastCol = emp.getLastColumn();
  if (lastCol >= 6) return;
  if (lastCol === 4) {
    emp.getRange(1, 5).setValue('ShiftStart');
    emp.getRange(1, 6).setValue('ShiftEnd');
    emp.getRange('E1:F1').setFontWeight('bold');
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
  cfg.lateAfter = cfg.lateAfter || '08:30';
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
  cfg.selfieMode = String(cfg.selfieMode || 'off').toLowerCase();
  if (['off', 'optional', 'required'].indexOf(cfg.selfieMode) === -1) cfg.selfieMode = 'off';
  var wo = String(cfg.weekendsOff == null ? 'on' : cfg.weekendsOff).toLowerCase();
  cfg.weekendsOff = !(wo === 'off' || wo === 'false' || wo === 'no' || wo === '0');
  cfg.reminderCheckInAfter = timeToSec_(cfg.reminderCheckInAfter || '') >= 0 ? cfg.reminderCheckInAfter : '';
  cfg.reminderCheckOutAfter = timeToSec_(cfg.reminderCheckOutAfter || '') >= 0 ? cfg.reminderCheckOutAfter : '';

  var secPin = getSecret_(ss, 'adminPin');
  if (secPin) cfg.adminPin = secPin;
  var secQr = getSecret_(ss, 'qrSecret');
  if (secQr) cfg.qrSecret = secQr;

  cache.put(key, JSON.stringify(cfg), 300);
  return cfg;
}

function publicConfig_(cfg, ss) {
  var offices = (getOffices_(ss, cfg) || []).map(function (o) {
    return { name: o.name, lat: o.lat, lng: o.lng, radius: o.radius };
  });
  return {
    appName: cfg.appName,
    officeName: cfg.officeName,
    officeLat: cfg.officeLat,
    officeLng: cfg.officeLng,
    radiusMeters: cfg.radiusMeters,
    offices: offices,
    selfieMode: cfg.selfieMode,
    reminderCheckInAfter: cfg.reminderCheckInAfter,
    reminderCheckOutAfter: cfg.reminderCheckOutAfter,
    weekendsOff: !!cfg.weekendsOff
  };
}

/* ================= Rotating QR (TOTP-style) ================= */

/**
 * Secret used to derive rotating entrance codes. Stored in Script Properties
 * per tenant; derived deterministically from qrSecret for legacy installs so
 * nothing breaks on upgrade.
 */
function rotatingSecret_(ss) {
  var s = getSecret_(ss, 'totpSecret');
  if (s) return s;
  var seed = String(getSecret_(ss, 'qrSecret') || ss.getId());
  var raw = Utilities.computeHmacSha256Signature('rotating:' + ss.getId(), seed);
  var derived = Utilities.base64Encode(raw).replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
  setSecret_('totpSecret', derived, ss.getId());
  return derived;
}

function rotatingWindow_(ms) {
  return Math.floor(ms / (ROT_INTERVAL_SEC * 1000));
}

/**
 * HOTP-style truncation: HMAC-SHA256(secret, windowIndex) -> 6-digit code.
 */
function rotatingCode_(ss, win) {
  var sig = Utilities.computeHmacSha256Signature('ROT' + win, rotatingSecret_(ss));
  var b = [];
  for (var i = 0; i < 4; i++) b.push(sig[i] & 0xff);
  var v = ((b[0] & 0x7f) << 24) | (b[1] << 16) | (b[2] << 8) | b[3];
  var code = ((v % 1000000) + 1000000) % 1000000;
  var s = String(code);
  while (s.length < 6) s = '0' + s;
  return 'ROT-' + s;
}

/** Accept the current or previous window (30s clock skew tolerance). */
function matchRotating_(ss, qr, nowMs) {
  if (String(qr).indexOf('ROT-') !== 0) return false;
  var w = rotatingWindow_(nowMs);
  for (var i = 1; i >= -1; i--) {
    if (String(qr) === rotatingCode_(ss, w + i)) return true;
  }
  return false;
}

/**
 * Feed for the office display screen (office-screen.html). Admin-gated so a
 * random visitor cannot fetch live entrance codes from outside the office.
 */
function officeScreen_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);
  var ms = now.getTime();
  var win = rotatingWindow_(ms);
  return {
    ok: true,
    screen: {
      token: rotatingCode_(ss, win),
      nextToken: rotatingCode_(ss, win + 1),
      intervalSec: ROT_INTERVAL_SEC,
      secondsLeft: Math.ceil((win + 1) * ROT_INTERVAL_SEC * 1000 - ms),
      appName: cfg.appName,
      serverTime: Utilities.formatDate(now, tz, 'HH:mm:ss')
    }
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
  var mode = String(payload.mode || 'scan').toLowerCase();

  if (!name || !email) return error_('Name and email are required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Invalid email address');

  var ts = Number(payload.ts);
  if (!isFinite(ts) || Math.abs(now.getTime() - ts) > cfg.replayMaxAgeMs) {
    logAudit_(ss, email, 'Request expired (stale timestamp)', 'STALE', now, tz);
    return error_('Request expired. Please scan again.');
  }

  /* Resolve which office this scan belongs to. Button-driven breaks skip
     QR validation entirely - no need to walk to the poster. */
  var offices = getOffices_(ss, cfg);
  var office = null;
  if (mode !== 'break' && mode !== 'resume') {
    for (var o = 0; o < offices.length; o++) {
      if (String(offices[o].token) === qr) { office = offices[o]; break; }
    }
    if (!office && matchRotating_(ss, qr, now.getTime())) {
      // Rotating entrance code: resolves to the first/default office.
      office = offices[0] || { name: cfg.officeName };
    }
    if (!office) {
      logAudit_(ss, email, 'Invalid QR token', 'INVALID_QR', now, tz);
      return error_('Invalid QR code. This does not match an office code.');
    }
  }

  if (!isEmailAllowed_(ss, email, cfg)) {
    logAudit_(ss, email, 'Email not authorized by roster', 'ROSTER_DENIED', now, tz);
    return error_('Your email is not authorized for attendance. Contact your admin.');
  }

  var employee = findEmployee_(ss, email);
  if (employee && employee.name) name = employee.name;

  var att = ss.getSheetByName(SHEET_ATT);
  var data = att.getDataRange().getValues();
  var dateStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var timeStr = Utilities.formatDate(now, tz, 'HH:mm:ss');

  var todayRows = [];
  for (var i = data.length - 1; i > 0; i--) {
    var row = data[i];
    if (row[3] && String(row[3]).toLowerCase() === email && cellDateStr_(row[0], tz) === dateStr) {
      todayRows.push({ action: String(row[4]), sec: timeToSec_(cellTimeStr_(row[1], tz)), office: String(row[10] || '') });
    }
  }

  var lastAction = todayRows.length ? todayRows[0].action : null;
  var lastTimeSec = todayRows.length ? todayRows[0].sec : -1;

  var nowSec = timeToSec_(Utilities.formatDate(now, tz, 'HH:mm:ss'));
  var sinceLast = lastTimeSec >= 0 ? Math.abs(nowSec - lastTimeSec) : -1;
  if (sinceLast >= 0 && sinceLast < cfg.minScanIntervalSec) {
    logAudit_(ss, email, 'Scan too soon after previous', 'TOO_QUICK', now, tz);
    return {
      ok: false,
      code: 'TOO_QUICK',
      message: 'Please wait ' + Math.ceil(cfg.minScanIntervalSec - sinceLast) + 's before scanning again.'
    };
  }

  /* State machine: OUT -> Check-in -> Break-out -> Break-in -> Check-out.
     A scan while on break resumes work; the Pause button starts a break
     without needing the QR again. */
  var stateOut = !lastAction || lastAction === 'Check-out';
  var stateBreak = lastAction === 'Break-out';
  var stateIn = lastAction === 'Check-in' || lastAction === 'Break-in';

  var mode = String(payload.mode || 'scan').toLowerCase();
  var action;
  var status;

  if (mode === 'break' || mode === 'resume') {
    if (mode === 'break') {
      if (!stateIn) {
        return error_(stateOut ? 'You are not checked in yet.' : 'You are already on a break.');
      }
      action = 'Break-out';
      status = 'On-break';
    } else {
      if (!stateBreak) return error_('There is no break to resume.');
      action = 'Break-in';
      status = 'On-site';
    }
  } else {
    if (stateOut) {
      action = 'Check-in';
      status = 'On-site';
    } else if (stateBreak) {
      action = 'Break-in';
      status = 'On-site';
    } else {
      action = 'Check-out';
      status = 'On-site';
    }
  }

  /* Button-driven breaks have no scanned office - reuse the last one. */
  if (!office) {
    office = { name: (todayRows[0] && todayRows[0].office) || cfg.officeName || '' };
  }

  /* Late alert at check-in: late when the scan lands after the employee's
     cutoff (per-person shiftStart, falling back to the 08:30 lateAfter). */
  var isLate = false;
  if (action === 'Check-in') {
    var cutoffSec = lateResolver_(ss, cfg)(email);
    isLate = cutoffSec >= 0 && nowSec > cutoffSec;
  }

  /* Selfie proof at check-in (config selfieMode: off | optional | required). */
  var selfieFileId = '';
  var photo = String(payload.photoDataUrl || '');
  if (action === 'Check-in' && photo) {
    selfieFileId = saveSelfie_(ss, cfg, email, name, dateStr, timeStr, photo);
    if (!selfieFileId) {
      logAudit_(ss, email, 'Selfie rejected (invalid or too large)', 'SELFIE_INVALID', now, tz);
    }
  }
  if (action === 'Check-in' && cfg.selfieMode === 'required' && !selfieFileId) {
    if (!photo) {
      return { ok: false, code: 'SELFIE_REQUIRED', message: 'Un selfie est requis pour pointer l\'entree.' };
    }
    return error_('Impossible d\'enregistrer le selfie. Reessayez.');
  }

  if (!writeBudget_('attq:' + ss.getId() + ':' + email, cfg.writeQuotaPerEmail, 3600000)) {
    logAudit_(ss, email, 'Hourly write quota hit (email)', 'QUOTA_EMAIL', now, tz);
    return error_('Too many check-ins this hour. Try again later.');
  }
  if (!writeBudget_('attq:' + ss.getId(), cfg.writeQuotaTenant, 3600000)) {
    logAudit_(ss, email, 'Hourly write quota hit (tenant)', 'QUOTA_TENANT', now, tz);
    return error_('Office is very busy right now. Try again in a few minutes.');
  }

  att.appendRow([dateStr, timeStr, safeCell_(name), email, action, status, '', '', 0, qr, office.name, selfieFileId]);

  return {
    ok: true,
    action: action,
    date: dateStr,
    time: timeStr,
    status: status,
    office: office.name || '',
    late: isLate,
    selfieSaved: !!selfieFileId,
    breakMinToday: computeBreakMinutes_(todayRows.concat([{ action: action, sec: nowSec }]))
  };
}

/**
 * Total minutes spent on completed breaks (Break-out -> Break-in pairs) from
 * a list of {action, sec} rows.
 */
function computeBreakMinutes_(rows) {
  var sorted = [];
  for (var i = 0; i < rows.length; i++) sorted.push(rows[i]);
  sorted.sort(function (a, b) { return a.sec - b.sec; });
  var open = -1;
  var total = 0;
  for (var j = 0; j < sorted.length; j++) {
    if (sorted[j].action === 'Break-out') open = sorted[j].sec;
    else if (sorted[j].action === 'Break-in' && open >= 0) {
      total += Math.max(0, sorted[j].sec - open);
      open = -1;
    }
  }
  return Math.round(total / 60);
}

/**
 * Save a base64 JPEG selfie into the "Attendance Selfies" Drive folder of the
 * account that owns the script. Returns the Drive file id, or '' when the
 * payload is not a valid small JPEG.
 */
function saveSelfie_(ss, cfg, email, name, dateStr, timeStr, photo) {
  try {
    var prefix = 'data:image/jpeg;base64,';
    if (String(photo).indexOf(prefix) !== 0) return '';
    var b64 = photo.slice(prefix.length).split(',').join('');
    if (!b64 || b64.length > SELFIE_MAX_BYTES) return '';
    var bytes = Utilities.base64Decode(b64);
    if (!bytes || bytes.length < 1000) return '';
    var folderName = (cfg.appName ? String(cfg.appName).replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 40) + ' ' : '') + 'Attendance Selfies';
    var it = DriveApp.getRootFolder().getFoldersByName(folderName);
    var folder = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(folderName);
    var safeName = String(email).replace(/[^a-zA-Z0-9._@-]/g, '_').slice(0, 60);
    var fname = dateStr + '_' + timeStr.replace(/:/g, '-') + '_' + safeName + '.jpg';
    var file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', fname));
    return file.getId();
  } catch (e) {
    return '';
  }
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
  var onBreakSet = {};
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
        delete onBreakSet[email];
      } else if (action === 'Break-out') {
        onBreakSet[email] = String(r[2] || '');
      } else if (action === 'Break-in') {
        delete onBreakSet[email];
      }
    }
    if (d >= from && d <= to) rangeRows.push(r);
  }

  var onSiteNames = [];
  var onBreakNames = [];
  for (var k in onSite) onSiteNames.push(onSite[k]);
  onSiteNames.sort();
  for (var kb in onBreakSet) onBreakNames.push(onBreakSet[kb]);
  onBreakNames.sort();

  /* Leave & holidays: approved leave and public holidays are not absences. */
  var leaves = getLeavesInRange_(ss, from, to);
  var holidays = getHolidaysInRange_(ss, from, to);
  var holidayDates = {};
  for (var h = 0; h < holidays.length; h++) holidayDates[holidays[h].date] = holidays[h].name;

  function leaveCoversDay_(email, dateStr) {
    for (var li = 0; li < leaves.length; li++) {
      if (leaves[li].email !== email) continue;
      if (dateStr >= leaves[li].start && dateStr <= leaves[li].end) return true;
    }
    return false;
  }

  var isHolidayToday = !!holidayDates[today];
  var weekendToday = cfg.weekendsOff && isWeekend_(today);
  var absent = [];
  var staff = expectedStaff_(ss);
  if (!isHolidayToday && !weekendToday) {
    for (var s = 0; s < staff.length; s++) {
      if (checkedInSet[staff[s].email]) continue;
      if (leaveCoversDay_(staff[s].email, today)) continue;
      absent.push(staff[s]);
    }
  }

  var report = computeReport_(rangeRows, from, to, lateResolver_(ss, cfg), tz);

  var people = aggregatePeople_(report.pairs, staff, onSite, checkedInSet, onBreakSet);

  /* Count approved-leave days per person inside the selected range. */
  for (var p = 0; p < people.length; p++) {
    var person = people[p];
    person.leaveDays = 0;
    for (var lv = 0; lv < leaves.length; lv++) {
      if (leaves[lv].email !== person.email) continue;
      person.leaveDays += daysOverlapCount_(from, to, leaves[lv].start, leaves[lv].end, cfg.weekendsOff);
    }
    if (!person.statusToday && leaveCoversDay_(person.email, today)) {
      person.statusToday = 'leave';
    } else if (person.statusToday === 'absent' && leaveCoversDay_(person.email, today)) {
      person.statusToday = 'leave';
    }
  }

  var adminSheet = ss.getSheetByName(SHEET_ADMINS);
  var admins = [];
  if (adminSheet) {
    var aRows = adminSheet.getDataRange().getValues();
    for (var ai = 1; ai < aRows.length; ai++) {
      var ae = String(aRows[ai][0] || '').trim().toLowerCase();
      if (!ae) continue;
      admins.push({
        email: ae,
        name: String(aRows[ai][1] || ''),
        addedOn: String(aRows[ai][2] || ''),
        addedBy: String(aRows[ai][3] || '')
      });
    }
  }

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
        onBreakNames: onBreakNames,
        isHolidayToday: isHolidayToday,
        holidayToday: holidayDates[today] || '',
        isWeekendToday: weekendToday,
        absent: absent
      },
      summary: report.summary,
      pairs: report.pairs,
      people: people,
      admins: admins,
      leaves: leaves,
      holidays: holidays
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
      out.push({ name: String(rows[i][0] || ''), email: email, department: String(rows[i][2] || '') });
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

/**
 * Per-person report covering EVERYONE: every staff email from Employees/Roster
 * (even with zero activity in the range) plus any email found in the attendance
 * data for the range. Aggregates days, hours, lates and missing check-outs.
 */
function aggregatePeople_(pairs, staff, onSite, checkedInSet, onBreakSet) {
  var byEmail = {};
  var order = [];

  function ensure_(email, name, department) {
    var key = String(email || '').toLowerCase();
    if (!key) return null;
    if (!byEmail[key]) {
      byEmail[key] = {
        email: key,
        name: '',
        department: '',
        daysPresent: 0,
        totalHours: 0,
        avgHours: null,
        lateCount: 0,
        missingOut: 0,
        firstIn: '',
        lastOut: '',
        lastDate: '',
        statusToday: ''
      };
      order.push(key);
    }
    if (name && !byEmail[key].name) byEmail[key].name = String(name);
    if (department && !byEmail[key].department) byEmail[key].department = String(department);
    return byEmail[key];
  }

  var s, i, person;
  for (s = 0; s < staff.length; s++) {
    var st = staff[s] || {};
    person = ensure_(st.email, st.name, st.department || '');
    if (person && !person.statusToday) person.statusToday = 'absent';
  }

  for (i = 0; i < pairs.length; i++) {
    var rec = pairs[i];
    person = ensure_(rec.email, rec.name, '');
    if (!person) continue;
    person.daysPresent++;
    person.totalHours += (rec.hours != null && !isNaN(rec.hours)) ? rec.hours : 0;
    if (rec.late) person.lateCount++;
    if (rec.missing) person.missingOut++;
    if (!person.lastDate || rec.date > person.lastDate) {
      person.lastDate = rec.date;
      person.firstIn = rec.in || '';
      person.lastOut = rec.out || '';
    } else if (rec.date === person.lastDate) {
      if (rec.in && (!person.firstIn || rec.in < person.firstIn)) person.firstIn = rec.in;
      if (rec.out && rec.out > (person.lastOut || '')) person.lastOut = rec.out;
    }
  }

  var out = [];
  for (i = 0; i < order.length; i++) {
    var key2 = order[i];
    person = byEmail[key2];
    if (onSite[key2]) {
      person.statusToday = (onBreakSet && onBreakSet[key2]) ? 'break' : 'onsite';
    } else if (checkedInSet[key2]) {
      person.statusToday = 'out';
    } else if (!person.statusToday) {
      person.statusToday = '';
    }
    person.totalHours = Math.round(person.totalHours * 100) / 100;
    person.avgHours = person.daysPresent
      ? Math.round((person.totalHours / person.daysPresent) * 100) / 100
      : null;
    out.push(person);
  }

  out.sort(function (a, b) {
    var an = String(a.name || a.email).toLowerCase();
    var bn = String(b.name || b.email).toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.totalHours === b.totalHours ? 0 : (a.totalHours > b.totalHours ? -1 : 1);
  });

  return out;
}

function myAttendance_(payload, cfg, now, tz, ss) {
  var email = String(payload.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Email required');
  if (!ownsEmail_(ss, email, String(payload.token || ''))) return sessionError_(ss, email, now, tz);
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

  var report = computeReport_(rows, from, to, lateResolver_(ss, cfg), tz);

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
  if (!ownsEmail_(ss, email, String(payload.token || ''))) return sessionError_(ss, email, now, tz);
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
      time: cellTimeStr_(r[1], tz),
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
  if (!ownsEmail_(ss, email, String(payload.token || ''))) return sessionError_(ss, email, now, tz);
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
  if (!ownsEmail_(ss, email, String(payload.token || ''))) return sessionError_(ss, email, now, tz);
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
        time: cellTimeStr_(r[1], tz),
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
  if (!ownsEmail_(ss, email, String(payload.token || ''))) return sessionError_(ss, email, now, tz);
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

  var report = computeReport_(rows, from, to, lateResolver_(ss, cfg), tz);

  var byDate = {};
  for (var j = 0; j < report.pairs.length; j++) {
    var p = report.pairs[j];
    byDate[p.date] = (byDate[p.date] || 0) + (p.hours || 0);
  }

  var days = [];
  for (var k = 0; k < 7; k++) {
    var ds = dateStr_(new Date(fromDate.getTime() + k * 86400000), tz);
    days.push({
      date: ds,
      hours: Math.round((byDate[ds] || 0) * 100) / 100,
      working: !(cfg.weekendsOff && isWeekend_(ds))
    });
  }

  var emp = findEmployee_(ss, email);
  var shift = {};
  if (emp && (String(emp.shiftStart || '').trim() || String(emp.shiftEnd || '').trim())) {
    shift = { start: String(emp.shiftStart || '').trim(), end: String(emp.shiftEnd || '').trim() };
  }

  return { ok: true, week: days, shift: shift };
}

/* ================= Employees ================= */

/**
 * Map column names to 0-based indices from the Employees sheet header row.
 * Older installs may only have Name/Email/Department/Created; newer ones add
 * ShiftStart/ShiftEnd/ShiftEnd and bio fields (Role, Phone, BirthDate, Photo).
 * Missing columns resolve to -1 so readers fall back to ''/existing values.
 */
function employeeColumns_(sheet) {
  var cols = { name: -1, email: -1, department: -1, created: -1, shiftStart: -1, shiftEnd: -1, role: -1, phone: -1, birth: -1, photo: -1, code: -1 };
  if (!sheet) return cols;
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var i = 0; i < header.length; i++) {
    switch (String(header[i] || '').trim().toLowerCase()) {
      case 'name': cols.name = i; break;
      case 'email': cols.email = i; break;
      case 'department': cols.department = i; break;
      case 'created': cols.created = i; break;
      case 'shiftstart': cols.shiftStart = i; break;
      case 'shiftend': cols.shiftEnd = i; break;
      case 'role': cols.role = i; break;
      case 'phone': cols.phone = i; break;
      case 'birthdate': cols.birth = i; break;
      case 'photo': cols.photo = i; break;
      case 'code': cols.code = i; break;
    }
  }
  return cols;
}

function findEmployee_(ss, email) {
  var sheet = ss.getSheetByName(SHEET_EMPLOYEES);
  if (!sheet) return null;
  var rows = sheet.getDataRange().getValues();
  email = String(email || '').trim().toLowerCase();
  var c = employeeColumns_(sheet);
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][c.email < 0 ? 1 : c.email] || '').trim().toLowerCase() === email) {
      return {
        name: String(rows[i][c.name < 0 ? 0 : c.name] || ''),
        department: String(rows[i][c.department < 0 ? 2 : c.department] || ''),
        shiftStart: String(rows[i][c.shiftStart < 0 ? 4 : c.shiftStart] || ''),
        shiftEnd: String(rows[i][c.shiftEnd < 0 ? 5 : c.shiftEnd] || ''),
        code: String(rows[i][c.code < 0 ? 10 : c.code] || '')
      };
    }
  }
  return null;
}

/**
 * Per-person "late after" threshold: an employee with ShiftStart set gets
 * their own cutoff; everyone else falls back to the global lateAfter config.
 */
function lateResolver_(ss, cfg) {
  var defSec = timeToSec_(cfg.lateAfter || '');
  var map = {};
  var emp = ss.getSheetByName(SHEET_EMPLOYEES);
  if (emp) {
    var rows = emp.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var e = String(rows[i][1] || '').trim().toLowerCase();
      var s = timeToSec_(String(rows[i][4] || ''));
      if (e && s >= 0) map[e] = s;
    }
  }
  return function (email) {
    var k = String(email || '').toLowerCase();
    if (map.hasOwnProperty(k)) return map[k];
    return defSec;
  };
}

function employeesData_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);

  var sheet = ss.getSheetByName(SHEET_EMPLOYEES);
  var list = [];
  if (sheet) {
    var rows = sheet.getDataRange().getValues();
    var c = employeeColumns_(sheet);
    for (var i = 1; i < rows.length; i++) {
      var email = String(rows[i][c.email < 0 ? 1 : c.email] || '').trim().toLowerCase();
      if (!email) continue;
      list.push({
        name: String(rows[i][c.name < 0 ? 0 : c.name] || ''),
        email: email,
        department: String(rows[i][c.department < 0 ? 2 : c.department] || ''),
        created: String(rows[i][c.created < 0 ? 3 : c.created] || ''),
        shiftStart: String(rows[i][c.shiftStart < 0 ? 4 : c.shiftStart] || ''),
        shiftEnd: String(rows[i][c.shiftEnd < 0 ? 5 : c.shiftEnd] || ''),
        role: String(rows[i][c.role] || ''),
        phone: String(rows[i][c.phone] || ''),
        birth: String(rows[i][c.birth] || ''),
        photo: String(rows[i][c.photo] || ''),
        code: String(rows[i][c.code < 0 ? 10 : c.code] || '')
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
  var shiftStart = normShiftTime_(payload.shiftStart);
  var shiftEnd = normShiftTime_(payload.shiftEnd);
  if (String(payload.shiftStart || '').trim() && !shiftStart) return error_('ShiftStart must be HH:MM.');
  if (String(payload.shiftEnd || '').trim() && !shiftEnd) return error_('ShiftEnd must be HH:MM.');
  var role = safeCell_(String(payload.role || '').trim());
  var phone = safeCell_(String(payload.phone || '').trim());
  var birth = safeCell_(String(payload.birth || '').trim());
  var photo = normalizePhoto_(payload.photo);
  var code = normEmployeeCode_(payload.code);
  if (String(payload.code || '').trim() && !code) return error_('Code must be exactly 6 digits.');

  var sheet = ss.getSheetByName(SHEET_EMPLOYEES);
  ensureEmployeeBioCols_(sheet);
  var c = employeeColumns_(sheet);
  var rows = sheet.getDataRange().getValues();
  var usedCodes = collectEmployeeCodes_(rows, c);
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][c.email < 0 ? 1 : c.email] || '').trim().toLowerCase() === email) {
      var existingCode = String(rows[i][c.code < 0 ? 10 : c.code] || '').trim();
      if (code && code === existingCode) { /* unchanged */ }
      else if (code && usedCodes.hasOwnProperty(code)) return error_('This code is already used by another employee.');
      var created = String(rows[i][c.created < 0 ? 3 : c.created] || Utilities.formatDate(now, tz, 'yyyy-MM-dd'));
      var row = [name, email, department, created];
      row[4] = shiftStart;
      row[5] = shiftEnd;
      row[c.role < 0 ? 6 : c.role] = role;
      row[c.phone < 0 ? 7 : c.phone] = phone;
      row[c.birth < 0 ? 8 : c.birth] = birth;
      row[c.photo < 0 ? 9 : c.photo] = photo;
      row[c.code < 0 ? 10 : c.code] = code || generateUniqueEmployeeCode_(ss, usedCodes);
      writeEmployeeRow_(sheet, i + 1, row);
      return { ok: true, employee: { name: name, email: email, department: department, role: role, phone: phone, birth: birth, photo: photo, code: row[c.code < 0 ? 10 : c.code] } };
    }
  }
  if (code && usedCodes.hasOwnProperty(code)) return error_('This code is already used by another employee.');
  var row = [name, email, department, Utilities.formatDate(now, tz, 'yyyy-MM-dd')];
  row[c.role < 0 ? 6 : c.role] = role;
  row[c.phone < 0 ? 7 : c.phone] = phone;
  row[c.birth < 0 ? 8 : c.birth] = birth;
  row[c.photo < 0 ? 9 : c.photo] = photo;
  row[c.code < 0 ? 10 : c.code] = code || generateUniqueEmployeeCode_(ss, usedCodes);
  if (shiftStart) row[c.shiftStart < 0 ? 4 : c.shiftStart] = shiftStart;
  if (shiftEnd) row[c.shiftEnd < 0 ? 5 : c.shiftEnd] = shiftEnd;
  sheet.appendRow(padRow_(row, Math.max(11, c.role < 0 ? 6 : 10)));
  return { ok: true, employee: { name: name, email: email, department: department, role: role, phone: phone, birth: birth, photo: photo, code: row[c.code < 0 ? 10 : c.code] } };
}

/** Update bio/photo (+ optional shift times) for an existing employee row. */
function employeeBioUpdate_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);
  var email = String(payload.email || '').trim().toLowerCase();
  if (!email) return error_('Email required');
  var sheet = ss.getSheetByName(SHEET_EMPLOYEES);
  if (!sheet) return error_('Employees sheet not found');
  ensureEmployeeBioCols_(sheet);
  var c = employeeColumns_(sheet);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][c.email < 0 ? 1 : c.email] || '').trim().toLowerCase() !== email) continue;
    var cols = Math.max(10, sheet.getLastColumn());
    var row = new Array(cols).fill('');
    for (var k = 0; k < rows[i].length; k++) row[k] = rows[i][k];
    if (payload.name !== undefined) row[c.name < 0 ? 0 : c.name] = safeCell_(String(payload.name || '').trim());
    if (payload.department !== undefined) row[c.department < 0 ? 2 : c.department] = safeCell_(String(payload.department || '').trim());
    if (payload.role !== undefined) row[c.role < 0 ? 6 : c.role] = safeCell_(String(payload.role || '').trim());
    if (payload.phone !== undefined) row[c.phone < 0 ? 7 : c.phone] = safeCell_(String(payload.phone || '').trim());
    if (payload.birth !== undefined) row[c.birth < 0 ? 8 : c.birth] = safeCell_(String(payload.birth || '').trim());
    if (payload.photo !== undefined) row[c.photo < 0 ? 9 : c.photo] = normalizePhoto_(payload.photo);
    if (payload.shiftStart !== undefined) row[c.shiftStart < 0 ? 4 : c.shiftStart] = normShiftTime_(payload.shiftStart);
    if (payload.shiftEnd !== undefined) row[c.shiftEnd < 0 ? 5 : c.shiftEnd] = normShiftTime_(payload.shiftEnd);
    if (payload.code !== undefined) {
      var existingCode = String(rows[i][c.code < 0 ? 10 : c.code] || '').trim();
      var newCode = normEmployeeCode_(payload.code);
      if (!String(payload.code || '').trim()) return error_('Code is required when updating it.');
      if (!newCode) return error_('Code must be exactly 6 digits.');
      if (newCode !== existingCode) {
        var used = collectEmployeeCodes_(rows, c);
        if (used.hasOwnProperty(newCode)) return error_('This code is already used by another employee.');
      }
      row[c.code < 0 ? 10 : c.code] = newCode;
    }
    writeEmployeeRow_(sheet, i + 1, row);
    return { ok: true, employee: { name: row[c.name < 0 ? 0 : c.name], email: email } };
  }
  return error_('Employee not found: ' + email);
}

/** Ensure the bio columns exist (append headers if missing) without disturbing existing rows. */
function ensureEmployeeBioCols_(sheet) {
  if (!sheet) return;
  var last = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, last).getValues()[0];
  var add = [];
  if (!headersContains_(headers, 'Role')) add.push('Role');
  if (!headersContains_(headers, 'Phone')) add.push('Phone');
  if (!headersContains_(headers, 'BirthDate')) add.push('BirthDate');
  if (!headersContains_(headers, 'Photo')) add.push('Photo');
  if (!headersContains_(headers, 'ShiftStart')) add.push('ShiftStart');
  if (!headersContains_(headers, 'ShiftEnd')) add.push('ShiftEnd');
  if (!headersContains_(headers, 'Code')) add.push('Code');
  if (!add.length) return;
  var start = last + 1;
  for (var i = 0; i < add.length; i++) {
    sheet.getRange(1, start + i).setValue(add[i]);
  }
}
function headersContains_(headers, name) {
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i] || '').trim().toLowerCase() === name.toLowerCase()) return true;
  }
  return false;
}
function padRow_(row, width) {
  while (row.length < width) row.push('');
  return row;
}
function writeEmployeeRow_(sheet, r, row) {
  var width = Math.max(11, row.length);
  sheet.getRange(r, 1, 1, width).setValues([padRow_(row, width)]);
}
/** Validate employee code format (exactly 6 digits) or return '' when invalid. */
function normEmployeeCode_(v) {
  var s = String(v || '').trim();
  return /^\d{6}$/.test(s) ? s : '';
}
/** Collect all non-empty employee codes from rows into a lookup map. */
function collectEmployeeCodes_(rows, c) {
  var codes = {};
  for (var i = 1; i < rows.length; i++) {
    var code = String(rows[i][c.code < 0 ? 10 : c.code] || '').trim();
    if (code) codes[code] = true;
  }
  return codes;
}
/** Return a unique 6-digit code not in the provided usedCodes map. */
function generateUniqueEmployeeCode_(ss, usedCodes) {
  var code;
  do { code = String(Math.floor(100000 + Math.random() * 900000)); } while (usedCodes && usedCodes[code]);
  return code;
}
/** Backfill missing codes for existing Employees rows (migration). */
function ensureEmployeeCodes_(ss) {
  var sheet = ss.getSheetByName(SHEET_EMPLOYEES);
  if (!sheet) return;
  ensureEmployeeBioCols_(sheet);
  var c = employeeColumns_(sheet);
  if (c.code < 0) return;
  var rows = sheet.getDataRange().getValues();
  var usedCodes = {};
  var updates = [];
  for (var i = 1; i < rows.length; i++) {
    var code = String(rows[i][c.code] || '').trim();
    if (code) { usedCodes[code] = true; continue; }
    var fresh = generateUniqueEmployeeCode_(ss, usedCodes);
    usedCodes[fresh] = true;
    updates.push({ row: i + 1, code: fresh });
  }
  for (var u = 0; u < updates.length; u++) {
    sheet.getRange(updates[u].row, c.code + 1).setValue(updates[u].code);
  }
}
/** Admin action: generate a new unique code for an employee. */
function employeeCodeReset_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);
  var email = String(payload.email || '').trim().toLowerCase();
  if (!email) return error_('Email required');
  var sheet = ss.getSheetByName(SHEET_EMPLOYEES);
  if (!sheet) return error_('Employees sheet not found');
  ensureEmployeeBioCols_(sheet);
  var c = employeeColumns_(sheet);
  if (c.code < 0) return error_('Code column not configured.');
  var rows = sheet.getDataRange().getValues();
  var usedCodes = collectEmployeeCodes_(rows, c);
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][c.email < 0 ? 1 : c.email] || '').trim().toLowerCase() !== email) continue;
    var oldCode = String(rows[i][c.code] || '').trim();
    if (oldCode) delete usedCodes[oldCode];
    var newCode = generateUniqueEmployeeCode_(ss, usedCodes);
    sheet.getRange(i + 1, c.code + 1).setValue(newCode);
    logAudit_(ss, String(payload.adminEmail || 'admin'), 'Employee code reset: ' + email, 'CODE_RESET', now, tz);
    return { ok: true, code: newCode };
  }
  return error_('Employee not found: ' + email);
}
/** Rate-limit fixed-code login attempts: max 5 failures then lockout 15 min. */
function codeAttemptOk_(ss, email, attempt, expected, now) {
  var cache = CacheService.getScriptCache();
  var key = 'codetry:user:' + ss.getId() + ':' + email;
  var state = { c: 0, until: 0 };
  var entry = cache.get(key);
  if (entry) { try { state = JSON.parse(entry); } catch (e) {} }
  if (now.getTime() < Number(state.until || 0)) return false;
  if (String(attempt).trim() === String(expected).trim()) { cache.remove(key); return true; }
  state.c = Number(state.c || 0) + 1;
  if (state.c >= 5) { state.c = 0; state.until = now.getTime() + 900000; }
  cache.put(key, JSON.stringify(state), 900);
  return false;
}
/** Accept a photo as a small data URL, or '' / DataURL: prefix only. Reject oversized values. */
function normalizePhoto_(v) {
  var p = String(v || '').trim();
  if (!p || p === 'null' || p === 'undefined') return '';
  if (p.indexOf('data:') !== 0 && p.indexOf('http') !== 0) return '';
  if (p.length > 60000) return p.slice(0, 60000);
  return p;
}

/** Normalize an HH:MM (or H:MM) string; returns '' when invalid. */
function normShiftTime_(v) {
  var s = String(v || '').trim();
  var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return '';
  var h = Number(m[1]);
  var mm = Number(m[2]);
  if (isNaN(h) || isNaN(mm) || h > 23 || mm > 59) return '';
  return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
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

/**
 * Email every roster member (Employees + Roster sheets) their personal 6-digit
 * sign-in code. Any member without a code gets one generated and saved first.
 * Admin-gated. Returns a summary of how many codes were sent / failed.
 */
function sendCodes_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);

  var staff = expectedStaff_(ss);
  if (!staff.length) return error_('No one in the roster yet (Employees / Roster).');

  // Backfill missing codes (e.g. names without a 6-digit code).
  ensureEmployeeCodes_(ss);

  var sheet = ss.getSheetByName(SHEET_EMPLOYEES);
  var c = sheet ? employeeColumns_(sheet) : { email: 1, code: 10, name: 0 };
  var codeByEmail = {};
  if (sheet) {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var em = String(rows[i][c.email < 0 ? 1 : c.email] || '').trim().toLowerCase();
      var cd = String(rows[i][c.code < 0 ? 10 : c.code] || '').trim();
      if (em && cd) codeByEmail[em] = cd;
    }
  }

  var sent = 0;
  var failed = [];
  var appName = cfg.appName || 'Attendance';

  for (var s = 0; s < staff.length; s++) {
    var email = String(staff[s].email || '').trim().toLowerCase();
    if (!email) continue;
    // Roster-only entries have no Employees row, so no code to send.
    if (!codeByEmail[email]) {
      failed.push(email + ' (no code on Employees)');
      continue;
    }
    var name = staff[s].name || email.split('@')[0] || email;
    try {
      MailApp.sendEmail({
        to: email,
        subject: 'Your ' + appName + ' sign-in code',
        body: 'Hello ' + name + ',\n\n' +
          'Your personal sign-in code for ' + appName + ' is: ' + codeByEmail[email] + '\n\n' +
          'Keep it private. It is used to clock in and out, and can be changed by an administrator.\n\n' +
          'If you did not expect this email, please ignore it.'
      });
      sent++;
      logAudit_(ss, String(payload.adminEmail || 'admin'), 'Sign-in code emailed to ' + email, 'CODE_SENT', now, tz);
    } catch (e) {
      failed.push(email);
    }
  }

  logAudit_(ss, String(payload.adminEmail || 'admin'), 'Bulk codes sent to ' + sent + ' roster member(s)' + (failed.length ? ' (' + failed.length + ' failed)' : ''), 'CODES_SENT', now, tz);
  return {
    ok: true,
    sent: sent,
    total: staff.length,
    failed: failed,
    message: sent + ' sign-in code' + (sent === 1 ? '' : 's') + ' sent to ' + sent + ' email' + (sent === 1 ? '' : 's') + '.'
  };
}

/* ================= Leave & holidays ================= */

/** Approved leave entries overlapping [from, to]. */
function getLeavesInRange_(ss, from, to) {
  var sheet = ss.getSheetByName(SHEET_LEAVE);
  var out = [];
  if (!sheet) return out;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var start = sanitizeDate_(rows[i][1], '');
    var end = sanitizeDate_(rows[i][2], '');
    var email = String(rows[i][0] || '').trim().toLowerCase();
    if (!email || !start || !end) continue;
    if (end < from || start > to) continue;
    out.push({ email: email, start: start, end: end, reason: String(rows[i][3] || '') });
  }
  return out;
}

/** Public holidays within [from, to]. */
function getHolidaysInRange_(ss, from, to) {
  var sheet = ss.getSheetByName(SHEET_HOLIDAYS);
  var out = [];
  if (!sheet) return out;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var d = sanitizeDate_(rows[i][0], '');
    if (!d || d < from || d > to) continue;
    out.push({ date: d, name: String(rows[i][1] || 'Holiday') });
  }
  out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return out;
}

/** True when the date string (YYYY-MM-DD) falls on Saturday or Sunday. */
function isWeekend_(dateStr) {
  var d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00Z');
  var w = d.getUTCDay();
  return w === 0 || w === 6;
}

/**
 * Number of days in the intersection of two inclusive ranges.
 * When workingOnly is true, Saturday/Sunday are excluded from the count.
 */
function daysOverlapCount_(aFrom, aTo, bFrom, bTo, workingOnly) {
  var s = aFrom > bFrom ? aFrom : bFrom;
  var e = aTo < bTo ? aTo : bTo;
  if (e < s) return 0;
  var ms = new Date(e + 'T00:00:00Z') - new Date(s + 'T00:00:00Z');
  var total = Math.floor(ms / 86400000) + 1;
  if (!workingOnly) return total;
  var count = 0;
  for (var i = 0; i < total; i++) {
    var d = new Date(s + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    var w = d.getUTCDay();
    if (w !== 0 && w !== 6) count++;
  }
  return count;
}

function leaveList_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);
  return { ok: true, leaves: getLeavesInRange_(ss, '0000-01-01', '9999-12-31') };
}

function leaveAdd_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);

  var email = String(payload.email || '').trim().toLowerCase();
  var start = sanitizeDate_(payload.start, '');
  var end = sanitizeDate_(payload.end, start);
  var reason = safeCell_(String(payload.reason || '').trim());
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Email invalide.');
  if (!start || !end) return error_('Dates invalides (AAAA-MM-JJ requis).');
  if (end < start) return error_('La fin doit etre apres le debut.');

  ss.getSheetByName(SHEET_LEAVE).appendRow([
    email, start, end, reason,
    Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    safeCell_(String(payload.adminEmail || 'admin'))
  ]);
  logAudit_(ss, String(payload.adminEmail || 'admin'), 'Leave added: ' + email + ' ' + start + '..' + end, 'LEAVE_ADDED', now, tz);
  return { ok: true };
}

function leaveDelete_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);
  var idx = Number(payload.index);
  var sheet = ss.getSheetByName(SHEET_LEAVE);
  var rows = sheet.getDataRange().getValues();
  if (!isFinite(idx) || idx < 1 || idx >= rows.length) return error_('Entree introuvable.');
  var removed = rows[idx];
  sheet.deleteRow(idx + 1);
  logAudit_(ss, String(payload.adminEmail || 'admin'), 'Leave removed: ' + removed[0] + ' ' + removed[1] + '..' + removed[2], 'LEAVE_REMOVED', now, tz);
  return { ok: true };
}

function holidayList_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);
  return { ok: true, holidays: getHolidaysInRange_(ss, '0000-01-01', '9999-12-31') };
}

function holidayAdd_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);

  var d = sanitizeDate_(payload.date, '');
  var name = safeCell_(String(payload.name || '').trim() || 'Jour ferie');
  if (!d) return error_('Date invalide (AAAA-MM-JJ requis).');

  var sheet = ss.getSheetByName(SHEET_HOLIDAYS);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (sanitizeDate_(rows[i][0], '') === d) return error_('Ce jour est deja enregistre.');
  }
  sheet.appendRow([d, name]);
  logAudit_(ss, String(payload.adminEmail || 'admin'), 'Holiday added: ' + d + ' ' + name, 'HOLIDAY_ADDED', now, tz);
  return { ok: true };
}

function holidayDelete_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);
  var idx = Number(payload.index);
  var sheet = ss.getSheetByName(SHEET_HOLIDAYS);
  var rows = sheet.getDataRange().getValues();
  if (!isFinite(idx) || idx < 1 || idx >= rows.length) return error_('Entree introuvable.');
  var removed = rows[idx];
  sheet.deleteRow(idx + 1);
  logAudit_(ss, String(payload.adminEmail || 'admin'), 'Holiday removed: ' + removed[0] + ' ' + removed[1], 'HOLIDAY_REMOVED', now, tz);
  return { ok: true };
}

/* ================= Announcements ================= */

/** Public, active announcements (no auth) for the employee home screen. */
function announcements_(payload, cfg, now, tz, ss) {
  var sheet = ss.getSheetByName(SHEET_ANNOUNCEMENTS);
  var out = [];
  if (sheet) {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var title = safeCell_(String(rows[i][0] || '').trim());
      var body = safeCell_(String(rows[i][1] || '').trim());
      if (!title && !body) continue;
      out.push({
        title: String(rows[i][0] || ''),
        body: String(rows[i][1] || ''),
        postedOn: String(rows[i][2] || ''),
        postedBy: String(rows[i][3] || ''),
        pinned: String(rows[i][4] || '') === 'true',
      });
    }
  }
  out.sort(function (a, b) {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.postedOn || '').localeCompare(a.postedOn || '');
  });
  return { ok: true, announcements: out };
}

function announcementList_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);
  var res = announcements_(payload, cfg, now, tz, ss);
  return { ok: true, announcements: res.announcements };
}

function announcementAdd_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);

  var title = safeCell_(String(payload.title || '').trim());
  var body = safeCell_(String(payload.body || '').trim());
  if (!title && !body) return error_('Titre ou message requis.');
  var pinned = payload.pinned ? String(payload.pinned) === 'true' : false;

  ss.getSheetByName(SHEET_ANNOUNCEMENTS).appendRow([
    title, body,
    Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    safeCell_(String(payload.adminEmail || 'admin')),
    pinned ? 'true' : 'false'
  ]);
  logAudit_(ss, String(payload.adminEmail || 'admin'), 'Announcement added: ' + (title || body), 'ANNOUNCEMENT_ADDED', now, tz);
  return { ok: true };
}

function announcementDelete_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);
  var idx = Number(payload.index);
  var sheet = ss.getSheetByName(SHEET_ANNOUNCEMENTS);
  var rows = sheet.getDataRange().getValues();
  if (!isFinite(idx) || idx < 1 || idx >= rows.length) return error_('Annonce introuvable.');
  var removed = rows[idx];
  sheet.deleteRow(idx + 1);
  logAudit_(ss, String(payload.adminEmail || 'admin'), 'Announcement removed: ' + (removed[0] || removed[1]), 'ANNOUNCEMENT_REMOVED', now, tz);
  return { ok: true };
}

/* ================= Manual corrections ================= */

/**
 * Admin fix-ups for missed or wrong scans. Modes:
 *   set_out     - append a corrected Check-out for an open day
 *   add_pair    - append a manual Check-in + Check-out pair
 *   remove_last - delete the most recent row of that person that day
 * Every change is audited with the acting admin.
 */
function correctionApply_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);

  var mode = String(payload.fixMode || '').trim();
  var email = String(payload.email || '').trim().toLowerCase();
  var date = sanitizeDate_(payload.date, '');
  var by = String(payload.adminEmail || 'admin');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Email invalide.');
  if (!date) return error_('Date invalide.');

  var att = ss.getSheetByName(SHEET_ATT);
  var data = att.getDataRange().getValues();

  // Find the day's rows for this person (chronological).
  var dayRows = [];
  for (var i = 1; i < data.length; i++) {
    if (cellDateStr_(data[i][0], tz) !== date) continue;
    if (String(data[i][3] || '').toLowerCase() !== email) continue;
    dayRows.push({ rowIdx: i + 1, action: String(data[i][4]), sec: timeToSec_(String(data[i][1])), time: String(data[i][1]), name: String(data[i][2] || ''), office: String(data[i][10] || ''), token: String(data[i][9] || '') });
  }

  if (mode === 'set_out' || mode === 'add_pair') {
    var outT = normShiftTime_(payload.out);
    var inT = normShiftTime_(payload.inTime);
    if (!outT) return error_("Heure de sortie invalide (HH:MM).");
    if (mode === 'add_pair' && !inT) return error_("Heure d'entree invalide (HH:MM).");

    if (mode === 'set_out') {
      if (!dayRows.length) return error_('Aucun pointage ce jour pour cette personne.');
      var lastRow = dayRows[dayRows.length - 1];
      if (lastRow.action === 'Check-out') return error_('Cette journee est deja cloturee par une sortie.');
      var openSec = lastRow.sec;
      var outSec = timeToSec_(outT);
      if (outSec <= openSec) return error_('La sortie doit etre apres l\'entree (' + lastRow.time.slice(0, 5) + ').');
      att.appendRow([date, outT + ':00', safeCell_(lastRow.name || email), email, 'Check-out', 'Corrected', '', '', 0, lastRow.token, lastRow.office, '']);
      logAudit_(ss, by, 'Correction set_out ' + email + ' ' + date + ' -> ' + outT, 'CORRECTION', now, tz);
      return { ok: true, applied: 'sortie ' + outT + ' ajoutee' };
    }

    // add_pair
    var inSec = timeToSec_(inT);
    var outSec2 = timeToSec_(outT);
    if (outSec2 <= inSec) return error_('La sortie doit etre apres l\'entree.');
    var officeName = dayRows.length ? dayRows[dayRows.length - 1].office : '';
    att.appendRow([date, inT + ':00', safeCell_(email), email, 'Check-in', 'Manual', '', '', 0, '', officeName, '']);
    att.appendRow([date, outT + ':00', safeCell_(email), email, 'Check-out', 'Manual', '', '', 0, '', officeName, '']);
    logAudit_(ss, by, 'Correction add_pair ' + email + ' ' + date + ' ' + inT + '-' + outT, 'CORRECTION', now, tz);
    return { ok: true, applied: 'paire manuelle ' + inT + '-' + outT + ' ajoutee' };
  }

  if (mode === 'remove_last') {
    if (!dayRows.length) return error_('Aucun pointage ce jour pour cette personne.');
    var victim = dayRows[dayRows.length - 1];
    att.deleteRow(victim.rowIdx);
    logAudit_(ss, by, 'Correction remove_last ' + email + ' ' + date + ' [' + victim.action + ' ' + victim.time + ']', 'CORRECTION', now, tz);
    return { ok: true, applied: 'dernier pointage supprime (' + victim.action + ' ' + victim.time.slice(0, 5) + ')' };
  }

  return error_('Mode de correction inconnu.');
}

/* ================= Admin Users ================= */

/**
 * Check if an email is in the Admins sheet.
 */
function isAdmin_(ss, email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return false;
  var sheet = ss.getSheetByName(SHEET_ADMINS);
  if (!sheet) return false;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === email) return true;
  }
  return false;
}

/**
 * Lightweight gate for the UI: tells the client whether this profile email may
 * see the Admin entry point. The real enforcement stays in admin_login /
 * adminAccess_ — this only hides the door, it does not unlock anything.
 */
function adminCheck_(payload, ss) {
  var email = String(payload.email || '').trim().toLowerCase();
  var valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  return { ok: true, isAdmin: valid && isAdmin_(ss, email) };
}

/**
 * Email-based admin login.
 * Step 1: Client sends { action:'admin_login', email } → sends OTP.
 * Step 2: Client sends { action:'admin_login', email, otp } → verifies OTP, creates session.
 */
function adminLogin_(payload, cfg, now, tz, ss) {
  var email = String(payload.email || '').trim().toLowerCase();
  if (!email) return error_('Email required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Invalid email address');

  if (!isAdmin_(ss, email)) {
    logAudit_(ss, email, 'Admin login attempt by non-admin email', 'NOT_ADMIN', now, tz);
    return error_('This email does not have admin access. Contact an admin to grant access.');
  }

  var otp = String(payload.otp || '').trim();

  // Step 2: OTP provided → verify and create session
  if (otp) {
    if (!verifyAdminOtp_(email, otp, now, ss)) {
      logAudit_(ss, email, 'Bad admin one-time code (email login)', 'BAD_OTP', now, tz);
      return error_('Invalid or expired one-time code.');
    }
    logAudit_(ss, email, 'Admin signed in (email 2FA)', 'ADMIN_2FA', now, tz);
    return { ok: true, token: createSession_(ss, now) };
  }

  // Step 1: No OTP → send one
  var guard = pinGuard_(cfg, now, ss);
  if (guard.locked) return { ok: false, message: guard.message };

  if (!writeBudget_('otpq:a:' + ss.getId() + ':' + email, 3, 3600000)) {
    logAudit_(ss, email, 'Admin OTP send rate limit hit', 'OTP_QUOTA', now, tz);
    return error_('Too many admin codes requested this hour. Try again later.');
  }

  var sent = sendOtpTo_(email, now, ss);
  logAudit_(ss, email, 'Admin OTP requested', 'ADMIN_OTP', now, tz);
  return {
    ok: true,
    needOtp: true,
    message: 'A one-time code was sent to ' + email + '.',
    otpDev: devOtpOn_(cfg) ? sent.dev : undefined,
    email: email
  };
}

/**
 * Expose the development OTP only when Config > otpDevMode is set to 'on'.
 * In production this stays hidden so an emailed code cannot be read from the
 * API response by someone who only knows the admin/employee email address.
 */
function devOtpOn_(cfg) {
  return String((cfg && cfg.otpDevMode) || '').trim().toLowerCase() === 'on';
}

/**
 * Send an OTP to a specific admin email address.
 */
function sendOtpTo_(email, now, ss) {
  var cache = CacheService.getScriptCache();
  var key = 'otp:admin:' + ss.getId() + ':' + email;
  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put(key, JSON.stringify({ code: code, until: now.getTime() + 600000, tries: 0 }), 600);
  try {
    MailApp.sendEmail(email, 'Your admin access code',
      'Your one-time code is: ' + code + '\n\nIt is valid for 10 minutes.\nIf you did not request this, ignore this email.');
  } catch (e) {}
  return { dev: code };
}

/* ================= Employee sign-in (email + one-time code) ================= */

function sendUserOtp_(email, now, ss) {
  var cache = CacheService.getScriptCache();
  var key = 'otp:user:' + ss.getId() + ':' + email;
  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put(key, JSON.stringify({ code: code, until: now.getTime() + 600000, tries: 0 }), 600);
  try {
    MailApp.sendEmail(email, 'Your attendance sign-in code',
      'Your one-time sign-in code is: ' + code + '\n\nIt is valid for 10 minutes.\nIf you did not request this, ignore this email.');
  } catch (e) {}
  return { dev: code };
}

function verifyUserOtp_(email, otp, now, ss) {
  var cache = CacheService.getScriptCache();
  var key = 'otp:user:' + ss.getId() + ':' + email;
  var entry = cache.get(key);
  if (!entry) return false;
  var o = {};
  try { o = JSON.parse(entry); } catch (e) { return false; }
  if (now.getTime() > Number(o.until || 0)) return false;
  if (Number(o.tries || 0) >= 5) return false;
  if (String(o.code) !== String(otp || '').trim()) {
    o.tries = Number(o.tries || 0) + 1;
    cache.put(key, JSON.stringify(o), 600);
    return false;
  }
  cache.remove(key);
  return true;
}

/**
 * Employee sign-in (the app's login view).
 * Step 1: Client sends { action:'user_login', email, tenant } -> sends OTP.
 * Step 2: Client sends { action:'user_login', email, otp } -> verifies and
 *   returns the profile + a session token (admins also get an admin session).
 * The session token is a client-side handle; real enforcement for attendance
 * (roster, geofence, quotas) happens on each action independently.
 */
function userLogin_(payload, cfg, now, tz, ss) {
  var email = String(payload.email || '').trim().toLowerCase();
  if (!email) return error_('Email required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Adresse email invalide.');

  var otp = String(payload.otp || '').trim();
  var code = String(payload.code || '').trim();

  // Fixed per-employee code login (single step). Takes priority when present.
  if (code) {
    if (!isEmailAllowed_(ss, email, cfg)) {
      logAudit_(ss, email, 'Sign-in blocked by roster', 'LOGIN_DENIED', now, tz);
      return error_('Cet email n\'est pas dans la liste autorisee. Demandez a votre administrateur de vous ajouter dans la feuille Employees.');
    }
    var emp = findEmployee_(ss, email);
    if (!emp || !String(emp.code || '').trim()) {
      logAudit_(ss, email, 'No code configured for employee', 'LOGIN_NO_CODE', now, tz);
      return error_('Aucun code n\'est associe a cet email. Demandez a votre administrateur.');
    }
    if (!codeAttemptOk_(ss, email, code, emp.code, now)) {
      logAudit_(ss, email, 'Bad fixed sign-in code', 'BAD_CODE', now, tz);
      return error_('Code incorrect. Veuillez reessayer.');
    }
    logAudit_(ss, email, 'User signed in (fixed code)', 'USER_LOGIN', now, tz);
    var name = emp.name || email.split('@')[0] || email;
    var isAdmin = isAdmin_(ss, email);
    return {
      ok: true,
      user: {
        name: name,
        email: email,
        tenant: String(payload.tenant || '').trim(),
        isAdmin: isAdmin
      },
      sessionToken: isAdmin ? createSession_(ss, now) : createUserSession_(ss, email, now)
    };
  }

  // Step 2 (legacy OTP): verify the code and hand back the signed-in profile.
  if (otp) {
    if (!verifyUserOtp_(email, otp, now, ss)) {
      logAudit_(ss, email, 'Bad sign-in one-time code', 'BAD_OTP', now, tz);
      return error_('Code invalide ou expire.');
    }
    logAudit_(ss, email, 'User signed in (email code)', 'USER_LOGIN', now, tz);
    var emp2 = findEmployee_(ss, email);
    var name2 = (emp2 && emp2.name) || email.split('@')[0] || email;
    var isAdmin2 = isAdmin_(ss, email);
    return {
      ok: true,
      user: {
        name: name2,
        email: email,
        tenant: String(payload.tenant || '').trim(),
        isAdmin: isAdmin2
      },
      /* Admins get the admin session (gives dashboard access). Employees get a
         user session token that is server-side bound to their email: employee
         data actions (myattendance, myexport, mydelete, recent, week) require
         it so one person cannot read or erase another person's records. */
      sessionToken: isAdmin2 ? createSession_(ss, now) : createUserSession_(ss, email, now)
    };
  }

  // Step 1: roster gate, then send the code.
  if (!isEmailAllowed_(ss, email, cfg)) {
    logAudit_(ss, email, 'Sign-in blocked by roster', 'LOGIN_DENIED', now, tz);
    return error_('Cet email n\'est pas dans la liste autorisee. Demandez a votre administrateur de vous ajouter dans la feuille Employees.');
  }

  if (!writeBudget_('otpq:' + ss.getId() + ':' + email, 3, 3600000)) {
    logAudit_(ss, email, 'OTP send rate limit hit', 'OTP_QUOTA', now, tz);
    return error_('Trop de codes envoyes a cet email cette heure. Reessayez plus tard.');
  }

  var sent = sendUserOtp_(email, now, ss);
  logAudit_(ss, email, 'Sign-in OTP requested', 'USER_OTP', now, tz);
  return {
    ok: true,
    needOtp: true,
    message: 'Un code a ete envoye a ' + email + '.',
    otpDev: devOtpOn_(cfg) ? sent.dev : undefined,
    email: email
  };
}

/**
 * Verify an OTP sent to an admin email and create a session.
 * Client sends { action:'admin', email, otp, ... }.
 * We check the email-specific OTP cache here.
 */
function verifyAdminOtp_(email, otp, now, ss) {
  var cache = CacheService.getScriptCache();
  var key = 'otp:admin:' + ss.getId() + ':' + email;
  var entry = cache.get(key);
  if (!entry) return false;
  var o = {};
  try { o = JSON.parse(entry); } catch (e) { return false; }
  if (now.getTime() > Number(o.until || 0)) return false;
  if (Number(o.tries || 0) >= 5) return false;
  if (String(o.code) !== String(otp || '').trim()) {
    o.tries = Number(o.tries || 0) + 1;
    cache.put(key, JSON.stringify(o), 600);
    return false;
  }
  cache.remove(key);
  return true;
}

/**
 * List all admins. Requires an existing admin session.
 */
function adminsList_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);

  var sheet = ss.getSheetByName(SHEET_ADMINS);
  var list = [];
  if (sheet) {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var email = String(rows[i][0] || '').trim().toLowerCase();
      if (!email) continue;
      list.push({
        email: email,
        name: String(rows[i][1] || ''),
        addedOn: String(rows[i][2] || ''),
        addedBy: String(rows[i][3] || '')
      });
    }
  }
  return { ok: true, admins: list };
}

/**
 * Add an admin. Requires an existing admin session.
 */
function adminAdd_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);

  var email = String(payload.email || '').trim().toLowerCase();
  var name = String(payload.name || '').trim();
  if (!email) return error_('Email required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error_('Invalid email address');

  if (isAdmin_(ss, email)) {
    return { ok: true, message: email + ' is already an admin.' };
  }

  var sheet = ss.getSheetByName(SHEET_ADMINS);
  var addedBy = String(payload.adminEmail || 'admin');
  sheet.appendRow([email, safeCell_(name), Utilities.formatDate(now, tz, 'yyyy-MM-dd'), safeCell_(addedBy)]);
  logAudit_(ss, addedBy, 'Added admin: ' + email, 'ADMIN_ADDED', now, tz);
  return { ok: true, admin: { email: email, name: name } };
}

/**
 * Remove an admin. Requires an existing admin session.
 */
function adminRemove_(payload, cfg, now, tz, ss) {
  var access = adminAccess_(payload, cfg, now, tz, ss);
  if (!access.ok) return error_(access.message);

  var email = String(payload.email || '').trim().toLowerCase();
  if (!email) return error_('Email required');

  var sheet = ss.getSheetByName(SHEET_ADMINS);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === email) {
      sheet.deleteRow(i + 1);
      var removedBy = String(payload.adminEmail || 'admin');
      logAudit_(ss, removedBy, 'Removed admin: ' + email, 'ADMIN_REMOVED', now, tz);
      return { ok: true, deleted: email };
    }
  }
  return error_('Admin not found: ' + email);
}

/* ================= Reports ================= */

/**
 * Build per-day in/out pairs from attendance rows. Break-aware: worked hours
 * exclude completed break intervals (Break-out -> Break-in). lateAfterSec may
 * be a number of seconds-of-day (-1 disables) or a resolver function
 * (email -> seconds) used for per-person shift start times.
 */
function computeReport_(rows, from, to, lateAfterSec, tz) {
  var lateFor = typeof lateAfterSec === 'function' ? lateAfterSec : function () { return lateAfterSec; };

  var byKey = {};
  var order = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var d = cellDateStr_(r[0], tz);
    if (d < from || d > to) continue;
    var email = String(r[3] || '').toLowerCase();
    if (!email) continue;
    var action = String(r[4] || '');
    var sec = timeToSec_(cellTimeStr_(r[1], tz));
    if (sec < 0) continue;
    var key = email + '|' + d;
    if (!byKey[key]) {
      byKey[key] = { email: email, name: String(r[2] || ''), date: d, rows: [] };
      order.push(key);
    }
    byKey[key].rows.push({ time: cellTimeStr_(r[1], tz), sec: sec, action: action });
  }

  var pairs = [];
  var totalHours = 0;
  var totalBreakMin = 0;
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
      var lateLimit = lateFor(rec.email);

      if (row.action === 'Check-in') {
        if (open) {
          missingOut++;
          if (open.late) lateCount++;
          pairs.push({ date: rec.date, name: rec.name, email: rec.email, in: open.time, out: null, hours: null, late: open.late, missing: true, breakMin: Math.round(open.breakSec / 60) });
        }
        open = { time: row.time, sec: row.sec, late: lateLimit >= 0 && row.sec > lateLimit, breakSec: 0, breakOpen: -1 };
        daySet[rec.email + '|' + rec.date] = 1;
        emailSet[rec.email] = 1;
      } else if (row.action === 'Break-out' && open && open.breakOpen < 0) {
        open.breakOpen = row.sec;
      } else if (row.action === 'Break-in') {
        if (open && open.breakOpen >= 0) {
          open.breakSec += Math.max(0, row.sec - open.breakOpen);
          open.breakOpen = -1;
        }
      } else if (row.action === 'Check-out' && open) {
        var netSec = Math.max(0, row.sec - open.sec - open.breakSec);
        var hours = Math.round((netSec / 3600) * 100) / 100;
        var breakMin = Math.round(open.breakSec / 60);
        if (open.late) lateCount++;
        totalHours += hours;
        totalBreakMin += breakMin;
        pairs.push({ date: rec.date, name: rec.name, email: rec.email, in: open.time, out: row.time, hours: hours, late: open.late, missing: false, breakMin: breakMin });
        open = null;
      }
    }

    if (open) {
      missingOut++;
      if (open.late) lateCount++;
      pairs.push({ date: rec.date, name: rec.name, email: rec.email, in: open.time, out: null, hours: null, late: open.late, missing: true, breakMin: Math.round(open.breakSec / 60) });
    }
  }

  return {
    pairs: pairs,
    summary: {
      totalHours: Math.round(totalHours * 100) / 100,
      totalBreakMin: totalBreakMin,
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

/**
 * Toggle roster mode so only emails in the Employees/Roster sheet can log in.
 * Run from Attendance menu > Restrict login to roster emails.
 */
function enableRosterMode() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  setConfigValue_(ss, 'rosterMode', 'roster');
  SpreadsheetApp.getUi().alert('Roster mode enabled.\n\nOnly emails listed in the Employees or Roster sheet can log in. Add employees via the Admin panel or the Employees sheet.');
}

function disableRosterMode() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  setConfigValue_(ss, 'rosterMode', 'open');
  SpreadsheetApp.getUi().alert('Roster mode disabled.\n\nAny valid email can now log in.');
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

/**
 * Hourly trigger that emails admins about people still checked in after
 * reminderCheckOutAfter (HH:MM in Config). Enable once via the menu.
 */
function enableCheckoutReminders() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendCheckoutReminders') {
      return 'Check-out reminders already enabled.';
    }
  }
  ScriptApp.newTrigger('sendCheckoutReminders').timeBased().everyHours(1).create();
  return 'Check-out reminders enabled. Set reminderCheckOutAfter (HH:MM) in Config.';
}

function sendCheckoutReminders() {
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var today = dateStr_(now, tz);
  var nowMin = Number(Utilities.formatDate(now, tz, 'H')) * 60 + Number(Utilities.formatDate(now, tz, 'm'));
  var master = SpreadsheetApp.getActiveSpreadsheet();

  var targets = [{ code: '', ss: master }];
  var map = allTenants_();
  for (var code in map) {
    try { targets.push({ code: code, ss: SpreadsheetApp.openById(map[code]) }); } catch (e) {}
  }

  var sent = [];
  for (var i = 0; i < targets.length; i++) {
    try {
      var ss = targets[i].ss;
      var cfg = getConfig_(ss);
      if (!cfg.adminEmail || !cfg.reminderCheckOutAfter) continue;
      // Fire within an hour of the configured time.
      if (Math.abs(timeToSec_(cfg.reminderCheckOutAfter) / 60 - nowMin) > 59) continue;

      var att = ss.getSheetByName(SHEET_ATT);
      if (!att) continue;
      var data = att.getDataRange().getValues();
      var lastIn = {};   // email -> name of latest Check-in
      var closedOut = {}; // email -> has Check-out after that
      for (var j = 1; j < data.length; j++) {
        if (cellDateStr_(data[j][0], tz) !== today) continue;
        var email = String(data[j][3] || '').toLowerCase();
        if (!email) continue;
        if (data[j][4] === 'Check-in') { lastIn[email] = String(data[j][2] || email); delete closedOut[email]; }
        else if (data[j][4] === 'Check-out' && lastIn[email]) closedOut[email] = 1;
      }
      var stillIn = [];
      for (var e in lastIn) if (!closedOut[e]) stillIn.push(lastIn[e] + ' <' + e + '>');
      if (!stillIn.length) continue;

      MailApp.sendEmail({
        to: cfg.adminEmail,
        subject: 'Check-out reminder \u2014 ' + today,
        body: cfg.appName + ': ' + stillIn.length + ' person(s) are still checked in at ' +
          Utilities.formatDate(now, tz, 'HH:mm') + ':\n\n  ' + stillIn.join('\n  ') +
          '\n\n(reminderCheckOutAfter = ' + cfg.reminderCheckOutAfter + ')'
      });
      sent.push({ code: targets[i].code, to: cfg.adminEmail });
    } catch (e) {}
  }
  return { ok: true, sent: sent };
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
      var report = computeReport_(rows, today, today, lateResolver_(target.ss, cfg), tz);
      var missingOutNames = [];
      var seenMissing = {};
      for (var m = 0; m < report.pairs.length; m++) {
        if (report.pairs[m].missing && !seenMissing[report.pairs[m].email]) {
          seenMissing[report.pairs[m].email] = 1;
          missingOutNames.push(report.pairs[m].name || report.pairs[m].email);
        }
      }
      var leaves = getLeavesInRange_(target.ss, today, today);
      var onLeaveSet = {};
      for (var lv = 0; lv < leaves.length; lv++) onLeaveSet[leaves[lv].email] = 1;
      var holidays = getHolidaysInRange_(target.ss, today, today);
      var body = buildDigestBody_(today, cfg, report, expectedStaff_(target.ss), missingOutNames, onLeaveSet, holidays);
      MailApp.sendEmail({ to: cfg.adminEmail, subject: 'Attendance summary \u2014 ' + today, body: body });
      sent.push({ code: target.code, to: cfg.adminEmail });
    } catch (e) {}
  }

  if (sent.length === 0) return { ok: false, message: 'No adminEmail configured for any tenant.' };
  return { ok: true, sent: sent };
}

function buildDigestBody_(today, cfg, report, staff, missingOutNames, onLeaveSet, holidays) {
  var lines = [];
  var i;
  lines.push('Attendance summary for ' + today + ' \u2014 ' + cfg.appName);
  if (holidays && holidays.length) {
    lines.push('Public holiday: ' + holidays[0].name);
  }
  lines.push('');

  var pairs = report.pairs;
  if (pairs.length === 0) {
    lines.push('No attendance recorded.');
  } else {
    var byEmail = {};
    var order = [];
    for (i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      if (!byEmail[p.email]) { byEmail[p.email] = { name: p.name, lines: [] }; order.push(p.email); }
      var inT = p.in || '--';
      var outT = p.out || '--';
      var hrs = p.hours != null ? formatHours_(p.hours) : 'no check-out';
      byEmail[p.email].lines.push('  ' + inT + ' \u2013 ' + outT + '  (' + hrs + (p.late ? ', late' : '') + (p.breakMin ? ', pause ' + formatHours_(p.breakMin / 60) : '') + ')');
    }
    for (i = 0; i < order.length; i++) {
      var e = order[i];
      lines.push(byEmail[e].name + ' <' + e + '>');
      for (var j = 0; j < byEmail[e].lines.length; j++) lines.push(byEmail[e].lines[j]);
      lines.push('');
    }
  }

  // Roster cross-check: who never checked in today (excluding leave).
  if (staff && staff.length) {
    var presentSet = {};
    for (i = 0; i < pairs.length; i++) presentSet[pairs[i].email] = 1;
    var absentList = [];
    for (i = 0; i < staff.length; i++) {
      if (presentSet[staff[i].email] || onLeaveSet[staff[i].email]) continue;
      absentList.push(staff[i].name ? staff[i].name + ' <' + staff[i].email + '>' : staff[i].email);
    }
    if (absentList.length) {
      lines.push('Not checked in (' + absentList.length + '):');
      for (i = 0; i < absentList.length; i++) lines.push('  ' + absentList[i]);
    } else {
      lines.push('Everyone expected is checked in.');
    }
  }

  if (missingOutNames && missingOutNames.length) {
    lines.push('');
    lines.push('Still no check-out (' + missingOutNames.length + '): ' + missingOutNames.join(', '));
  }

  var s = report.summary;
  lines.push('');
  lines.push('Present: ' + s.people + ' \u00b7 Total hours: ' + formatHours_(s.totalHours) +
    ' \u00b7 Late: ' + s.lateCount + ' \u00b7 Missing check-out: ' + s.missingOut +
    (s.totalBreakMin ? ' \u00b7 Pause: ' + formatHours_(s.totalBreakMin / 60) : ''));
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

  var email = String(payload.email || '').trim().toLowerCase();
  var pin = String(payload.pin || '').trim();
  var otp = String(payload.otp || '').trim();

  // Email-based admin login (OTP sent to the admin's own email)
  if (email && otp && isAdmin_(ss, email)) {
    if (!verifyAdminOtp_(email, otp, now, ss)) {
      logAudit_(ss, email, 'Bad admin one-time code (email login)', 'BAD_OTP', now, tz);
      return { ok: false, message: 'Invalid or expired one-time code.' };
    }
    logAudit_(ss, email, 'Admin signed in (email 2FA)', 'ADMIN_2FA', now, tz);
    return { ok: true, token: createSession_(ss, now) };
  }

  // Legacy PIN-based login (backward compatibility)
  if (!pin) return { ok: false, message: 'Admin login required.' };

  var auth = pinCheck_(payload, cfg, now, tz, ss);
  if (!auth.ok) return auth;

  if (!otp) {
    // If the admin email is in the Admins sheet, send OTP to them
    // Otherwise fall back to the configured adminEmail
    var otpEmail = cfg.adminEmail;
    var sent;
    if (otpEmail && isAdmin_(ss, otpEmail)) {
      sent = sendOtpTo_(otpEmail, now, ss);
    } else {
      sent = sendOtp_(cfg, now, ss);
    }
    var msg = otpEmail
      ? 'A one-time code was emailed to ' + otpEmail + '.'
      : 'No admin email is configured, so a development code is shown below. Set adminEmail in Config for production.';
    return { ok: false, code: 'NEED_OTP', needOtp: true, otpDev: devOtpOn_(cfg) ? sent.dev : undefined, message: msg };
  }

  var otpOk = verifyOtp_(cfg, now, ss, otp);
  if (!otpOk && cfg.adminEmail && isAdmin_(ss, cfg.adminEmail)) {
    otpOk = verifyAdminOtp_(cfg.adminEmail, otp, now, ss);
  }
  if (!otpOk) {
    logAudit_(ss, '', 'Bad admin one-time code', 'BAD_OTP', now, tz);
    return { ok: false, message: 'Invalid or expired one-time code.' };
  }
  logAudit_(ss, '', 'Admin signed in (PIN 2FA)', 'ADMIN_2FA', now, tz);
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

/**
 * Create a user session bound to an email address. Unlike the admin session
 * (which proves "is an admin"), this proves "is this specific employee".
 * TTL is capped at the script cache maximum (6h); the client just signs in
 * again when it expires.
 */
function createUserSession_(ss, email, now) {
  var token = randomToken_() + randomToken_();
  CacheService.getScriptCache().put(
    'usersess:' + ss.getId() + ':' + token,
    String(email || '').trim().toLowerCase(),
    Math.min(21600, 12 * 3600)
  );
  return token;
}

function validUserSession_(ss, email, token) {
  if (!email || !token) return false;
  var cached = CacheService.getScriptCache().get('usersess:' + ss.getId() + ':' + token);
  return !!cached && String(cached).toLowerCase() === String(email).trim().toLowerCase();
}

/**
 * Does this token authorize access to this employee's own data? A user session
 * minted for the same email, or any valid admin session (admins already have
 * full access through the admin panel, so accepting their token here does not
 * expand the attack surface).
 */
function ownsEmail_(ss, email, token) {
  if (validUserSession_(ss, email, token)) return true;
  return validSession_(ss, token);
}

/** Standard "re-authenticate" error for employee-data actions. */
function sessionError_(ss, email, now, tz) {
  logAudit_(ss, email, 'Data access denied (no session for this email)', 'SESSION_REQUIRED', now, tz);
  return {
    ok: false,
    code: 'SESSION_REQUIRED',
    message: 'Votre session a expire. Reconnectez-vous pour voir vos donnees.'
  };
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

/**
 * Extract an HH:mm:ss string from a spreadsheet cell that may be a Date object
 * (Sheets stores pure times as dates on the 1899-12-30 base day) or a plain
 * string like "08:30" / "08:30:00".
 */
function cellTimeStr_(cell, tz) {
  if (cell instanceof Date) return Utilities.formatDate(cell, tz, 'HH:mm:ss');
  var s = String(cell || '').trim();
  if (!s) return s;
  if (/^\d{1,2}:\d{2}$/.test(s)) return s + ':00';
  return s;
}
