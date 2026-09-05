// Applies supabase/schema.sql + supabase/rls_policies.sql to a remote Supabase
// Postgres instance using the database connection string.
//
// Usage:
//   Set DATABASE_URL in backend/.env (see .env.example), then:
//   npm run apply-schema
//
// The connection string can point at the Supabase pooler:
//   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Missing DATABASE_URL. Add it to backend/.env (see .env.example).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

const files = [resolve(__dirname, '../supabase/schema.sql'), resolve(__dirname, '../supabase/rls_policies.sql')];

async function run() {
  await client.connect();
  for (const file of files) {
    const sql = readFileSync(file, 'utf8');
    console.log('Applying', file.slice(file.indexOf('supabase')));
    await client.query(sql);
    console.log('  OK');
  }
  console.log('Schema applied successfully.');
  await client.end();
}

run().catch(async (e) => {
  console.error('Apply failed:', e.message);
  try { await client.end(); } catch {}
  process.exit(1);
});