-- Up
CREATE TABLE review_queue (
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

-- Down
DROP TABLE review_queue;
