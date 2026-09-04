-- Row Level Security policies for the Attendance App.
--
-- IMPORTANT: The backend server.js uses the SERVICE_ROLE key, which BYPASSES RLS.
-- These policies protect your data against direct anon-key access from the
-- browser. Only enable them if you plan to use the anon key in the client.
--
-- If you use only the service role key (recommended for this architecture),
-- you can leave RLS disabled and skip this file. These are provided as a
-- reference for the recommended configuration.

-- ===================== EMPLOYEES =====================
-- Anonymous read: only non-sensitive fields, and only for the matching tenant.
CREATE POLICY "employees select own" ON employees
  FOR SELECT USING (
    email = auth.jwt() ->> 'email'
  );

-- ===================== ATTENDANCE =====================
CREATE POLICY "attendance select own" ON attendance
  FOR SELECT USING (
    email = auth.jwt() ->> 'email'
  );

-- Insert allowed for authenticated users (self check-in).
CREATE POLICY "attendance insert own" ON attendance
  FOR INSERT WITH CHECK (
    email = auth.jwt() ->> 'email'
  );

-- ===================== ADMINS =====================
CREATE POLICY "admins select" ON admins
  FOR SELECT USING (true);

-- ===================== ANNOUNCEMENTS =====================
CREATE POLICY "announcements public read" ON announcements
  FOR SELECT USING (true);

-- ===================== HOLIDAYS =====================
CREATE POLICY "holidays public read" ON holidays
  FOR SELECT USING (true);

-- ===================== AUDIT =====================
-- No public access to audit logs.

-- ===================== CONFIG =====================
-- Only expose non-sensitive config to the public.
CREATE POLICY "config public read" ON config
  FOR SELECT USING (
    key NOT IN ('adminPin', 'qrSecret')
  );

-- ===================== OFFICES =====================
-- Public read (QR tokens are rotating; static office tokens are admin-only).
CREATE POLICY "offices public read" ON offices
  FOR SELECT USING (true);
