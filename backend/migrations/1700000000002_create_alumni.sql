-- Up
CREATE TABLE alumni (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name           VARCHAR(255) NOT NULL,
    full_name_blind     VARCHAR(64),
    enrollment_no       VARCHAR(50),
    batch_year          INT,
    branch              VARCHAR(100),
    degree              VARCHAR(50),
    dob                 DATE,
    emails              JSONB DEFAULT '[]',
    phones              JSONB DEFAULT '[]',
    current_company     VARCHAR(255),
    current_title       VARCHAR(255),
    industry            VARCHAR(100),
    linkedin_url        VARCHAR(500),
    current_city        VARCHAR(100),
    field_sources       JSONB DEFAULT '{}',
    data_completeness   FLOAT DEFAULT 0,
    overall_confidence  FLOAT DEFAULT 0,
    last_verified_at    TIMESTAMPTZ,
    is_verified         BOOLEAN DEFAULT false,
    tags                TEXT[] DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    created_by          UUID REFERENCES users(id),
    updated_by          UUID REFERENCES users(id)
);

-- Down
DROP TABLE alumni;
