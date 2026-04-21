// v2 types — account-centric, multi-source, full customer lifecycle.
// Mirrors migrations/001_v2_schema.sql.

export type AccountStatus = 'Active' | 'Dormant' | 'Lost';

export type DealStage =
  | 'Intro'
  | 'Discovery'
  | 'Proposal'
  | 'Negotiation'
  | 'Proposal Accepted'
  | 'Kickoff'
  | 'Build'
  | 'Delivery'
  | 'Adoption'
  | 'Expansion'
  | 'Lost';

export const DEAL_STAGES: DealStage[] = [
  'Intro', 'Discovery', 'Proposal', 'Negotiation', 'Proposal Accepted',
  'Kickoff', 'Build', 'Delivery', 'Adoption', 'Expansion', 'Lost',
];

// Workshop = $5k, 2h15m Claude Code training engagement.
// Build    = actual AI agent deployment.
// Advisory = ongoing advisory/consulting.
export type DealType = 'Workshop' | 'Build' | 'Advisory';
export const DEAL_TYPES: DealType[] = ['Workshop', 'Build', 'Advisory'];

export type DocumentKind =
  | 'MSA' | 'SOW' | 'Proposal' | 'Invoice'
  | 'EngagementLetter' | 'NDA' | 'Signed' | 'Other';

export type DocumentState =
  | 'Draft' | 'Sent' | 'Viewed' | 'Signed'
  | 'Voided' | 'Declined' | 'Paid' | 'Overdue';

export type EventSource =
  | 'bubbles' | 'gmail' | 'gcal' | 'slack' | 'imessage' | 'notion'
  | 'docusign' | 'dropbox_sign' | 'hellosign' | 'adobesign'
  | 'bill_com' | 'qbo' | 'stripe'
  | 'manual' | 'system' | 'research';

export type EventKind =
  | 'meeting_held' | 'meeting_scheduled' | 'meeting_cancelled'
  | 'email_sent' | 'email_received' | 'email_cc_received'
  | 'doc_sent' | 'doc_viewed' | 'doc_signed' | 'doc_voided' | 'doc_declined'
  | 'invoice_sent' | 'invoice_paid' | 'invoice_overdue'
  | 'slack_message' | 'imessage'
  | 'note_added' | 'stage_changed' | 'research_updated'
  | 'sla_logged' | 'sla_fulfilled' | 'sla_missed'
  | 'contact_added';

export type ContactSource = 'ingested' | 'research' | 'manual' | 'preservation';

export type SlaStatus = 'Open' | 'Fulfilled' | 'Missed' | 'Cancelled';

export type IntegrationProvider = 'gmail' | 'gcal' | 'slack' | 'notion';

// --- Tables ---

export interface Account {
  id: string;
  name: string;
  status: AccountStatus;
  owner: string;
  primary_domain: string | null;
  website: string | null;
  location: string | null;
  industry: string | null;
  employee_count: number | null;
  annual_revenue: string | null;
  founded_year: number | null;
  ceo_name: string | null;
  description: string | null;
  research_json: Record<string, unknown> | null;
  research_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_key_figure: boolean;
  primary_account_id: string | null;
  source: ContactSource;
  source_ref: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  account_id: string;
  name: string;
  stage: DealStage;
  type: DealType;
  value_usd: string | null;
  owner: string;
  opened_at: string;
  closed_at: string | null;
  outcome: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  account_id: string;
  deal_id: string | null;
  kind: DocumentKind;
  title: string;
  hash: string | null;
  source_ref: string;
  envelope_id: string | null;
  state: DocumentState;
  recipients: Array<{ name?: string; email?: string; role?: string }> | null;
  sent_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  signed_at: string | null;
  drive_url: string | null;
  storage_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  id: string;
  account_id: string;
  deal_id: string | null;
  contact_id: string | null;
  document_id: string | null;
  source: EventSource;
  kind: EventKind;
  occurred_at: string;
  actor: string | null;
  summary: string;
  source_ref: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface SlaCommitment {
  id: string;
  account_id: string;
  deal_id: string | null;
  commitment_text: string;
  owner: string;
  due_at: string | null;
  fulfilled_at: string | null;
  status: SlaStatus;
  extracted_from_ref: string;
  fulfilled_by_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface IngestionRun {
  id: string;
  source: EventSource;
  started_at: string;
  finished_at: string | null;
  cursor: string | null;
  rows_written: number;
  rows_skipped: number;
  errors_json: unknown;
  ok: boolean | null;
}

export interface AgentSession {
  id: string;
  account_id: string | null;
  title: string | null;
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tool_calls?: unknown;
    created_at: string;
  }>;
  started_at: string;
  updated_at: string;
}

// --- UI helpers ---

export const STAGE_COLORS: Record<DealStage, { bg: string; text: string; dot: string }> = {
  'Intro':              { bg: 'bg-blue-100',    text: 'text-blue-800',    dot: 'bg-blue-500' },
  'Discovery':          { bg: 'bg-cyan-100',    text: 'text-cyan-800',    dot: 'bg-cyan-500' },
  'Proposal':           { bg: 'bg-orange-100',  text: 'text-orange-800',  dot: 'bg-orange-500' },
  'Negotiation':        { bg: 'bg-amber-100',   text: 'text-amber-800',   dot: 'bg-amber-500' },
  'Proposal Accepted':  { bg: 'bg-purple-100',  text: 'text-purple-800',  dot: 'bg-purple-500' },
  'Kickoff':            { bg: 'bg-indigo-100',  text: 'text-indigo-800',  dot: 'bg-indigo-500' },
  'Build':              { bg: 'bg-teal-100',    text: 'text-teal-800',    dot: 'bg-teal-500' },
  'Delivery':           { bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  'Adoption':           { bg: 'bg-green-100',   text: 'text-green-800',   dot: 'bg-green-500' },
  'Expansion':          { bg: 'bg-lime-100',    text: 'text-lime-800',    dot: 'bg-lime-500' },
  'Lost':               { bg: 'bg-red-100',     text: 'text-red-800',     dot: 'bg-red-500' },
};
