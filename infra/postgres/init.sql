-- =============================================================================
-- Alumni Portal — Complete Database Schema
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- Trigram fuzzy search
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()

-- =============================================================================
-- Database Roles
-- =============================================================================

-- api_user: used by Node.js backend — full CRUD on all tables except audit
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'api_user') THEN
    CREATE ROLE api_user WITH LOGIN PASSWORD 'password';
  END IF;
END
$$;

-- audit_user: INSERT-only on audit.log — used by audit logging middleware
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'audit_user') THEN
    CREATE ROLE audit_user WITH LOGIN PASSWORD 'audit_password';
  END IF;
END
$$;

-- go_worker: used by Go microservices — CRUD on alumni, review_queue, import_jobs
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'go_worker') THEN
    CREATE ROLE go_worker WITH LOGIN PASSWORD 'worker_password';
  END IF;
END
$$;

-- =============================================================================
-- Core Tables
-- =============================================================================

-- Users — system users (your team)
CREATE TABLE IF NOT EXISTS users (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                VARCHAR(255) UNIQUE NOT NULL,
    password_hash        VARCHAR(255) NOT NULL,
    role                 VARCHAR(20) NOT NULL
                         CHECK (role IN ('super_admin','admin','team_lead','team_member')),
    name                 VARCHAR(255) NOT NULL,
    is_active            BOOLEAN DEFAULT true,
    is_locked            BOOLEAN DEFAULT false,
    totp_secret          VARCHAR(255),
    totp_enabled         BOOLEAN DEFAULT false,
    password_history     JSONB DEFAULT '[]',
    last_password_change TIMESTAMPTZ DEFAULT NOW(),
    team_lead_id         UUID REFERENCES users(id),
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Alumni — master alumni records (golden record)
CREATE TABLE IF NOT EXISTS alumni (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity (mostly from college records, tier 1)
    full_name           VARCHAR(255) NOT NULL,
    full_name_blind     VARCHAR(64),
    enrollment_no       VARCHAR(50),
    batch_year          INT,
    branch              VARCHAR(100),
    degree              VARCHAR(50),
    dob                 DATE,

    -- Contact (JSONB arrays — ranked, multiple per person)
    emails              JSONB DEFAULT '[]',
    phones              JSONB DEFAULT '[]',
    -- Each entry: { "value": "encrypted_string", "rank": 1, "type": "work",
    --               "source_tier": 3, "source_name": "apollo_api",
    --               "confidence": 70, "smtp_status": "valid", "added_at": "..." }

    -- Professional
    current_company     VARCHAR(255),
    current_title       VARCHAR(255),
    industry            VARCHAR(100),
    linkedin_url        VARCHAR(500),
    current_city        VARCHAR(100),

    -- Per-field provenance
    field_sources       JSONB DEFAULT '{}',

    -- Metadata
    data_completeness   FLOAT DEFAULT 0,
    overall_confidence  FLOAT DEFAULT 0,
    last_verified_at    TIMESTAMPTZ,
    is_verified         BOOLEAN DEFAULT false,
    tags                TEXT[] DEFAULT '{}',

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    created_by          UUID REFERENCES users(id),
    updated_by          UUID REFERENCES users(id)
);

-- Indexes for alumni
CREATE INDEX IF NOT EXISTS idx_alumni_name_trgm ON alumni USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_alumni_batch ON alumni (batch_year);
CREATE INDEX IF NOT EXISTS idx_alumni_branch ON alumni (branch);
CREATE INDEX IF NOT EXISTS idx_alumni_company ON alumni USING gin (current_company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_alumni_completeness ON alumni (data_completeness);
CREATE INDEX IF NOT EXISTS idx_alumni_tags ON alumni USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_alumni_blind_name ON alumni (full_name_blind);

-- Alumni Alternates — rejected/alternate values per field
CREATE TABLE IF NOT EXISTS alumni_alternates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumni_id       UUID NOT NULL REFERENCES alumni(id) ON DELETE CASCADE,
    field_name      VARCHAR(50) NOT NULL,
    value_encrypted TEXT NOT NULL,
    source_tier     INT NOT NULL,
    source_name     VARCHAR(255),
    confidence      FLOAT,
    reason          VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Import Jobs — track every data import
CREATE TABLE IF NOT EXISTS import_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type     VARCHAR(30) NOT NULL,
    source_tier     INT NOT NULL,
    source_name     VARCHAR(255),
    file_path       VARCHAR(500),
    column_mapping  JSONB,
    status          VARCHAR(20) DEFAULT 'pending',

    total_rows      INT DEFAULT 0,
    processed_rows  INT DEFAULT 0,
    merged_count    INT DEFAULT 0,
    new_count       INT DEFAULT 0,
    review_count    INT DEFAULT 0,
    error_count     INT DEFAULT 0,
    error_log       JSONB DEFAULT '[]',

    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Review Queue — human review for ambiguous matches
CREATE TABLE IF NOT EXISTS review_queue (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    existing_alumni_id  UUID REFERENCES alumni(id),
    incoming_data       JSONB NOT NULL,
    match_score         FLOAT NOT NULL,
    score_breakdown     JSONB NOT NULL,
    source_import_id    UUID REFERENCES import_jobs(id),
    status              VARCHAR(20) DEFAULT 'pending',
    resolved_by         UUID REFERENCES users(id),
    resolved_at         TIMESTAMPTZ,
    resolution_note     TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Schema + Log — immutable activity log
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL,
    user_email      VARCHAR(255) NOT NULL,
    user_role       VARCHAR(20) NOT NULL,
    action          VARCHAR(50) NOT NULL,
    resource_type   VARCHAR(30),
    resource_id     UUID,
    details         JSONB,
    ip_address      INET NOT NULL,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit.log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit.log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit.log (resource_type, resource_id);

-- Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(64) NOT NULL UNIQUE,
    device_info     JSONB,
    ip_address      INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(20) NOT NULL,
    audience_filter JSONB NOT NULL,
    audience_count  INT DEFAULT 0,
    template_body   TEXT NOT NULL,
    template_subject VARCHAR(255),
    status          VARCHAR(20) DEFAULT 'draft',
    scheduled_at    TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    delivered_count INT DEFAULT 0,
    opened_count    INT DEFAULT 0,
    clicked_count   INT DEFAULT 0,
    bounced_count   INT DEFAULT 0,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign Recipients
CREATE TABLE IF NOT EXISTS campaign_recipients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES campaigns(id),
    alumni_id       UUID NOT NULL REFERENCES alumni(id),
    email_used      VARCHAR(255) NOT NULL,
    status          VARCHAR(20) DEFAULT 'pending',
    delivered_at    TIMESTAMPTZ,
    opened_at       TIMESTAMPTZ,
    bounced_at      TIMESTAMPTZ,
    bounce_reason   VARCHAR(255)
);

-- =============================================================================
-- Role Grants
-- =============================================================================

-- api_user: full access to all application tables, but NOT audit.log UPDATE/DELETE
GRANT USAGE ON SCHEMA public TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO api_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO api_user;

-- api_user can INSERT into audit.log but cannot UPDATE or DELETE
GRANT USAGE ON SCHEMA audit TO api_user;
GRANT INSERT, SELECT ON audit.log TO api_user;
GRANT USAGE, SELECT ON SEQUENCE audit.log_id_seq TO api_user;

-- audit_user: INSERT-only on audit.log — enforced at DB role level
GRANT USAGE ON SCHEMA audit TO audit_user;
GRANT INSERT ON audit.log TO audit_user;
GRANT USAGE, SELECT ON SEQUENCE audit.log_id_seq TO audit_user;

-- go_worker: CRUD on alumni, alumni_alternates, review_queue, import_jobs
GRANT USAGE ON SCHEMA public TO go_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON alumni TO go_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON alumni_alternates TO go_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON review_queue TO go_worker;
GRANT SELECT, INSERT, UPDATE ON import_jobs TO go_worker;
GRANT SELECT ON users TO go_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO go_worker;

-- go_worker can INSERT audit logs
GRANT USAGE ON SCHEMA audit TO go_worker;
GRANT INSERT ON audit.log TO go_worker;
GRANT USAGE, SELECT ON SEQUENCE audit.log_id_seq TO go_worker;

-- =============================================================================
-- Updated_at trigger function
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alumni_updated_at
    BEFORE UPDATE ON alumni
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
