-- Attendance App - Supabase Schema
-- Run this in: Supabase Dashboard > SQL Editor > New query

-- ===================== CONFIG =====================
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Default config values
INSERT INTO config (key, value) VALUES
  ('appName', 'Liste Des Presences'),
  ('officeName', 'Head Office'),
  ('officeLat', '5.6037168'),
  ('officeLng', '-0.1869644'),
  ('radiusMeters', '150'),
  ('adminPin', '1234'),
  ('adminEmail', ''),
  ('rosterMode', 'roster'),
  ('rosterDomain', ''),
  ('minScanIntervalSec', '60'),
  ('replayMaxAgeMs', '300000'),
  ('pinMaxAttempts', '5'),
  ('pinLockoutMs', '900000'),
  ('writeQuotaPerEmail', '60'),
  ('writeQuotaTenant', '600'),
  ('retentionDays', '0'),
  ('lateAfter', '08:30'),
  ('selfieMode', 'off'),
  ('reminderCheckInAfter', ''),
  ('reminderCheckOutAfter', ''),
  ('weekendsOff', 'on');

-- ===================== EMPLOYEES =====================
CREATE TABLE employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT UNIQUE NOT NULL,
  department TEXT DEFAULT '',
  created DATE DEFAULT CURRENT_DATE,
  shift_start TIME,
  shift_end TIME,
  role TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  birth_date DATE,
  photo TEXT DEFAULT '',
  code TEXT UNIQUE
);

-- ===================== ATTENDANCE =====================
CREATE TABLE attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  time TIME NOT NULL,
  name TEXT DEFAULT '',
  email TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('Check-in', 'Check-out', 'Break-out', 'Break-in')),
  status TEXT DEFAULT '',
  latitude DOUBLE PRECISION DEFAULT 0,
  longitude DOUBLE PRECISION DEFAULT 0,
  distance_meters DOUBLE PRECISION DEFAULT 0,
  qr_token TEXT DEFAULT '',
  office TEXT DEFAULT '',
  selfie TEXT DEFAULT ''
);

CREATE INDEX idx_attendance_email_date ON attendance (email, date);
CREATE INDEX idx_attendance_date ON attendance (date);

-- ===================== ADMINS =====================
CREATE TABLE admins (
  email TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  added_on DATE DEFAULT CURRENT_DATE,
  added_by TEXT DEFAULT ''
);

-- ===================== ROSTER =====================
CREATE TABLE roster (
  email TEXT PRIMARY KEY
);

-- ===================== OFFICES =====================
CREATE TABLE offices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT DEFAULT 'Office',
  qr_token TEXT NOT NULL,
  latitude DOUBLE PRECISION DEFAULT 0,
  longitude DOUBLE PRECISION DEFAULT 0,
  radius_meters DOUBLE PRECISION DEFAULT 150
);

-- ===================== AUDIT =====================
CREATE TABLE audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE,
  time TIME,
  email TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  code TEXT DEFAULT ''
);

CREATE INDEX idx_audit_date ON audit (date);

-- ===================== LEAVE =====================
CREATE TABLE leave_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  reason TEXT DEFAULT '',
  created DATE DEFAULT CURRENT_DATE,
  created_by TEXT DEFAULT ''
);

-- ===================== HOLIDAYS =====================
CREATE TABLE holidays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  name TEXT DEFAULT 'Holiday'
);

-- ===================== ANNOUNCEMENTS =====================
CREATE TABLE announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT DEFAULT '',
  body TEXT DEFAULT '',
  posted_on DATE DEFAULT CURRENT_DATE,
  posted_by TEXT DEFAULT '',
  pinned BOOLEAN DEFAULT false
);

-- ===================== TENANTS =====================
CREATE TABLE tenants (
  code TEXT PRIMARY KEY,
  spreadsheet_id TEXT DEFAULT '',
  created DATE DEFAULT CURRENT_DATE
);

-- ===================== OTP STORE (replaces CacheService) =====================
CREATE TABLE otp_store (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_otp_key ON otp_store (key);

-- ===================== SESSIONS =====================
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  email TEXT,
  session_type TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- ===================== QUOTA TRACKER =====================
CREATE TABLE write_quotas (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== AUTO-CLEANUP FUNCTION =====================
-- Clean expired OTPs and sessions
CREATE OR REPLACE FUNCTION cleanup_expired()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_store WHERE expires_at < NOW();
  DELETE FROM sessions WHERE expires_at < NOW();
  DELETE FROM write_quotas WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;
