// Apply a SQL migration file against the DATABASE_URL.
// Run with: node --env-file=.env.local scripts/apply-migration.mjs migrations/001_v2_schema.sql
//
// Uses Neon's WebSocket-backed Pool (not the HTTP `neon()` helper) because the
// HTTP helper rejects multi-statement queries and we need DO $$…$$ plpgsql blocks.
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { readFileSync } from 'node:fs';

neonConfig.webSocketConstructor = ws;

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <path-to-sql>');
  process.exit(1);
}
const ddl = readFileSync(file, 'utf8');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

console.log(`Applying ${file} ...`);
const client = await pool.connect();
try {
  await client.query(ddl);
  console.log('Applied.');
} finally {
  client.release();
  await pool.end();
}
