-- Up

-- Admission roster support: extra identity columns from the admission cell
-- sheet (father/mother name, full address breakdown, program name). These are
-- nullable because non-roster sources (Apollo, alumni portal) won't fill them.
ALTER TABLE alumni
  ADD COLUMN IF NOT EXISTS father_name      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mother_name      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS current_address  TEXT,
  ADD COLUMN IF NOT EXISTS current_state    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pincode          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS program_name     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS gender           VARCHAR(20);

-- enrollment_no is the authoritative dedup key for roster rows. Partial unique
-- so non-roster rows (which don't have it) can coexist without collision.
-- Lowercased so '101810001' and '101810001' won't collide on whitespace/case.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alumni_enrollment_no_unique
  ON alumni (LOWER(enrollment_no))
  WHERE enrollment_no IS NOT NULL AND enrollment_no <> '';

-- Indexed lookup for the matcher's Phase-2 identity step (name+batch+branch).
-- Functional index on lowercased name so the matcher can do a case-insensitive
-- equality lookup instead of falling through to fuzzy similarity.
CREATE INDEX IF NOT EXISTS idx_alumni_identity_lookup
  ON alumni (LOWER(full_name), batch_year, branch);

-- Multi-candidate review support: when the matcher finds 2+ alumni rows that
-- match the same (name, batch, branch), it can't pick one — it stuffs the IDs
-- into this array and the review UI renders an N-column picker. Empty array
-- by default keeps the normal 1-vs-1 flow untouched.
ALTER TABLE review_queue
  ADD COLUMN IF NOT EXISTS candidate_alumni_ids JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS review_type          VARCHAR(30) DEFAULT 'fuzzy';
  -- review_type: 'fuzzy' (existing path) | 'identity_ambiguous' (Phase 2)

-- Down
DROP INDEX IF EXISTS idx_alumni_identity_lookup;
DROP INDEX IF EXISTS idx_alumni_enrollment_no_unique;
ALTER TABLE review_queue
  DROP COLUMN IF EXISTS candidate_alumni_ids,
  DROP COLUMN IF EXISTS review_type;
ALTER TABLE alumni
  DROP COLUMN IF EXISTS father_name,
  DROP COLUMN IF EXISTS mother_name,
  DROP COLUMN IF EXISTS current_address,
  DROP COLUMN IF EXISTS current_state,
  DROP COLUMN IF EXISTS pincode,
  DROP COLUMN IF EXISTS program_name,
  DROP COLUMN IF EXISTS gender;
