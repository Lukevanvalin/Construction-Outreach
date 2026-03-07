import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY environment variable is not set' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { transcript } = body;

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: 'Transcript is required' },
        { status: 400 }
      );
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: `You are an expert meeting note-taker for a construction industry CRM. Analyze the following meeting transcript and provide a structured summary.

Your response must be valid JSON with this exact structure:
{
  "summary": "A comprehensive but concise summary of the meeting. Cover the key topics discussed, decisions made, and important context. Write in a professional tone suitable for CRM notes. Aim for 3-5 solid paragraphs.",
  "actionItems": ["Action item 1", "Action item 2", ...],
  "nextMeetingDate": "YYYY-MM-DDTHH:mm:ss" or null
}

Guidelines:
- The summary should be actionable and informative, not overly detailed but comprehensive enough to remind someone of the key points
- Extract ALL action items mentioned, including follow-ups, tasks, deliverables, and commitments
- For nextMeetingDate, extract any mentioned upcoming meeting date/time. If a specific date is mentioned, convert it to ISO format. If only a relative date is mentioned (e.g., "next Tuesday"), estimate based on typical business scheduling. If no meeting date is mentioned, set to null.
- Focus on construction-related details: project scope, timelines, budgets, materials, subcontractors, permits, etc.

IMPORTANT: Return ONLY the JSON object, no additional text or markdown formatting.

Transcript:
${transcript}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to process transcript with AI' },
        { status: 500 }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.content[0]?.text;

    if (!content) {
      return NextResponse.json(
        { error: 'No response from AI' },
        { status: 500 }
      );
    }

    // Parse the JSON response from Claude
    let parsed;
    try {
      // Try to extract JSON from the response (in case it's wrapped in markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(content);
      }
    } catch {
      console.error('Failed to parse AI response:', content);
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      summary: parsed.summary || '',
      actionItems: parsed.actionItems || [],
      nextMeetingDate: parsed.nextMeetingDate || null,
    });
  } catch (error) {
    console.error('AI summarize error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
