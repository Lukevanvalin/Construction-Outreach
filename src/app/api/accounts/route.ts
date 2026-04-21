import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const sql = getDb();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');

  const rows = search
    ? await sql`
        SELECT
          a.*,
          (SELECT COUNT(*)::int FROM deals d WHERE d.account_id = a.id) AS deal_count,
          (SELECT COUNT(*)::int FROM contacts c WHERE c.primary_account_id = a.id) AS contact_count,
          (SELECT MAX(te.occurred_at) FROM timeline_events te WHERE te.account_id = a.id) AS last_activity_at,
          (SELECT json_agg(json_build_object('stage', d.stage, 'type', d.type))
             FROM deals d WHERE d.account_id = a.id) AS deals_summary
        FROM accounts a
        WHERE LOWER(a.name) LIKE ${'%' + search.toLowerCase() + '%'}
        ORDER BY last_activity_at DESC NULLS LAST, a.name ASC
      `
    : await sql`
        SELECT
          a.*,
          (SELECT COUNT(*)::int FROM deals d WHERE d.account_id = a.id) AS deal_count,
          (SELECT COUNT(*)::int FROM contacts c WHERE c.primary_account_id = a.id) AS contact_count,
          (SELECT MAX(te.occurred_at) FROM timeline_events te WHERE te.account_id = a.id) AS last_activity_at,
          (SELECT json_agg(json_build_object('stage', d.stage, 'type', d.type))
             FROM deals d WHERE d.account_id = a.id) AS deals_summary
        FROM accounts a
        ORDER BY last_activity_at DESC NULLS LAST, a.name ASC
      `;

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const sql = getDb();
  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const [row] = await sql`
    INSERT INTO accounts (name, primary_domain)
    VALUES (${body.name}, ${body.primary_domain || null})
    RETURNING *
  `;
  return NextResponse.json(row, { status: 201 });
}
