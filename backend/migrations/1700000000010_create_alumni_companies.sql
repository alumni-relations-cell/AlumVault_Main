-- Up

-- ----------------------------------------------------------------------------
-- alumni_companies: employment history per alumnus.
-- One row per (alumni_id, company) pair. is_current flags the latest job.
-- source records where the data came from so conflicts can be resolved.
-- ----------------------------------------------------------------------------
CREATE TABLE alumni_companies (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumni_id    UUID NOT NULL REFERENCES alumni(id) ON DELETE CASCADE,
    company      VARCHAR(255) NOT NULL,
    title        VARCHAR(255),
    is_current   BOOLEAN DEFAULT false,
    source       VARCHAR(100),
    confidence   FLOAT DEFAULT 0.7,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (alumni_id, company)
);

CREATE INDEX idx_alumni_companies_alumni ON alumni_companies (alumni_id);
CREATE INDEX idx_alumni_companies_company_trgm ON alumni_companies USING gin (company gin_trgm_ops);
CREATE INDEX idx_alumni_companies_current ON alumni_companies (alumni_id) WHERE is_current = true;

-- ----------------------------------------------------------------------------
-- alumni.missing_in_apollo: caches negative Apollo lookups so we don't burn
-- credits asking again for someone Apollo doesn't know.
-- ----------------------------------------------------------------------------
ALTER TABLE alumni ADD COLUMN missing_in_apollo BOOLEAN DEFAULT false;
ALTER TABLE alumni ADD COLUMN apollo_checked_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- linkedin_url is the primary dedup key. Unique-among-non-null.
-- Lowercased so 'LinkedIn.com/in/Foo' == 'linkedin.com/in/foo' for dedup.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX idx_alumni_linkedin_unique
    ON alumni (LOWER(linkedin_url))
    WHERE linkedin_url IS NOT NULL AND linkedin_url <> '';

-- ----------------------------------------------------------------------------
-- Fallback dedup key when LinkedIn URL is missing: (name_blind, batch, branch).
-- Not unique because legitimate near-collisions exist (twins, common names);
-- the matcher decides via review_queue.
-- ----------------------------------------------------------------------------
CREATE INDEX idx_alumni_dedup_fallback ON alumni (full_name_blind, batch_year, branch);

-- Down
DROP INDEX IF EXISTS idx_alumni_dedup_fallback;
DROP INDEX IF EXISTS idx_alumni_linkedin_unique;
ALTER TABLE alumni DROP COLUMN IF EXISTS apollo_checked_at;
ALTER TABLE alumni DROP COLUMN IF EXISTS missing_in_apollo;
DROP INDEX IF EXISTS idx_alumni_companies_current;
DROP INDEX IF EXISTS idx_alumni_companies_company_trgm;
DROP INDEX IF EXISTS idx_alumni_companies_alumni;
DROP TABLE IF EXISTS alumni_companies;
