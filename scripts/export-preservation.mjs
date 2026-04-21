// One-off preservation export.
// Reads every row from the v1 tables and writes a single JSON file.
// Run with: node --env-file=.env.local scripts/export-preservation.mjs
import { neon } from '@neondatabase/serverless';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);

const prospects = await sql`SELECT * FROM prospects ORDER BY created_at ASC`;
const notes = await sql`SELECT * FROM interaction_notes ORDER BY created_at ASC`;
const transcripts = await sql`SELECT * FROM meeting_transcripts ORDER BY created_at ASC`;

const payload = {
  exported_at: new Date().toISOString(),
  source_db: 'neon construction-outreach',
  counts: {
    prospects: prospects.length,
    interaction_notes: notes.length,
    meeting_transcripts: transcripts.length,
  },
  prospects,
  interaction_notes: notes,
  meeting_transcripts: transcripts,
};

const out = join(__dirname, '..', 'data', `preservation-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(out, JSON.stringify(payload, null, 2));
console.log(`Wrote ${out}`);
console.log(`  prospects: ${prospects.length}`);
console.log(`  interaction_notes: ${notes.length}`);
console.log(`  meeting_transcripts: ${transcripts.length}`);
