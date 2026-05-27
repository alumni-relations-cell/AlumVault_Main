# Alumni Backend Portal — System Architecture

> Thapar University Alumni Relations Management System

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [High-Level Architecture](#3-high-level-architecture)
4. [API Layer (Node.js / Express)](#4-api-layer-nodejs--express)
5. [Middleware Stack](#5-middleware-stack)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Database Schema](#7-database-schema)
8. [Go Microworkers](#8-go-microworkers)
9. [Async Message Queue (RabbitMQ)](#9-async-message-queue-rabbitmq)
10. [Caching & Sessions (Redis)](#10-caching--sessions-redis)
11. [Encryption Strategy](#11-encryption-strategy)
12. [Audit Logging](#12-audit-logging)
13. [Python Enrichment Pipeline](#13-python-enrichment-pipeline)
14. [Deployment Architecture](#14-deployment-architecture)
15. [Data Flow Scenarios](#15-data-flow-scenarios)
16. [Security Features](#16-security-features)
17. [Performance Considerations](#17-performance-considerations)
18. [Testing Strategy](#18-testing-strategy)
19. [Configuration Reference](#19-configuration-reference)
20. [Quick Start](#20-quick-start)

---

## 1. Executive Summary

The **Alumni Backend Portal** is a production-grade, multi-service backend for managing alumni data at scale. It ingests data from multiple sources (CSV/XLSX uploads, university portals, external APIs), deduplicates records through fuzzy matching and composite scoring, verifies contact information, and serves enriched data securely via a role-based REST API.

**Core capabilities:**

- Multi-source alumni data ingestion and normalization
- Automatic deduplication via composite fuzzy scoring (name + email + phone + company)
- AES-256-GCM encryption of all PII at rest
- Four-tier RBAC with role-based data masking
- Async pipeline: Node.js → RabbitMQ → Go workers → Python enrichment
- Immutable audit trail with per-field access logging
- Email campaign management with delivery/open/bounce tracking

---

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| **API** | Node.js + Express | 18 LTS / 4.18 |
| **Primary DB** | PostgreSQL | 15 (Alpine) |
| **Cache / Sessions** | Redis | 7 |
| **Message Queue** | RabbitMQ | 3 (management-alpine) |
| **Background Workers** | Go | 1.21 |
| **Enrichment Pipeline** | Python + APScheduler | 3.11 |
| **Reverse Proxy** | NGINX | latest stable |
| **Container Runtime** | Docker + Docker Compose | latest |
| **CI/CD** | GitHub Actions | — |
| **Object Storage** | MinIO (dev) / AWS S3 (prod) | — |
| **Logging** | Pino (structured JSON) | 8 |

---

## 3. High-Level Architecture

```
 External Clients
 (Browser / Mobile / API)
         │
         ▼
   ┌──────────┐
   │  NGINX   │  TLS termination, rate throttle, WebSocket upgrade
   └────┬─────┘
        │
        ▼
 ┌──────────────────────────────────────────────────────────┐
 │              Node.js REST API (Express)                  │
 │                                                          │
 │  helmet → cors → body → cookie → csrf → rateLimit →     │
 │  auditLog → authenticate → rbac → maskData → validate    │
 └──────┬──────────────────────────┬───────────────────────┘
        │                          │
        ▼                          ▼
  ┌───────────┐             ┌────────────┐
  │PostgreSQL │             │   Redis    │
  │ (primary  │             │ sessions / │
  │  data)    │             │ rate limit │
  └───────────┘             └────────────┘
        │
        ▼
  ┌───────────┐
  │ RabbitMQ  │  alumni.exchange  (topic routing)
  └─────┬─────┘
        │
   ┌────┴────────────────────────────┐
   │                                 │
   ▼                                 ▼
Go Workers                    Python Pipeline
├── Importer   (parse CSV)    ├── Apollo.io enrichment
├── Matcher    (fuzzy score)  ├── LinkedIn discovery
├── Verifier   (SMTP check)   ├── GMass re-mining
└── Dedup      (periodic)     ├── Portal sync
                              └── Bounce handler
```

---

## 4. API Layer (Node.js / Express)

### Route Map

```
/health                              Public health check

/api/auth
├── POST   /login                    Credential + 2FA challenge
├── POST   /verify-2fa               TOTP verification
├── POST   /refresh                  Token rotation
├── POST   /register                 Admin-only user creation
├── POST   /change-password          Password update (history enforced)
├── POST   /forgot-password          Reset flow
├── POST   /logout                   Session destruction
└── GET    /me                       Current user profile

/api/alumni
├── GET    /                         Search (fuzzy + filters + cursor pagination)
├── GET    /stats                    Aggregate statistics
├── GET    /:id                      Single record (masked per role)
├── PATCH  /:id                      Update fields (team_lead+)
├── DELETE /:id                      Hard delete (admin+)
├── POST   /:id/reveal               Request PII reveal (all roles)
└── POST   /:id/reveal/approve       Approve reveal request (team_lead+)

/api/import
├── POST   /                         Upload CSV/XLSX/TSV (team_lead+)
├── GET    /                         List import jobs
├── GET    /:id                      Job detail + progress
├── POST   /:id/cancel               Cancel pending job (admin+)
└── POST   /:id/rollback             Rollback completed job (admin+)

/api/review
├── GET    /                         Pending duplicate queue
├── GET    /stats                    Queue statistics
├── GET    /:id                      Duplicate detail with score breakdown
└── POST   /:id/resolve              Approve / reject merge (team_lead+)

/api/campaigns
├── POST   /                         Create campaign (admin+)
├── GET    /                         List campaigns
├── PUT    /:id                      Update campaign
├── DELETE /:id                      Delete campaign
├── GET    /:id                      Campaign report with metrics
└── POST   /:id/send                 Execute send via RabbitMQ (admin+)

/api/enrichment
├── POST   /trigger                  Start Apollo/LinkedIn batch (admin+)
├── GET    /:jobId/progress          Job progress tracking
└── GET    /email-health             Email validity metrics (admin+)

/api/export
└── POST   /                         Export alumni to CSV (super_admin only)

/api/users
├── POST   /                         Create user (admin+)
├── GET    /                         List users
├── GET    /:id                      User detail
├── PATCH  /:id                      Update user
└── DELETE /:id                      Disable user (super_admin only)

/api/audit
├── GET    /                         Query audit log (admin+)
└── GET    /:id                      Audit entry detail

/api/dashboard
└── GET    /                         Summary metrics (all roles)
```

---

## 5. Middleware Stack

Executed in order for every request:

| # | Middleware | Purpose |
|---|---|---|
| 1 | `helmet()` | Security headers (CSP, HSTS, X-Frame-Options) |
| 2 | `cors()` | Origin whitelist validation |
| 3 | `express.json()` | Request body parsing (10 MB limit) |
| 4 | `express.urlencoded()` | Form data parsing |
| 5 | `cookieParser()` | Cookie extraction |
| 6 | `pino-http()` | Structured request logging |
| 7 | `csrfProtection` | Double-submit cookie (mutations only) |
| 8 | `rateLimiter` | Redis sliding-window (per-route, per-user/IP) |
| 9 | `auditLogger` | Async audit log to PostgreSQL |
| 10 | `authenticate` | JWT + session + device fingerprint |
| 11 | `rbac()` | Role-based access control |
| 12 | `maskData` | Response field redaction per role |
| 13 | `validate()` | Joi schema validation |

---

## 6. Authentication & Authorization

### Token Lifecycle

```
Login
  │
  ├── bcrypt verify password
  ├── (if 2FA enabled) issue temp_token → Redis (5 min TTL)
  │   └── POST /verify-2fa → TOTP check → issue full tokens
  │
  ▼
Access Token  (JWT RS256, 15 min)
  payload: { sub, email, role, perms[], name, fp }

Refresh Token (JWT HS256, 7 days)
  stored as SHA-256 hash in refresh_tokens table
  single-use → rotated on every /refresh call

Session
  Redis key: session:{userId}:{deviceHash}  (15 min TTL)
  deviceHash = HMAC(IP + UserAgent)
```

### Role Hierarchy

```
super_admin  (level 4)
  └── admin  (level 3)
        └── team_lead  (level 2)
              └── team_member  (level 1)
```

### Permission Matrix

| Permission | super_admin | admin | team_lead | team_member |
|---|:---:|:---:|:---:|:---:|
| alumni:read | ✓ | ✓ | ✓ | ✓ |
| alumni:write | ✓ | ✓ | ✓ | — |
| alumni:delete | ✓ | ✓ | — | — |
| alumni:export | ✓ | ✓ | ✓ | — |
| alumni:reveal_request | ✓ | ✓ | ✓ | ✓ |
| alumni:reveal_approve | ✓ | ✓ | ✓ | — |
| import:create | ✓ | ✓ | ✓ | — |
| import:cancel / rollback | ✓ | ✓ | — | — |
| review:resolve | ✓ | ✓ | ✓ | — |
| campaign:create | ✓ | ✓ | — | — |
| campaign:read | ✓ | ✓ | ✓ | — |
| user:create / read / update | ✓ | ✓ | — | — |
| user:delete | ✓ | — | — | — |
| audit:read | ✓ | ✓ | — | — |
| enrichment:trigger | ✓ | ✓ | — | — |
| dashboard:read | ✓ | ✓ | ✓ | ✓ |

### Data Masking by Role

| Field | super_admin | admin | team_lead | team_member |
|---|---|---|---|---|
| email | Visible | Visible | `***@domain.com` | `●●●●●●●●` |
| phone | Visible | `+91-XXXXXX-{last4}` | `●●●●●●●●` | `●●●●●●●●` |
| linkedin_url | Visible | Visible | Visible | `null` |
| dob | Visible | Visible | Visible | `●●●●●●●●` |

---

## 7. Database Schema

### Core Tables

**`users`**
```
id               UUID  PK
email            VARCHAR(255)  UNIQUE NOT NULL
password_hash    VARCHAR(255)
role             VARCHAR(20)   super_admin | admin | team_lead | team_member
name             VARCHAR(255)
is_active        BOOLEAN  default true
is_locked        BOOLEAN  default false
totp_secret      VARCHAR(255)
totp_enabled     BOOLEAN  default false
password_history JSONB    (last 5 bcrypt hashes)
team_lead_id     UUID  FK → users.id
created_at       TIMESTAMPTZ
updated_at       TIMESTAMPTZ
```

**`alumni`**
```
id                  UUID  PK
full_name           VARCHAR(255)  NOT NULL
full_name_blind     VARCHAR(64)   HMAC blind index
enrollment_no       VARCHAR(50)
batch_year          INT
branch              VARCHAR(100)
degree              VARCHAR(50)
dob                 DATE
emails              JSONB  [{value: AES-GCM-encrypted, primary: bool, added_at}]
phones              JSONB  [{value: AES-GCM-encrypted, primary: bool, added_at}]
current_company     VARCHAR(255)
current_title       VARCHAR(255)
industry            VARCHAR(100)
linkedin_url        VARCHAR(500)
current_city        VARCHAR(100)
field_sources       JSONB  {email: source_id, phone: source_id, ...}
data_completeness   FLOAT  (0–100%)
overall_confidence  FLOAT  (weighted score)
last_verified_at    TIMESTAMPTZ
is_verified         BOOLEAN
tags                TEXT[]
created_by          UUID  FK → users.id
updated_by          UUID  FK → users.id
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

**`alumni_alternates`** (duplicate candidates)
```
id            UUID  PK
primary_id    UUID  FK → alumni.id
alternate_id  UUID  FK → alumni.id
match_score   FLOAT
status        VARCHAR(20)  pending | approved | rejected
created_at    TIMESTAMPTZ
```

**`import_jobs`**
```
id              UUID  PK
source_type     VARCHAR(30)   csv | xlsx | api
source_tier     INT           1–5  (confidence tier)
source_name     VARCHAR(255)
file_path       VARCHAR(500)
column_mapping  JSONB
status          VARCHAR(20)   pending | processing | completed | failed | cancelled
total_rows      INT
processed_rows  INT
merged_count    INT
new_count       INT
review_count    INT
error_count     INT
error_log       JSONB
started_at      TIMESTAMPTZ
completed_at    TIMESTAMPTZ
created_by      UUID  FK → users.id
created_at      TIMESTAMPTZ
```

**`review_queue`**
```
id                   UUID  PK
existing_alumni_id   UUID  FK → alumni.id
incoming_data        JSONB
match_score          FLOAT
score_breakdown      JSONB  {name, email, phone, company}
source_import_id     UUID  FK → import_jobs.id
status               VARCHAR(20)  pending | approved | rejected
resolved_by          UUID  FK → users.id
resolved_at          TIMESTAMPTZ
resolution_note      TEXT
created_at           TIMESTAMPTZ
```

**`campaigns`**
```
id               UUID  PK
name             VARCHAR(255)
type             VARCHAR(20)   email | sms | notification
audience_filter  JSONB
audience_count   INT
template_body    TEXT
template_subject VARCHAR(255)
status           VARCHAR(20)   draft | scheduled | sent | archived
scheduled_at     TIMESTAMPTZ
sent_at          TIMESTAMPTZ
delivered_count  INT
opened_count     INT
clicked_count    INT
bounced_count    INT
created_by       UUID  FK → users.id
created_at       TIMESTAMPTZ
```

**`campaign_recipients`**
```
id           UUID  PK
campaign_id  UUID  FK → campaigns.id
alumni_id    UUID  FK → alumni.id
email_used   VARCHAR(255)
status       VARCHAR(20)  pending | delivered | opened | bounced | failed
delivered_at TIMESTAMPTZ
opened_at    TIMESTAMPTZ
bounced_at   TIMESTAMPTZ
bounce_reason VARCHAR(255)
```

**`refresh_tokens`**
```
id          UUID  PK
user_id     UUID  FK → users.id  ON DELETE CASCADE
token_hash  VARCHAR(64)  UNIQUE  (SHA-256)
device_info JSONB
ip_address  INET
expires_at  TIMESTAMPTZ
created_at  TIMESTAMPTZ
```

**`audit.log`** (append-only, immutable)
```
id            BIGSERIAL  PK
user_id       UUID
user_email    VARCHAR(255)
user_role     VARCHAR(20)
action        VARCHAR(50)
resource_type VARCHAR(30)
resource_id   UUID
details       JSONB  {statusCode, method, path, duration, query}
ip_address    INET
user_agent    TEXT
created_at    TIMESTAMPTZ  NOT NULL
```

### Key Indexes

```sql
CREATE INDEX ON alumni(batch_year, branch, is_verified);
CREATE INDEX ON alumni(full_name_blind);
CREATE INDEX ON import_jobs(status, created_at);
CREATE INDEX ON review_queue(status, created_at);
CREATE INDEX ON audit.log(user_id, created_at);
CREATE INDEX ON refresh_tokens(user_id, expires_at);
```

---

## 8. Go Microworkers

All workers connect to RabbitMQ exchange `alumni.exchange` (topic type, durable). Internal messages are HMAC-SHA256 signed.

### Importer

| Attribute | Detail |
|---|---|
| Input queue | `import.pending` |
| Output queue | `import.parsed` |
| Responsibility | Parse CSV/XLSX/TSV, normalize fields, encrypt PII with AES-256-GCM, insert/upsert alumni rows |

### Matcher

| Attribute | Detail |
|---|---|
| Input queue | `import.parsed` |
| Output queue | `import.matched` |
| Responsibility | Composite fuzzy scoring: name (80 pts) + email (10 pts) + phone (10 pts) + company (5 pts). Score ≥ 80 → auto-merge. 60–79 → review_queue. |

### Verifier

| Attribute | Detail |
|---|---|
| Input queue | `import.matched` |
| Output queue | `import.verified` |
| Responsibility | SMTP email validation. Updates `overall_confidence`: valid +40, catch_all +15, invalid −20 |

### Dedup

| Attribute | Detail |
|---|---|
| Trigger | Scheduled every 6 hours or via API |
| Output queue | `dedup.completed` |
| Responsibility | Exact + fuzzy duplicate detection across full dataset, creates `alumni_alternates` records |

---

## 9. Async Message Queue (RabbitMQ)

**Exchange:** `alumni.exchange` (topic, durable)

| Routing Key | Produced By | Consumed By | Purpose |
|---|---|---|---|
| `import.pending` | Node API | Go Importer | Parse & encrypt uploaded file |
| `import.parsed` | Go Importer | Go Matcher | Fuzzy match against existing records |
| `import.matched` | Go Matcher | Go Verifier | SMTP email validation |
| `import.verified` | Go Verifier | Python Pipeline | Apollo / LinkedIn enrichment |
| `import.enriched` | Python Pipeline | Node API | Mark job completed, notify via WebSocket |
| `dedup.trigger` | Node API / cron | Go Dedup | Periodic duplicate detection |
| `dedup.completed` | Go Dedup | Node API | WebSocket broadcast to team |
| `campaign.send` | Node API | Python Pipeline | Execute email campaign |
| `bounce.report` | Python Pipeline | Node API | Handle email bounces |

**Message envelope (HMAC-signed):**
```json
{
  "job_id": "uuid",
  "file_path": "/uploads/alumni.csv",
  "source_tier": 3,
  "initiated_by": "user-uuid",
  "data": {}
}
```
```
Headers:
  x-signature: HMAC-SHA256(body, INTERNAL_HMAC_SECRET)
  x-timestamp: unix_seconds  (5-minute freshness window)
```

---

## 10. Caching & Sessions (Redis)

| Key Pattern | TTL | Purpose |
|---|---|---|
| `session:{userId}:{deviceHash}` | 15 min | Active session tracking |
| `2fa:{tokenHash}` | 5 min | Temporary 2FA state |
| `ratelimit:{route}:{ip\|userId}` | Sliding window | Per-route rate limiting |

**Rate limit examples:**

| Route | Max | Window | Key |
|---|---|---|---|
| `POST /api/auth/login` | 5 | 1 min | IP |
| `GET /api/alumni` | 100 | 1 hour | user |
| `POST /api/import` | 10 (admin: 30, super_admin: 50) | 1 day | user |
| Default | 1000 | 1 hour | IP |

---

## 11. Encryption Strategy

### PII Fields (AES-256-GCM)

```
Key:    ENCRYPTION_KEY env var (64-char hex → 32 bytes)
Fields: alumni.emails[].value, alumni.phones[].value
Format: <iv_hex>:<tag_hex>:<ciphertext_hex>
```

### Blind Indexes (HMAC-SHA256)

```
Key:    BLIND_INDEX_KEY env var (64-char hex → 32 bytes)
Fields: alumni.full_name_blind, emails_blind, phones_blind
Use:    Privacy-preserving equality searches without decrypting
```

### Password Hashing

```
Algorithm: bcryptjs, 12 rounds
Storage:   users.password_hash
History:   Last 5 hashes in users.password_history (reuse prevention)
```

### Token Hashing

```
Algorithm: SHA-256
Fields:    refresh_tokens.token_hash
Purpose:   DB breach cannot expose valid refresh tokens
```

### JWT Keys

```
Algorithm: RS256 (RSA 2048-bit) — production
Fallback:  HS256 via JWT_SECRET env var — development only
Paths:     /secrets/jwt_private.pem, /secrets/jwt_public.pem
```

---

## 12. Audit Logging

Every authenticated request is automatically logged to `audit.log` (asynchronously, after response):

```
Captured: user_id, user_email, user_role, action, resource_type,
          resource_id, HTTP method, path, status_code, duration,
          query params, IP address, user_agent, timestamp (UTC)
```

The table is **append-only** — no updates or deletes. All sensitive field accesses (reveal requests, exports) generate explicit audit entries.

---

## 13. Python Enrichment Pipeline

Managed by APScheduler, triggered via `import.verified` queue or `POST /api/enrichment/trigger`.

| Module | Purpose |
|---|---|
| `apollo_enricher.py` | Fetch company/title data from Apollo.io API |
| `linkedin_finder.py` | Discover LinkedIn profile URLs |
| `gmass_miner.py` | Re-mine email addresses via GMass API |
| `portal_sync.py` | Sync from university alumni portal |
| `bounce_handler.py` | Process email bounces, flag invalid addresses |

Enriched fields are written back to `alumni` table via the Node API internal endpoint (HMAC-signed request).

---

## 14. Deployment Architecture

### Docker Services

| Service | Image | Network |
|---|---|---|
| `nginx` | nginx:latest | public + internal |
| `api` | node:18-alpine | internal |
| `go_matcher` | golang:1.21 | internal |
| `go_verifier` | golang:1.21 | internal |
| `go_importer` | golang:1.21 | internal |
| `go_dedup` | golang:1.21 | internal |
| `python_pipeline` | python:3.11 | internal |
| `postgres` | postgres:15-alpine | internal |
| `redis` | redis:7-alpine | internal |
| `rabbitmq` | rabbitmq:3-management-alpine | internal |
| `minio` | minio/minio | internal |

Only NGINX is on the `public` network. All services communicate over the isolated `internal` network.

### NGINX Responsibilities

- TLS termination (certs at `/infra/certs/`)
- HTTP → HTTPS redirect
- WebSocket upgrade (`/ws` path)
- Round-robin load balancing to Node API instances
- First-layer rate throttling

### CI/CD (GitHub Actions)

Triggers: PRs to `main`/`develop`, push to `develop`

```
Jobs:
  node-test:
    - ESLint
    - Jest unit tests (with PostgreSQL + Redis services)
    - Coverage report

  go-build:
    - go build ./cmd/matcher
    - go build ./cmd/verifier
    - go build ./cmd/importer
    - go build ./cmd/dedup
    - go test -race ./...

  python-lint:
    - flake8
    - Requirements validation
```

---

## 15. Data Flow Scenarios

### CSV Import & Deduplication

```
1. team_lead uploads alumni.csv
   POST /api/import  →  Node creates import_job (status: pending)
                    →  Publishes to import.pending

2. Go Importer
   - Downloads file from S3/MinIO
   - Parses + normalizes + encrypts PII
   - Upserts alumni rows
   - Publishes to import.parsed

3. Go Matcher
   - Fuzzy scores each row against existing alumni
   - score ≥ 80  →  auto-merge
   - 60–79       →  review_queue (status: pending)
   - Publishes to import.matched

4. Go Verifier
   - SMTP-validates email addresses
   - Adjusts overall_confidence
   - Publishes to import.verified

5. Python Pipeline
   - Enriches with Apollo/LinkedIn
   - Publishes to import.enriched

6. Node API
   - Updates job status: completed
   - WebSocket broadcast: notifyImportProgress(userId, jobId, {...})

7. team_lead reviews duplicates
   GET /api/review → list
   POST /api/review/:id/resolve → approve merge
```

### Campaign Execution

```
1. admin creates campaign (status: draft)
2. admin schedules send (status: scheduled, scheduled_at: ...)
3. Python scheduler fires at scheduled_at
   - Resolves audience_filter → alumni IDs
   - Publishes to campaign.send
4. Python renders + sends emails via SMTP/SES
   - Creates campaign_recipients rows
5. External server webhooks bounce events
   - Python bounce_handler → bounce.report queue
6. Node updates campaign_recipients status
   - WebSocket: campaign.updated
7. GET /api/campaigns/:id → delivered / opened / bounced counts
```

### PII Reveal Request

```
1. team_member: POST /api/alumni/:id/reveal  { field: 'phone' }
   → Node creates reveal_request, WebSocket notifies team_leads

2. team_lead:   POST /api/alumni/:id/reveal/approve  { approved: true }
   → Node logs approval to audit.log

3. team_member: GET /api/alumni/:id
   → maskData middleware checks approval → phone now visible

4. Full trail in audit.log: who requested, who approved, when, which field
```

---

## 16. Security Features

| Category | Controls |
|---|---|
| **Transport** | HTTPS/TLS via NGINX, HSTS header |
| **Network** | Internal Docker network, only 80/443 public |
| **Headers** | Helmet (CSP, X-Frame-Options, X-Content-Type-Options) |
| **CORS** | Whitelist-based origin validation |
| **CSRF** | Double-submit cookie (SameSite: strict) |
| **Rate limiting** | Redis sliding window, per-route, per-role overrides |
| **Input validation** | Joi schemas on all request bodies |
| **Authentication** | JWT RS256, 15-min access token, 7-day refresh rotation |
| **Device binding** | HMAC(IP + UserAgent) fingerprint in JWT payload |
| **2FA** | TOTP (RFC 6238) with 5-min temp token TTL |
| **Brute force** | 5 login attempts / min per IP |
| **PII encryption** | AES-256-GCM at rest for emails + phones |
| **Password security** | bcryptjs 12 rounds + 5-hash history |
| **Token security** | SHA-256 hash stored (not raw token) |
| **Service auth** | HMAC-SHA256 signed internal calls + 5-min timestamp |
| **Audit trail** | Immutable append-only log, all mutations captured |
| **Data masking** | Role-based field redaction in every response |

---

## 17. Performance Considerations

| Area | Approach |
|---|---|
| **DB connections** | pg pool, max 20 (configurable) |
| **Pagination** | Cursor-based O(1) — not offset |
| **Indexes** | Composite on batch_year+branch+is_verified, blind indexes for PII |
| **Caching** | Redis for sessions + rate limits; no client-side caching (sensitive data) |
| **Async jobs** | Heavy work (parse, match, verify, enrich) off the request path via RabbitMQ |
| **Real-time updates** | WebSocket (ws library) over `/ws` with JWT auth |
| **Go workers** | Goroutine-per-message concurrency for CPU-intensive tasks |
| **Python pipeline** | APScheduler + async I/O for external API calls |

---

## 18. Testing Strategy

| Layer | Tool | Covers |
|---|---|---|
| Unit | Jest | Auth service, RBAC, masking, encryption |
| Integration | Jest + pg + Redis | DB CRUD, session flow, rate limiting |
| Worker | `go test -race` | Matcher scoring, verifier logic, CSV parsing |
| Lint | ESLint + flake8 | Code style, unused vars |
| CI | GitHub Actions | All of the above on every PR |

Target coverage: **≥ 80%** on critical paths.

---

## 19. Configuration Reference

### Key Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | No | development | Environment (development / test / production) |
| `PORT` | No | 3000 | HTTP server port |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `DATABASE_POOL_MAX` | No | 20 | Max DB connections |
| `REDIS_URL` | Yes | — | Redis connection string |
| `RABBITMQ_URL` | Yes | — | RabbitMQ connection string |
| `JWT_PRIVATE_KEY_PATH` | Yes (prod) | — | RS256 private PEM path |
| `JWT_PUBLIC_KEY_PATH` | Yes (prod) | — | RS256 public PEM path |
| `JWT_SECRET` | Dev only | — | HS256 fallback secret |
| `JWT_ACCESS_EXPIRY` | No | 15m | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | No | 7d | Refresh token lifetime |
| `ENCRYPTION_KEY` | Yes | — | 64-char hex, AES-256 key |
| `BLIND_INDEX_KEY` | Yes | — | 64-char hex, HMAC key |
| `INTERNAL_HMAC_SECRET` | Yes | — | Service-to-service signing key |
| `CORS_ORIGIN` | Yes | localhost:3001 | Comma-separated allowed origins |
| `APOLLO_API_KEY` | Optional | — | Apollo.io API key |
| `GMASS_API_KEY` | Optional | — | GMass API key |

### Key npm Packages

| Package | Purpose |
|---|---|
| `express` | Web framework |
| `pg` | PostgreSQL client |
| `ioredis` | Redis client |
| `amqplib` | RabbitMQ client |
| `jsonwebtoken` | JWT sign / verify |
| `bcryptjs` | Password hashing |
| `helmet` | Security headers |
| `cors` | CORS middleware |
| `joi` | Schema validation |
| `otplib` | TOTP 2FA |
| `pino` | Structured logging |
| `multer` | File upload |
| `ws` | WebSocket server |
| `node-pg-migrate` | DB migrations |

---

## 20. Quick Start

### Prerequisites

- Node.js 18+, npm
- PostgreSQL 15+
- Redis 7+
- RabbitMQ 3+
- Go 1.21+ (for workers)
- Python 3.11+ (for pipeline)
- Docker + Docker Compose (recommended)

### Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# View API logs
docker-compose logs -f api

# Run migrations
docker-compose exec api npm run migrate:up

# Stop
docker-compose down

# Full teardown including volumes
docker-compose down -v
```

### Local Development

```bash
# 1. Install Node dependencies
cd backend && npm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_URL, RABBITMQ_URL, keys

# 3. Generate JWT keys
openssl genrsa -out ../secrets/jwt_private.pem 2048
openssl rsa -in ../secrets/jwt_private.pem -pubout -out ../secrets/jwt_public.pem

# 4. Generate encryption keys
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste output → ENCRYPTION_KEY, repeat → BLIND_INDEX_KEY

# 5. Run migrations
npm run migrate:up

# 6. Start API
npm run dev

# 7. Build and start Go workers (separate terminals)
cd ../go-backend
go run ./cmd/importer &
go run ./cmd/matcher  &
go run ./cmd/verifier &
go run ./cmd/dedup    &

# 8. Start Python pipeline
cd ../pipeline
pip install -r requirements.txt
python scheduler.py
```

### Run Tests

```bash
cd backend
npm test          # Jest with coverage
npm run lint      # ESLint
```

---

*Generated from codebase analysis — Thapar University Alumni Backend Portal*
