import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Clears the "new information" flag once Luke has looked at the account.
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = getDb();
  const [row] = await sql`
    UPDATE accounts
    SET last_reviewed_at = NOW(), unreviewed_count = 0
    WHERE id = ${id}
    RETURNING id, last_reviewed_at, unreviewed_count
  `;
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(row);
}
