-- ============================================================================
-- Attendance App - Multi-tenant Supabase Schema (v2)
-- ----------------------------------------------------------------------------
-- Every data table carries a tenant_id foreign key. Tenants (companies) are
-- isolated in a SINGLE shared Postgres database, with the tenant_id column
-- scoping every row. The API server resolves the tenant from the tenant code
-- sent in each request payload and filters every query by tenant_id.
--
-- Run this in: Supabase Dashboard > SQL Editor > New query
--
-- WARNING: the block below drops the previous (v1, single-tenant) tables so
-- the multi-tenant schema can be created from scratch. This wipes any trial
-- data left from the incomplete v2 migration.
-- ============================================================================

-- ===================== RESET (v1 -> v2) =====================
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS offices CASCADE;
DROP TABLE IF EXISTS roster CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS write_quotas CASCADE;
DROP TABLE IF EXISTS otp_store CASCADE;
DROP TABLE IF EXISTS audit CASCADE;
DROP TABLE IF EXISTS config CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- ===================== TENANTS =====================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9\-]{1,23}$'),
  app_name TEXT DEFAULT 'Liste Des Presences',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'trial')),
  plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'starter', 'pro')),
  master_pin TEXT DEFAULT '',
  max_employees INTEGER DEFAULT 25,
  max_offices INTEGER DEFAULT 1,
  created DATE DEFAULT CURRENT_DATE,
  created_by TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);

-- ===================== CONFIG =====================
CREATE TABLE IF NOT EXISTS config (
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

-- ===================== EMPLOYEES =====================
CREATE TABLE IF NOT EXISTS employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  department TEXT DEFAULT '',
  created DATE DEFAULT CURRENT_DATE,
  shift_start TIME,
  shift_end TIME,
  role TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  birth_date DATE,
  photo TEXT DEFAULT '',
  code TEXT,
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees (tenant_id);

-- ===================== ATTENDANCE =====================
CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_date ON attendance (tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_email_date ON attendance (tenant_id, email, date);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_date_time ON attendance (tenant_id, date, time);

-- ===================== ADMINS =====================
CREATE TABLE IF NOT EXISTS admins (
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT DEFAULT '',
  added_on DATE DEFAULT CURRENT_DATE,
  added_by TEXT DEFAULT '',
  PRIMARY KEY (tenant_id, email)
);

-- ===================== ROSTER =====================
CREATE TABLE IF NOT EXISTS roster (
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  PRIMARY KEY (tenant_id, email)
);

-- ===================== OFFICES =====================
CREATE TABLE IF NOT EXISTS offices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name TEXT DEFAULT 'Office',
  qr_token TEXT NOT NULL,
  latitude DOUBLE PRECISION DEFAULT 0,
  longitude DOUBLE PRECISION DEFAULT 0,
  radius_meters DOUBLE PRECISION DEFAULT 150
);
CREATE INDEX IF NOT EXISTS idx_offices_tenant ON offices (tenant_id);

-- ===================== AUDIT =====================
CREATE TABLE IF NOT EXISTS audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  date DATE,
  time TIME,
  email TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  code TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_date ON audit (tenant_id, date);

-- ===================== LEAVE =====================
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  reason TEXT DEFAULT '',
  created DATE DEFAULT CURRENT_DATE,
  created_by TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_leave_tenant ON leave_requests (tenant_id);

-- ===================== HOLIDAYS =====================
CREATE TABLE IF NOT EXISTS holidays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  date DATE NOT NULL,
  name TEXT DEFAULT 'Holiday',
  UNIQUE (tenant_id, date)
);
CREATE INDEX IF NOT EXISTS idx_holidays_tenant ON holidays (tenant_id);

-- ===================== ANNOUNCEMENTS =====================
CREATE TABLE IF NOT EXISTS announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  title TEXT DEFAULT '',
  body TEXT DEFAULT '',
  posted_on DATE DEFAULT CURRENT_DATE,
  posted_by TEXT DEFAULT '',
  pinned BOOLEAN DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant ON announcements (tenant_id);

-- ===================== OTP STORE (replaces CacheService) =====================
CREATE TABLE IF NOT EXISTS otp_store (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS idx_otp_tenant_key ON otp_store (tenant_id, key);

-- ===================== SESSIONS =====================
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email TEXT,
  session_type TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions (tenant_id);

-- ===================== QUOTA TRACKER =====================
CREATE TABLE IF NOT EXISTS write_quotas (
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, key)
);

-- ===================== AUTO-CLEANUP FUNCTION =====================
CREATE OR REPLACE FUNCTION cleanup_expired()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_store WHERE expires_at < NOW();
  DELETE FROM sessions WHERE expires_at < NOW();
  DELETE FROM write_quotas WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;
