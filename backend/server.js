import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath, pathToFileURL } from 'url';
import supabase from './supabase.js';
import { Resend } from 'resend';

const app = express();
const PORT = process.env.PORT || 3000;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const PLAN_LIMITS = {
  free: { employees: 25, offices: 1 },
  starter: { employees: 100, offices: 3 },
  pro: { employees: 1000, offices: 10 },
};
const PLAN_NAMES = { free: 'Free', starter: 'Starter', pro: 'Pro' };

const ctxStore = new AsyncLocalStorage();

const TENANT_TABLES = new Set([
  'config', 'employees', 'attendance', 'admins', 'roster', 'offices',
  'audit', 'leave_requests', 'holidays', 'announcements',
  'otp_store', 'sessions', 'write_quotas',
]);

const DEFAULT_CONFIG = [
  ['appName', 'Liste Des Presences'],
  ['officeName', 'Head Office'],
  ['officeLat', '5.6037168'],
  ['officeLng', '-0.1869644'],
  ['radiusMeters', '150'],
  ['rosterMode', 'roster'],
  ['rosterDomain', ''],
  ['minScanIntervalSec', '60'],
  ['replayMaxAgeMs', '300000'],
  ['pinMaxAttempts', '5'],
  ['pinLockoutMs', '900000'],
  ['writeQuotaPerEmail', '60'],
  ['writeQuotaTenant', '600'],
  ['retentionDays', '0'],
  ['lateAfter', '08:30'],
  ['selfieMode', 'off'],
  ['reminderCheckInAfter', ''],
  ['reminderCheckOutAfter', ''],
  ['weekendsOff', 'on'],
];

/* ===================== TENANCY HELPERS ===================== */

function currentTenant() {
  const st = ctxStore.getStore();
  return st ? st.tenantId : null;
}

function currentTenantPlan() {
  const st = ctxStore.getStore();
  return st ? st.plan : 'free';
}

function db(table) {
  const q = supabase.from(table);
  if (TENANT_TABLES.has(table) && currentTenant()) {
    return q.eq('tenant_id', currentTenant());
  }
  return q;
}

function withTenant(row) {
  if (Array.isArray(row)) return row.map(withTenant);
  const tid = currentTenant();
  return tid ? { ...row, tenant_id: tid } : row;
}

function planLimit(max) {
  const p = PLAN_LIMITS[currentTenantPlan()] || PLAN_LIMITS.free;
  return p[max] ?? max;
}

async function resolveTenant(code) {
  const c = String(code || '').trim().toLowerCase();
  if (!c) return null;
  const { data } = await db('tenants').select('id, code, app_name, plan, status, master_pin, max_employees, max_offices').eq('code', c).maybeSingle();
  return data || null;
}

async function ensureTenantConfig(tenantId) {
  const { count } = await db('config').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  if (count > 0) return;
  await db('config').insert(DEFAULT_CONFIG.map(([key, value]) => ({ tenant_id: tenantId, key, value })));
}

async function effectiveTenant(payload) {
  const code = String(payload.tenant || process.env.DEFAULT_TENANT || '').trim().toLowerCase();
  if (!code) return { id: null, code: '', reason: 'no_tenant' };
  const t = await resolveTenant(code);
  if (!t) return { id: null, code, reason: 'unknown' };
  return { id: t.id, code: t.code, plan: t.plan, status: t.status, appName: t.app_name };
}

const ROT_INTERVAL_SEC = 30;
const SELFIE_MAX_BYTES = 400000;

app.use(cors());
app.use(express.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

/* ===================== HELPERS ===================== */

function json(res, obj) {
  return res.json(obj);
}

function error(msg) {
  return { ok: false, message: msg };
}

function safeCell(v) {
  let s = String(v == null ? '' : v).trim();
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 200);
}

function timeToSec(t) {
  const s = String(t).trim();
  if (!s) return -1;
  const parts = s.split(':');
  if (parts.length < 2 || parts.length > 3) return -1;
  const h = Number(parts[0]), m = Number(parts[1]);
  const sec = parts.length === 3 ? Number(parts[2]) : 0;
  if (isNaN(h) || isNaN(m) || isNaN(sec)) return -1;
  return h * 3600 + m * 60 + sec;
}

function formatDate(d, tz, fmt) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'Africa/Accra',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d) + '';
}

function formatTime(d, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz || 'Africa/Accra',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(d);
}

function dateStr(d, tz) {
  return formatDate(d, tz);
}

function normShiftTime(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  if (isNaN(h) || isNaN(mm) || h > 23 || mm > 59) return null;
  return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
}

function randomToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function formatHours(h) {
  if (h === null || h === undefined || isNaN(h)) return '0h 0m';
  const total = Math.round(h * 60);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return hours + 'h ' + mins + 'm';
}

function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const w = d.getUTCDay();
  return w === 0 || w === 6;
}

function sanitizeDate(v, fallback) {
  const s = String(v || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return fallback;
}

/* ===================== CONFIG ===================== */

async function getConfig() {
  const { data } = await db('config').select('key, value');
  const cfg = {};
  if (data) {
    for (const row of data) {
      if (row.key && row.value !== undefined && row.value !== '') {
        cfg[row.key] = row.value;
      }
    }
  }
  cfg.appName = cfg.appName || 'Liste Des Presences';
  cfg.officeName = cfg.officeName || 'Head Office';
  cfg.adminEmail = cfg.adminEmail || '';
  cfg.lateAfter = cfg.lateAfter || '08:30';
  cfg.officeLat = Number(cfg.officeLat || 0);
  cfg.officeLng = Number(cfg.officeLng || 0);
  cfg.radiusMeters = Number(cfg.radiusMeters || 150);
  cfg.minScanIntervalSec = Number(cfg.minScanIntervalSec || 60);
  cfg.replayMaxAgeMs = Number(cfg.replayMaxAgeMs || 300000);
  cfg.pinMaxAttempts = Number(cfg.pinMaxAttempts || 5);
  cfg.pinLockoutMs = Number(cfg.pinLockoutMs || 900000);
  cfg.writeQuotaPerEmail = Number(cfg.writeQuotaPerEmail || 60);
  cfg.writeQuotaTenant = Number(cfg.writeQuotaTenant || 600);
  cfg.retentionDays = Number(cfg.retentionDays || 0);
  cfg.selfieMode = String(cfg.selfieMode || 'off').toLowerCase();
  if (!['off', 'optional', 'required'].includes(cfg.selfieMode)) cfg.selfieMode = 'off';
  const wo = String(cfg.weekendsOff == null ? 'on' : cfg.weekendsOff).toLowerCase();
  cfg.weekendsOff = !(wo === 'off' || wo === 'false' || wo === 'no' || wo === '0');
  cfg.reminderCheckInAfter = cfg.reminderCheckInAfter || '';
  cfg.reminderCheckOutAfter = cfg.reminderCheckOutAfter || '';
  return cfg;
}

function publicConfig(cfg, offices) {
  return {
    appName: cfg.appName,
    officeName: cfg.officeName,
    officeLat: cfg.officeLat,
    officeLng: cfg.officeLng,
    radiusMeters: cfg.radiusMeters,
    offices: offices.map(o => ({ name: o.name, lat: o.latitude, lng: o.longitude, radius: o.radius_meters })),
    selfieMode: cfg.selfieMode,
    reminderCheckInAfter: cfg.reminderCheckInAfter,
    reminderCheckOutAfter: cfg.reminderCheckOutAfter,
    weekendsOff: !!cfg.weekendsOff,
  };
}

/* ===================== OFFICES ===================== */

async function getOffices(cfg) {
  const { data } = await db('offices').select('*');
  const offices = (data || []).filter(o => o.qr_token && o.latitude && o.longitude);
  if (offices.length === 0 && cfg.qrSecret) {
    return [{ name: cfg.officeName, qr_token: cfg.qrSecret, latitude: cfg.officeLat, longitude: cfg.officeLng, radius_meters: cfg.radiusMeters }];
  }
  return offices;
}

/* ===================== EMPLOYEES ===================== */

async function findEmployee(email) {
  const { data } = await db('employees').select('*').eq('email', email.toLowerCase().trim()).maybeSingle();
  return data;
}

async function expectedStaff() {
  const { data: empRows } = await db('employees').select('name, email, department');
  const { data: rosterRows } = await db('roster').select('email');
  const seen = {};
  const out = [];
  for (const e of (empRows || [])) {
    const em = String(e.email || '').trim().toLowerCase();
    if (!em || seen[em]) continue;
    seen[em] = 1;
    out.push({ name: e.name || '', email: em, department: e.department || '' });
  }
  for (const r of (rosterRows || [])) {
    const em = String(r.email || '').trim().toLowerCase();
    if (!em || seen[em]) continue;
    seen[em] = 1;
    out.push({ name: '', email: em });
  }
  return out;
}

/* ===================== AUDIT ===================== */

async function logAudit(email, reason, code) {
  if (!currentTenant()) return;
  const now = new Date();
  const tz = 'Africa/Accra';
  try {
    await db('audit').insert(withTenant({
      date: dateStr(now, tz),
      time: formatTime(now, tz),
      email: email || '',
      reason: reason || '',
      code: code || '',
    }));
  } catch (e) {}
}

/* ===================== QUOTAS ===================== */

async function writeBudget(key, limit, windowMs) {
  const now = Date.now();
  const { data } = await db('write_quotas').select('*').eq('key', key).maybeSingle();
  if (!data || (now - new Date(data.window_start).getTime()) > windowMs) {
    await db('write_quotas').upsert(withTenant({ key, count: 1, window_start: new Date().toISOString() }));
    return true;
  }
  if (data.count >= limit) return false;
  await db('write_quotas').update({ count: data.count + 1 }).eq('key', key);
  return true;
}

/* ===================== OTP / SESSIONS ===================== */

async function storeOtp(key, code, ttlMs) {
  await db('otp_store').upsert(withTenant({
    key,
    value: { code, tries: 0 },
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  }));
}

async function verifyOtp(key, attempt) {
  const { data } = await db('otp_store').select('*').eq('key', key).maybeSingle();
  if (!data) return false;
  if (new Date(data.expires_at).getTime() < Date.now()) return false;
  if ((data.value.tries || 0) >= 5) return false;
  if (String(data.value.code) !== String(attempt).trim()) {
    await db('otp_store').update({ value: { ...data.value, tries: (data.value.tries || 0) + 1 } }).eq('key', key);
    return false;
  }
  await db('otp_store').delete().eq('key', key);
  return true;
}

async function createSession(type = 'admin', email = null) {
  const token = randomToken() + randomToken();
  await db('sessions').insert(withTenant({
    token,
    email,
    session_type: type,
    expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
  }));
  return token;
}

async function validSession(token) {
  if (!token) return false;
  const { data } = await db('sessions').select('token').eq('token', token).maybeSingle();
  return !!data;
}

async function validUserSession(email, token) {
  if (!email || !token) return false;
  const { data } = await db('sessions').select('token, email').eq('token', token).maybeSingle();
  return !!data && String(data.email).toLowerCase() === String(email).trim().toLowerCase();
}

async function ownsEmail(email, token) {
  if (await validUserSession(email, token)) return true;
  return await validSession(token);
}

/* ===================== PIN GUARD ===================== */

async function pinCheck(payload, cfg) {
  const pin = String(payload.pin || '').trim();
  const guardKey = 'pinlock';
  const { data } = await db('otp_store').select('*').eq('key', guardKey).maybeSingle();
  let state = { count: 0, until: 0 };
  if (data) state = { count: data.value.count || 0, until: data.value.until || 0 };

  if (Date.now() < state.until) {
    const remain = Math.ceil((state.until - Date.now()) / 60000);
    return { ok: false, message: 'Too many failed attempts. Try again in ' + remain + ' min.' };
  }

  if (pin !== cfg.adminPin) {
    state.count = (state.count || 0) + 1;
    await logAudit('', 'Invalid admin PIN attempt', 'BAD_PIN');
    if (state.count >= cfg.pinMaxAttempts) {
      state.count = 0;
      state.until = Date.now() + cfg.pinLockoutMs;
    }
    await db('otp_store').upsert(withTenant({
      key: guardKey,
      value: state,
      expires_at: new Date(Date.now() + cfg.pinLockoutMs).toISOString(),
    }));
    if (state.until > Date.now()) {
      return { ok: false, message: 'Too many failed attempts. Admin locked for ' + Math.ceil(cfg.pinLockoutMs / 60000) + ' minutes.' };
    }
    return { ok: false, message: 'Invalid PIN (' + state.count + '/' + cfg.pinMaxAttempts + ' attempts).' };
  }
  await db('otp_store').delete().eq('key', guardKey);
  return { ok: true };
}

/* ===================== EMAIL ===================== */

async function sendEmail(to, subject, body) {
  if (!resend) {
    console.log('[EMAIL] (no provider) To:', to, 'Subject:', subject);
    return;
  }
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Attendance <noreply@attendance.app>',
      to,
      subject,
      text: body,
    });
  } catch (e) {
    console.error('Email send failed:', e.message);
  }
}

/* ===================== ADMIN ACCESS ===================== */

async function adminAccess(payload, cfg) {
  if (await validSession(String(payload.token || ''))) return { ok: true };

  const email = String(payload.email || '').trim().toLowerCase();
  const pin = String(payload.pin || '').trim();
  const otp = String(payload.otp || '').trim();

  if (email && otp) {
    const { data: admin } = await db('admins').select('email').eq('email', email).maybeSingle();
    if (admin) {
      if (!await verifyOtp('otp:admin:' + email, otp)) {
        await logAudit(email, 'Bad admin one-time code', 'BAD_OTP');
        return { ok: false, message: 'Invalid or expired one-time code.' };
      }
      await logAudit(email, 'Admin signed in (email 2FA)', 'ADMIN_2FA');
      return { ok: true, token: await createSession('admin', email) };
    }
  }

  if (!pin) return { ok: false, message: 'Admin login required.' };

  const auth = await pinCheck(payload, cfg);
  if (!auth.ok) return auth;

  if (!otp) {
    let otpEmail = cfg.adminEmail;
    const { data: admin } = otpEmail
      ? await db('admins').select('email').eq('email', otpEmail).maybeSingle()
      : { data: null };
    if (!otpEmail || !admin) {
      const { data: admins } = await db('admins').select('email').limit(1);
      if (admins && admins.length) otpEmail = admins[0].email;
    }
    if (!otpEmail) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await storeOtp('otp:admin:dev', code, 600000);
      return { ok: false, code: 'NEED_OTP', needOtp: true, otpDev: code, message: 'No admin email configured. Dev code shown.' };
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await storeOtp('otp:admin:' + otpEmail, code, 600000);
    await sendEmail(otpEmail, 'Your admin access code', 'Your one-time code is: ' + code + '\nValid for 10 minutes.');
    return { ok: false, needOtp: true, message: 'A one-time code was sent to ' + otpEmail + '.', email: otpEmail };
  }

  const otpEmail2 = cfg.adminEmail;
  const otpOk = (await verifyOtp('otp:admin:' + otpEmail2, otp)) || (await verifyOtp('otp:admin:dev', otp));
  if (!otpOk) {
    await logAudit('', 'Bad admin one-time code', 'BAD_OTP');
    return { ok: false, message: 'Invalid or expired one-time code.' };
  }
  await logAudit('', 'Admin signed in (PIN 2FA)', 'ADMIN_2FA');
  return { ok: true, token: await createSession('admin', email) };
}

/* ===================== IS ADMIN ===================== */

async function isAdmin(email) {
  if (!email) return false;
  const { data } = await db('admins').select('email').eq('email', email.toLowerCase().trim()).maybeSingle();
  return !!data;
}

/* ===================== LATE RESOLVER ===================== */

async function lateResolver(cfg) {
  const defSec = timeToSec(cfg.lateAfter || '');
  const { data } = await db('employees').select('email, shift_start');
  const map = {};
  if (data) {
    for (const row of data) {
      const e = String(row.email || '').trim().toLowerCase();
      const s = timeToSec(row.shift_start || '');
      if (e && s >= 0) map[e] = s;
    }
  }
  return (email) => {
    const k = String(email || '').toLowerCase();
    return map.hasOwnProperty(k) ? map[k] : defSec;
  };
}

/* ===================== COMPUTE REPORT ===================== */

function computeReport(rows, from, to, lateFor, tz) {
  const byKey = {};
  const order = [];

  for (const r of rows) {
    const d = cellDateStr(r.date || r[0], tz);
    if (d < from || d > to) continue;
    const email = String(r.email || r[3] || '').toLowerCase();
    if (!email) continue;
    const action = String(r.action || r[4] || '');
    const sec = timeToSec(cellTimeStr(r.time || r[1], tz));
    if (sec < 0) continue;
    const key = email + '|' + d;
    if (!byKey[key]) {
      byKey[key] = { email, name: r.name || r[2] || '', date: d, rows: [] };
      order.push(key);
    }
    byKey[key].rows.push({ time: cellTimeStr(r.time || r[1], tz), sec, action });
  }

  const pairs = [];
  let totalHours = 0, totalBreakMin = 0, lateCount = 0, missingOut = 0;
  const daySet = {}, emailSet = {};

  for (const k of order) {
    const rec = byKey[k];
    rec.rows.sort((a, b) => a.sec - b.sec);
    let open = null;

    for (const row of rec.rows) {
      const lateLimit = lateFor(rec.email);
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
        const netSec = Math.max(0, row.sec - open.sec - open.breakSec);
        const hours = Math.round((netSec / 3600) * 100) / 100;
        const breakMin = Math.round(open.breakSec / 60);
        if (open.late) lateCount++;
        totalHours += hours;
        totalBreakMin += breakMin;
        pairs.push({ date: rec.date, name: rec.name, email: rec.email, in: open.time, out: row.time, hours, late: open.late, missing: false, breakMin });
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
    pairs,
    summary: {
      totalHours: Math.round(totalHours * 100) / 100,
      totalBreakMin,
      daysPresent: Object.keys(daySet).length,
      lateCount,
      missingOut,
      people: Object.keys(emailSet).length,
    },
  };
}

function cellDateStr(cell, tz) {
  if (cell instanceof Date) return dateStr(cell, tz);
  const s = String(cell || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function cellTimeStr(cell, tz) {
  if (cell instanceof Date) return formatTime(cell, tz);
  const s = String(cell || '').trim();
  if (!s) return s;
  if (/^\d{1,2}:\d{2}$/.test(s)) return s + ':00';
  return s;
}

function daysOverlapCount(aFrom, aTo, bFrom, bTo, workingOnly) {
  const s = aFrom > bFrom ? aFrom : bFrom;
  const e = aTo < bTo ? aTo : bTo;
  if (e < s) return 0;
  const ms = new Date(e + 'T00:00:00Z') - new Date(s + 'T00:00:00Z');
  const total = Math.floor(ms / 86400000) + 1;
  if (!workingOnly) return total;
  let count = 0;
  for (let i = 0; i < total; i++) {
    const d = new Date(s + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) count++;
  }
  return count;
}

/* ===================== ROTATING QR ===================== */

async function rotatingSecret() {
  const { data } = await db('config').select('value').eq('key', 'qrSecret').maybeSingle();
  return data?.value || 'default';
}

function rotatingWindow(ms) {
  return Math.floor(ms / (ROT_INTERVAL_SEC * 1000));
}

async function rotatingCode(win) {
  const secret = await rotatingSecret();
  const crypto = await import('crypto');
  const sig = crypto.createHmac('sha256', 'ROT' + win).update(secret).digest();
  const v = ((sig[0] & 0x7f) << 24) | (sig[1] << 16) | (sig[2] << 8) | sig[3];
  const code = ((v % 1000000) + 1000000) % 1000000;
  return 'ROT-' + String(code).padStart(6, '0');
}

async function matchRotating(qr, nowMs) {
  if (!String(qr).startsWith('ROT-')) return false;
  const w = rotatingWindow(nowMs);
  for (let i = 1; i >= -1; i--) {
    if (qr === await rotatingCode(w + i)) return true;
  }
  return false;
}

/* ===================== LEAVE ===================== */

async function getLeavesInRange(from, to) {
  const { data } = await db('leave_requests').select('*');
  return (data || []).filter(l => {
    const start = sanitizeDate(l.start_date, '');
    const end = sanitizeDate(l.end_date, '');
    return l.email && start && end && end >= from && start <= to;
  }).map(l => ({
    email: l.email.toLowerCase(),
    start: sanitizeDate(l.start_date, ''),
    end: sanitizeDate(l.end_date, ''),
    reason: l.reason || '',
  }));
}

/* ===================== HOLIDAYS ===================== */

async function getHolidaysInRange(from, to) {
  const { data } = await db('holidays').select('*');
  return (data || [])
    .filter(h => {
      const d = sanitizeDate(h.date, '');
      return d && d >= from && d <= to;
    })
    .map(h => ({ date: sanitizeDate(h.date, ''), name: h.name || 'Holiday' }))
    .sort((a, b) => a.date < b.date ? -1 : 1);
}

/* ===================== ACTIONS ===================== */

async function actionConfig() {
  const cfg = await getConfig();
  const offices = await getOffices(cfg);
  return { ok: true, config: publicConfig(cfg, offices) };
}

async function actionAttendance(payload, cfg, now, tz) {
  const qr = String(payload.qr || '').trim();
  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const mode = String(payload.mode || 'scan').toLowerCase();

  if (!name || !email) return error('Name and email are required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('Invalid email address');

  const ts = Number(payload.ts);
  if (!isFinite(ts) || Math.abs(now.getTime() - ts) > cfg.replayMaxAgeMs) {
    await logAudit(email, 'Request expired (stale timestamp)', 'STALE');
    return error('Request expired. Please scan again.');
  }

  const offices = await getOffices(cfg);
  let office = null;
  if (mode !== 'break' && mode !== 'resume') {
    for (const o of offices) {
      if (String(o.qr_token) === qr) { office = o; break; }
    }
    if (!office && await matchRotating(qr, now.getTime())) {
      office = offices[0] || { name: cfg.officeName };
    }
    if (!office) {
      await logAudit(email, 'Invalid QR token', 'INVALID_QR');
      return error('Invalid QR code. This does not match an office code.');
    }
  }

  if (!await isEmailAllowed(email, cfg)) {
    await logAudit(email, 'Email not authorized by roster', 'ROSTER_DENIED');
    return error('Your email is not authorized for attendance. Contact your admin.');
  }

  const employee = await findEmployee(email);
  const displayName = employee && employee.name ? employee.name : name;

  const { data: todayRows } = await db('attendance')
    .select('*')
    .eq('email', email)
    .eq('date', dateStr(now, tz))
    .order('time', { ascending: false });

  const rows = (todayRows || []).map(r => ({
    action: r.action,
    sec: timeToSec(r.time),
    office: r.office || '',
  }));

  const lastAction = rows.length ? rows[0].action : null;
  const lastTimeSec = rows.length ? rows[0].sec : -1;
  const nowSec = timeToSec(formatTime(now, tz));
  const sinceLast = lastTimeSec >= 0 ? Math.abs(nowSec - lastTimeSec) : -1;

  if (sinceLast >= 0 && sinceLast < cfg.minScanIntervalSec) {
    await logAudit(email, 'Scan too soon after previous', 'TOO_QUICK');
    return { ok: false, code: 'TOO_QUICK', message: 'Please wait ' + Math.ceil(cfg.minScanIntervalSec - sinceLast) + 's before scanning again.' };
  }

  const stateOut = !lastAction || lastAction === 'Check-out';
  const stateBreak = lastAction === 'Break-out';
  const stateIn = lastAction === 'Check-in' || lastAction === 'Break-in';

  let action, status;
  if (mode === 'break' || mode === 'resume') {
    if (mode === 'break') {
      if (!stateIn) return error(stateOut ? 'You are not checked in yet.' : 'You are already on a break.');
      action = 'Break-out'; status = 'On-break';
    } else {
      if (!stateBreak) return error('There is no break to resume.');
      action = 'Break-in'; status = 'On-site';
    }
  } else {
    if (stateOut) { action = 'Check-in'; status = 'On-site'; }
    else if (stateBreak) { action = 'Break-in'; status = 'On-site'; }
    else { action = 'Check-out'; status = 'On-site'; }
  }

  if (!office) {
    office = { name: (rows[0] && rows[0].office) || cfg.officeName || '' };
  }

  let isLate = false;
  if (action === 'Check-in') {
    const lateFor = await lateResolver(cfg);
    const cutoffSec = lateFor(email);
    isLate = cutoffSec >= 0 && nowSec > cutoffSec;
  }

  let selfieFileId = '';
  const photo = String(payload.photoDataUrl || '');
  if (action === 'Check-in' && photo && photo.startsWith('data:image/jpeg;base64,')) {
    selfieFileId = photo.slice(0, SELFIE_MAX_BYTES);
  }
  if (action === 'Check-in' && cfg.selfieMode === 'required' && !selfieFileId) {
    if (!photo) return { ok: false, code: 'SELFIE_REQUIRED', message: 'Un selfie est requis pour pointer l\'entree.' };
  }

  if (!await writeBudget('attq:' + email, cfg.writeQuotaPerEmail, 3600000)) {
    await logAudit(email, 'Hourly write quota hit (email)', 'QUOTA_EMAIL');
    return error('Too many check-ins this hour. Try again later.');
  }
  if (!await writeBudget('attq:tenant', cfg.writeQuotaTenant, 3600000)) {
    await logAudit(email, 'Hourly write quota hit (tenant)', 'QUOTA_TENANT');
    return error('Office is very busy right now. Try again in a few minutes.');
  }

  await db('attendance').insert(withTenant({
    date: dateStr(now, tz),
    time: formatTime(now, tz),
    name: safeCell(displayName),
    email,
    action,
    status,
    qr_token: qr,
    office: office.name || '',
    selfie: selfieFileId,
  }));

  const breakMinutes = computeBreakMinutes(rows.concat([{ action, sec: nowSec }]));

  return {
    ok: true,
    action,
    date: dateStr(now, tz),
    time: formatTime(now, tz),
    status,
    office: office.name || '',
    late: isLate,
    selfieSaved: !!selfieFileId,
    breakMinToday: breakMinutes,
  };
}

function computeBreakMinutes(rows) {
  const sorted = [...rows].sort((a, b) => a.sec - b.sec);
  let open = -1, total = 0;
  for (const r of sorted) {
    if (r.action === 'Break-out') open = r.sec;
    else if (r.action === 'Break-in' && open >= 0) {
      total += Math.max(0, r.sec - open);
      open = -1;
    }
  }
  return Math.round(total / 60);
}

async function isEmailAllowed(email, cfg) {
  const mode = String(cfg.rosterMode || 'open');
  if (mode === 'open') return true;
  if (mode === 'domain') {
    const at = email.indexOf('@');
    if (at === -1) return false;
    return email.slice(at + 1).toLowerCase() === String(cfg.rosterDomain || '').toLowerCase();
  }
  if (mode === 'roster') {
    const { data } = await db('roster').select('email').eq('email', email.toLowerCase()).maybeSingle();
    if (data) return true;
    const emp = await findEmployee(email);
    return !!emp;
  }
  return true;
}

async function actionAdmin(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) {
    if (access.needOtp) return { ok: false, code: 'NEED_OTP', needOtp: true, otpDev: access.otpDev, message: access.message };
    return error(access.message);
  }

  const today = dateStr(now, tz);
  const from = sanitizeDate(payload.from, today);
  const to = sanitizeDate(payload.to, today);

  const { data: attData } = await db('attendance').select('*').gte('date', from).lte('date', to).order('time', { ascending: true });

  const onSite = {}, onBreakSet = {}, checkedInSet = {};
  let checkedInToday = 0, checkedOutToday = 0;

  for (const r of (attData || [])) {
    const d = cellDateStr(r.date, tz);
    const email = String(r.email || '').toLowerCase();
    const action = String(r.action || '');
    if (d === today) {
      if (action === 'Check-in') { checkedInToday++; checkedInSet[email] = 1; onSite[email] = r.name || ''; }
      else if (action === 'Check-out') { checkedOutToday++; delete onSite[email]; delete onBreakSet[email]; }
      else if (action === 'Break-out') onBreakSet[email] = r.name || '';
      else if (action === 'Break-in') delete onBreakSet[email];
    }
  }

  const onSiteNames = Object.values(onSite).sort();
  const onBreakNames = Object.values(onBreakSet).sort();

  const leaves = await getLeavesInRange(from, to);
  const holidays = await getHolidaysInRange(from, to);
  const holidayDates = {};
  for (const h of holidays) holidayDates[h.date] = h.name;

  const isHolidayToday = !!holidayDates[today];
  const weekendToday = cfg.weekendsOff && isWeekend(today);
  const staff = await expectedStaff();

  const absent = [];
  if (!isHolidayToday && !weekendToday) {
    for (const s of staff) {
      if (checkedInSet[s.email]) continue;
      if (leaves.some(l => l.email === s.email && today >= l.start && today <= l.end)) continue;
      absent.push(s);
    }
  }

  const lateFor = await lateResolver(cfg);
  const report = computeReport(attData || [], from, to, lateFor, tz);
  const people = aggregatePeople(report.pairs, staff, onSite, checkedInSet, onBreakSet);

  for (const person of people) {
    person.leaveDays = 0;
    for (const lv of leaves) {
      if (lv.email !== person.email) continue;
      person.leaveDays += daysOverlapCount(from, to, lv.start, lv.end, cfg.weekendsOff);
    }
    if (!person.statusToday && leaves.some(l => l.email === person.email && today >= l.start && today <= l.end)) {
      person.statusToday = 'leave';
    }
  }

  const { data: adminRows } = await db('admins').select('*');
  const admins = (adminRows || []).map(a => ({ email: a.email, name: a.name || '', addedOn: a.added_on || '', addedBy: a.added_by || '' }));

  return {
    ok: true,
    sessionToken: access.token,
    admin: {
      appName: cfg.appName,
      today,
      range: { from, to },
      live: {
        checkedInToday, checkedOutToday,
        onSite: onSiteNames.length, onSiteNames, onBreakNames,
        isHolidayToday, holidayToday: holidayDates[today] || '',
        isWeekendToday: weekendToday, absent,
      },
      summary: report.summary,
      pairs: report.pairs,
      people,
      admins,
      leaves,
      holidays,
    },
  };
}

function aggregatePeople(pairs, staff, onSite, checkedInSet, onBreakSet) {
  const byEmail = {};
  const order = [];

  function ensure(email, name, department) {
    const key = String(email || '').toLowerCase();
    if (!key) return null;
    if (!byEmail[key]) {
      byEmail[key] = { email: key, name: '', department: '', daysPresent: 0, totalHours: 0, avgHours: null, lateCount: 0, missingOut: 0, firstIn: '', lastOut: '', lastDate: '', statusToday: '' };
      order.push(key);
    }
    if (name && !byEmail[key].name) byEmail[key].name = String(name);
    if (department && !byEmail[key].department) byEmail[key].department = String(department);
    return byEmail[key];
  }

  for (const st of staff) {
    const person = ensure(st.email, st.name, st.department || '');
    if (person && !person.statusToday) person.statusToday = 'absent';
  }

  for (const rec of pairs) {
    const person = ensure(rec.email, rec.name, '');
    if (!person) continue;
    person.daysPresent++;
    person.totalHours += (rec.hours != null && !isNaN(rec.hours)) ? rec.hours : 0;
    if (rec.late) person.lateCount++;
    if (rec.missing) person.missingOut++;
    if (!person.lastDate || rec.date > person.lastDate) {
      person.lastDate = rec.date;
      person.firstIn = rec.in || '';
      person.lastOut = rec.out || '';
    }
  }

  const out = [];
  for (const key of order) {
    const person = byEmail[key];
    if (onSite[key]) person.statusToday = (onBreakSet && onBreakSet[key]) ? 'break' : 'onsite';
    else if (checkedInSet[key]) person.statusToday = 'out';
    person.totalHours = Math.round(person.totalHours * 100) / 100;
    person.avgHours = person.daysPresent ? Math.round((person.totalHours / person.daysPresent) * 100) / 100 : null;
    out.push(person);
  }
  out.sort((a, b) => {
    const an = String(a.name || a.email).toLowerCase();
    const bn = String(b.name || b.email).toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.totalHours === b.totalHours ? 0 : (a.totalHours > b.totalHours ? -1 : 1);
  });
  return out;
}

async function actionMyAttendance(payload, cfg, now, tz) {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('Email required');
  if (!await ownsEmail(email, String(payload.token || ''))) return { ok: false, code: 'SESSION_REQUIRED', message: 'Session expired. Please sign in again.' };

  const today = dateStr(now, tz);
  const from = sanitizeDate(payload.from, today.slice(0, 7) + '-01');
  const to = sanitizeDate(payload.to, today);

  const { data } = await db('attendance').select('*').eq('email', email).gte('date', from).lte('date', to);
  const lateFor = await lateResolver(cfg);
  const report = computeReport(data || [], from, to, lateFor, tz);

  return {
    ok: true,
    attendance: { range: { from, to }, summary: report.summary, pairs: report.pairs },
  };
}

async function actionRecent(payload, cfg, now, tz) {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!await ownsEmail(email, String(payload.token || ''))) return { ok: false, code: 'SESSION_REQUIRED', message: 'Session expired.' };

  const { data } = await db('attendance')
    .select('date, time, action, office')
    .eq('email', email)
    .order('date', { ascending: false })
    .order('time', { ascending: false })
    .limit(5);

  return { ok: true, recent: (data || []).map(r => ({ date: r.date, time: r.time, action: r.action, office: r.office || '' })) };
}

async function actionWeek(payload, cfg, now, tz) {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!await ownsEmail(email, String(payload.token || ''))) return { ok: false, code: 'SESSION_REQUIRED', message: 'Session expired.' };

  const fromDate = new Date(now.getTime() - 6 * 86400000);
  const from = dateStr(fromDate, tz);
  const to = dateStr(now, tz);

  const { data } = await db('attendance').select('*').eq('email', email).gte('date', from).lte('date', to);
  const lateFor = await lateResolver(cfg);
  const report = computeReport(data || [], from, to, lateFor, tz);

  const byDate = {};
  for (const p of report.pairs) byDate[p.date] = (byDate[p.date] || 0) + (p.hours || 0);

  const days = [];
  for (let k = 0; k < 7; k++) {
    const ds = dateStr(new Date(fromDate.getTime() + k * 86400000), tz);
    days.push({ date: ds, hours: Math.round((byDate[ds] || 0) * 100) / 100, working: !(cfg.weekendsOff && isWeekend(ds)) });
  }

  const emp = await findEmployee(email);
  let shift = {};
  if (emp && (emp.shift_start || emp.shift_end)) shift = { start: emp.shift_start, end: emp.shift_end };

  return { ok: true, week: days, shift };
}

async function actionEmployees(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);

  const { data } = await db('employees').select('*').order('name');
  const list = (data || []).map(r => ({
    name: r.name || '',
    email: (r.email || '').toLowerCase(),
    department: r.department || '',
    created: r.created || '',
    shiftStart: r.shift_start || '',
    shiftEnd: r.shift_end || '',
    role: r.role || '',
    phone: r.phone || '',
    birth: r.birth_date || '',
    photo: r.photo || '',
    code: r.code || '',
  }));
  return { ok: true, employees: list };
}

async function actionEmployeeAdd(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);

  const name = safeCell(String(payload.name || '').trim());
  const email = String(payload.email || '').trim().toLowerCase();
  const department = safeCell(String(payload.department || '').trim());
  if (!name || !email) return error('Name and email are required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('Invalid email address');
  const shiftStart = normShiftTime(payload.shiftStart);
  const shiftEnd = normShiftTime(payload.shiftEnd);
  const code = String(payload.code || '').trim();
  if (code && !/^\d{6}$/.test(code)) return error('Code must be exactly 6 digits.');

  const { data: existing } = await db('employees').select('*').eq('email', email).maybeSingle();
  if (!existing) {
    const { count: empCount } = await db('employees').select('*', { count: 'exact', head: true });
    if (empCount >= planLimit('employees')) return error('Your plan allows up to ' + planLimit('employees') + ' employees. Upgrade to add more.');
  }
  if (existing) {
    const update = {
      name, department, role: safeCell(String(payload.role || '').trim()),
      phone: safeCell(String(payload.phone || '').trim()),
      birth_date: String(payload.birth || '').trim() || null,
      photo: String(payload.photo || '').trim().slice(0, 60000),
    };
    if (shiftStart) update.shift_start = shiftStart + ':00';
    if (shiftEnd) update.shift_end = shiftEnd + ':00';
    if (code && code !== existing.code) {
      const { data: used } = await db('employees').select('code');
      if (used && used.some(u => u.code === code)) return error('This code is already used by another employee.');
      update.code = code;
    }
    await db('employees').update(update).eq('email', email);
    return { ok: true, employee: { name, email, department } };
  }

  let empCode = code;
  if (!empCode) {
    const { data: allCodes } = await db('employees').select('code');
    const used = new Set((allCodes || []).map(c => c.code).filter(Boolean));
    do { empCode = String(Math.floor(100000 + Math.random() * 900000)); } while (used.has(empCode));
  }

  await db('employees').insert(withTenant({
    name, email, department, code: empCode,
    shift_start: shiftStart ? shiftStart + ':00' : null,
    shift_end: shiftEnd ? shiftEnd + ':00' : null,
    role: safeCell(String(payload.role || '').trim()),
    phone: safeCell(String(payload.phone || '').trim()),
    birth_date: String(payload.birth || '').trim() || null,
    photo: String(payload.photo || '').trim().slice(0, 60000),
  }));
  return { ok: true, employee: { name, email, department, code: empCode } };
}

async function actionEmployeeDelete(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) return error('Email required');
  const { data } = await db('employees').select('email').eq('email', email).maybeSingle();
  if (!data) return error('Employee not found: ' + email);
  await db('employees').delete().eq('email', email);
  return { ok: true, deleted: email };
}

async function actionAdminLogin(payload, cfg, now, tz) {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) return error('Email required');
  if (!await isAdmin(email)) {
    await logAudit(email, 'Admin login attempt by non-admin', 'NOT_ADMIN');
    return error('This email does not have admin access.');
  }

  const otp = String(payload.otp || '').trim();
  if (otp) {
    if (!await verifyOtp('otp:admin:' + email, otp)) {
      await logAudit(email, 'Bad admin OTP', 'BAD_OTP');
      return error('Invalid or expired one-time code.');
    }
    await logAudit(email, 'Admin signed in (email 2FA)', 'ADMIN_2FA');
    return { ok: true, token: await createSession('admin', email) };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await storeOtp('otp:admin:' + email, code, 600000);
  if (resend) {
    await sendEmail(email, 'Your admin access code', 'Your one-time code is: ' + code + '\nValid for 10 minutes.');
  } else {
    console.log('[DEV] Admin OTP for ' + email + ': ' + code);
  }
  return {
    ok: true,
    needOtp: true,
    message: 'A one-time code was sent to ' + email + '.',
    email,
    otpDev: resend ? undefined : code,
  };
}

async function actionAdminCheck(payload) {
  const email = String(payload.email || '').trim().toLowerCase();
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  return { ok: true, isAdmin: valid && await isAdmin(email) };
}

async function actionAdminsList(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  const { data } = await db('admins').select('*');
  return { ok: true, admins: (data || []).map(a => ({ email: a.email, name: a.name || '', addedOn: a.added_on || '', addedBy: a.added_by || '' })) };
}

async function actionAdminAdd(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  const email = String(payload.email || '').trim().toLowerCase();
  const name = String(payload.name || '').trim();
  if (!email) return error('Email required');
  if (await isAdmin(email)) return { ok: true, message: email + ' is already an admin.' };
  await db('admins').insert(withTenant({ email, name, added_on: dateStr(now, 'Africa/Accra'), added_by: safeCell(String(payload.adminEmail || 'admin')) }));
  await logAudit(String(payload.adminEmail || 'admin'), 'Added admin: ' + email, 'ADMIN_ADDED');
  return { ok: true, admin: { email, name } };
}

async function actionAdminRemove(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) return error('Email required');
  const { data } = await db('admins').select('email').eq('email', email).maybeSingle();
  if (!data) return error('Admin not found: ' + email);
  await db('admins').delete().eq('email', email);
  await logAudit(String(payload.adminEmail || 'admin'), 'Removed admin: ' + email, 'ADMIN_REMOVED');
  return { ok: true, deleted: email };
}

async function actionUserLogin(payload, cfg, now, tz) {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) return error('Email required');
  if (!/^[^@\s]+@^@\s]+\.[^@\s]+$/.test(email)) return error('Invalid email address.');

  const code = String(payload.code || '').trim();
  const otp = String(payload.otp || '').trim();

  if (code) {
    if (!await isEmailAllowed(email, cfg)) {
      await logAudit(email, 'Sign-in blocked by roster', 'LOGIN_DENIED');
      return error('Your email is not authorized.');
    }
    const emp = await findEmployee(email);
    if (!emp || !emp.code) {
      await logAudit(email, 'No code configured', 'LOGIN_NO_CODE');
      return error('No code associated with this email.');
    }
    const cacheKey = 'codetry:' + email;
    const { data: attemptData } = await db('otp_store').select('*').eq('key', cacheKey).maybeSingle();
    if (attemptData && attemptData.value.locked_until && Date.now() < attemptData.value.locked_until) {
      return error('Too many failed attempts. Try again later.');
    }
    if (code !== emp.code) {
      const tries = (attemptData?.value.tries || 0) + 1;
      const val = tries >= 5 ? { tries: 0, locked_until: Date.now() + 900000 } : { tries };
      await db('otp_store').upsert(withTenant({ key: cacheKey, value: val, expires_at: new Date(Date.now() + 900000).toISOString() }));
      await logAudit(email, 'Bad fixed sign-in code', 'BAD_CODE');
      return error('Incorrect code.');
    }
    await db('otp_store').delete().eq('key', cacheKey);
    await logAudit(email, 'User signed in (fixed code)', 'USER_LOGIN');
    const adminFlag = await isAdmin(email);
    const sessionType = adminFlag ? 'admin' : 'user';
    return {
      ok: true,
      user: { name: emp.name || email.split('@')[0], email, tenant: String(payload.tenant || '').trim(), isAdmin: adminFlag },
      sessionToken: await createSession(sessionType, email),
    };
  }

  if (otp) {
    if (!await verifyOtp('otp:user:' + email, otp)) {
      await logAudit(email, 'Bad user OTP', 'BAD_OTP');
      return error('Invalid or expired code.');
    }
    const emp = await findEmployee(email);
    const name = (emp && emp.name) || email.split('@')[0];
    const adminFlag = await isAdmin(email);
    await logAudit(email, 'User signed in (email OTP)', 'USER_LOGIN');
    return {
      ok: true,
      user: { name, email, tenant: String(payload.tenant || '').trim(), isAdmin: adminFlag },
      sessionToken: await createSession(adminFlag ? 'admin' : 'user', email),
    };
  }

  if (!await isEmailAllowed(email, cfg)) {
    await logAudit(email, 'Sign-in blocked by roster', 'LOGIN_DENIED');
    return error('Your email is not authorized.');
  }

  const otpCode = String(Math.floor(100000 + Math.random() * 900000));
  await storeOtp('otp:user:' + email, otpCode, 600000);
  await sendEmail(email, 'Your attendance sign-in code', 'Your one-time sign-in code is: ' + otpCode + '\nValid for 10 minutes.');
  return { ok: true, needOtp: true, message: 'A code was sent to ' + email + '.', email };
}

async function actionLeaveList(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  return { ok: true, leaves: await getLeavesInRange('0000-01-01', '9999-12-31') };
}

async function actionLeaveAdd(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  const email = String(payload.email || '').trim().toLowerCase();
  const start = sanitizeDate(payload.start, '');
  const end = sanitizeDate(payload.end, start);
  const reason = safeCell(String(payload.reason || '').trim());
  if (!start || !end) return error('Dates required (YYYY-MM-DD).');
  if (end < start) return error('End must be after start.');
  await db('leave_requests').insert(withTenant({ email, start_date: start, end_date: end, reason, created_by: safeCell(String(payload.adminEmail || 'admin')) }));
  await logAudit(String(payload.adminEmail || 'admin'), 'Leave added: ' + email + ' ' + start + '..' + end, 'LEAVE_ADDED');
  return { ok: true };
}

async function actionLeaveDelete(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  const idx = Number(payload.index);
  const { data } = await db('leave_requests').select('*').order('created');
  if (!data || idx < 1 || idx >= data.length) return error('Entry not found.');
  await db('leave_requests').delete().eq('id', data[idx].id);
  return { ok: true };
}

async function actionHolidayList(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  return { ok: true, holidays: await getHolidaysInRange('0000-01-01', '9999-12-31') };
}

async function actionHolidayAdd(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  const d = sanitizeDate(payload.date, '');
  const name = safeCell(String(payload.name || '').trim() || 'Holiday');
  if (!d) return error('Date required (YYYY-MM-DD).');
  const { data: existing } = await db('holidays').select('date').eq('date', d).maybeSingle();
  if (existing) return error('This date is already recorded.');
  await db('holidays').insert(withTenant({ date: d, name }));
  return { ok: true };
}

async function actionHolidayDelete(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  const idx = Number(payload.index);
  const { data } = await db('holidays').select('*').order('date');
  if (!data || idx < 1 || idx >= data.length) return error('Entry not found.');
  await db('holidays').delete().eq('id', data[idx].id);
  return { ok: true };
}

async function actionAnnouncements() {
  const { data } = await db('announcements').select('*');
  const out = (data || []).filter(a => a.title || a.body).map(a => ({
    title: a.title || '', body: a.body || '', postedOn: a.posted_on || '', postedBy: a.posted_by || '', pinned: !!a.pinned,
  }));
  out.sort((a, b) => { if (a.pinned !== b.pinned) return a.pinned ? -1 : 1; return (b.postedOn || '').localeCompare(a.postedOn || ''); });
  return { ok: true, announcements: out };
}

async function actionAnnouncementAdd(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  const title = safeCell(String(payload.title || '').trim());
  const body = safeCell(String(payload.body || '').trim());
  if (!title && !body) return error('Title or body required.');
  await db('announcements').insert(withTenant({
    title, body, posted_on: dateStr(now, 'Africa/Accra'),
    posted_by: safeCell(String(payload.adminEmail || 'admin')),
    pinned: String(payload.pinned) === 'true',
  }));
  return { ok: true };
}

async function actionAnnouncementDelete(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  const idx = Number(payload.index);
  const { data } = await db('announcements').select('*').order('posted_on');
  if (!data || idx < 1 || idx >= data.length) return error('Announcement not found.');
  await db('announcements').delete().eq('id', data[idx].id);
  return { ok: true };
}

async function actionOfficeScreen(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  const ms = now.getTime();
  const win = rotatingWindow(ms);
  return {
    ok: true,
    screen: {
      token: await rotatingCode(win),
      nextToken: await rotatingCode(win + 1),
      intervalSec: ROT_INTERVAL_SEC,
      secondsLeft: Math.ceil((win + 1) * ROT_INTERVAL_SEC * 1000 - ms),
      appName: cfg.appName,
      serverTime: formatTime(now, tz),
    },
  };
}

async function actionSendCodes(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  const staff = await expectedStaff();
  if (!staff.length) return error('No one in the roster yet.');

  const { data: empRows } = await db('employees').select('email, code, name');
  const codeByEmail = {};
  for (const e of (empRows || [])) {
    const em = String(e.email || '').toLowerCase();
    if (em && e.code) codeByEmail[em] = e.code;
  }

  let sent = 0;
  const failed = [];
  const appName = cfg.appName || 'Attendance';

  for (const s of staff) {
    const em = String(s.email || '').toLowerCase();
    if (!em || !codeByEmail[em]) { failed.push(em + ' (no code)'); continue; }
    const nm = s.name || em.split('@')[0];
    await sendEmail(em, 'Your ' + appName + ' sign-in code',
      'Hello ' + nm + ',\n\nYour personal sign-in code for ' + appName + ' is: ' + codeByEmail[em] + '\n\nKeep it private.');
    sent++;
  }
  return { ok: true, sent, total: staff.length, failed, message: sent + ' sign-in code(s) sent.' };
}

async function actionMyExport(payload, cfg, now, tz) {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!await ownsEmail(email, String(payload.token || ''))) return { ok: false, code: 'SESSION_REQUIRED', message: 'Session expired.' };
  const { data } = await db('attendance').select('*').eq('email', email).order('date');
  return {
    ok: true,
    rows: (data || []).map(r => ({
      date: r.date, time: r.time, name: r.name || '', action: r.action,
      status: r.status || '', distance: r.distance_meters || 0, office: r.office || '',
    })),
  };
}

async function actionCorrectionApply(payload, cfg, now, tz) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);
  const mode = String(payload.fixMode || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const date = sanitizeDate(payload.date, '');
  if (!email || !date) return error('Email and date required.');

  const { data: dayRows } = await db('attendance').select('*').eq('email', email).eq('date', date).order('time');

  if (mode === 'set_out') {
    const outT = normShiftTime(payload.out);
    if (!outT) return error('Invalid checkout time (HH:MM).');
    if (!dayRows || !dayRows.length) return error('No attendance this day.');
    const last = dayRows[dayRows.length - 1];
    if (last.action === 'Check-out') return error('Day already closed.');
    const outSec = timeToSec(outT);
    if (outSec <= timeToSec(last.time)) return error('Checkout must be after check-in.');
    await db('attendance').insert(withTenant({
      date, time: outT + ':00', name: last.name || email, email,
      action: 'Check-out', status: 'Corrected', qr_token: last.qr_token, office: last.office,
    }));
    return { ok: true, applied: 'Checkout ' + outT + ' added' };
  }

  if (mode === 'add_pair') {
    const inT = normShiftTime(payload.inTime);
    const outT = normShiftTime(payload.out);
    if (!inT || !outT) return error('Invalid times.');
    if (timeToSec(outT) <= timeToSec(inT)) return error('Checkout must be after check-in.');
    const officeName = dayRows && dayRows.length ? dayRows[dayRows.length - 1].office : '';
    await db('attendance').insert(withTenant([
      { date, time: inT + ':00', name: email, email, action: 'Check-in', status: 'Manual', office: officeName },
      { date, time: outT + ':00', name: email, email, action: 'Check-out', status: 'Manual', office: officeName },
    ]));
    return { ok: true, applied: 'Manual pair ' + inT + '-' + outT + ' added' };
  }

  if (mode === 'remove_last') {
    if (!dayRows || !dayRows.length) return error('No attendance this day.');
    const victim = dayRows[dayRows.length - 1];
    await db('attendance').delete().eq('id', victim.id);
    return { ok: true, applied: 'Last entry removed (' + victim.action + ' ' + (victim.time || '').slice(0, 5) + ')' };
  }

  return error('Unknown correction mode.');
}

async function actionEmployeeCodeResend(payload, cfg, now, tz) {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('Invalid email address.');
  const emp = await findEmployee(email);
  if (!emp) return error('No account found for this email.');
  if (!emp.code) return error('No sign-in code has been set for this account.');
  await sendEmail(email, 'Your ' + cfg.appName + ' sign-in code',
    'Hello ' + (emp.name || email.split('@')[0]) + ',\n\nYour personal sign-in code for ' + cfg.appName + ' is: ' + emp.code + '\n\nKeep it private.');
  await logAudit(email, 'Sign-in code resent', 'CODE_SENT');
  return { ok: true, message: 'Your sign-in code has been emailed to you.' };
}

/* ===================== ROUTER ===================== */

const MASTER_PIN = process.env.MASTER_PIN || '';
const PROVISION_DAILY_LIMIT = Number(process.env.PROVISION_DAILY_LIMIT || 50);

async function actionOrganization(payload, cfg) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);

  const { data: tenant } = await db('tenants').select('code, app_name, plan, status, created, pending_plan, stripe_customer_id').eq('id', currentTenant()).maybeSingle();
  if (!tenant) return error('Tenant not found.');

  const { count: empCount } = await db('employees').select('*', { count: 'exact', head: true }).limit(1);
  const offices = await getOffices(cfg);
  const limits = PLAN_LIMITS[tenant.plan] || PLAN_LIMITS.free;

  return {
    ok: true,
    org: {
      code: tenant.code,
      appName: tenant.app_name,
      plan: tenant.plan,
      pendingPlan: tenant.pending_plan || '',
      status: tenant.status,
      created: tenant.created || '',
      usage: {
        employees: empCount || 0,
        employeeLimit: limits.employees,
        offices: offices.length,
        officeLimit: limits.offices,
      },
      billing: {
        stripeConfigured: !!STRIPE_SECRET_KEY,
        upgrades: [
          { plan: 'starter', price: process.env.STRIPE_PRICE_STARTER || '' },
          { plan: 'pro', price: process.env.STRIPE_PRICE_PRO || '' },
        ],
      },
    },
  };
}

async function stripeCreateCheckout({ price, plan, tenantId, code, successUrl }) {
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    'metadata[tenant_id]': tenantId,
    'metadata[plan]': plan,
    'metadata[code]': code,
    success_url: successUrl,
  });
  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: (data.error && data.error.message) || 'Stripe error.' };
    return { ok: true, url: data.url, id: data.id };
  } catch (err) {
    return { ok: false, message: 'Could not reach Stripe: ' + err.message };
  }
}

async function actionPlanChange(payload, cfg) {
  const access = await adminAccess(payload, cfg);
  if (!access.ok) return error(access.message);

  const target = String(payload.plan || '').trim().toLowerCase();
  if (!PLAN_LIMITS[target]) return error('Unknown plan: ' + target);

  const { data: tenant } = await db('tenants').select('id, code, plan, pending_plan').eq('id', currentTenant()).maybeSingle();
  if (!tenant) return error('Tenant not found.');

  if (tenant.plan === target) {
    return { ok: true, plan: tenant.plan, message: 'This organisation is already on the ' + target + ' plan.' };
  }

  const price = process.env['STRIPE_PRICE_' + target.toUpperCase()];
  if (STRIPE_SECRET_KEY && price) {
    const session = await stripeCreateCheckout({
      price,
      plan: target,
      tenantId: tenant.id,
      code: tenant.code,
      successUrl: String(payload.successUrl || FRONTEND_URL + '/#/admin'),
    });
    if (!session.ok) return error(session.message);
    await db('tenants').update({ pending_plan: target }).eq('id', tenant.id);
    return { ok: true, checkoutUrl: session.url, pendingPlan: target, message: 'Checkout session created.' };
  }

  await db('tenants').update({ plan: target, pending_plan: null }).eq('id', tenant.id);
  await logAudit('', 'Plan changed to ' + target, 'PLAN_CHANGED');
  return { ok: true, plan: target, message: 'Plan mis a jour : ' + PLAN_NAMES[target] + '.' };
}

function verifyStripeSignature(header, rawBody) {
  if (!header || !rawBody) return false;
  const parts = {};
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx > 0) parts[part.slice(0, idx).trim()] = part.slice(idx + 1);
  }
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(parts.t + '.' + rawBody).digest('hex');
  const a = Buffer.from(parts.v1), b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function actionStripeWebhook(req, res) {
  try {
    const sig = req.headers['stripe-signature'] || '';
    if (STRIPE_WEBHOOK_SECRET && !verifyStripeSignature(sig, req.rawBody)) {
      return res.status(400).json({ error: 'Invalid signature.' });
    }
    const event = req.body;
    if (event && event.type === 'checkout.session.completed') {
      const s = event.data && event.data.object;
      const tenantId = (s && s.metadata && s.metadata.tenant_id) || '';
      const plan = (s && s.metadata && s.metadata.plan) || '';
      if (tenantId && plan) {
        await supabase.from('tenants').update({ plan, pending_plan: null, stripe_customer_id: s.customer || '' }).eq('id', tenantId);
      }
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function actionProvision(payload) {
  const code = String(payload.code || '').trim().toLowerCase();
  const appName = safeCell(String(payload.appName || payload.orgName || '').trim()).slice(0, 60);
  const adminEmail = String(payload.adminEmail || '').trim().toLowerCase();
  const masterPin = String(payload.masterPin || '');

  // If MASTER_PIN env is empty, self-serve signup is open (no key required).
  if (MASTER_PIN && masterPin !== MASTER_PIN) return error('Invalid provisioning key.');

  if (adminEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) return error('Invalid admin email address.');

  const { count: todayCount } = await supabase.from('tenants').select('*', { count: 'exact', head: true }).eq('created', dateStr(new Date(), 'Africa/Accra'));
  if (todayCount >= PROVISION_DAILY_LIMIT) return error('Too many organisations created today. Try again later.');
  if (!/^[a-z0-9][a-z0-9\-]{1,23}$/.test(code)) {
    return error('Organisation code must be 2-24 chars: lowercase letters, digits, or hyphens.');
  }
  if (!appName) return error('Organisation name is required.');

  const existing = await resolveTenant(code);
  if (existing) return error('That organisation code is already taken.');

  const adminPin = String(Math.floor(100000 + Math.random() * 900000));
  const qrSecret = randomToken() + randomToken() + randomToken();

  const { data: tenant, error: terr } = await supabase.from('tenants').insert({
    code,
    app_name: appName,
    status: 'active',
    plan: 'free',
    master_pin: adminPin,
  }).select('id, code, app_name').single();
  if (terr || !tenant) return error('Could not create the organisation. ' + (terr ? terr.message : ''));

  await supabase.from('config').insert([
    ...DEFAULT_CONFIG.map(([k, v]) => ({ tenant_id: tenant.id, key: k, value: v })),
    { tenant_id: tenant.id, key: 'adminPin', value: adminPin },
    { tenant_id: tenant.id, key: 'qrSecret', value: qrSecret },
    { tenant_id: tenant.id, key: 'appName', value: appName },
    { tenant_id: tenant.id, key: 'adminEmail', value: adminEmail },
  ]);

  if (adminEmail) {
    await supabase.from('admins').insert({ tenant_id: tenant.id, email: adminEmail, name: appName, added_by: 'provision' });
  }

  return {
    ok: true,
    tenant: { code: tenant.code, appName },
    adminPin,
    message: 'Organisation created. Share the code with your team and keep the admin PIN safe.',
  };
}

async function actionTenantCheck(payload) {
  const t = await resolveTenant(String(payload.tenant || '').trim());
  return { ok: true, exists: !!t, tenant: t ? { code: t.code, appName: t.app_name } : null };
}

function tenantRequired(res, tenant) {
  if (tenant.reason === 'no_tenant') return json(res, error('Organisation code required. Set it in the app or include "tenant" in the request.'));
  if (tenant.reason === 'unknown') return json(res, error('Unknown organisation code.'));
  if (tenant.status !== 'active') return json(res, error('This organisation is suspended.'));
  return false;
}

app.post('/api/stripe_webhook', async (req, res) => {
  return actionStripeWebhook(req, res);
});

app.post(['/api', '/'], async (req, res) => {
  try {
    const payload = req.body;
    const action = String(payload.action || 'config');
    const now = new Date();
    const tz = 'Africa/Accra';

    if (action === 'provision') return json(res, await actionProvision(payload));
    if (action === 'tenant_check') return json(res, await actionTenantCheck(payload));
    if (action === 'stripe_webhook') return actionStripeWebhook(req, res);

    const tenant = await effectiveTenant(payload);
    const blocked = tenantRequired(res, tenant);
    if (blocked) return blocked;

    return await ctxStore.run({ tenantId: tenant.id, plan: tenant.plan }, async () => {
      await ensureTenantConfig(tenant.id);
      const cfg = await getConfig();

      switch (action) {
        case 'config': return json(res, await actionConfig());
        case 'organization': return json(res, await actionOrganization(payload, cfg));
        case 'plan_change': return json(res, await actionPlanChange(payload, cfg));
        case 'attendance': return json(res, await actionAttendance(payload, cfg, now, tz));
        case 'admin': return json(res, await actionAdmin(payload, cfg, now, tz));
        case 'myattendance': return json(res, await actionMyAttendance(payload, cfg, now, tz));
        case 'recent': return json(res, await actionRecent(payload, cfg, now, tz));
        case 'week': return json(res, await actionWeek(payload, cfg, now, tz));
        case 'employees': return json(res, await actionEmployees(payload, cfg, now, tz));
        case 'employee_add': return json(res, await actionEmployeeAdd(payload, cfg, now, tz));
        case 'employee_delete': return json(res, await actionEmployeeDelete(payload, cfg, now, tz));
        case 'admin_login': return json(res, await actionAdminLogin(payload, cfg, now, tz));
        case 'admin_check': return json(res, await actionAdminCheck(payload));
        case 'admins_list': return json(res, await actionAdminsList(payload, cfg, now, tz));
        case 'admin_add': return json(res, await actionAdminAdd(payload, cfg, now, tz));
        case 'admin_remove': return json(res, await actionAdminRemove(payload, cfg, now, tz));
        case 'office_screen': return json(res, await actionOfficeScreen(payload, cfg, now, tz));
        case 'leave_list': return json(res, await actionLeaveList(payload, cfg, now, tz));
        case 'leave_add': return json(res, await actionLeaveAdd(payload, cfg, now, tz));
        case 'leave_delete': return json(res, await actionLeaveDelete(payload, cfg, now, tz));
        case 'holiday_list': return json(res, await actionHolidayList(payload, cfg, now, tz));
        case 'holiday_add': return json(res, await actionHolidayAdd(payload, cfg, now, tz));
        case 'holiday_delete': return json(res, await actionHolidayDelete(payload, cfg, now, tz));
        case 'announcements': return json(res, await actionAnnouncements());
        case 'announcement_list': return json(res, await actionAnnouncements());
        case 'announcement_add': return json(res, await actionAnnouncementAdd(payload, cfg, now, tz));
        case 'announcement_delete': return json(res, await actionAnnouncementDelete(payload, cfg, now, tz));
        case 'correction_apply': return json(res, await actionCorrectionApply(payload, cfg, now, tz));
        case 'send_codes': return json(res, await actionSendCodes(payload, cfg, now, tz));
        case 'user_login': return json(res, await actionUserLogin(payload, cfg, now, tz));
        case 'employee_code_resend': return json(res, await actionEmployeeCodeResend(payload, cfg, now, tz));
        case 'myexport': return json(res, await actionMyExport(payload, cfg, now, tz));
        default: return json(res, error('Unknown action: ' + action));
      }
    });
  } catch (err) {
    console.error('Server error:', err);
    return json(res, error('Server error: ' + err.message));
  }
});

app.get('/api', (req, res) => {
  res.json({ ok: true, message: 'Attendance API is running.' });
});

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Attendance API v2.0' });
});

export default app;

const _entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (_entry && import.meta.url === _entry) {
  app.listen(PORT, () => {
    console.log(`Attendance API running on port ${PORT}`);
  });
}
