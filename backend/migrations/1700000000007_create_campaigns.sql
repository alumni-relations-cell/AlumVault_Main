-- Up
CREATE TABLE campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(20) NOT NULL,
    audience_filter JSONB NOT NULL,
    audience_count  INT DEFAULT 0,
    template_body   TEXT NOT NULL,
    template_subject VARCHAR(255),
    status          VARCHAR(20) DEFAULT 'draft',
    scheduled_at    TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    delivered_count INT DEFAULT 0,
    opened_count    INT DEFAULT 0,
    clicked_count   INT DEFAULT 0,
    bounced_count   INT DEFAULT 0,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE campaign_recipients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES campaigns(id),
    alumni_id       UUID NOT NULL REFERENCES alumni(id),
    email_used      VARCHAR(255) NOT NULL,
    status          VARCHAR(20) DEFAULT 'pending',
    delivered_at    TIMESTAMPTZ,
    opened_at       TIMESTAMPTZ,
    bounced_at      TIMESTAMPTZ,
    bounce_reason   VARCHAR(255)
);

-- Down
DROP TABLE campaign_recipients;
DROP TABLE campaigns;
