-- Up
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; 
CREATE INDEX idx_alumni_name_trgm ON alumni USING gin (full_name gin_trgm_ops);
CREATE INDEX idx_alumni_batch ON alumni (batch_year);
CREATE INDEX idx_alumni_branch ON alumni (branch);
CREATE INDEX idx_alumni_company ON alumni USING gin (current_company gin_trgm_ops);
CREATE INDEX idx_alumni_completeness ON alumni (data_completeness);
CREATE INDEX idx_alumni_tags ON alumni USING gin (tags);
CREATE INDEX idx_alumni_blind_name ON alumni (full_name_blind);

CREATE INDEX idx_audit_user ON audit.log (user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit.log (action, created_at DESC);

CREATE INDEX idx_refresh_token_hash ON refresh_tokens (token_hash);

CREATE INDEX idx_campaign_recipients_campaign_id ON campaign_recipients (campaign_id);
CREATE INDEX idx_campaign_recipients_alumni_id ON campaign_recipients (alumni_id);

-- Down
DROP INDEX idx_campaign_recipients_alumni_id;
DROP INDEX idx_campaign_recipients_campaign_id;
DROP INDEX idx_refresh_token_hash;

DROP INDEX idx_audit_action;
DROP INDEX idx_audit_user;

DROP INDEX idx_alumni_blind_name;
DROP INDEX idx_alumni_tags;
DROP INDEX idx_alumni_completeness;
DROP INDEX idx_alumni_company;
DROP INDEX idx_alumni_branch;
DROP INDEX idx_alumni_batch;
DROP INDEX idx_alumni_name_trgm;
