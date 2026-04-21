import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = getDb();

  const [account] = await sql`SELECT * FROM accounts WHERE id = ${id}`;
  if (!account) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const deals = await sql`SELECT * FROM deals WHERE account_id = ${id} ORDER BY opened_at DESC`;
  const contacts = await sql`
    SELECT c.* FROM contacts c
    JOIN account_contacts ac ON ac.contact_id = c.id
    WHERE ac.account_id = ${id}
    ORDER BY c.is_key_figure DESC, c.last_seen_at DESC
  `;
  const timeline = await sql`
    SELECT * FROM timeline_events
    WHERE account_id = ${id}
    ORDER BY occurred_at DESC
    LIMIT 200
  `;
  const documents = await sql`
    SELECT * FROM documents WHERE account_id = ${id} ORDER BY created_at DESC
  `;
  const slas = await sql`
    SELECT * FROM sla_commitments WHERE account_id = ${id} ORDER BY due_at ASC NULLS LAST
  `;

  return NextResponse.json({ account, deals, contacts, timeline, documents, slas });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = getDb();
  const body = await request.json();
  const allowed = ['name', 'status', 'owner', 'primary_domain', 'website', 'location', 'industry',
                   'employee_count', 'annual_revenue', 'founded_year', 'ceo_name', 'description'];
  const entries = Object.entries(body).filter(([k]) => allowed.includes(k));
  if (!entries.length) return NextResponse.json({ error: 'no updatable fields' }, { status: 400 });

  const sets = entries.map(([k, v], i) => `${k} = $${i + 2}`).join(', ');
  const values = entries.map(([, v]) => v);
  const q = `UPDATE accounts SET ${sets} WHERE id = $1 RETURNING *`;
  const result = await sql.query(q, [id, ...values]);
  return NextResponse.json(result[0]);
}
