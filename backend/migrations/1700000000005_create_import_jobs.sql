-- Up
CREATE TABLE import_jobs (
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

-- Down
DROP TABLE import_jobs;
