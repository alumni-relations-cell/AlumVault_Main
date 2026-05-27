-- Up
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE audit.log (
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

-- Down
DROP TABLE audit.log;
DROP SCHEMA audit;
