import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Single idempotent write surface for the calendar/email ingestion agent.
// Auth: header `x-ingest-token` must equal env INGEST_TOKEN.
//
// Body shape:
// {
//   company:  "Atlantis Construction Group Inc.",   // required
//   domain:   "atlantiscg.com",                       // optional
//   status:   "Active",                               // optional account_status
//   deal:     { name, stage, type },                  // optional — opens a deal if account is new / on request
//   contacts: [{ full_name, email?, title?, phone?, is_key_figure? }],
//   events:   [{ source, kind, occurred_at?, summary, source_ref, actor?, payload? }]
// }
//
// Idempotency: timeline_events.source_ref is UNIQUE, contacts.email is UNIQUE,
// and contact_added / deal events carry stable source_refs — so re-running the
// same payload inserts nothing new and reports new_events: 0.

const SOURCES = new Set([
  'bubbles', 'gmail', 'gcal', 'slack', 'imessage', 'notion',
  'docusign', 'dropbox_sign', 'hellosign', 'adobesign',
  'bill_com', 'qbo', 'stripe', 'manual', 'system', 'research',
]);
const KINDS = new Set([
  'meeting_held', 'meeting_scheduled', 'meeting_cancelled',
  'email_sent', 'email_received', 'email_cc_received',
  'doc_sent', 'doc_viewed', 'doc_signed', 'doc_voided', 'doc_declined',
  'invoice_sent', 'invoice_paid', 'invoice_overdue',
  'slack_message', 'imessage',
  'note_added', 'stage_changed', 'research_updated',
  'sla_logged', 'sla_fulfilled', 'sla_missed', 'contact_added',
]);
const STAGES = new Set([
  'Intro', 'Discovery', 'Proposal', 'Negotiation', 'Proposal Accepted',
  'Kickoff', 'Build', 'Delivery', 'Adoption', 'Expansion', 'Lost',
]);
const DEAL_TYPES = new Set(['Workshop', 'Build', 'Advisory']);

interface IngestContact {
  full_name?: string;
  email?: string;
  title?: string;
  phone?: string;
  is_key_figure?: boolean;
}
interface IngestEvent {
  source?: string;
  kind?: string;
  occurred_at?: string;
  summary?: string;
  source_ref?: string;
  actor?: string;
  payload?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const token = process.env.INGEST_TOKEN;
  if (!token || request.headers.get('x-ingest-token') !== token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sql = getDb();
  const body = await request.json().catch(() => null);
  if (!body || !body.company || typeof body.company !== 'string') {
    return NextResponse.json({ error: 'company (string) required' }, { status: 400 });
  }

  const company: string = body.company.trim();
  const domain: string | null = body.domain ? String(body.domain).trim().toLowerCase() : null;
  const warnings: string[] = [];

  // --- 1. Resolve / create the account -------------------------------------
  let account: Record<string, string | null> | undefined;
  if (domain) {
    [account] = await sql`
      SELECT a.id, a.name FROM accounts a
      JOIN account_domains ad ON ad.account_id = a.id
      WHERE ad.domain = ${domain}
      LIMIT 1
    `;
  }
  if (!account) {
    [account] = await sql`SELECT id, name FROM accounts WHERE LOWER(name) = LOWER(${company}) LIMIT 1`;
  }

  let created = false;
  if (!account) {
    [account] = await sql`
      INSERT INTO accounts (name, primary_domain)
      VALUES (${company}, ${domain})
      RETURNING id, name
    `;
    created = true;
  } else if (domain) {
    // Backfill primary_domain if we now know it.
    await sql`UPDATE accounts SET primary_domain = COALESCE(primary_domain, ${domain}) WHERE id = ${account.id}`;
  }
  const accountId = account!.id;

  if (domain) {
    await sql`INSERT INTO account_domains (account_id, domain) VALUES (${accountId}, ${domain}) ON CONFLICT DO NOTHING`;
  }
  if (body.status && ['Active', 'Dormant', 'Lost'].includes(body.status)) {
    await sql`UPDATE accounts SET status = ${body.status}::account_status WHERE id = ${accountId}`;
  }

  let newEvents = 0;

  // --- 2. Optional deal (only opens one if explicitly requested) -----------
  if (body.deal && body.deal.name) {
    const stage = STAGES.has(body.deal.stage) ? body.deal.stage : 'Intro';
    const dtype = DEAL_TYPES.has(body.deal.type) ? body.deal.type : 'Build';
    const existing = await sql`SELECT id FROM deals WHERE account_id = ${accountId} AND LOWER(name) = LOWER(${body.deal.name}) LIMIT 1`;
    if (!existing.length) {
      await sql`
        INSERT INTO deals (account_id, name, stage, type, notes)
        VALUES (${accountId}, ${body.deal.name}, ${stage}::deal_stage, ${dtype}::deal_type, ${body.deal.notes || null})
      `;
    }
  }

  // --- 3. Contacts ----------------------------------------------------------
  const contacts: IngestContact[] = Array.isArray(body.contacts) ? body.contacts : [];
  for (const c of contacts) {
    const fullName = (c.full_name || '').trim();
    if (!fullName) continue;
    const email = c.email ? c.email.trim().toLowerCase() : null;

    let contact: Record<string, string | null> | undefined;
    let contactCreated = false;

    if (email) {
      const before = await sql`SELECT id FROM contacts WHERE LOWER(email) = ${email}`;
      [contact] = await sql`
        INSERT INTO contacts (full_name, email, phone, title, is_key_figure, primary_account_id, source, source_ref)
        VALUES (${fullName}, ${email}, ${c.phone || null}, ${c.title || null}, ${Boolean(c.is_key_figure)},
                ${accountId}, 'ingested', ${'ingest:contact:' + email})
        ON CONFLICT (email) DO UPDATE SET
          full_name = COALESCE(EXCLUDED.full_name, contacts.full_name),
          title = COALESCE(contacts.title, EXCLUDED.title),
          phone = COALESCE(contacts.phone, EXCLUDED.phone),
          primary_account_id = COALESCE(contacts.primary_account_id, EXCLUDED.primary_account_id),
          is_key_figure = contacts.is_key_figure OR EXCLUDED.is_key_figure,
          last_seen_at = NOW()
        RETURNING id, full_name, title
      `;
      contactCreated = before.length === 0;
    } else {
      [contact] = await sql`
        SELECT c.id, c.full_name, c.title FROM contacts c
        JOIN account_contacts ac ON ac.contact_id = c.id
        WHERE ac.account_id = ${accountId} AND LOWER(c.full_name) = LOWER(${fullName})
        LIMIT 1
      `;
      if (!contact) {
        [contact] = await sql`
          INSERT INTO contacts (full_name, phone, title, is_key_figure, primary_account_id, source, source_ref)
          VALUES (${fullName}, ${c.phone || null}, ${c.title || null}, ${Boolean(c.is_key_figure)},
                  ${accountId}, 'ingested', ${'ingest:contact:' + accountId + ':' + fullName.toLowerCase()})
          RETURNING id, full_name, title
        `;
        contactCreated = true;
      }
    }

    await sql`INSERT INTO account_contacts (account_id, contact_id) VALUES (${accountId}, ${contact!.id}) ON CONFLICT DO NOTHING`;

    if (contactCreated) {
      const ref = `ingest:contact_added:${accountId}:${contact!.id}`;
      const inserted = await sql`
        INSERT INTO timeline_events (account_id, contact_id, source, kind, occurred_at, actor, summary, source_ref, payload)
        VALUES (${accountId}, ${contact!.id}, 'system', 'contact_added', NOW(), 'ingest',
                ${`Contact added: ${contact!.full_name}${contact!.title ? ' (' + contact!.title + ')' : ''}`.slice(0, 500)},
                ${ref}, ${JSON.stringify({ via: 'ingest' })}::jsonb)
        ON CONFLICT (source_ref) DO NOTHING
        RETURNING id
      `;
      if (inserted.length) newEvents++;
    }
  }

  // --- 4. Timeline events ---------------------------------------------------
  const events: IngestEvent[] = Array.isArray(body.events) ? body.events : [];
  for (const e of events) {
    const source = e.source || '';
    const kind = e.kind || '';
    const summary = (e.summary || '').trim();
    const sourceRef = (e.source_ref || '').trim();
    if (!SOURCES.has(source)) { warnings.push(`skip event: bad source "${source}"`); continue; }
    if (!KINDS.has(kind)) { warnings.push(`skip event: bad kind "${kind}"`); continue; }
    if (!summary) { warnings.push('skip event: empty summary'); continue; }
    if (!sourceRef) { warnings.push('skip event: missing source_ref'); continue; }

    const inserted = await sql`
      INSERT INTO timeline_events (account_id, source, kind, occurred_at, actor, summary, source_ref, payload)
      VALUES (${accountId}, ${source}::event_source, ${kind}::event_kind,
              ${e.occurred_at || null}::timestamptz, ${e.actor || 'ingest'},
              ${summary.slice(0, 500)}, ${sourceRef},
              ${JSON.stringify(e.payload || {})}::jsonb)
      ON CONFLICT (source_ref) DO NOTHING
      RETURNING id
    `;
    if (inserted.length) newEvents++;
  }

  // --- 5. Bump the "new information" counter --------------------------------
  let bump = newEvents;
  if (created && bump === 0) bump = 1; // a brand-new account is itself news
  let unreviewedCount: number | null = null;
  if (bump > 0) {
    const [row] = await sql`
      UPDATE accounts
      SET unreviewed_count = unreviewed_count + ${bump}, last_ingest_at = NOW()
      WHERE id = ${accountId}
      RETURNING unreviewed_count
    `;
    unreviewedCount = row?.unreviewed_count ?? null;
  } else {
    const [row] = await sql`SELECT unreviewed_count FROM accounts WHERE id = ${accountId}`;
    unreviewedCount = row?.unreviewed_count ?? null;
  }

  return NextResponse.json({
    account_id: accountId,
    account_name: account!.name,
    created,
    new_events: newEvents,
    unreviewed_count: unreviewedCount,
    warnings,
  });
}
