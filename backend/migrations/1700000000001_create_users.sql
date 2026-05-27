-- Up
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                VARCHAR(255) UNIQUE NOT NULL,
    password_hash        VARCHAR(255) NOT NULL,
    role                 VARCHAR(20) NOT NULL CHECK (role IN ('super_admin','admin','team_lead','team_member')),
    name                 VARCHAR(255) NOT NULL,
    is_active            BOOLEAN DEFAULT true,
    is_locked            BOOLEAN DEFAULT false,
    totp_secret          VARCHAR(255),
    totp_enabled         BOOLEAN DEFAULT false,
    password_history     JSONB DEFAULT '[]',
    last_password_change TIMESTAMPTZ DEFAULT NOW(),
    team_lead_id         UUID REFERENCES users(id),
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Down
DROP TABLE users;
