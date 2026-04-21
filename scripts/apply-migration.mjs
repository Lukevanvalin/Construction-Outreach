// Apply a SQL migration file against the DATABASE_URL.
// Run with: node --env-file=.env.local scripts/apply-migration.mjs migrations/001_v2_schema.sql
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <path-to-sql>');
  process.exit(1);
}
const ddl = readFileSync(file, 'utf8');
const sql = neon(process.env.DATABASE_URL);

console.log(`Applying ${file} ...`);
// Neon's serverless driver supports multi-statement via sql.query() or template tag.
// Here we split on `;` at top-level to avoid transaction issues with DDL.
// Simpler: wrap in a single call via sql() tagged template over the whole file.
await sql.query(ddl);
console.log('Applied.');
