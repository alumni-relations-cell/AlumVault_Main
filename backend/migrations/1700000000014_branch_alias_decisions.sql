-- Up

-- Persistent store for "same / different" decisions the operator makes during
-- the interactive rematch flow. Without this, every rematch run would re-ask
-- the same branch and degree pairs the user already resolved.
--
-- Pair (value_a, value_b) is stored in lower-case sorted order so the
-- UNIQUE constraint covers both directions of the same pair.

CREATE TABLE IF NOT EXISTS branch_alias_decisions (
  id          BIGSERIAL PRIMARY KEY,
  field       VARCHAR(10)  NOT NULL CHECK (field IN ('branch', 'degree')),
  value_a     TEXT         NOT NULL,
  value_b     TEXT         NOT NULL,
  decision    VARCHAR(15)  NOT NULL CHECK (decision IN ('same', 'different')),
  preferred   TEXT,
  decided_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
  decided_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(field, value_a, value_b)
);

CREATE INDEX IF NOT EXISTS idx_branch_alias_decisions_field
  ON branch_alias_decisions(field);
