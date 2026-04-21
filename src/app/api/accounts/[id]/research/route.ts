import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';

const MODEL = 'claude-sonnet-4-5-20250929';

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    website: { type: ['string', 'null'] },
    location: { type: ['string', 'null'], description: 'HQ city, state' },
    industry: { type: ['string', 'null'] },
    employee_count: { type: ['integer', 'null'] },
    annual_revenue: { type: ['string', 'null'], description: 'e.g. "$50M-$100M"' },
    founded_year: { type: ['integer', 'null'] },
    ceo_name: { type: ['string', 'null'] },
    key_people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          title: { type: 'string' },
        },
      },
    },
    description: { type: ['string', 'null'], description: '2-3 sentence company description' },
    sources: { type: 'array', items: { type: 'string' }, description: 'URLs consulted' },
  },
};

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = getDb();
  const [account] = await sql`SELECT * FROM accounts WHERE id = ${id}`;
  if (!account) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      } as unknown as Anthropic.Messages.Tool,
    ],
    messages: [
      {
        role: 'user',
        content: `Research the construction / AEC company "${account.name}"${account.primary_domain ? ` (website domain: ${account.primary_domain})` : ''}.

Return a single JSON object matching this shape, using null for fields you cannot confidently verify:

${JSON.stringify(RESEARCH_SCHEMA, null, 2)}

Use web_search to find the company's actual website, executive team page, LinkedIn, ENR/BD+C/construction industry coverage, or state business filings. Prefer primary sources. If you find multiple candidates, pick the most likely match for a construction/AEC firm operating in the US.

Reply with exactly one JSON object, no prose.`,
      },
    ],
  });

  // Extract the JSON object from the final text block.
  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ error: 'research agent returned no JSON', raw: text }, { status: 502 });
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    return NextResponse.json({ error: 'invalid JSON from research agent', raw: text }, { status: 502 });
  }

  await sql`
    UPDATE accounts SET
      website        = COALESCE(${parsed.website || null}, website),
      location       = COALESCE(${parsed.location || null}, location),
      industry       = COALESCE(${parsed.industry || null}, industry),
      employee_count = COALESCE(${parsed.employee_count || null}::int, employee_count),
      annual_revenue = COALESCE(${parsed.annual_revenue || null}, annual_revenue),
      founded_year   = COALESCE(${parsed.founded_year || null}::int, founded_year),
      ceo_name       = COALESCE(${parsed.ceo_name || null}, ceo_name),
      description    = COALESCE(${parsed.description || null}, description),
      research_json  = ${JSON.stringify(parsed)}::jsonb,
      research_updated_at = NOW()
    WHERE id = ${id}
  `;

  // Log research event on the timeline
  await sql`
    INSERT INTO timeline_events (
      account_id, source, kind, occurred_at, actor, summary, source_ref, payload
    ) VALUES (
      ${id}, 'research', 'research_updated', NOW(), 'agent',
      ${'Company research refreshed for ' + account.name},
      ${'research:' + id + ':' + Date.now()},
      ${JSON.stringify(parsed)}::jsonb
    )
  `;

  const [updated] = await sql`SELECT * FROM accounts WHERE id = ${id}`;
  return NextResponse.json({ account: updated, research: parsed });
}
