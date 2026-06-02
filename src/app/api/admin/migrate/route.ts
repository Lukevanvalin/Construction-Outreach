import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// One-shot idempotent migration to add the "new information" tracking columns.
// Guarded by the same shared secret as /api/ingest. Hit once after deploy:
//   curl -XPOST .../api/admin/migrate -H "x-admin-token: $INGEST_TOKEN"
export async function POST(request: NextRequest) {
  const token = process.env.INGEST_TOKEN;
  if (!token || request.headers.get('x-admin-token') !== token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sql = getDb();
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_ingest_at   TIMESTAMPTZ`;
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ`;
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS unreviewed_count INT NOT NULL DEFAULT 0`;

  const [check] = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'unreviewed_count'
  `;
  return NextResponse.json({ ok: true, unreviewed_count_present: Boolean(check) });
}
