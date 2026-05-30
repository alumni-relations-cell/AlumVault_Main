-- Up

-- Multi-signal verification rule for alumni records.
-- A row is considered "verified" iff both independent signals hold:
--   1. At least one email entry has smtp_status='valid' (verifier confirmed deliverable)
--   2. batch_year AND branch are non-empty (alumni identity known)
-- Employment fields (current_company / current_title) are discovered via
-- enrichment, not a precondition for verification.
-- last_verified_at is stamped only on the false -> true transition.
-- Implemented as a BEFORE INSERT/UPDATE trigger so the rule is single-sourced
-- in the DB and survives bugs in any service layer that forgets to recompute it.

CREATE OR REPLACE FUNCTION recompute_alumni_verified() RETURNS TRIGGER AS $$
DECLARE
  has_valid_email  BOOLEAN := false;
  is_now_verified  BOOLEAN := false;
  was_verified     BOOLEAN := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(NEW.emails, '[]'::jsonb)) elem
    WHERE elem->>'smtp_status' = 'valid'
  ) INTO has_valid_email;

  is_now_verified :=
        has_valid_email
    AND NEW.batch_year IS NOT NULL
    AND NEW.branch     IS NOT NULL AND NEW.branch <> '';

  IF TG_OP = 'UPDATE' THEN
    was_verified := COALESCE(OLD.is_verified, false);
  END IF;

  NEW.is_verified := is_now_verified;

  IF is_now_verified AND NOT was_verified THEN
    NEW.last_verified_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS alumni_recompute_verified ON alumni;

CREATE TRIGGER alumni_recompute_verified
BEFORE INSERT OR UPDATE ON alumni
FOR EACH ROW
EXECUTE FUNCTION recompute_alumni_verified();

-- Partial index to make the verified-filter query plan cheap.
CREATE INDEX IF NOT EXISTS idx_alumni_is_verified ON alumni (is_verified) WHERE is_verified = true;

-- Backfill: re-fire the trigger against every existing row so anything that
-- already satisfies the rule gets flipped without waiting for the next write.
UPDATE alumni SET id = id;

-- Down
DROP INDEX IF EXISTS idx_alumni_is_verified;
DROP TRIGGER IF EXISTS alumni_recompute_verified ON alumni;
DROP FUNCTION IF EXISTS recompute_alumni_verified();
