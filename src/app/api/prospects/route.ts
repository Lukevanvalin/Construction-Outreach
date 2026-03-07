import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    let prospects;

    if (status && search) {
      prospects = await sql`
        SELECT p.*,
          (SELECT MAX(created_at) FROM interaction_notes WHERE prospect_id = p.id) as last_interaction_date
        FROM prospects p
        WHERE p.status = ${status}
          AND (LOWER(p.name) LIKE ${'%' + search.toLowerCase() + '%'} OR LOWER(p.company) LIKE ${'%' + search.toLowerCase() + '%'})
        ORDER BY p.introduction_date DESC NULLS LAST, p.created_at DESC
      `;
    } else if (status) {
      prospects = await sql`
        SELECT p.*,
          (SELECT MAX(created_at) FROM interaction_notes WHERE prospect_id = p.id) as last_interaction_date
        FROM prospects p
        WHERE p.status = ${status}
        ORDER BY p.introduction_date DESC NULLS LAST, p.created_at DESC
      `;
    } else if (search) {
      prospects = await sql`
        SELECT p.*,
          (SELECT MAX(created_at) FROM interaction_notes WHERE prospect_id = p.id) as last_interaction_date
        FROM prospects p
        WHERE LOWER(p.name) LIKE ${'%' + search.toLowerCase() + '%'} OR LOWER(p.company) LIKE ${'%' + search.toLowerCase() + '%'}
        ORDER BY p.introduction_date DESC NULLS LAST, p.created_at DESC
      `;
    } else {
      prospects = await sql`
        SELECT p.*,
          (SELECT MAX(created_at) FROM interaction_notes WHERE prospect_id = p.id) as last_interaction_date
        FROM prospects p
        ORDER BY p.introduction_date DESC NULLS LAST, p.created_at DESC
      `;
    }

    return NextResponse.json(prospects);
  } catch (error) {
    console.error('Error fetching prospects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prospects' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();
    const id = uuidv4();

    const result = await sql`
      INSERT INTO prospects (id, name, company, email, phone, status, project_requirements, introduction_date, source_email_thread, upcoming_meeting_date, upcoming_meeting_notes)
      VALUES (
        ${id},
        ${body.name || ''},
        ${body.company || ''},
        ${body.email || ''},
        ${body.phone || ''},
        ${body.status || 'New Lead'},
        ${body.project_requirements || ''},
        ${body.introduction_date || null},
        ${body.source_email_thread || ''},
        ${body.upcoming_meeting_date || null},
        ${body.upcoming_meeting_notes || ''}
      )
      RETURNING *
    `;

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error('Error creating prospect:', error);
    return NextResponse.json(
      { error: 'Failed to create prospect' },
      { status: 500 }
    );
  }
}
