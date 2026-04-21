-- Construction-Outreach v2 schema.
-- Account-centric, multi-source, full customer lifecycle.
-- Runs AFTER scripts/export-preservation.mjs has produced data/preservation-*.json.
-- Runs BEFORE scripts/seed-from-preservation.mjs which rehydrates accounts/contacts.

BEGIN;

-- =============================================================================
-- 0. Drop v1 tables (data already preserved in data/preservation-*.json)
-- =============================================================================
DROP TABLE IF EXISTS interaction_notes CASCADE;
DROP TABLE IF EXISTS meeting_transcripts CASCADE;
DROP TABLE IF EXISTS prospects CASCADE;
DROP TABLE IF EXISTS gmail_tokens CASCADE;

-- =============================================================================
-- 1. Enums
-- =============================================================================
DROP TYPE IF EXISTS account_status CASCADE;
CREATE TYPE account_status AS ENUM ('Active', 'Dormant', 'Lost');

DROP TYPE IF EXISTS deal_stage CASCADE;
CREATE TYPE deal_stage AS ENUM (
  'Intro', 'Discovery', 'Proposal', 'Negotiation', 'Proposal Accepted',
  'Kickoff', 'Build', 'Delivery', 'Adoption', 'Expansion', 'Lost'
);

-- Workshop ($5k, 2h15m, teach Claude Code) vs Build (actual AI agent) vs Advisory.
-- Orthogonal to stage. A single account may have both a Workshop deal and a Build deal running at once.
DROP TYPE IF EXISTS deal_type CASCADE;
CREATE TYPE deal_type AS ENUM ('Workshop', 'Build', 'Advisory');

DROP TYPE IF EXISTS document_kind CASCADE;
CREATE TYPE document_kind AS ENUM (
  'MSA', 'SOW', 'Proposal', 'Invoice', 'EngagementLetter', 'NDA', 'Signed', 'Other'
);

DROP TYPE IF EXISTS document_state CASCADE;
CREATE TYPE document_state AS ENUM (
  'Draft', 'Sent', 'Viewed', 'Signed', 'Voided', 'Declined', 'Paid', 'Overdue'
);

DROP TYPE IF EXISTS event_source CASCADE;
CREATE TYPE event_source AS ENUM (
  'bubbles', 'gmail', 'gcal', 'slack', 'imessage', 'notion',
  'docusign', 'dropbox_sign', 'hellosign', 'adobesign',
  'bill_com', 'qbo', 'stripe',
  'manual', 'system', 'research'
);

DROP TYPE IF EXISTS event_kind CASCADE;
CREATE TYPE event_kind AS ENUM (
  'meeting_held', 'meeting_scheduled', 'meeting_cancelled',
  'email_sent', 'email_received', 'email_cc_received',
  'doc_sent', 'doc_viewed', 'doc_signed', 'doc_voided', 'doc_declined',
  'invoice_sent', 'invoice_paid', 'invoice_overdue',
  'slack_message', 'imessage',
  'note_added', 'stage_changed', 'research_updated',
  'sla_logged', 'sla_fulfilled', 'sla_missed',
  'contact_added'
);

DROP TYPE IF EXISTS contact_source CASCADE;
CREATE TYPE contact_source AS ENUM ('ingested', 'research', 'manual', 'preservation');

DROP TYPE IF EXISTS sla_status CASCADE;
CREATE TYPE sla_status AS ENUM ('Open', 'Fulfilled', 'Missed', 'Cancelled');

DROP TYPE IF EXISTS integration_provider CASCADE;
CREATE TYPE integration_provider AS ENUM ('gmail', 'gcal', 'slack', 'notion');

-- =============================================================================
-- 2. Accounts (companies) — the primary entity
-- =============================================================================
CREATE TABLE accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,
  status            account_status NOT NULL DEFAULT 'Active',
  owner             TEXT NOT NULL DEFAULT 'luke',

  -- Research fields (populated by /api/accounts/[id]/research)
  primary_domain    TEXT,
  website           TEXT,
  location          TEXT,
  industry          TEXT,
  employee_count    INTEGER,
  annual_revenue    TEXT,
  founded_year      INTEGER,
  ceo_name          TEXT,
  description       TEXT,
  research_json     JSONB,
  research_updated_at TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_accounts_status ON accounts(status);
CREATE INDEX idx_accounts_primary_domain ON accounts(primary_domain);

-- Domain → account routing (for CC'd DocuSign/invoice emails).
CREATE TABLE account_domains (
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  domain      TEXT NOT NULL,
  PRIMARY KEY (account_id, domain)
);
CREATE UNIQUE INDEX idx_account_domains_domain ON account_domains(domain);

-- =============================================================================
-- 3. Contacts (people) — can belong to multiple accounts
-- =============================================================================
CREATE TABLE contacts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name          TEXT NOT NULL,
  email              TEXT UNIQUE,
  phone              TEXT,
  title              TEXT,
  is_key_figure      BOOLEAN NOT NULL DEFAULT FALSE,
  primary_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  source             contact_source NOT NULL DEFAULT 'manual',
  source_ref         TEXT,
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_contacts_primary_account ON contacts(primary_account_id);
CREATE INDEX idx_contacts_email ON contacts(LOWER(email));

-- Many-to-many for rare cross-account relationships (consultants, CFOs serving multiple firms).
CREATE TABLE account_contacts (
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role        TEXT,
  PRIMARY KEY (account_id, contact_id)
);
CREATE INDEX idx_account_contacts_contact ON account_contacts(contact_id);

-- =============================================================================
-- 4. Deals — one account can have several over time
-- =============================================================================
CREATE TABLE deals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  stage       deal_stage NOT NULL DEFAULT 'Intro',
  type        deal_type NOT NULL DEFAULT 'Build',
  value_usd   NUMERIC(12, 2),
  owner       TEXT NOT NULL DEFAULT 'luke',
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ,
  outcome     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_deals_account ON deals(account_id);
CREATE INDEX idx_deals_stage ON deals(stage);
CREATE INDEX idx_deals_type ON deals(type);

-- =============================================================================
-- 5. Documents — MSA / SOW / Proposal / Invoice / Signed / etc.
-- =============================================================================
CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id       UUID REFERENCES deals(id) ON DELETE SET NULL,
  kind          document_kind NOT NULL,
  title         TEXT NOT NULL,
  hash          TEXT,              -- sha256 of the file bytes when available
  source_ref    TEXT NOT NULL,     -- gmail:msg:<id> | docusign:envelope:<id> | drive:<id> | local:<path>
  envelope_id   TEXT,              -- DocuSign / Dropbox Sign envelope identifier
  state         document_state NOT NULL DEFAULT 'Draft',
  recipients    JSONB,             -- [{name, email, role}]
  sent_at       TIMESTAMPTZ,
  viewed_at     TIMESTAMPTZ,
  responded_at  TIMESTAMPTZ,
  signed_at     TIMESTAMPTZ,
  drive_url     TEXT,
  storage_url   TEXT,              -- our own blob storage if we end up stashing a copy
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_documents_source_ref ON documents(source_ref);
CREATE INDEX idx_documents_account_kind ON documents(account_id, kind);
CREATE INDEX idx_documents_state ON documents(state);
CREATE INDEX idx_documents_envelope ON documents(envelope_id) WHERE envelope_id IS NOT NULL;

-- =============================================================================
-- 6. Timeline events — unified append-only log across every source
-- =============================================================================
CREATE TABLE timeline_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id      UUID REFERENCES deals(id) ON DELETE SET NULL,
  contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,
  document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  source       event_source NOT NULL,
  kind         event_kind NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL,
  actor        TEXT,             -- 'luke' | contact email | external service name
  summary      TEXT NOT NULL,    -- 1-line human readable
  source_ref   TEXT NOT NULL,    -- gmail:msg:<id> | bubbles:<path> | slack:<team>/<channel>/<ts> | ...
  payload      JSONB,            -- full raw payload for the agent to re-read
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_timeline_source_ref ON timeline_events(source_ref);
CREATE INDEX idx_timeline_account_time ON timeline_events(account_id, occurred_at DESC);
CREATE INDEX idx_timeline_deal_time ON timeline_events(deal_id, occurred_at DESC);
CREATE INDEX idx_timeline_kind ON timeline_events(kind);
CREATE INDEX idx_timeline_source ON timeline_events(source);

-- =============================================================================
-- 7. SLA commitments — "I'll send by Friday" etc. extracted from transcripts
-- =============================================================================
CREATE TABLE sla_commitments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id            UUID REFERENCES deals(id) ON DELETE SET NULL,
  commitment_text    TEXT NOT NULL,
  owner              TEXT NOT NULL DEFAULT 'luke',
  due_at             TIMESTAMPTZ,
  fulfilled_at       TIMESTAMPTZ,
  status             sla_status NOT NULL DEFAULT 'Open',
  extracted_from_ref TEXT NOT NULL, -- source_ref of the timeline_event this came from
  fulfilled_by_ref   TEXT,          -- source_ref of the timeline_event that fulfilled it
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sla_account_status ON sla_commitments(account_id, status);
CREATE INDEX idx_sla_due ON sla_commitments(due_at) WHERE status = 'Open';

-- =============================================================================
-- 8. Ingestion runs — per-source sync tracking (so the agent can see holes)
-- =============================================================================
CREATE TABLE ingestion_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       event_source NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  cursor       TEXT,              -- source-specific continuation token (gmail historyId, slack cursor, etc.)
  rows_written INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  errors_json  JSONB,
  ok           BOOLEAN
);
CREATE INDEX idx_ingestion_runs_source_time ON ingestion_runs(source, started_at DESC);

-- =============================================================================
-- 9. Agent chat sessions — per-account conversation history for the dashboard chat
-- =============================================================================
CREATE TABLE agent_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID REFERENCES accounts(id) ON DELETE CASCADE,  -- null = global session
  title        TEXT,
  messages     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{role, content, tool_calls, created_at}]
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_sessions_account ON agent_sessions(account_id, updated_at DESC);

-- =============================================================================
-- 10. Integration tokens — generic replacement for gmail_tokens
-- =============================================================================
CREATE TABLE integration_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        integration_provider NOT NULL,
  connected_email TEXT,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  expiry_date     BIGINT,
  scope           TEXT,
  last_sync_at    TIMESTAMPTZ,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_integration_provider_email ON integration_tokens(provider, connected_email);

-- =============================================================================
-- 11. updated_at triggers
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'accounts','contacts','deals','documents',
    'sla_commitments','agent_sessions','integration_tokens'
  ])
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

COMMIT;
