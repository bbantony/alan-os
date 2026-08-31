// Applies every not-yet-applied .sql file in supabase/migrations, in filename
// order, against the Supabase Postgres database, tracking what's already run
// in a _migrations table so re-running this script is safe. Run with:
//   SUPABASE_DB_URL="postgresql://..." node scripts/run-migration.mjs
import { readdirSync, readFileSync } from "node:fs";
import { Client } from "pg";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("Set SUPABASE_DB_URL to the Supabase connection string first.");
  process.exit(1);
}

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
let sawWarning = false;

// Postgres NOTICE/WARNING output is discarded by node-pg unless something
// listens for it. Migration 0035 uses `raise warning` to say when it SKIPPED
// creating a unique index because duplicate rows already exist — without this
// handler the script printed a cheerful "ok" while the index silently was not
// created and nobody was told. A guarded migration whose guard is invisible is
// not a guard.
client.on("notice", (msg) => {
  const severity = msg.severity ?? "NOTICE";
  console.log(`  [${severity}] ${msg.message}`);
  if (severity === "WARNING") sawWarning = true;
});

await client.connect();
try {
  // RLS and the revoke are NOT optional and must happen in the same breath as
  // the create. This table lives in the PostgREST-exposed `public` schema, so
  // without them anyone holding the public anon key can delete rows from it —
  // and the next deploy then replays old migrations, one of which (0022)
  // contains an unconditional `delete from public.reminders`. It was the only
  // table in the app without RLS. Re-run safe: both statements are idempotent.
  await client.query(`
    create table if not exists public._migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
    alter table public._migrations enable row level security;
    revoke all on public._migrations from anon, authenticated;
  `);

  const { rows } = await client.query("select filename from public._migrations");
  const applied = new Set(rows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(new URL(file, dir), "utf8");
    console.log(`Applying ${file}...`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public._migrations (filename) values ($1)", [file]);
      await client.query("commit");
      console.log(`  ok`);
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  }
} finally {
  await client.end();
}

if (sawWarning) {
  console.log("");
  console.log("  ONE OR MORE WARNINGS ABOVE — something was skipped on purpose.");
  console.log("  Fix the data the warning names, then re-run THAT migration. Re-running");
  console.log("  this script is not enough on its own: applied files are skipped, so you");
  console.log("  must first remove its row, e.g.");
  console.log("");
  console.log("    delete from public._migrations where filename = '0035_close_audit_security_holes.sql';");
  console.log("");
}
