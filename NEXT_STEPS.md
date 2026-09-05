# v2 Multi-tenant — deferred steps (do later)

Everything below is committed on branch `v2-supabase` (commit `4ca9876`, pushed to origin).

## 1. Apply schema to live Supabase
- Add DB password to `backend/.env`:
  ```
  DATABASE_URL=postgresql://postgres.<project-ref>:<DB-PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres
  ```
- Run from `backend/`:
  ```
  npm run apply-schema
  ```
- WARNING: `supabase/schema.sql` DROPs the old v1 tables (config, employees, attendance, ...) then creates the multi-tenant ones. Data is lost unless migrated first.

## 2. Smoke-test full flow
1. `node server.js` in `backend/` (MASTER_PIN empty = open signup).
2. Open web app frontend, click "Creer une organisation".
3. Sign up -> note org code + admin PIN.
4. Admin sign-in with the email from signup (dev OTP shown in server console when no email provider is set).
5. Sign out, log in as an employee with an added employee code.
6. Check attendance + admin dashboard data is scoped to only that org.

## 3. Deploy backend to Vercel
- Set env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `MASTER_PIN` (empty for open signup, or a key), `PROVISION_DAILY_LIMIT`.
- Point the frontend at the deployed API via `frontend/.env`:
  ```
  VITE_API_URL=https://<vercel>.vercel.app/api
  ```

## 4. Later phases (not started)
- Rotate the live `SUPABASE_SERVICE_KEY` before public launch (the .env is gitignored, but it exists).

## Done in code (not yet deployed live)
- Phase 3: billing tiers — `organization`/`plan_change` actions, Stripe Checkout + `stripe_webhook`, instant plan changes in dev mode, plan limits enforced on `employee_add`.
- Phase 4: tenant admin portal — "Mon organisation" view (org info, usage bars, plan cards) + org settings editor (`config_update` action) for name, office, radius, late-after, weekend rule, selfie mode, reminders.