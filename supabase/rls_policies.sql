-- ============================================================================
-- Attendance App - Row Level Security (RLS) policies (v2, multi-tenant)
-- ----------------------------------------------------------------------------
-- The backend server.js uses the SERVICE_ROLE key, which BYPASSES RLS.
-- These policies are a defense-in-depth layer protecting data from direct
-- access with the anon key from the browser.
--
-- Strategy: the API server sets the GUC "app.tenant_id" on each request
-- (e.g. via supabase.rpc or by setting a role). Policies compare that value
-- with the row's tenant_id. All policies are tenant-scoped; each tenant can
-- only touch its own rows.
-- ============================================================================

-- ===================== TENANTS =====================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
-- Public: a tenant can only read its own row (needed for provisioning check).
CREATE POLICY "tenants select own" ON tenants
  FOR SELECT USING (
    id::text = current_setting('app.tenant_id', true)
  );

-- ===================== CONFIG =====================
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
-- Public read: only non-sensitive keys for the matching tenant.
CREATE POLICY "config select own tenant" ON config
  FOR SELECT USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND key NOT IN ('adminPin', 'masterPin', 'qrSecret')
  );

-- ===================== EMPLOYEES =====================
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
-- Employees can read their own record within the tenant.
CREATE POLICY "employees select own" ON employees
  FOR SELECT USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND email = auth.jwt() ->> 'email'
  );

-- ===================== ATTENDANCE =====================
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
-- Employees can read their own attendance within the tenant.
CREATE POLICY "attendance select own" ON attendance
  FOR SELECT USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND email = auth.jwt() ->> 'email'
  );

-- Employees can check themselves in/out within the tenant.
CREATE POLICY "attendance insert own" ON attendance
  FOR INSERT WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND email = auth.jwt() ->> 'email'
  );

-- ===================== ADMINS =====================
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
-- Only the matching tenant's admins rows are visible.
CREATE POLICY "admins select tenant" ON admins
  FOR SELECT USING (
    tenant_id::text = current_setting('app.tenant_id', true)
  );

-- ===================== ROSTER =====================
ALTER TABLE roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roster select tenant" ON roster
  FOR SELECT USING (
    tenant_id::text = current_setting('app.tenant_id', true)
  );

-- ===================== OFFICES =====================
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
-- Public read within the tenant (office info needed to scan).
CREATE POLICY "offices select tenant" ON offices
  FOR SELECT USING (
    tenant_id::text = current_setting('app.tenant_id', true)
  );

-- ===================== AUDIT =====================
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;
-- No public access. Only admin (service role) can read.

-- ===================== LEAVE =====================
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leave select own" ON leave_requests
  FOR SELECT USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND email = auth.jwt() ->> 'email'
  );

-- ===================== HOLIDAYS =====================
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holidays select tenant" ON holidays
  FOR SELECT USING (
    tenant_id::text = current_setting('app.tenant_id', true)
  );

-- ===================== ANNOUNCEMENTS =====================
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements select tenant" ON announcements
  FOR SELECT USING (
    tenant_id::text = current_setting('app.tenant_id', true)
  );

-- ===================== OTP STORE =====================
ALTER TABLE otp_store ENABLE ROW LEVEL SECURITY;
-- No public access. Internal only.

-- ===================== SESSIONS =====================
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
-- No public access. Internal only.

-- ===================== WRITE QUOTAS =====================
ALTER TABLE write_quotas ENABLE ROW LEVEL SECURITY;
-- No public access. Internal only.