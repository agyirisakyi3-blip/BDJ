/**
 * Data Migration Script: Google Sheets -> Supabase
 *
 * Prerequisites:
 *   1. Run the schema.sql in your Supabase SQL Editor first
 *   2. npm install googleapis @supabase/supabase-js dotenv
 *   3. Set up Google Sheets API credentials (see below)
 *   4. Create a .env file with SUPABASE_URL and SUPABASE_SERVICE_KEY
 *
 * Usage:
 *   node migrate.js
 *
 * Google Sheets API setup:
 *   - Go to https://console.cloud.google.com
 *   - Create a project or use existing
 *   - Enable "Google Sheets API"
 *   - Create credentials (Service Account)
 *   - Download the JSON key file as ./credentials.json
 *   - Share your Google Sheet with the service account email
 */

import 'dotenv/config';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

/* ===================== CONFIG ===================== */

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || 'YOUR_GOOGLE_SHEET_ID';
const TZ = 'Africa/Accra';

/* ===================== SETUP ===================== */

async function getGoogleSheets() {
  let auth;
  try {
    const creds = JSON.parse(readFileSync('./credentials.json', 'utf-8'));
    auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  } catch (e) {
    console.error('Missing ./credentials.json. Download from Google Cloud Console.');
    console.error('Guide: https://theoephraim.medium.com/google-sheets-api-using-node-js-80f54c42f5bd');
    process.exit(1);
  }
  return google.sheets({ version: 'v4', auth });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }
  return createClient(url, key);
}

/* ===================== HELPERS ===================== */

function cellToStr(cell) {
  if (cell === null || cell === undefined) return '';
  return String(cell).trim();
}

function cellToDate(cell) {
  if (!cell) return null;
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  const s = String(cell).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function cellToTime(cell) {
  if (!cell) return null;
  if (cell instanceof Date) {
    return String(cell.getUTCHours()).padStart(2, '0') + ':' +
           String(cell.getUTCMinutes()).padStart(2, '0') + ':' +
           String(cell.getUTCSeconds()).padStart(2, '0');
  }
  const s = String(cell).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return s.length === 5 ? s + ':00' : s;
  return null;
}

function lowerEmail(cell) {
  return String(cell || '').trim().toLowerCase();
}

/* ===================== SHEET READERS ===================== */

async function readSheet(sheets, sheetName) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: sheetName,
    });
    return res.data.values || [];
  } catch (e) {
    console.log(`  [skip] Sheet "${sheetName}" not found or empty`);
    return [];
  }
}

function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => String(h).trim().toLowerCase());
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cellToStr(row[i]); });
    return obj;
  });
}

/* ===================== MIGRATION ===================== */

async function migrate() {
  console.log('=== Attendance App: Google Sheets -> Supabase Migration ===\n');

  const sheets = await getGoogleSheets();
  const db = getSupabase();

  // Resolve target tenant (multi-tenant v2)
  const TENANT_CODE = (process.env.TENANT_CODE || '').trim().toLowerCase();
  if (!TENANT_CODE) {
    console.error('Missing TENANT_CODE. Set it in .env to the organisation code to migrate into.');
    console.error('Provision the tenant first via the API: POST /api { action: "provision", code, appName, masterPin }');
    process.exit(1);
  }
  const { data: tenantRow } = await db.from('tenants').select('id, code').eq('code', TENANT_CODE).maybeSingle();
  if (!tenantRow) {
    console.error('Tenant "' + TENANT_CODE + '" not found. Provision it first via the API.');
    process.exit(1);
  }
  const TENANT_ID = tenantRow.id;
  const t = (row) => ({ ...row, tenant_id: TENANT_ID });
  console.log('  -> Target tenant: ' + TENANT_CODE + ' (' + TENANT_ID + ')');

  // 1. Config
  console.log('1. Migrating Config...');
  const configRows = await readSheet(sheets, 'Config');
  if (configRows.length > 1) {
    const configs = [];
    for (let i = 1; i < configRows.length; i++) {
      const key = cellToStr(configRows[i][0]);
      const value = cellToStr(configRows[i][1]);
      if (key && value) configs.push(t({ key, value }));
    }
    if (configs.length) {
      await db.from('config').delete().eq('tenant_id', TENANT_ID);
      await db.from('config').insert(configs);
      console.log(`  -> ${configs.length} config values`);
    }
  }

  // 2. Employees
  console.log('2. Migrating Employees...');
  const empRows = rowsToObjects(await readSheet(sheets, 'Employees'));
  if (empRows.length) {
    const employees = empRows.filter(e => e.email).map(e => t({
      name: cellToStr(e.name),
      email: lowerEmail(e.email),
      department: cellToStr(e.department),
      created: cellToDate(e.created) || new Date().toISOString().slice(0, 10),
      shift_start: cellToTime(e.shiftstart),
      shift_end: cellToTime(e.shiftend),
      role: cellToStr(e.role),
      phone: cellToStr(e.phone),
      birth_date: cellToDate(e.birthdate),
      photo: cellToStr(e.photo).slice(0, 60000),
      code: cellToStr(e.code) || String(Math.floor(100000 + Math.random() * 900000)),
    }));
    await db.from('employees').delete().eq('tenant_id', TENANT_ID);
    // Insert in batches of 50
    for (let i = 0; i < employees.length; i += 50) {
      await db.from('employees').insert(employees.slice(i, i + 50));
    }
    console.log(`  -> ${employees.length} employees`);
  }

  // 3. Attendance
  console.log('3. Migrating Attendance...');
  const attRows = rowsToObjects(await readSheet(sheets, 'Attendance'));
  if (attRows.length) {
    const attendance = attRows.filter(a => a.email).map(a => t({
      date: cellToDate(a.date) || new Date().toISOString().slice(0, 10),
      time: cellToTime(a.time) || '00:00:00',
      name: cellToStr(a.name),
      email: lowerEmail(a.email),
      action: cellToStr(a.action),
      status: cellToStr(a.status),
      latitude: Number(a.latitude) || 0,
      longitude: Number(a.longitude) || 0,
      distance_meters: Number(a['distance(m)']) || 0,
      qr_token: cellToStr(a['qr token']),
      office: cellToStr(a.office),
      selfie: cellToStr(a.selfie).slice(0, 400000),
    }));
    // Batch insert (attendance can be large)
    for (let i = 0; i < attendance.length; i += 100) {
      await db.from('attendance').insert(attendance.slice(i, i + 100));
    }
    console.log(`  -> ${attendance.length} attendance records`);
  }

  // 4. Admins
  console.log('4. Migrating Admins...');
  const adminRows = rowsToObjects(await readSheet(sheets, 'Admins'));
  if (adminRows.length) {
    const admins = adminRows.filter(a => a.email).map(a => t({
      email: lowerEmail(a.email),
      name: cellToStr(a.name),
      added_on: cellToDate(a['added on']) || new Date().toISOString().slice(0, 10),
      added_by: cellToStr(a['added by']),
    }));
    await db.from('admins').delete().eq('tenant_id', TENANT_ID);
    await db.from('admins').insert(admins);
    console.log(`  -> ${admins.length} admins`);
  }

  // 5. Roster
  console.log('5. Migrating Roster...');
  const rosterRows = rowsToObjects(await readSheet(sheets, 'Roster'));
  if (rosterRows.length) {
    const roster = rosterRows.filter(r => r.email).map(r => t({ email: lowerEmail(r.email) }));
    await db.from('roster').delete().eq('tenant_id', TENANT_ID);
    await db.from('roster').insert(roster);
    console.log(`  -> ${roster.length} roster entries`);
  }

  // 6. Offices
  console.log('6. Migrating Offices...');
  const officeRows = rowsToObjects(await readSheet(sheets, 'Offices'));
  if (officeRows.length) {
    const offices = officeRows.filter(o => o['qr token']).map(o => t({
      name: cellToStr(o.name) || 'Office',
      qr_token: cellToStr(o['qr token']),
      latitude: Number(o.latitude) || 0,
      longitude: Number(o.longitude) || 0,
      radius_meters: Number(o['radius (m)']) || 150,
    }));
    await db.from('offices').delete().eq('tenant_id', TENANT_ID);
    await db.from('offices').insert(offices);
    console.log(`  -> ${offices.length} offices`);
  }

  // 7. Audit
  console.log('7. Migrating Audit...');
  const auditRows = rowsToObjects(await readSheet(sheets, 'Audit'));
  if (auditRows.length) {
    const audit = auditRows.map(a => t({
      date: cellToDate(a.date),
      time: cellToTime(a.time),
      email: lowerEmail(a.email),
      reason: cellToStr(a.reason),
      code: cellToStr(a.code),
    }));
    for (let i = 0; i < audit.length; i += 100) {
      await db.from('audit').insert(audit.slice(i, i + 100));
    }
    console.log(`  -> ${audit.length} audit entries`);
  }

  // 8. Leave
  console.log('8. Migrating Leave...');
  const leaveRows = rowsToObjects(await readSheet(sheets, 'Leave'));
  if (leaveRows.length) {
    const leaves = leaveRows.filter(l => l.email).map(l => t({
      email: lowerEmail(l.email),
      start_date: cellToDate(l.startdate),
      end_date: cellToDate(l.enddate),
      reason: cellToStr(l.reason),
      created: cellToDate(l.created) || new Date().toISOString().slice(0, 10),
      created_by: cellToStr(l.createdby),
    }));
    await db.from('leave_requests').delete().eq('tenant_id', TENANT_ID);
    await db.from('leave_requests').insert(leaves);
    console.log(`  -> ${leaves.length} leave entries`);
  }

  // 9. Holidays
  console.log('9. Migrating Holidays...');
  const holidayRows = rowsToObjects(await readSheet(sheets, 'Holidays'));
  if (holidayRows.length) {
    const holidays = holidayRows.filter(h => h.date).map(h => t({
      date: cellToDate(h.date),
      name: cellToStr(h.name) || 'Holiday',
    }));
    await db.from('holidays').delete().eq('tenant_id', TENANT_ID);
    await db.from('holidays').insert(holidays);
    console.log(`  -> ${holidays.length} holidays`);
  }

  // 10. Announcements
  console.log('10. Migrating Announcements...');
  const annRows = rowsToObjects(await readSheet(sheets, 'Announcements'));
  if (annRows.length) {
    const announcements = annRows.filter(a => a.title || a.body).map(a => t({
      title: cellToStr(a.title),
      body: cellToStr(a.body),
      posted_on: cellToDate(a.postedon) || new Date().toISOString().slice(0, 10),
      posted_by: cellToStr(a.postedby),
      pinned: cellToStr(a.pinned) === 'true',
    }));
    await db.from('announcements').delete().eq('tenant_id', TENANT_ID);
    await db.from('announcements').insert(announcements);
    console.log(`  -> ${announcements.length} announcements`);
  }

  console.log('  -> Tenant code: ' + TENANT_CODE);
  console.log('\n=== Migration complete! ===');
  console.log('Next steps:');
  console.log('  1. Update frontend/src/config.js to point to your new API');
  console.log('  2. Deploy the backend (backend/server.js)');
  console.log('  3. Test all features');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
