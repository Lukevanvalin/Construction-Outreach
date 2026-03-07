import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;

    const result = await sql`
      SELECT p.*,
        (SELECT MAX(created_at) FROM interaction_notes WHERE prospect_id = p.id) as last_interaction_date
      FROM prospects p
      WHERE p.id = ${id}
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Prospect not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('Error fetching prospect:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prospect' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;
    const body = await request.json();

    const result = await sql`
      UPDATE prospects SET
        name = ${body.name ?? ''},
        company = ${body.company ?? ''},
        email = ${body.email ?? ''},
        phone = ${body.phone ?? ''},
        status = ${body.status ?? 'New Lead'},
        project_requirements = ${body.project_requirements ?? ''},
        introduction_date = ${body.introduction_date || null},
        source_email_thread = ${body.source_email_thread ?? ''},
        upcoming_meeting_date = ${body.upcoming_meeting_date || null},
        upcoming_meeting_notes = ${body.upcoming_meeting_notes ?? ''},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Prospect not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('Error updating prospect:', error);
    return NextResponse.json(
      { error: 'Failed to update prospect' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;

    const result = await sql`
      DELETE FROM prospects WHERE id = ${id} RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Prospect not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Prospect deleted' });
  } catch (error) {
    console.error('Error deleting prospect:', error);
    return NextResponse.json(
      { error: 'Failed to delete prospect' },
      { status: 500 }
    );
  }
}
