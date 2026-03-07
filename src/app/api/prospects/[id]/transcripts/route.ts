import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;

    const transcripts = await sql`
      SELECT * FROM meeting_transcripts
      WHERE prospect_id = ${id}
      ORDER BY created_at DESC
    `;

    return NextResponse.json(transcripts);
  } catch (error) {
    console.error('Error fetching transcripts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcripts' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getDb();
    const { id } = await params;
    const body = await request.json();
    const transcriptId = uuidv4();

    const result = await sql`
      INSERT INTO meeting_transcripts (id, prospect_id, transcript, ai_summary, extracted_action_items, extracted_meeting_date)
      VALUES (
        ${transcriptId},
        ${id},
        ${body.transcript || ''},
        ${body.ai_summary || ''},
        ${body.extracted_action_items || ''},
        ${body.extracted_meeting_date || null}
      )
      RETURNING *
    `;

    // If AI extracted a meeting date, update the prospect's upcoming meeting
    if (body.extracted_meeting_date) {
      await sql`
        UPDATE prospects SET
          upcoming_meeting_date = ${body.extracted_meeting_date},
          updated_at = NOW()
        WHERE id = ${id}
      `;
    }

    // Auto-create an interaction note from the AI summary
    if (body.ai_summary) {
      const noteId = uuidv4();
      await sql`
        INSERT INTO interaction_notes (id, prospect_id, note)
        VALUES (${noteId}, ${id}, ${`Meeting Summary:\n${body.ai_summary}`})
      `;
    }

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error('Error creating transcript:', error);
    return NextResponse.json(
      { error: 'Failed to create transcript' },
      { status: 500 }
    );
  }
}
