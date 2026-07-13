// Applies every .sql file in supabase/migrations, in filename order, against
// the Supabase Postgres database. Run with:
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

await client.connect();
try {
  for (const file of files) {
    const sql = readFileSync(new URL(file, dir), "utf8");
    console.log(`Applying ${file}...`);
    await client.query(sql);
    console.log(`  ok`);
  }
} finally {
  await client.end();
}
