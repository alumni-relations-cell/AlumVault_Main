-- Up

-- Track which import job created each alumnus row, so an import can be
-- rolled back cleanly without re-discovering inserts via JSONB heuristics.
--
-- Set only on INSERT (by the Go importer). Updates from later imports do
-- NOT change this — it always points at the import that first created the
-- row. Deleting an import job CASCADEs to NULL here (we don't want to lose
-- the alumnus when the import job record is purged).

ALTER TABLE alumni
  ADD COLUMN IF NOT EXISTS source_import_id UUID
    REFERENCES import_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alumni_source_import_id
  ON alumni(source_import_id) WHERE source_import_id IS NOT NULL;

-- Backfill the cancelled "all students.xlsx" roster job (May 2026) so the
-- reviewer can roll it back. Identify alumni it created by:
--   1. created_at within the job window, AND
--   2. emails/phones JSONB carries a contact entry whose source_name matches
--      the job's file_path.
UPDATE alumni a
SET source_import_id = ij.id
FROM import_jobs ij
WHERE a.source_import_id IS NULL
  AND ij.source_type = 'admission_roster'
  AND a.created_at >= COALESCE(ij.started_at, ij.created_at)
  AND a.created_at <= COALESCE(ij.completed_at, NOW())
  AND (
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(a.emails, '[]'::jsonb)) e
      WHERE e->>'source_name' = ij.file_path
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(a.phones, '[]'::jsonb)) p
      WHERE p->>'source_name' = ij.file_path
    )
  );
