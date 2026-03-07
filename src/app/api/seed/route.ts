import { NextResponse } from 'next/server';
import { getDb, initializeDatabase } from '@/lib/db';
import { seedProspects } from '@/lib/seed-data';

export async function POST() {
  try {
    const sql = getDb();

    // Initialize tables first
    await initializeDatabase();

    // Check if data already exists
    const existing = await sql`SELECT COUNT(*) as count FROM prospects`;
    if (Number(existing[0].count) > 0) {
      return NextResponse.json({
        message: `Database already has ${existing[0].count} prospects. Skipping seed.`,
        skipped: true,
      });
    }

    let seededCount = 0;

    for (const prospect of seedProspects) {
      // Insert prospect
      const result = await sql`
        INSERT INTO prospects (name, company, email, phone, status, project_requirements, introduction_date, source_email_thread, upcoming_meeting_date, upcoming_meeting_notes)
        VALUES (
          ${prospect.name},
          ${prospect.company},
          ${prospect.email},
          ${prospect.phone},
          ${prospect.status},
          ${prospect.project_requirements},
          ${prospect.introduction_date},
          ${prospect.source_email_thread},
          ${prospect.upcoming_meeting_date},
          ${prospect.upcoming_meeting_notes}
        )
        RETURNING id
      `;

      const prospectId = result[0].id;

      // Insert interaction notes (in reverse order so oldest is first created)
      for (let i = prospect.initial_notes.length - 1; i >= 0; i--) {
        await sql`
          INSERT INTO interaction_notes (prospect_id, note)
          VALUES (${prospectId}, ${prospect.initial_notes[i]})
        `;
      }

      seededCount++;
    }

    return NextResponse.json({
      message: `Successfully seeded ${seededCount} prospects with interaction notes.`,
      count: seededCount,
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: 'Failed to seed database', details: String(error) },
      { status: 500 }
    );
  }
}
