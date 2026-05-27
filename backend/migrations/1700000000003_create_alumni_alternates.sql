-- Up
CREATE TABLE alumni_alternates (
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

-- Down
DROP TABLE alumni_alternates;
