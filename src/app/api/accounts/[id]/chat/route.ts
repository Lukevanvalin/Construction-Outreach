import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';

const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TURNS = 8;

const DEAL_STAGES = ['Intro','Discovery','Proposal','Negotiation','Proposal Accepted','Kickoff','Build','Delivery','Adoption','Expansion','Lost'];
const DEAL_TYPES = ['Workshop','Build','Advisory'];

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'get_timeline',
    description: 'Return timeline events for this account. Use this to answer questions about what has happened, when, and in what order. Filters are optional.',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'ISO timestamp — only return events on or after this moment.' },
        kind: { type: 'string', description: 'Filter by event kind (e.g. meeting_held, email_received, note_added).' },
        source: { type: 'string', description: 'Filter by source (gmail, bubbles, manual, docusign, etc.).' },
        limit: { type: 'integer', description: 'Max rows (default 50, max 200).' },
      },
    },
  },
  {
    name: 'get_deals',
    description: 'Return all deals on this account with stage and type.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_contacts',
    description: 'Return all contacts associated with this account.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_documents',
    description: 'Return all documents attached to this account (MSAs, proposals, invoices, etc.).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'record_note',
    description: 'Record a new manual note on this account. Use this when the user says things like "note that...", "remember that...", "add that the call with X said Y", or any phone/iMessage/verbal context they want captured. The note is written to the timeline as source=manual, kind=note_added.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The full note text.' },
        deal_id: { type: 'string', description: 'Optional deal id to attach the note to.' },
        contact_id: { type: 'string', description: 'Optional contact id the note is about.' },
      },
      required: ['content'],
    },
  },
  {
    name: 'update_deal',
    description: `Update fields on a deal on this account. Use this whenever the user asks to change a stage, type, name, value, notes, or outcome — e.g. "move this to Discovery", "change the type to Workshop", "update the stage pill", "this deal is actually closed won". Look up the deal first with get_deals if you don't have its id. Every change fires an audit event on the timeline automatically.
Valid stages: ${DEAL_STAGES.join(', ')}.
Valid types:  ${DEAL_TYPES.join(', ')}.`,
    input_schema: {
      type: 'object',
      properties: {
        deal_id:   { type: 'string' },
        stage:     { type: 'string', enum: DEAL_STAGES },
        type:      { type: 'string', enum: DEAL_TYPES },
        name:      { type: 'string' },
        value_usd: { type: 'number' },
        notes:     { type: 'string' },
        outcome:   { type: 'string' },
        closed_at: { type: 'string', description: 'ISO timestamp, or null to clear.' },
      },
      required: ['deal_id'],
    },
  },
  {
    name: 'update_account',
    description: 'Update fields on THIS account (the one the chat is scoped to — you do not need the account_id). Use for corrections like "the CEO is actually Bob", "they have 450 employees not 200", "change the description to…". Fires an audit event on the timeline.',
    input_schema: {
      type: 'object',
      properties: {
        name:            { type: 'string' },
        status:          { type: 'string', enum: ['Active', 'Dormant', 'Lost'] },
        primary_domain:  { type: 'string' },
        website:         { type: 'string' },
        location:        { type: 'string' },
        industry:        { type: 'string' },
        employee_count:  { type: 'integer' },
        annual_revenue:  { type: 'string' },
        founded_year:    { type: 'integer' },
        ceo_name:        { type: 'string' },
        description:     { type: 'string' },
      },
    },
  },
  {
    name: 'update_contact',
    description: 'Update fields on an existing contact attached to this account. Look them up with get_contacts first if you need the id.',
    input_schema: {
      type: 'object',
      properties: {
        contact_id:    { type: 'string' },
        full_name:     { type: 'string' },
        email:         { type: 'string' },
        phone:         { type: 'string' },
        title:         { type: 'string' },
        is_key_figure: { type: 'boolean' },
      },
      required: ['contact_id'],
    },
  },
  {
    name: 'create_contact',
    description: 'Create a new contact on this account. Use this when the user mentions a new person ("had a call with David Gallo at Alliance", "their CFO Jane Doe joined the thread") who is not yet in get_contacts. Email is preferred but optional.',
    input_schema: {
      type: 'object',
      properties: {
        full_name:     { type: 'string' },
        email:         { type: 'string' },
        phone:         { type: 'string' },
        title:         { type: 'string' },
        is_key_figure: { type: 'boolean' },
      },
      required: ['full_name'],
    },
  },
];

function systemPrompt(accountName: string) {
  return `You are the Ruh AI account intelligence agent for "${accountName}". You ARE this CRM — when the user asks for an edit, make it. Do not tell them to use some other interface. You have write tools; use them.

Your job: answer questions about this account and make the edits the user asks for. Everything is grounded in timeline, deals, contacts, and documents you can read via tools. New context the user gives you (phone call, iMessage, hallway conversation) gets captured via record_note.

Rules:
- When the user asks to change something ("move to Discovery", "this is Workshop not Build", "update the stage pill", "CEO is actually Bob", "add David Gallo as a contact"), CALL THE WRITE TOOL. Never say "you'll need to update that in the CRM" — you are the CRM.
- Always ground answers in tool results. If you don't have data, say "I don't know — the ingestion pipeline hasn't covered that yet" rather than guessing.
- Be terse. No preamble. No "Certainly!" / "Great question!" / "I'd be happy to". Direct answers.
- Cite timeline events by summary + date when relevant.
- If the user gives you new context, call record_note (and create_contact if a new person is mentioned) before replying.
- If you notice a gap (missing context that should be in the system), name it explicitly: "I don't see any Gmail events here — the Gmail ingest probably isn't wired yet."
- Never fabricate numbers, dates, people, or documents. If it's not in tool results, say so.
- After a write, confirm in one line what changed. Don't dump the whole record back.`;
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  accountId: string,
): Promise<string> {
  const sql = getDb();

  if (name === 'get_timeline') {
    const limit = Math.min(Number(input.limit) || 50, 200);
    const rows = await sql.query(
      `SELECT id, source, kind, occurred_at, actor, summary, source_ref
         FROM timeline_events
         WHERE account_id = $1
           AND ($2::text IS NULL OR occurred_at >= $2::timestamptz)
           AND ($3::text IS NULL OR kind::text = $3)
           AND ($4::text IS NULL OR source::text = $4)
         ORDER BY occurred_at DESC
         LIMIT $5`,
      [accountId, input.since || null, input.kind || null, input.source || null, limit],
    );
    return JSON.stringify(rows);
  }

  if (name === 'get_deals') {
    const rows = await sql`SELECT id, name, stage, type, opened_at, closed_at, notes FROM deals WHERE account_id = ${accountId} ORDER BY opened_at DESC`;
    return JSON.stringify(rows);
  }

  if (name === 'get_contacts') {
    const rows = await sql`
      SELECT c.id, c.full_name, c.email, c.phone, c.title, c.is_key_figure, c.source, c.last_seen_at
      FROM contacts c
      JOIN account_contacts ac ON ac.contact_id = c.id
      WHERE ac.account_id = ${accountId}
      ORDER BY c.is_key_figure DESC, c.last_seen_at DESC
    `;
    return JSON.stringify(rows);
  }

  if (name === 'get_documents') {
    const rows = await sql`SELECT id, kind, title, state, sent_at, signed_at, source_ref FROM documents WHERE account_id = ${accountId} ORDER BY created_at DESC`;
    return JSON.stringify(rows);
  }

  if (name === 'record_note') {
    const content = String(input.content || '').trim();
    if (!content) return JSON.stringify({ error: 'content required' });
    const sourceRef = `manual:chat:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const [row] = await sql`
      INSERT INTO timeline_events (
        account_id, deal_id, contact_id, source, kind, occurred_at,
        actor, summary, source_ref, payload
      ) VALUES (
        ${accountId},
        ${input.deal_id || null},
        ${input.contact_id || null},
        'manual',
        'note_added',
        NOW(),
        'luke',
        ${content.slice(0, 500)},
        ${sourceRef},
        ${JSON.stringify({ full_note: content, via: 'chat' })}::jsonb
      )
      RETURNING id, occurred_at
    `;
    return JSON.stringify({ recorded: true, id: row.id, occurred_at: row.occurred_at });
  }

  if (name === 'update_deal') {
    const dealId = String(input.deal_id || '');
    if (!dealId) return JSON.stringify({ error: 'deal_id required' });
    const [before] = await sql`SELECT * FROM deals WHERE id = ${dealId} AND account_id = ${accountId}`;
    if (!before) return JSON.stringify({ error: 'deal not found on this account' });

    const allowed = ['stage', 'type', 'name', 'value_usd', 'notes', 'outcome', 'closed_at'];
    const entries = Object.entries(input).filter(([k, v]) => allowed.includes(k) && v !== undefined);
    if (!entries.length) return JSON.stringify({ error: 'no updatable fields provided' });

    const casts: Record<string, string> = { stage: '::deal_stage', type: '::deal_type', closed_at: '::timestamptz', value_usd: '::numeric' };
    const sets = entries.map(([k], i) => `${k} = $${i + 2}${casts[k] || ''}`).join(', ');
    const values = entries.map(([, v]) => v);
    const result = await sql.query(`UPDATE deals SET ${sets} WHERE id = $1 RETURNING *`, [dealId, ...values]);
    const after = result[0];

    // Audit event on the timeline
    const changes = entries.map(([k, v]) => `${k}: ${JSON.stringify((before as Record<string, unknown>)[k])} → ${JSON.stringify(v)}`).join('; ');
    const stageChanged = input.stage && input.stage !== before.stage;
    await sql`
      INSERT INTO timeline_events (
        account_id, deal_id, source, kind, occurred_at, actor, summary, source_ref, payload
      ) VALUES (
        ${accountId}, ${dealId}, 'manual',
        ${stageChanged ? 'stage_changed' : 'note_added'}::event_kind,
        NOW(), 'luke',
        ${`Deal "${after.name}" updated — ${changes}`.slice(0, 500)},
        ${`manual:chat-update:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`},
        ${JSON.stringify({ before, after, via: 'chat' })}::jsonb
      )
    `;
    return JSON.stringify({ updated: true, deal: after });
  }

  if (name === 'update_account') {
    const allowed = ['name', 'status', 'primary_domain', 'website', 'location', 'industry',
                     'employee_count', 'annual_revenue', 'founded_year', 'ceo_name', 'description'];
    const entries = Object.entries(input).filter(([k, v]) => allowed.includes(k) && v !== undefined);
    if (!entries.length) return JSON.stringify({ error: 'no updatable fields provided' });

    const [before] = await sql`SELECT * FROM accounts WHERE id = ${accountId}`;
    const casts: Record<string, string> = { status: '::account_status', employee_count: '::int', founded_year: '::int' };
    const sets = entries.map(([k], i) => `${k} = $${i + 2}${casts[k] || ''}`).join(', ');
    const values = entries.map(([, v]) => v);
    const result = await sql.query(`UPDATE accounts SET ${sets} WHERE id = $1 RETURNING *`, [accountId, ...values]);
    const after = result[0];

    const changes = entries.map(([k, v]) => `${k}: ${JSON.stringify((before as Record<string, unknown>)[k])} → ${JSON.stringify(v)}`).join('; ');
    await sql`
      INSERT INTO timeline_events (
        account_id, source, kind, occurred_at, actor, summary, source_ref, payload
      ) VALUES (
        ${accountId}, 'manual', 'note_added', NOW(), 'luke',
        ${`Account updated — ${changes}`.slice(0, 500)},
        ${`manual:chat-account-update:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`},
        ${JSON.stringify({ before, after, via: 'chat' })}::jsonb
      )
    `;
    return JSON.stringify({ updated: true, account: after });
  }

  if (name === 'update_contact') {
    const contactId = String(input.contact_id || '');
    if (!contactId) return JSON.stringify({ error: 'contact_id required' });

    const [before] = await sql`
      SELECT c.* FROM contacts c
      JOIN account_contacts ac ON ac.contact_id = c.id
      WHERE c.id = ${contactId} AND ac.account_id = ${accountId}
    `;
    if (!before) return JSON.stringify({ error: 'contact not found on this account' });

    const allowed = ['full_name', 'email', 'phone', 'title', 'is_key_figure'];
    const entries = Object.entries(input).filter(([k, v]) => allowed.includes(k) && v !== undefined);
    if (!entries.length) return JSON.stringify({ error: 'no updatable fields provided' });

    const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
    const values = entries.map(([, v]) => v);
    const result = await sql.query(`UPDATE contacts SET ${sets}, last_seen_at = NOW() WHERE id = $1 RETURNING *`, [contactId, ...values]);
    const after = result[0];
    const changes = entries.map(([k, v]) => `${k}: ${JSON.stringify((before as Record<string, unknown>)[k])} → ${JSON.stringify(v)}`).join('; ');
    await sql`
      INSERT INTO timeline_events (
        account_id, contact_id, source, kind, occurred_at, actor, summary, source_ref, payload
      ) VALUES (
        ${accountId}, ${contactId}, 'manual', 'note_added', NOW(), 'luke',
        ${`Contact "${after.full_name}" updated — ${changes}`.slice(0, 500)},
        ${`manual:chat-contact-update:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`},
        ${JSON.stringify({ before, after, via: 'chat' })}::jsonb
      )
    `;
    return JSON.stringify({ updated: true, contact: after });
  }

  if (name === 'create_contact') {
    const fullName = String(input.full_name || '').trim();
    if (!fullName) return JSON.stringify({ error: 'full_name required' });
    const [contact] = await sql`
      INSERT INTO contacts (
        full_name, email, phone, title, is_key_figure, primary_account_id, source, source_ref
      ) VALUES (
        ${fullName},
        ${input.email || null},
        ${input.phone || null},
        ${input.title || null},
        ${Boolean(input.is_key_figure)},
        ${accountId},
        'manual',
        ${`manual:chat-create-contact:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`}
      )
      ON CONFLICT (email) DO UPDATE SET
        full_name = COALESCE(EXCLUDED.full_name, contacts.full_name),
        primary_account_id = COALESCE(contacts.primary_account_id, EXCLUDED.primary_account_id),
        title = COALESCE(EXCLUDED.title, contacts.title),
        last_seen_at = NOW()
      RETURNING *
    `;
    await sql`INSERT INTO account_contacts (account_id, contact_id) VALUES (${accountId}, ${contact.id}) ON CONFLICT DO NOTHING`;
    await sql`
      INSERT INTO timeline_events (
        account_id, contact_id, source, kind, occurred_at, actor, summary, source_ref, payload
      ) VALUES (
        ${accountId}, ${contact.id}, 'manual', 'contact_added', NOW(), 'luke',
        ${`Contact added: ${contact.full_name}${contact.title ? ' (' + contact.title + ')' : ''}`.slice(0, 500)},
        ${`manual:chat-contact-created:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`},
        ${JSON.stringify({ contact, via: 'chat' })}::jsonb
      )
    `;
    return JSON.stringify({ created: true, contact });
  }

  return JSON.stringify({ error: `unknown tool ${name}` });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { message, session_id } = await request.json();
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

  const sql = getDb();
  const [account] = await sql`SELECT id, name FROM accounts WHERE id = ${id}`;
  if (!account) return NextResponse.json({ error: 'account not found' }, { status: 404 });

  // Load or create session
  let session;
  if (session_id) {
    [session] = await sql`SELECT * FROM agent_sessions WHERE id = ${session_id} AND account_id = ${id}`;
  }
  if (!session) {
    [session] = await sql`INSERT INTO agent_sessions (account_id, title) VALUES (${id}, ${account.name}) RETURNING *`;
  }

  type StoredMessage = {
    role: 'user' | 'assistant';
    content: string | Anthropic.Messages.ContentBlockParam[];
    created_at: string;
  };
  const storedMessages: StoredMessage[] = Array.isArray(session.messages) ? session.messages : [];

  // Append the new user turn
  storedMessages.push({ role: 'user', content: message, created_at: new Date().toISOString() });

  // Build Anthropic messages array
  const anthropicMessages: Anthropic.Messages.MessageParam[] = storedMessages.map((m) => ({
    role: m.role,
    content: m.content as string | Anthropic.Messages.ContentBlockParam[],
  }));

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let finalText = '';
  let turns = 0;
  while (turns < MAX_TURNS) {
    turns++;
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt(account.name),
      tools: TOOLS,
      messages: anthropicMessages,
    });

    anthropicMessages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await runTool(block.name, (block.input as Record<string, unknown>) || {}, id);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }
      anthropicMessages.push({ role: 'user', content: toolResults });
      continue;
    }

    // end_turn: extract text
    finalText = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    break;
  }

  // Persist the final assistant reply back to storage (including the tool-use round-trips).
  const toStore: StoredMessage[] = [
    ...storedMessages,
    ...anthropicMessages
      .slice(storedMessages.length)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content, created_at: new Date().toISOString() })),
  ];
  await sql`
    UPDATE agent_sessions
    SET messages = ${JSON.stringify(toStore)}::jsonb, updated_at = NOW()
    WHERE id = ${session.id}
  `;

  return NextResponse.json({
    session_id: session.id,
    assistant: finalText || '(no text — tool loop exhausted)',
    turns,
  });
}
