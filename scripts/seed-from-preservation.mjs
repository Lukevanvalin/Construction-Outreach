// Seed the v2 schema from data/preservation-*.json.
// Run with: node --env-file=.env.local scripts/seed-from-preservation.mjs
//
// Rules:
//   - One `account` per unique `company` value.
//   - Primary domain inferred from the first contact's email at that company.
//   - One `contact` per prospect (source='preservation'), linked via primary_account_id + account_contacts.
//   - One `deal` per prospect, with stage mapped from the old v1 status.
//   - Each interaction_note → timeline_events (kind='note_added', source='manual').
//   - Each meeting_transcript → timeline_events (kind='meeting_held', source='bubbles').
//   - Stage mapping (v1 status → v2 deal_stage):
//       New Lead / Contacted          → Intro
//       Meeting Scheduled             → Discovery
//       Proposal Sent                 → Proposal
//       In Progress                   → Negotiation
//       Closed Won                    → (manual override via data/stage-overrides.json)
//       Closed Lost                   → Lost
//   - deal_type defaults to 'Build'; override via data/stage-overrides.json.

import { neon } from '@neondatabase/serverless';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

const latest = readdirSync(dataDir)
  .filter((f) => f.startsWith('preservation-') && f.endsWith('.json'))
  .sort()
  .pop();
if (!latest) {
  console.error('No preservation file found in data/');
  process.exit(1);
}
const payload = JSON.parse(readFileSync(join(dataDir, latest), 'utf8'));
console.log(`Seeding from ${latest}  (prospects=${payload.prospects.length}, notes=${payload.interaction_notes.length}, transcripts=${payload.meeting_transcripts.length})`);

// Optional manual overrides for prospects where auto-mapping would be wrong.
// Shape: { "<company_name>": { "stage": "Build", "type": "Workshop" } }
const overridesPath = join(dataDir, 'stage-overrides.json');
const OVERRIDES = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, 'utf8')) : {};

const STAGE_MAP = {
  'New Lead': 'Intro',
  Contacted: 'Intro',
  'Meeting Scheduled': 'Discovery',
  'Proposal Sent': 'Proposal',
  'In Progress': 'Negotiation',
  'Closed Won': 'Proposal Accepted', // fallback if no override
  'Closed Lost': 'Lost',
};

const sql = neon(process.env.DATABASE_URL);

// --- Group prospects by company so we can create one account per unique company.
const byCompany = new Map();
for (const p of payload.prospects) {
  const key = (p.company || 'Unknown').trim();
  if (!byCompany.has(key)) byCompany.set(key, []);
  byCompany.get(key).push(p);
}

const accountIdByCompany = new Map();
const contactIdByProspectId = new Map();
const dealIdByProspectId = new Map();

// --- Accounts + domains
for (const [company, prospects] of byCompany) {
  const firstEmail = prospects.find((p) => p.email)?.email || '';
  const domain = firstEmail.includes('@') ? firstEmail.split('@')[1].toLowerCase() : null;

  const [acc] = await sql`
    INSERT INTO accounts (name, primary_domain, status)
    VALUES (${company}, ${domain}, 'Active')
    RETURNING id
  `;
  accountIdByCompany.set(company, acc.id);

  if (domain) {
    await sql`
      INSERT INTO account_domains (account_id, domain) VALUES (${acc.id}, ${domain})
      ON CONFLICT DO NOTHING
    `;
  }
}
console.log(`  accounts: ${accountIdByCompany.size}`);

// --- Contacts (one per prospect)
for (const p of payload.prospects) {
  const accountId = accountIdByCompany.get((p.company || 'Unknown').trim());
  const [c] = await sql`
    INSERT INTO contacts (
      full_name, email, phone, primary_account_id, source, source_ref, first_seen_at, last_seen_at
    )
    VALUES (
      ${p.name || 'Unknown'},
      ${p.email || null},
      ${p.phone || null},
      ${accountId},
      'preservation',
      ${'preservation:prospect:' + p.id},
      ${p.created_at},
      ${p.updated_at}
    )
    ON CONFLICT (email) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      primary_account_id = COALESCE(contacts.primary_account_id, EXCLUDED.primary_account_id)
    RETURNING id
  `;
  contactIdByProspectId.set(p.id, c.id);
  await sql`
    INSERT INTO account_contacts (account_id, contact_id)
    VALUES (${accountId}, ${c.id})
    ON CONFLICT DO NOTHING
  `;
}
console.log(`  contacts: ${contactIdByProspectId.size}`);

// --- Deals (one per prospect)
for (const p of payload.prospects) {
  const company = (p.company || 'Unknown').trim();
  const accountId = accountIdByCompany.get(company);
  const override = OVERRIDES[company] || {};
  const stage = override.stage || STAGE_MAP[p.status] || 'Intro';
  const type = override.type || 'Build';
  const openedAt = p.introduction_date || p.created_at;
  const closedAt = stage === 'Lost' ? p.updated_at : null;
  const notes = [p.project_requirements, p.upcoming_meeting_notes].filter(Boolean).join('\n\n---\n\n');
  const [d] = await sql`
    INSERT INTO deals (account_id, name, stage, type, opened_at, closed_at, notes)
    VALUES (
      ${accountId},
      ${p.company + ' — ' + type + ' engagement'},
      ${stage}::deal_stage,
      ${type}::deal_type,
      ${openedAt},
      ${closedAt},
      ${notes}
    )
    RETURNING id
  `;
  dealIdByProspectId.set(p.id, d.id);
}
console.log(`  deals: ${dealIdByProspectId.size}`);

// --- Interaction notes → timeline_events
let notesWritten = 0;
for (const n of payload.interaction_notes) {
  const dealId = dealIdByProspectId.get(n.prospect_id);
  const contactId = contactIdByProspectId.get(n.prospect_id);
  const prospect = payload.prospects.find((p) => p.id === n.prospect_id);
  const accountId = prospect ? accountIdByCompany.get((prospect.company || 'Unknown').trim()) : null;
  if (!accountId) continue;
  await sql`
    INSERT INTO timeline_events (
      account_id, deal_id, contact_id, source, kind, occurred_at,
      actor, summary, source_ref, payload
    ) VALUES (
      ${accountId}, ${dealId}, ${contactId}, 'manual', 'note_added', ${n.created_at},
      'luke', ${n.note.slice(0, 500)}, ${'preservation:note:' + n.id},
      ${JSON.stringify({ full_note: n.note })}::jsonb
    )
    ON CONFLICT (source_ref) DO NOTHING
  `;
  notesWritten++;
}
console.log(`  timeline_events (notes): ${notesWritten}`);

// --- Meeting transcripts → timeline_events
let txWritten = 0;
for (const t of payload.meeting_transcripts) {
  const dealId = dealIdByProspectId.get(t.prospect_id);
  const contactId = contactIdByProspectId.get(t.prospect_id);
  const prospect = payload.prospects.find((p) => p.id === t.prospect_id);
  const accountId = prospect ? accountIdByCompany.get((prospect.company || 'Unknown').trim()) : null;
  if (!accountId) continue;
  const occurredAt = t.extracted_meeting_date || t.created_at;
  const summary = (t.ai_summary || 'Meeting transcript').slice(0, 500);
  await sql`
    INSERT INTO timeline_events (
      account_id, deal_id, contact_id, source, kind, occurred_at,
      actor, summary, source_ref, payload
    ) VALUES (
      ${accountId}, ${dealId}, ${contactId}, 'bubbles', 'meeting_held', ${occurredAt},
      'luke', ${summary}, ${'preservation:transcript:' + t.id},
      ${JSON.stringify({
        ai_summary: t.ai_summary,
        action_items: t.extracted_action_items,
        transcript: t.transcript,
      })}::jsonb
    )
    ON CONFLICT (source_ref) DO NOTHING
  `;
  txWritten++;
}
console.log(`  timeline_events (transcripts): ${txWritten}`);

console.log('Done.');
