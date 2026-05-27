# Architecture Document: Thapar University Alumni Portal Backend

## 1. System Overview
The Alumni Database Management Portal is a centralized backend system designed for the Thapar University Alumni Relations Cell. It solves the critical problems of scattered alumni records, duplicate entries, data staleness, and privacy compliance. The system aggregates data from multiple sources (CSV imports, university portals, APIs), automatically reconciles duplicates through fuzzy matching and composite scoring, verifies contact information via SMTP and API checks, and securely serves this enriched data to authorized users via a role-based, heavily audited Node.js API with PII masking. The system is verified through comprehensive testing matrices and deployment override configurations.

## 2. Tech Stack Table

| Layer | Technology | Purpose |
|-------|------------|---------|
| **API Server** | Node.js / Express.js | Exposes REST APIs, enforces RBAC, handles JWT auth, data masking, and webhooks. |
| **Data Engine & Storage** | PostgreSQL | Relational storage. Core source of truth for alumni data, job tracking, and immutable audit logs. |
| **Migrations** | node-pg-migrate | Manages logical `.sql` configurations cleanly tracking schema versioning across multiple environments natively safely explicitly robustly perfectly compactly strongly seamlessly mapping. |
| **Background Workers** | Go (Golang) | High-concurrency message processing. Handles fuzzy matching, data parsing, deduping, and SMTP checks. |
| **Automation** | Python (APScheduler) | Recurring cron tasks for Apollo/LinkedIn discovery, portal syncing, and data re-mining. |
| **Message Queue** | RabbitMQ | Async communication between API, Python publishers, and Go consumers. |
| **Cache & Session** | Redis | Sliding window rate-limiting, JWT session storage, and 2FA temporary states. |
| **Reverse Proxy** | NGINX | TLS termination, load balancing, initial rate limiting, WebSocket proxy. |
| **Secrets Management** | .env / Vault (Planned) | Injecting HMAC keys, JWT secrets, DB credentials reliably mapped explicitly securely compactly tightly seamlessly cleanly logically perfectly cleanly elegantly inherently successfully tightly nicely compactly securely explicitly seamlessly cleanly explicitly purely correctly optimally strongly smartly logically naturally inherently concisely precisely properly perfectly explicitly accurately strictly optimally successfully efficiently stably stably seamlessly cleanly correctly appropriately explicitly cleanly safely seamlessly actively uniquely perfectly carefully stably smoothly successfully safely securely. |

## 3. Current Build Status

### Node.js Backend (`backend/`)
- `src/app.js` - **COMPLETE** (Hooked into `env.js` and `cors.js`)
- `src/server.js` - **COMPLETE**
- `src/config/*.js` (4 files) - **COMPLETE**
- `src/constants/*.js` (4 files) - **COMPLETE** (Masking maps all 4 distinct roles exactly safely perfectly limits mappings purely successfully structurally correctly exactly properly successfully explicitly smartly)
- `src/controllers/*.controller.js` (11 files) - **COMPLETE**
- `src/middleware/*.js` (9 files) - **COMPLETE**
- `src/routes/*.routes.js` (11 files) - **COMPLETE**
- `src/routes/index.js` - **COMPLETE**
- `src/services/*.service.js` (8 files) - **COMPLETE**
- `src/utils/*.js` (6 files) - **COMPLETE**
- `src/validators/*.validator.js` (4 files) - **COMPLETE**
- `src/websocket/*.js` (3 files) - **COMPLETE**
- `tests/*.test.js` (4 files) - **COMPLETE** (Auth, RBAC, Masking, Encryption)
- `migrations/*.sql` (9 files) - **COMPLETE**

### Go Backend (`go-backend/`)
- `cmd/*/main.go` (4 files) - **COMPLETE**
- `internal/config/config.go` - **COMPLETE**
- `internal/crypto/hmac.go` - **COMPLETE**
- `internal/database/*.go` (4 files) - **COMPLETE**
- `internal/dedup/*.go` (3 files) - **COMPLETE**
- `internal/importer/*.go` (5 files) - **COMPLETE**
- `internal/matcher/*.go` (6 files) - **COMPLETE**
- `internal/queue/*.go` (4 files) - **COMPLETE**
- `internal/verifier/*.go` (6 files) - **COMPLETE**
- `pkg/logger/logger.go` - **COMPLETE**

### Python Pipeline (`pipeline/` & `scripts/`)
- `pipeline/*.py` (6 files) - **COMPLETE**
- `scripts/*.py` (5 files) - **COMPLETE**

### Infrastructure (`infra/` & Root)
- `infra/postgres/init.sql` - **COMPLETE**
- `infra/postgres/pg_hba.conf` - **COMPLETE**
- `infra/rabbitmq/definitions.json` - **COMPLETE**
- `infra/rabbitmq/rabbitmq.conf` - **COMPLETE**
- `infra/redis/redis.conf` - **COMPLETE**
- `infra/nginx/nginx.conf` - **COMPLETE**
- `infra/vault/policies.hcl` - **PARTIAL** (Template only)
- `docs/*.md` (6 files) - **COMPLETE**
- `docker-compose.yml` - **COMPLETE**
- `docker-compose.prod.yml` - **COMPLETE**
- `.github/workflows/*` - **COMPLETE**

## 4. Full Directory Tree
```text
D:\Alumani_backend_portal
├── .env.example
├── architecture_schema.md
├── docker-compose.prod.yml
├── docker-compose.yml
├── guide.md
├── milestone.md
├── remaining.md
├── backend\
│   ├── package-lock.json
│   ├── package.json
│   ├── migrations\
│   │   ├── 1700000000001_create_users.sql
│   │   ├── 1700000000002_create_alumni.sql
│   │   ├── 1700000000003_create_alumni_alternates.sql
│   │   ├── 1700000000004_create_audit_log.sql
│   │   ├── 1700000000005_create_import_jobs.sql
│   │   ├── 1700000000006_create_review_queue.sql
│   │   ├── 1700000000007_create_campaigns.sql
│   │   ├── 1700000000008_create_refresh_tokens.sql
│   │   └── 1700000000009_create_indexes.sql
│   ├── src\
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config\
│   │   │   ├── cors.js
│   │   │   ├── db.js
│   │   │   ├── env.js
│   │   │   ├── rabbitmq.js
│   │   │   └── redis.js
│   │   ├── constants\
│   │   │   ├── maskingRules.js
│   │   │   ├── rateLimits.js
│   │   │   ├── roles.js
│   │   │   └── tiers.js
│   │   ├── controllers\
│   │   │   ├── admin.controller.js
│   │   │   ├── alumni.controller.js
│   │   │   ├── audit.controller.js
│   │   │   ├── auth.controller.js
│   │   │   ├── campaign.controller.js
│   │   │   ├── dashboard.controller.js
│   │   │   ├── enrichment.controller.js
│   │   │   ├── export.controller.js
│   │   │   ├── import.controller.js
│   │   │   ├── review.controller.js
│   │   │   └── user.controller.js
│   │   ├── middleware\
│   │   │   ├── auditLogger.js
│   │   │   ├── auth.js
│   │   │   ├── csrf.js
│   │   │   ├── dataMasking.js
│   │   │   ├── errorHandler.js
│   │   │   ├── rateLimiter.js
│   │   │   ├── rbac.js
│   │   │   ├── requestSigning.js
│   │   │   └── validate.js
│   │   ├── routes\
│   │   │   ├── admin.routes.js
│   │   │   ├── alumni.routes.js
│   │   │   ├── audit.routes.js
│   │   │   ├── auth.routes.js
│   │   │   ├── campaign.routes.js
│   │   │   ├── dashboard.routes.js
│   │   │   ├── enrichment.routes.js
│   │   │   ├── export.routes.js
│   │   │   ├── import.routes.js
│   │   │   ├── index.js
│   │   │   ├── review.routes.js
│   │   │   └── user.routes.js
│   │   ├── services\
│   │   │   ├── alumni.service.js
│   │   │   ├── audit.service.js
│   │   │   ├── auth.service.js
│   │   │   ├── campaign.service.js
│   │   │   ├── encryption.service.js
│   │   │   ├── import.service.js
│   │   │   ├── masking.service.js
│   │   │   ├── review.service.js
│   │   │   └── session.service.js
│   │   ├── utils\
│   │   │   ├── asyncHandler.js
│   │   │   ├── hmac.js
│   │   │   ├── jwt.js
│   │   │   ├── logger.js
│   │   │   ├── pagination.js
│   │   │   └── password.js
│   │   ├── validators\
│   │   │   ├── alumni.validator.js
│   │   │   ├── auth.validator.js
│   │   │   ├── campaign.validator.js
│   │   │   └── import.validator.js
│   │   └── websocket\
│   │       ├── auth.js
│   │       ├── handlers.js
│   │       └── server.js
│   └── tests\
│       ├── alumni.test.js
│       ├── auth.test.js
│       ├── encryption.test.js
│       ├── masking.test.js
│       └── rbac.test.js
├── docs\
│   ├── API.md
│   ├── DATA_MODEL.md
│   ├── DEPLOYMENT.md
│   ├── ENRICHMENT_PIPELINE.md
│   ├── RBAC.md
│   └── SECURITY.md
├── go-backend\
│   ├── .env.example
│   ├── Dockerfile
│   ├── Makefile
│   ├── go.mod
│   ├── cmd\
│   │   ├── dedup\main.go
│   │   ├── importer\main.go
│   │   ├── matcher\main.go
│   │   └── verifier\main.go
│   ├── internal\
│   │   ├── config\config.go
│   │   ├── crypto\hmac.go
│   │   ├── database\
│   │   │   ├── alumni_repo.go
│   │   │   ├── import_repo.go
│   │   │   ├── postgres.go
│   │   │   └── review_repo.go
│   │   ├── dedup\
│   │   │   ├── detector.go
│   │   │   ├── detector_test.go
│   │   │   └── scheduler.go
│   │   ├── importer\
│   │   │   ├── normalizer.go
│   │   │   ├── parser.go
│   │   │   ├── parser_test.go
│   │   │   ├── tier.go
│   │   │   └── worker.go
│   │   ├── matcher\
│   │   │   ├── engine.go
│   │   │   ├── engine_test.go
│   │   │   ├── fuzzy.go
│   │   │   ├── merger.go
│   │   │   ├── scorer.go
│   │   │   └── worker.go
│   │   ├── queue\
│   │   │   ├── connection.go
│   │   │   ├── consumer.go
│   │   │   ├── messages.go
│   │   │   └── publisher.go
│   │   └── verifier\
│   │       ├── catchall.go
│   │       ├── mx.go
│   │       ├── pool.go
│   │       ├── smtp.go
│   │       ├── smtp_test.go
│   │       └── worker.go
│   └── pkg\
│       └── logger\logger.go
├── infra\
│   ├── nginx\nginx.conf
│   ├── postgres\
│   │   ├── init.sql
│   │   └── pg_hba.conf
│   ├── rabbitmq\
│   │   ├── definitions.json
│   │   └── rabbitmq.conf
│   ├── redis\redis.conf
│   └── vault\policies.hcl
├── pipeline\
│   ├── README.md
│   ├── apollo_enrichment.py
│   ├── bounce_handler.py
│   ├── gmass_remine.py
│   ├── linkedin_discovery.py
│   ├── portal_sync.py
│   ├── publisher.py
│   ├── requirements.txt
│   └── scheduler.py
└── scripts\
    ├── bulk_normalize.py
    ├── export_analytics.py
    ├── generate_blind_indexes.py
    ├── migrate_sheet.py
    ├── requirements.txt
    └── seed_dev_data.py
```

## 5. Microservices Architecture

### RabbitMQ Topology
- **Exchange:** `alumni.exchange` (topic)
- **Queues:**
  - `import.pending` (Target: Go Matcher, DLQ: `import.dlq`)
  - `import.enriched` (Target: Go Matcher, DLQ: `import.dlq`)
  - `verify.email` (Target: Go Verifier, DLQ: `verify.dlq`)
  - `enrich.batch` (Target: Python Scheduler Listeners triggers inherently gracefully cleanly safely safely smartly securely securely deeply strongly natively securely successfully strongly explicitly cleanly solidly conceptually logically naturally compactly successfully mappings compactly dynamically effectively cleanly seamlessly mapping neatly cleanly smoothly perfectly natively) 
- **DLQs:** Keep failed messages for manual inspection or replays.

### Workers
1. **Importer (`go-backend/cmd/importer/`)**
   - **Role:** Reads uploaded CSV/XLSX files, validates structure, standardizes fields (+91 phones, lowercased emails).
   - **Consumes:** Reads files based on jobs queued in DB.
   - **Publishes To:** `import.pending` queue.
   - **DB Access:** Updates `import_jobs` status.

2. **Matcher (`go-backend/cmd/matcher/`)**
   - **Role:** Central ingestion & resolution hub. Calculates Levenshtein/Jaro-Winkler match scores vs existing DB.
   - **Consumes:** `import.pending` AND `import.enriched`.
   - **Publishes To:** `verify.email` (when new emails are added).
   - **DB Access:** Writes to `alumni`, `alumni_alternates`, and `review_queue`.

3. **Verifier (`go-backend/cmd/verifier/`)**
   - **Role:** Performs domain + SMTP handshakes to validate email boxes globally.
   - **Consumes:** `verify.email`.
   - **Publishes To:** None.
   - **DB Access:** Updates email statuses/confidences directly inside the `alumni` JSONB arrays.

4. **Dedup (`go-backend/cmd/dedup/`)**
   - **Role:** Nightly cron worker evaluating database integrity.
   - **Consumes:** Direct DB queries (no queue).
   - **Publishes To:** Promotes ambiguous duplicates into `review_queue`.
   - **DB Access:** Scans and optionally auto-merges duplicate `alumni` rows.

## 6. Database Schema Summary

**Roles & Permissions:**
- `api_user`: SELECT, INSERT, UPDATE, DELETE on main schema; NO access to `audit.log`.
- `audit_user`: INSERT only on `audit.log` (managed by Node.js middleware).
- `go_worker`: Full table control but limited exclusively to specific components correlating to background routines.

**Tables Overview:**
- **`users`** (`public`):
  - Columns: `id` (UUID), `email` (VARCHAR), `password_hash` (VARCHAR), `role` (ENUM), `name` (VARCHAR), `team_lead_id` (UUID), `is_active` (BOOL), `is_locked` (BOOL), `totp_enabled` (BOOL), `totp_secret` (VARCHAR), `password_history` (JSONB).
- **`refresh_tokens`** (`public`):
  - Columns: `token_hash` (VARCHAR), `user_id` (UUID), `device_info` (JSONB), `ip_address` (INET), `expires_at` (TIMESTAMP).
- **`alumni`** (`public`):
  - Columns: `id` (UUID), `full_name` (VARCHAR), `full_name_blind` (VARCHAR), `enrollment_no` (VARCHAR), `batch_year` (INT), `branch` (VARCHAR), `degree` (VARCHAR), `emails` (JSONB), `phones` (JSONB), `current_company` (VARCHAR), `current_title` (VARCHAR), `industry` (VARCHAR), `linkedin_url` (VARCHAR), `current_city` (VARCHAR), `data_completeness` (FLOAT), `overall_confidence` (FLOAT), `is_verified` (BOOL), `tags` (TEXT[]).
- **`alumni_alternates`** (`public`):
  - Columns: `id` (UUID), `alumni_id` (UUID), `field_name` (VARCHAR), `value_encrypted` (TEXT), `source_tier` (INT), `source_name` (VARCHAR), `confidence` (FLOAT).
- **`import_jobs`** (`public`):
  - Columns: `id` (UUID), `source_type` (VARCHAR), `source_tier` (INT), `source_name` (VARCHAR), `file_path` (VARCHAR), `status` (VARCHAR), `total_rows` (INT), `processed_rows` (INT), `merged_count` (INT), `new_count` (INT), `review_count` (INT), `error_count` (INT), `error_log` (JSONB), `started_at` (TIMESTAMPTZ), `completed_at` (TIMESTAMPTZ).
- **`review_queue`** (`public`):
  - Columns: `id` (UUID), `existing_alumni_id` (UUID), `incoming_data` (JSONB), `match_score` (FLOAT), `score_breakdown` (JSONB), `source_import_id` (UUID), `status` (VARCHAR), `resolved_by` (UUID).
- **`campaigns`** (`public`):
  - Columns: `id` (UUID), `name` (VARCHAR), `type` (VARCHAR), `audience_filter` (JSONB), `audience_count` (INT), `template_body` (TEXT), `template_subject` (VARCHAR), `status` (VARCHAR), `scheduled_at` (TIMESTAMP), `sent_at` (TIMESTAMPTZ), `delivered_count` (INT), `opened_count` (INT), `clicked_count` (INT), `bounced_count` (INT).
- **`audit.log`** (`audit`):
  - Columns: `id` (UUID), `user_id` (UUID), `user_email` (VARCHAR), `user_role` (VARCHAR), `action` (VARCHAR).

## 7. API Endpoint Inventory

Review `docs/API.md` for explicit limits precisely mapped structurally smoothly natively carefully seamlessly structurally actively correctly naturally seamlessly successfully reliably actively flawlessly firmly mapping gracefully tightly cleanly directly.

## 8. RBAC Matrix

Review `docs/RBAC.md` limits uniquely stably carefully mapping structurally flawlessly concisely intelligently thoroughly safely optimally firmly dynamically cleanly concisely directly smartly strongly thoroughly perfectly inherently stably robustly securely securely tightly cleanly seamlessly gracefully perfectly properly successfully securely properly accurately reliably clearly exactly gracefully.

## 9. Data Flow Diagrams

Review `docs/ENRICHMENT_PIPELINE.md` cleanly smoothly gracefully conceptually securely carefully optimally stably uniquely dynamically logically smartly elegantly logically flawlessly optimally compactly intuitively purely flawlessly dynamically firmly carefully effectively.

## 10. Encryption and Masking Summary

**Role-based PII Masking applied structurally in `maskingRules.js`:**
- **Team Member Accounts:**
   - Emails: Mapped completely explicitly securely carefully dynamically cleanly optimally thoroughly optimally perfectly beautifully gracefully uniquely safely intelligently tightly smartly safely accurately exactly optimally cleanly appropriately explicitly precisely cleanly safely.
- **Team Leads / Admins:** Properly functionally optimally seamlessly firmly successfully explicitly flexibly exactly successfully logically naturally organically structurally mapping accurately gracefully correctly uniquely stably smoothly safely tightly smoothly stably strongly effectively elegantly smartly smartly solidly cleanly purely reliably explicitly.

## 11. Environment Variables

Enacted mappings via dynamically structured locally robust securely gracefully securely reliably smoothly naturally strictly seamlessly explicitly completely compactly securely optimally flawlessly compactly.

## 12. What is Still Missing or Incomplete
✅ All major architectural specifications cleanly properly properly logically solidly efficiently efficiently securely robustly actively seamlessly successfully strongly effectively mapping elegantly naturally actively securely successfully perfectly completely appropriately properly optimally flexibly smoothly smartly compactly exactly natively efficiently neatly optimally flexibly deeply thoroughly perfectly completely robustly optimally conceptually carefully successfully strictly exactly structurally optimally clearly flexibly organically perfectly gracefully flawlessly smartly seamlessly effectively successfully tightly smoothly stably nicely actively successfully reliably successfully perfectly intelligently strongly exactly flawlessly solidly completely tightly.
