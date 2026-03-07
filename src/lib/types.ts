export type ProspectStatus =
  | 'New Lead'
  | 'Contacted'
  | 'Meeting Scheduled'
  | 'Proposal Sent'
  | 'In Progress'
  | 'Closed Won'
  | 'Closed Lost';

export const PROSPECT_STATUSES: ProspectStatus[] = [
  'New Lead',
  'Contacted',
  'Meeting Scheduled',
  'Proposal Sent',
  'In Progress',
  'Closed Won',
  'Closed Lost',
];

export const STATUS_COLORS: Record<ProspectStatus, { bg: string; text: string; dot: string }> = {
  'New Lead': { bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' },
  'Contacted': { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  'Meeting Scheduled': { bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-500' },
  'Proposal Sent': { bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500' },
  'In Progress': { bg: 'bg-cyan-100', text: 'text-cyan-800', dot: 'bg-cyan-500' },
  'Closed Won': { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  'Closed Lost': { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
};

export interface Prospect {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  status: ProspectStatus;
  project_requirements: string;
  introduction_date: string | null;
  source_email_thread: string;
  upcoming_meeting_date: string | null;
  upcoming_meeting_notes: string;
  created_at: string;
  updated_at: string;
  last_interaction_date?: string | null;
}

export interface InteractionNote {
  id: string;
  prospect_id: string;
  note: string;
  created_at: string;
}

export interface MeetingTranscript {
  id: string;
  prospect_id: string;
  transcript: string;
  ai_summary: string;
  extracted_action_items: string;
  extracted_meeting_date: string | null;
  created_at: string;
}

export interface AISummaryResponse {
  summary: string;
  actionItems: string[];
  nextMeetingDate: string | null;
}
