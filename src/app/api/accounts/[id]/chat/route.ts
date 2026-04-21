import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';

const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TURNS = 8;

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
];

function systemPrompt(accountName: string) {
  return `You are the Ruh AI account intelligence agent for the account "${accountName}".

Your job: answer the user's questions about this specific account with citations from the timeline, documents, deals, and contacts. When the user gives you new context (a phone call, an iMessage, a hallway conversation), capture it with the record_note tool.

Rules:
- Always ground answers in tool results. If you don't have data, say "I don't know — the ingestion pipeline hasn't covered that yet" rather than guessing.
- Be terse. No preamble. No "Certainly!" / "Great question!". Direct answers.
- Cite timeline events by their summary + date when relevant.
- If the user tells you something new (call, message, side conversation), call record_note before answering. Confirm what you recorded in one line.
- If you notice a gap (missing context that should probably be in the system), name it: "I don't see any Gmail events on this account — Gmail ingest probably isn't wired yet."
- Never fabricate numbers, dates, people, or documents. If it's not in tool results, say so.`;
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
