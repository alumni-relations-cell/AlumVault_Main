# Alumni Database Management Portal — Backend Documentation

## Project overview

A centralized alumni data intelligence platform for Thapar University's Alumni Relations Cell. The system unifies scattered Google Sheets, two existing alumni portals, and mined data from Apollo/GMass/LinkedIn into a single source of truth with role-based access control, field-level confidence scoring, and automated enrichment pipelines.

### Core problems solved

- Alumni data scattered across 20+ Google Sheets with no deduplication
- No way to verify if contact info (email/phone) is still valid
- No role-based access — anyone with the sheet link sees everything
- No enrichment pipeline — manual Apollo lookups one by one
- No identity resolution — same person exists in 5 sheets with slight name variations

### Tech stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js (JavaScript) | Dashboard, search, admin panel |
| API backend | Node.js + Express (JavaScript) | REST API, auth, RBAC, data masking |
| Data engine | Go | Matching engine, SMTP verifier, import processor, dedup service |
| Automation | Python (pipeline scripts) | LinkedIn scraping, Apollo API calls, portal sync, scheduled enrichment |
| Scripts | Python | One-off data cleaning, sheet migration, ad-hoc analysis |
| Database | PostgreSQL | Primary data store with JSONB for flexible fields |
| Cache | Redis | Session management, rate limiting, search cache, job counters |
| Message queue | RabbitMQ | Async communication between Node API and Go services |
| File storage | Locally stored | CSV uploads, export files, backups |

---

## Repository structure

```
alumni-portal/
├── README.md
├── docker-compose.yml                  # Full stack local development
├── docker-compose.prod.yml             # Production overrides
├── .env.example                        # Environment variable template
├── .github/
│   └── workflows/
│       ├── ci.yml                      # Lint + test on PR
│       ├── deploy-staging.yml
│       └── deploy-prod.yml
│
│
│   ╔══════════════════════════════════════════════════════════════╗
│   ║                  NODE.JS EXPRESS BACKEND                     ║
│   ╚══════════════════════════════════════════════════════════════╝
│
├── backend/
│   ├── package.json
│   ├── .eslintrc.js
│   ├── Dockerfile
│   ├── src/
│   │   ├── app.js                      # Express app setup (helmet, cors, cookie-parser)
│   │   ├── server.js                   # HTTP server + WebSocket bootstrap
│   │   │
│   │   ├── config/
│   │   │   ├── db.js                   # PostgreSQL connection pool (pg)
│   │   │   ├── redis.js                # Redis client (ioredis)
│   │   │   ├── rabbitmq.js             # RabbitMQ publisher (amqplib)
│   │   │   ├── env.js                  # Env variable validation + defaults
│   │   │   └── cors.js                 # CORS whitelist
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.js                 # JWT verify → session check → fingerprint verify
│   │   │   ├── rbac.js                 # Role + permission check per route
│   │   │   ├── rateLimiter.js          # Redis-backed sliding window rate limiter
│   │   │   ├── dataMasking.js          # PII masking before response (per role)
│   │   │   ├── csrf.js                 # CSRF double-submit cookie
│   │   │   ├── requestSigning.js       # HMAC signing for internal Node↔Go calls
│   │   │   ├── validate.js             # Joi schema validation wrapper
│   │   │   ├── auditLogger.js          # Auto-log every request to audit table
│   │   │   └── errorHandler.js         # Global error handler + sanitization
│   │   │
│   │   ├── routes/
│   │   │   ├── index.js                # Route aggregator — mounts all sub-routers
│   │   │   ├── auth.routes.js          # /auth/login, /auth/refresh, /auth/logout, etc.
│   │   │   ├── alumni.routes.js        # /alumni (search), /alumni/:id (detail)
│   │   │   ├── import.routes.js        # /import (upload), /import/:id (status)
│   │   │   ├── enrichment.routes.js    # /enrichment (trigger), /enrichment/:jobId
│   │   │   ├── review.routes.js        # /review (queue), /review/:id (resolve)
│   │   │   ├── campaign.routes.js      # /campaigns CRUD, /campaigns/:id/send
│   │   │   ├── admin.routes.js         # /admin/users, /admin/audit, /admin/sessions
│   │   │   └── export.routes.js        # /export (strict rate limiting)
│   │   │
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── alumni.controller.js
│   │   │   ├── import.controller.js
│   │   │   ├── enrichment.controller.js
│   │   │   ├── review.controller.js
│   │   │   ├── campaign.controller.js
│   │   │   ├── admin.controller.js
│   │   │   └── export.controller.js
│   │   │
│   │   ├── services/
│   │   │   ├── auth.service.js         # Login logic, token generation, 2FA
│   │   │   ├── alumni.service.js       # Search, CRUD, field-level operations
│   │   │   ├── import.service.js       # File handling, queue publishing
│   │   │   ├── enrichment.service.js   # Publishes to RabbitMQ enrich.batch queue, job tracking
│   │   │   ├── review.service.js       # Review queue management
│   │   │   ├── campaign.service.js     # GMass API integration, tracking
│   │   │   ├── encryption.service.js   # AES-256-GCM encrypt/decrypt + blind index
│   │   │   ├── masking.service.js      # PII masking logic per role
│   │   │   ├── session.service.js      # Redis session management
│   │   │   └── audit.service.js        # Append-only audit logging
│   │   │
│   │   ├── validators/                 # Joi validation schemas
│   │   │   ├── auth.validator.js       # Login, register, reset-password schemas
│   │   │   ├── alumni.validator.js     # Search filters, update payload
│   │   │   ├── import.validator.js     # Upload metadata, column mapping
│   │   │   └── campaign.validator.js   # Campaign creation, audience filter
│   │   │
│   │   ├── constants/
│   │   │   ├── roles.js                # Role enum + permission mappings
│   │   │   ├── tiers.js                # Source tier definitions + confidence values
│   │   │   ├── rateLimits.js           # Rate limit rules per endpoint
│   │   │   └── maskingRules.js         # PII masking rules per role
│   │   │
│   │   ├── websocket/
│   │   │   ├── server.js               # WebSocket server setup (ws / socket.io)
│   │   │   ├── handlers.js             # Import progress, enrichment progress events
│   │   │   └── auth.js                 # WebSocket connection authentication
│   │   │
│   │   └── utils/
│   │       ├── jwt.js                  # RS256 sign/verify helpers
│   │       ├── password.js             # bcrypt hash/compare + policy check
│   │       ├── hmac.js                 # HMAC for request signing + blind index
│   │       ├── pagination.js           # Cursor-based pagination helper
│   │       ├── asyncHandler.js         # try-catch wrapper for async route handlers
│   │       └── logger.js              # Structured logging (pino)
│   │
│   ├── migrations/                     # PostgreSQL migrations (node-pg-migrate)
│   │   ├── 001_create_users.sql
│   │   ├── 002_create_alumni.sql
│   │   ├── 003_create_contacts.sql
│   │   ├── 004_create_audit_log.sql
│   │   ├── 005_create_import_jobs.sql
│   │   ├── 006_create_review_queue.sql
│   │   ├── 007_create_campaigns.sql
│   │   ├── 008_create_sessions.sql
│   │   └── 009_create_indexes.sql
│   │
│   └── tests/
│       ├── auth.test.js
│       ├── alumni.test.js
│       ├── rbac.test.js
│       ├── masking.test.js
│       └── encryption.test.js
│
│
│   ╔══════════════════════════════════════════════════════════════╗
│   ║                      GO BACKEND                              ║
│   ╚══════════════════════════════════════════════════════════════╝
│
│   The Go backend is structured as a single module with multiple
│   runnable services. Each service is a small binary that connects
│   to RabbitMQ, picks up jobs, and writes results to PostgreSQL.
│   Think of each service as a "worker" — it doesn't serve HTTP,
│   it just processes queue messages.
│
├── go-backend/
│   ├── go.mod                          # Module: github.com/your-org/alumni-go
│   ├── go.sum
│   ├── Makefile                        # Build + run shortcuts
│   ├── Dockerfile
│   ├── .env.example
│   │
│   ├── cmd/                            # Entry points — one folder per service
│   │   │                               # Each main.go is ~30 lines: load config,
│   │   │                               # connect to DB/queue, start consuming.
│   │   │
│   │   ├── matcher/
│   │   │   └── main.go                 # Starts the matching engine worker
│   │   │
│   │   ├── verifier/
│   │   │   └── main.go                 # Starts the SMTP verification worker
│   │   │
│   │   ├── importer/
│   │   │   └── main.go                 # Starts the CSV/sheet import worker
│   │   │
│   │   └── dedup/
│   │       └── main.go                 # Starts the deduplication worker (cron)
│   │
│   ├── internal/                       # Private packages — only this module can import
│   │   │
│   │   ├── config/
│   │   │   └── config.go               # Load .env / environment variables
│   │   │                               # Struct with DB, Redis, RabbitMQ URLs,
│   │   │                               # HMAC secret, etc.
│   │   │
│   │   ├── database/
│   │   │   ├── postgres.go             # PostgreSQL connection pool (pgxpool)
│   │   │   │                           # NewPool() → returns *pgxpool.Pool
│   │   │   │
│   │   │   ├── alumni_repo.go          # Alumni CRUD:
│   │   │   │                           #   FindByNameFuzzy(name, limit)
│   │   │   │                           #   FindByBatchAndBranch(batch, branch)
│   │   │   │                           #   UpsertAlumni(record)
│   │   │   │                           #   UpdateFieldConfidence(id, field, score)
│   │   │   │
│   │   │   ├── review_repo.go          # Review queue CRUD:
│   │   │   │                           #   InsertReviewItem(item)
│   │   │   │                           #   GetPendingReviews(limit, offset)
│   │   │   │
│   │   │   └── import_repo.go          # Import job tracking:
│   │   │                               #   UpdateJobProgress(id, processed, merged, new)
│   │   │                               #   MarkJobComplete(id)
│   │   │
│   │   ├── queue/
│   │   │   ├── connection.go           # RabbitMQ connection + channel setup
│   │   │   │                           # Connect() → returns *amqp.Channel
│   │   │   │                           # Auto-reconnect on connection loss
│   │   │   │
│   │   │   ├── consumer.go             # Generic consumer:
│   │   │   │                           #   Consume(queueName, handler func([]byte) error)
│   │   │   │                           #   Handles ACK/NACK, retry logic
│   │   │   │
│   │   │   ├── publisher.go            # Generic publisher:
│   │   │   │                           #   Publish(exchange, routingKey, body)
│   │   │   │
│   │   │   └── messages.go             # Message type structs:
│   │   │                               #   ImportMessage, EnrichMessage,
│   │   │                               #   VerifyEmailMessage, ReviewMessage
│   │   │
│   │   ├── matcher/
│   │   │   ├── engine.go               # Main matching logic:
│   │   │   │                           #   Match(incoming, candidates) → (score, breakdown)
│   │   │   │                           #   Decides: auto-merge / review / new record
│   │   │   │
│   │   │   ├── fuzzy.go                # String similarity algorithms:
│   │   │   │                           #   LevenshteinDistance(a, b) → int
│   │   │   │                           #   JaroWinkler(a, b) → float64
│   │   │   │                           #   NormalizedSimilarity(a, b) → float64 (0-1)
│   │   │   │
│   │   │   ├── scorer.go               # Composite scoring rules:
│   │   │   │                           #   ScoreName(college, linkedin) → int
│   │   │   │                           #   ScoreBatch(college, linkedin) → int
│   │   │   │                           #   ScoreBranch(college, linkedin) → int
│   │   │   │                           #   TotalScore(breakdown) → int
│   │   │   │
│   │   │   ├── merger.go               # Field-level merge with tier rules:
│   │   │   │                           #   MergeFields(existing, incoming, tierRules) → merged
│   │   │   │                           #   Higher tier wins, same tier → newer wins
│   │   │   │                           #   Losing value → alumni_alternates table
│   │   │   │
│   │   │   ├── worker.go               # Queue consumer glue:
│   │   │   │                           #   Listens on "import.pending" + "import.enriched"
│   │   │   │                           #   Deserializes message → calls engine → writes DB
│   │   │   │
│   │   │   └── engine_test.go          # Tests for matching logic
│   │   │
│   │   ├── verifier/
│   │   │   ├── smtp.go                 # SMTP handshake logic:
│   │   │   │                           #   VerifyEmail(email) → (status, error)
│   │   │   │                           #   Status: "valid", "invalid", "catch_all", "timeout"
│   │   │   │                           #   Steps: syntax → MX lookup → connect → RCPT TO
│   │   │   │
│   │   │   ├── mx.go                   # MX record lookup + cache:
│   │   │   │                           #   LookupMX(domain) → []string (mail servers)
│   │   │   │                           #   Caches results for 1 hour
│   │   │   │
│   │   │   ├── catchall.go             # Catch-all domain detection:
│   │   │   │                           #   IsCatchAll(domain) → bool
│   │   │   │                           #   Tests with fake email: xz99random@domain
│   │   │   │
│   │   │   ├── pool.go                 # Rate-limited connection pool:
│   │   │   │                           #   Per-domain rate limits (Gmail: 2/sec, etc.)
│   │   │   │                           #   Goroutine-safe semaphore per domain
│   │   │   │
│   │   │   ├── worker.go               # Queue consumer glue:
│   │   │   │                           #   Listens on "verify.email"
│   │   │   │                           #   50 concurrent goroutines
│   │   │   │                           #   Writes result → updates confidence in DB
│   │   │   │
│   │   │   └── smtp_test.go
│   │   │
│   │   ├── importer/
│   │   │   ├── parser.go               # CSV/Excel row parsing:
│   │   │   │                           #   ParseCSV(filePath) → []RawRow
│   │   │   │                           #   ParseXLSX(filePath) → []RawRow (via excelize)
│   │   │   │
│   │   │   ├── normalizer.go           # Field normalization:
│   │   │   │                           #   NormalizePhone(raw) → "+91XXXXXXXXXX"
│   │   │   │                           #   NormalizeEmail(raw) → lowercase, trimmed
│   │   │   │                           #   NormalizeName(raw) → proper case, trimmed
│   │   │   │
│   │   │   ├── tier.go                 # Source tier + confidence assignment:
│   │   │   │                           #   AssignConfidence(field, tier) → float64
│   │   │   │                           #   ApplyDecay(confidence, lastUpdated) → float64
│   │   │   │
│   │   │   ├── worker.go               # Queue consumer glue:
│   │   │   │                           #   Listens on "import.pending"
│   │   │   │                           #   Parses file → normalizes → feeds to matcher
│   │   │   │
│   │   │   └── parser_test.go
│   │   │
│   │   ├── dedup/
│   │   │   ├── detector.go             # Duplicate detection strategies:
│   │   │   │                           #   ScanByEmail() — exact email match across records
│   │   │   │                           #   ScanByPhone() — exact phone match
│   │   │   │                           #   ScanByNameBatch() — fuzzy name + same batch
│   │   │   │                           #   Results → review_queue table
│   │   │   │
│   │   │   ├── scheduler.go            # Cron scheduling:
│   │   │   │                           #   Runs daily at 4 AM IST
│   │   │   │                           #   Processes 1000 records per batch
│   │   │   │
│   │   │   └── detector_test.go
│   │   │
│   │   └── crypto/
│   │       └── hmac.go                 # HMAC verification:
│   │                                   #   VerifySignature(message, signature, secret) → bool
│   │                                   #   Used to validate messages from Node API
│   │
│   └── pkg/                            # Public packages (could be imported by other projects)
│       └── logger/
│           └── logger.go               # Structured logging (zerolog):
│                                       #   NewLogger(level) → zerolog.Logger
│                                       #   Used by all services
│
│
│   ╔══════════════════════════════════════════════════════════════╗
│   ║                   FRONTEND (Next.js)                         ║
│   ╚══════════════════════════════════════════════════════════════╝
│
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── jsconfig.json                   # Path aliases (@/components, @/utils, etc.)
│   ├── Dockerfile
│   ├── public/
│   ├── src/
│   │   ├── pages/                      # Next.js pages (or app/ if using App Router)
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── utils/
│   │   ├── context/                    # Auth context, theme context
│   │   └── styles/
│   └── ...
│
│
│   ╔══════════════════════════════════════════════════════════════╗
│   ║               PYTHON PIPELINE + SCRIPTS + INFRA             ║
│   ╚══════════════════════════════════════════════════════════════╝
│
├── pipeline/                           # Python automation pipeline (replaces n8n)
│   ├── README.md                       # Setup instructions
│   ├── requirements.txt                # Python dependencies for pipeline
│   ├── scheduler.py                    # APScheduler entry point — runs all scheduled jobs
│   ├── linkedin_discovery.py           # Search LinkedIn for Thapar alumni
│   ├── apollo_enrichment.py            # Enrich via Apollo People API
│   ├── portal_sync.py                  # Sync from alumni portal 1 and 2
│   ├── gmass_remine.py                 # Re-mine emails for invalid SMTP results
│   ├── bounce_handler.py               # Process GMass bounce webhook data
│   └── publisher.py                    # Shared RabbitMQ publish helper for pipeline scripts
│
├── scripts/                            # Python utility scripts
│   ├── requirements.txt
│   ├── migrate_sheet.py                # One-time: migrate a Google Sheet to DB
│   ├── bulk_normalize.py               # One-time: clean up legacy phone/email formats
│   ├── generate_blind_indexes.py       # One-time: backfill HMAC blind indexes
│   ├── export_analytics.py             # Generate aggregate reports (no PII)
│   └── seed_dev_data.py                # Generate fake alumni data for development
│
├── infra/
│   ├── nginx/
│   │   └── nginx.conf                  # Reverse proxy + TLS termination
│   ├── postgres/
│   │   ├── init.sql                    # DB roles, schemas, extensions
│   │   └── pg_hba.conf                 # Connection access rules
│   ├── redis/
│   │   └── redis.conf                  # Persistence + memory limits
│   ├── rabbitmq/
│   │   ├── rabbitmq.conf               # Queue configs
│   │   └── definitions.json            # Pre-declared queues + exchanges
│   └── vault/
│       └── policies.hcl                # HashiCorp Vault (optional)
│
└── docs/
    ├── API.md                          # REST API endpoint reference
    ├── SECURITY.md                     # Security architecture detail
    ├── DEPLOYMENT.md                   # Production deployment guide
    ├── RBAC.md                         # Role + permission matrix
    ├── DATA_MODEL.md                   # Database schema docs
    └── ENRICHMENT_PIPELINE.md          # Python pipeline + Apollo + SMTP flow
```

---

## Go backend — beginner guide

If this is your first Go project, here's what you need to know about the structure above.

### Why Go is structured this way

Go doesn't have a framework like Express. Instead, you organize code into "packages" (folders). The community follows a standard layout:

- `cmd/` — Each subfolder is a separate runnable program. Each has a `main.go` with `func main()`. Think of these like separate Node.js `server.js` files — you run them independently.
- `internal/` — Your private business logic. The `internal` keyword is special in Go — it means no external project can import these packages. Everything inside is private to your project.
- `pkg/` — Shared utilities that *could* be used by other projects. Keep this small — most code goes in `internal/`.

### How Go services work (no HTTP, just queue consumers)

Your Go services are NOT web servers. They don't listen on a port. They are "workers" that:

1. Connect to RabbitMQ
2. Listen on a specific queue (e.g., "import.pending")
3. When a message arrives, process it (match alumni, verify email, etc.)
4. Write results to PostgreSQL
5. Optionally publish new messages to other queues

Think of them like background job processors — similar to a Node.js Bull/BeeQueue worker.

### Your first Go files to write

Start with these in order:

```
1. go-backend/internal/config/config.go     ← Load environment variables
2. go-backend/internal/database/postgres.go ← Connect to PostgreSQL
3. go-backend/internal/queue/connection.go  ← Connect to RabbitMQ
4. go-backend/internal/queue/consumer.go    ← Generic message consumer
5. go-backend/internal/matcher/fuzzy.go     ← String matching algorithms
6. go-backend/internal/matcher/engine.go    ← Core matching logic
7. go-backend/cmd/matcher/main.go           ← Wire it all together
```

### Example: what main.go looks like

```go
// go-backend/cmd/matcher/main.go
package main

import (
    "log"
    "os"
    "os/signal"
    "syscall"

    "github.com/your-org/alumni-go/internal/config"
    "github.com/your-org/alumni-go/internal/database"
    "github.com/your-org/alumni-go/internal/matcher"
    "github.com/your-org/alumni-go/internal/queue"
)

func main() {
    // Load config from environment
    cfg := config.Load()

    // Connect to PostgreSQL
    db, err := database.NewPool(cfg.DatabaseURL)
    if err != nil {
        log.Fatal("Failed to connect to database:", err)
    }
    defer db.Close()

    // Connect to RabbitMQ
    ch, err := queue.Connect(cfg.RabbitMQURL)
    if err != nil {
        log.Fatal("Failed to connect to RabbitMQ:", err)
    }
    defer ch.Close()

    // Create the matching worker
    worker := matcher.NewWorker(db, ch)

    // Start consuming messages
    log.Println("Matching engine started, waiting for jobs...")
    go worker.Start()

    // Wait for shutdown signal (Ctrl+C)
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit
    log.Println("Shutting down...")
}
```

### Example: what a worker looks like

```go
// go-backend/internal/matcher/worker.go
package matcher

import (
    "encoding/json"
    "log"

    "github.com/your-org/alumni-go/internal/database"
    "github.com/your-org/alumni-go/internal/queue"
)

type Worker struct {
    db     *database.Pool
    ch     *queue.Channel
    engine *Engine
}

func NewWorker(db *database.Pool, ch *queue.Channel) *Worker {
    return &Worker{
        db:     db,
        ch:     ch,
        engine: NewEngine(),
    }
}

func (w *Worker) Start() {
    // Listen on two queues
    queue.Consume(w.ch, "import.pending", w.handleImport)
    queue.Consume(w.ch, "import.enriched", w.handleEnriched)
}

func (w *Worker) handleImport(body []byte) error {
    var msg queue.ImportMessage
    if err := json.Unmarshal(body, &msg); err != nil {
        return err
    }

    // For each record in the import:
    // 1. Find potential matches in DB
    // 2. Score each candidate
    // 3. Auto-merge / send to review / create new
    log.Printf("Processing import job: %s", msg.JobID)
    // ... implementation
    return nil
}

func (w *Worker) handleEnriched(body []byte) error {
    // Handle Apollo-enriched data
    // ... implementation
    return nil
}
```

### Example: fuzzy matching

```go
// go-backend/internal/matcher/fuzzy.go
package matcher

import "math"

// LevenshteinDistance returns the minimum number of edits to transform a into b
func LevenshteinDistance(a, b string) int {
    la, lb := len(a), len(b)
    d := make([][]int, la+1)
    for i := range d {
        d[i] = make([]int, lb+1)
        d[i][0] = i
    }
    for j := 1; j <= lb; j++ {
        d[0][j] = j
    }
    for i := 1; i <= la; i++ {
        for j := 1; j <= lb; j++ {
            cost := 1
            if a[i-1] == b[j-1] {
                cost = 0
            }
            d[i][j] = min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+cost)
        }
    }
    return d[la][lb]
}

// NormalizedSimilarity returns 0.0 to 1.0 (1.0 = identical)
func NormalizedSimilarity(a, b string) float64 {
    maxLen := math.Max(float64(len(a)), float64(len(b)))
    if maxLen == 0 {
        return 1.0
    }
    dist := float64(LevenshteinDistance(a, b))
    return 1.0 - (dist / maxLen)
}

func min(a, b, c int) int {
    if a < b {
        if a < c { return a }
        return c
    }
    if b < c { return b }
    return c
}
```

### Go key libraries to install

```bash
cd go-backend

# Initialize module
go mod init github.com/your-org/alumni-go

# PostgreSQL driver (best Go postgres library)
go get github.com/jackc/pgx/v5
go get github.com/jackc/pgx/v5/pgxpool

# RabbitMQ client
go get github.com/rabbitmq/amqp091-go

# Excel parsing (for .xlsx imports)
go get github.com/xuri/excelize/v2

# Environment variables
go get github.com/joho/godotenv

# Structured logging
go get github.com/rs/zerolog

# Cron scheduling (for dedup service)
go get github.com/robfig/cron/v3
```

### Running Go services

```bash
# Run individually (during development)
cd go-backend
go run cmd/matcher/main.go
go run cmd/verifier/main.go
go run cmd/importer/main.go

# Build binaries (for production)
go build -o bin/matcher cmd/matcher/main.go
go build -o bin/verifier cmd/verifier/main.go
go build -o bin/importer cmd/importer/main.go
go build -o bin/dedup cmd/dedup/main.go

# Or use the Makefile
make build-all       # builds all 4 binaries
make run-matcher     # runs matching engine
make run-verifier    # runs SMTP verifier
```

### Makefile for Go

```makefile
# go-backend/Makefile

.PHONY: build-all run-matcher run-verifier run-importer run-dedup test

build-all:
	go build -o bin/matcher cmd/matcher/main.go
	go build -o bin/verifier cmd/verifier/main.go
	go build -o bin/importer cmd/importer/main.go
	go build -o bin/dedup cmd/dedup/main.go

run-matcher:
	go run cmd/matcher/main.go

run-verifier:
	go run cmd/verifier/main.go

run-importer:
	go run cmd/importer/main.go

run-dedup:
	go run cmd/dedup/main.go

test:
	go test ./internal/... -v

lint:
	golangci-lint run ./...
```

---

## Database schema

### Required PostgreSQL extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- Trigram fuzzy search
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
```

### Core tables

#### `users` — system users (your team)

```sql
CREATE TABLE users (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                VARCHAR(255) UNIQUE NOT NULL,
    password_hash        VARCHAR(255) NOT NULL,
    role                 VARCHAR(20) NOT NULL
                         CHECK (role IN ('super_admin','admin','team_lead','team_member')),
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
```

#### `alumni` — master alumni records (golden record)

```sql
CREATE TABLE alumni (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity (mostly from college records, tier 1)
    full_name           VARCHAR(255) NOT NULL,
    full_name_blind     VARCHAR(64),
    enrollment_no       VARCHAR(50),
    batch_year          INT,
    branch              VARCHAR(100),
    degree              VARCHAR(50),
    dob                 DATE,

    -- Contact (JSONB arrays — ranked, multiple per person)
    emails              JSONB DEFAULT '[]',
    phones              JSONB DEFAULT '[]',
    -- Each entry: { "value": "encrypted_string", "rank": 1, "type": "work",
    --               "source_tier": 3, "source_name": "apollo_api",
    --               "confidence": 70, "smtp_status": "valid", "added_at": "..." }

    -- Professional
    current_company     VARCHAR(255),
    current_title       VARCHAR(255),
    industry            VARCHAR(100),
    linkedin_url        VARCHAR(500),
    current_city        VARCHAR(100),

    -- Per-field provenance
    field_sources       JSONB DEFAULT '{}',

    -- Metadata
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

CREATE INDEX idx_alumni_name_trgm ON alumni USING gin (full_name gin_trgm_ops);
CREATE INDEX idx_alumni_batch ON alumni (batch_year);
CREATE INDEX idx_alumni_branch ON alumni (branch);
CREATE INDEX idx_alumni_company ON alumni USING gin (current_company gin_trgm_ops);
CREATE INDEX idx_alumni_completeness ON alumni (data_completeness);
CREATE INDEX idx_alumni_tags ON alumni USING gin (tags);
CREATE INDEX idx_alumni_blind_name ON alumni (full_name_blind);
```

#### `alumni_alternates` — rejected/alternate values per field

```sql
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
```

#### `import_jobs` — track every data import

```sql
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
```

#### `review_queue` — human review for ambiguous matches

```sql
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
```

#### `audit.log` — immutable activity log

```sql
CREATE SCHEMA audit;

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

-- audit_user can ONLY insert — enforced at DB role level
CREATE INDEX idx_audit_user ON audit.log (user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit.log (action, created_at DESC);
CREATE INDEX idx_audit_resource ON audit.log (resource_type, resource_id);
```

#### `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(64) NOT NULL UNIQUE,
    device_info     JSONB,
    ip_address      INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `campaigns` + `campaign_recipients`

```sql
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
```

---

## RabbitMQ queue topology

### Exchanges and queues

```
alumni.exchange (topic exchange)
├── import.pending          # New sheet upload ready for processing
├── import.enriched         # Apollo/LinkedIn enriched data ready for merge
├── verify.email            # Emails to SMTP-verify
├── enrich.batch            # Batch enrichment trigger for Python pipeline
├── review.created          # New review item added (notifies Node API)
├── notification.admin      # Admin alerts (anomalies, rate limit hits)
└── campaign.bounce         # GMass bounce webhook data
```

### Message format examples

```javascript
// import.pending — published by Node API when admin uploads a CSV
{
  job_id: "uuid",
  file_path: "uploads/2024/import_xyz.csv",
  source_tier: 1,
  column_mapping: { "col_A": "full_name", "col_B": "batch_year", "col_C": "email" },
  initiated_by: "user_uuid",
  signature: "hmac_sha256_hex"
}

// import.enriched — published by Python pipeline after Apollo lookup
{
  alumni_id: "uuid_or_null",
  linkedin_url: "https://linkedin.com/in/priya-sharma",
  apollo_data: {
    emails: [{ email: "priya@google.com", type: "work" }],
    phones: [{ number: "+919876543210", type: "mobile" }],
    company: "Google",
    title: "Software Engineer",
    industry: "Technology"
  },
  source_tier: 4,
  source_import_id: "uuid",
  signature: "hmac_sha256_hex"
}

// verify.email — published by Go matcher after adding new email
{
  alumni_id: "uuid",
  email: "priya@google.com",
  current_confidence: 58,
  signature: "hmac_sha256_hex"
}
```

---

## Authentication flow

### Login sequence

```
1. POST /api/auth/login { email, password }
2. Rate limit check (Redis: 5 attempts / 15 min per IP)
3. Fetch user by email from PostgreSQL
4. bcrypt.compare(password, user.password_hash)
5. If 2FA enabled:
   a. Return { temp_token, requires_2fa: true }
   b. POST /api/auth/verify-2fa { temp_token, totp_code }
   c. Validate TOTP code against user.totp_secret
6. Generate access token (JWT RS256, 15 min expiry)
   Payload: { sub: user_id, role, perms: [...], fp: hmac(ip+ua) }
7. Generate refresh token (random 256-bit, store SHA-256 hash in DB)
8. Create session in Redis: session:{user_id}:{device_hash}
9. Set httpOnly secure cookies:
   - access_token (Path=/, Max-Age=900)
   - refresh_token (Path=/api/auth/refresh, Max-Age=604800)
```

### Token refresh

```
1. POST /api/auth/refresh (refresh_token cookie auto-sent)
2. Hash token, lookup in refresh_tokens table
3. If found + not expired:
   a. DELETE old refresh token (rotation!)
   b. Generate new access JWT + new refresh token
   c. Store new refresh token hash, set new cookies
4. If old token reused (already deleted):
   → SECURITY ALERT: possible token theft
   → Delete ALL tokens + sessions for this user
   → Force re-login on all devices
```

### Middleware chain (every API request)

```
Request
  → helmet (security headers)
  → cors (whitelist check)
  → rateLimiter (Redis sliding window)
  → csrf (double-submit cookie on mutations)
  → auth (JWT verify → session check → fingerprint verify)
  → rbac (role + permission check)
  → validate (Joi schema validation)
  → controller logic
  → dataMasking (mask PII per role before response)
  → auditLogger (log to audit.log)
  → response
```

---

## Rate limiting rules

```javascript
// backend/src/constants/rateLimits.js

module.exports = {
  'POST /api/auth/login':           { window: '15m', max: 5,   key: 'ip' },
  'POST /api/auth/forgot-password': { window: '1h',  max: 3,   key: 'ip' },

  'GET /api/alumni':                { window: '1m',  max: 20,  key: 'user' },
  'GET /api/alumni/:id':            { window: '1m',  max: 30,  key: 'user' },

  'POST /api/alumni/:id/reveal':    { window: '24h', max: 20,  key: 'user',
    roleOverrides: {
      team_lead: 50,
      admin: 200,
      super_admin: Infinity
    }
  },

  'POST /api/export':               { window: '1h',  max: 1,   key: 'user',
    roles: ['super_admin']
  },

  default:                      { window: '1m',  max: 100, key: 'user' },
};
```

---

## RBAC permission matrix

```javascript
// backend/src/constants/roles.js

const PERMISSIONS = {
  ALUMNI_SEARCH:      'alumni:search',
  ALUMNI_VIEW:        'alumni:view',
  ALUMNI_VIEW_FULL:   'alumni:view_full',
  ALUMNI_EDIT:        'alumni:edit',
  ALUMNI_DELETE:      'alumni:delete',
  ALUMNI_REVEAL:      'alumni:reveal',

  IMPORT_UPLOAD:      'import:upload',
  IMPORT_VIEW:        'import:view',
  IMPORT_ROLLBACK:    'import:rollback',

  REVIEW_VIEW:        'review:view',
  REVIEW_RESOLVE:     'review:resolve',

  ENRICHMENT_TRIGGER: 'enrichment:trigger',
  ENRICHMENT_VIEW:    'enrichment:view',

  CAMPAIGN_CREATE:    'campaign:create',
  CAMPAIGN_SEND:      'campaign:send',
  CAMPAIGN_VIEW:      'campaign:view',

  USER_MANAGE:        'user:manage',
  AUDIT_VIEW:         'audit:view',
  SESSION_MANAGE:     'session:manage',
  SETTINGS_MANAGE:    'settings:manage',
  EXPORT_DATA:        'export:data',
};

const ROLE_PERMISSIONS = {
  super_admin: Object.values(PERMISSIONS),

  admin: [
    'alumni:search', 'alumni:view', 'alumni:view_full', 'alumni:edit', 'alumni:delete',
    'import:upload', 'import:view',
    'review:view', 'review:resolve',
    'enrichment:trigger', 'enrichment:view',
    'campaign:create', 'campaign:send', 'campaign:view',
    'user:manage', 'audit:view', 'session:manage',
    'export:data',
  ],

  team_lead: [
    'alumni:search', 'alumni:view', 'alumni:edit', 'alumni:reveal',
    'import:upload', 'import:view',
    'review:view', 'review:resolve',
    'enrichment:view',
    'campaign:view',
  ],

  team_member: [
    'alumni:search', 'alumni:view', 'alumni:reveal',
    'import:view',
    'review:view',
    'enrichment:view',
  ],
};

module.exports = { PERMISSIONS, ROLE_PERMISSIONS };
```

---

## Data masking rules

```javascript
// backend/src/constants/maskingRules.js

function maskEmail(email) {
  const [local, domain] = email.split('@');
  return local[0] + '*'.repeat(local.length - 2) + local.slice(-1) + '@' + domain;
}

function maskPhone(phone) {
  return phone.slice(0, 2) + 'XXX-XXXXX';
}

function maskDate(date) {
  return '**/**/' + date.slice(-4);
}

const MASKING_RULES = {
  team_member: {
    email:         maskEmail,         // r***a@gmail.com
    phone:         maskPhone,         // 98XXX-XXXXX
    dob:           () => null,        // hidden entirely
    enrollment_no: (v) => v,          // visible
    linkedin_url:  (v) => v,          // visible
  },
  team_lead: {
    email:         maskEmail,
    phone:         maskPhone,
    dob:           maskDate,          // **/**/1998
    enrollment_no: (v) => v,
    linkedin_url:  (v) => v,
  },
  admin:       {},                    // no masking
  super_admin: {},                    // no masking
};

module.exports = { MASKING_RULES, maskEmail, maskPhone, maskDate };
```

---

## Encryption at rest

```javascript
// backend/src/services/encryption.service.js

const crypto = require('crypto');

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes
const BLIND_INDEX_KEY = Buffer.from(process.env.BLIND_INDEX_KEY, 'hex');

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(ciphertext) {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
}

function blindIndex(value) {
  return crypto.createHmac('sha256', BLIND_INDEX_KEY)
    .update(value.toLowerCase().trim())
    .digest('hex');
}

module.exports = { encrypt, decrypt, blindIndex };
```

---

## Source tier system

| Tier | Source | Base confidence | Fields covered |
|------|--------|----------------|----------------|
| 1 | College official records | 95% | Name, enrollment, batch, branch, degree, DOB |
| 2 | Alumni portal (self-reported) | 82% | Current email, phone, company, city (decay: -3%/yr) |
| 3 | Manually mined (Apollo by team) | 70% | Email, phone, company, LinkedIn |
| 4 | Auto-mined (Python pipeline + Apollo API) | 58% | Email, phone, company, LinkedIn |
| 5 | Crowdsourced/unverified sheets | 40% | Supplementary only — never overwrites higher tier |

### Merge rules

```
1. Higher tier always wins for same field
2. Same tier → more recent timestamp wins
3. Losing value → alumni_alternates table
4. SMTP verification modifies confidence:
   - Valid: +40 pts (capped at 95)
   - Catch-all: +15 pts
   - Invalid: flag for GMass re-mine
5. Campaign bounce → auto-demote email, promote next ranked
6. Self-reported decay: confidence -= 3 per year since last update
```

### Composite matching score

```
Exact name match:                       +25 pts
Fuzzy name match (>85% Jaro-Winkler):   +15 pts
LinkedIn education says "Thapar":       +30 pts
Graduation year matches batch:          +25 pts
Branch / field of study matches:        +15 pts
College email domain in profile:        +20 pts
Location plausible (Indian city):       +5 pts
Age plausible from grad year:           +5 pts

Score >= 80:  Auto-merge
Score 40-79:  Human review queue
Score < 40:   Different person — do not merge
```

---

## Go service specifications

### matcher (matching engine)

```
Consumes:    import.pending, import.enriched
Publishes:   review.created, verify.email
Concurrency: 10 goroutines
DB pool:     max 20 connections (pgxpool)
Logic:       For each incoming record → fuzzy search DB → composite score → merge/review/create
```

### verifier (SMTP email checker)

```
Consumes:    verify.email
Publishes:   (writes directly to DB)
Concurrency: 50 goroutines (rate limited per domain)
Rate limits:
  - Gmail/Google:     2 checks/sec
  - Outlook/MS:       2 checks/sec
  - Other providers:  5 checks/sec
  - Per IP total:     100 checks/min
Timeout:     10 sec per SMTP connection
Retry:       2 retries with exponential backoff
Requirement: server must have valid reverse DNS (PTR record)
```

### importer (CSV/sheet processor)

```
Consumes:    import.pending
Publishes:   (feeds records to matcher internally)
Concurrency: 5 goroutines
Max file:    50MB
Formats:     CSV, TSV, XLSX (via excelize)
Throughput:  ~500 rows/sec
```

### dedup (scheduled duplicate scanner)

```
Trigger:     cron — daily at 4 AM IST
Strategies:  exact email match, exact phone match, fuzzy name + batch + branch
Batch size:  1000 records per iteration
Output:      new entries in review_queue table
```

---

## Python pipeline specifications

### linkedin_discovery.py

```
Trigger:     APScheduler — runs at 2 AM IST daily
             Also consumes from enrich.batch RabbitMQ queue (on-demand)
Input:       Array of { name, batch_year, branch }
  1. For each alumni, search LinkedIn: "{name} Thapar {batch_year}"
  2. If common name, add branch to query
  3. Parse results: extract name, profile URL, headline
  4. Filter: must contain "Thapar" in results
  5. Publish to RabbitMQ: import.enriched queue
Rate limit:  100 searches/day per LinkedIn session
Libraries:   requests, pika (RabbitMQ)
```

### apollo_enrichment.py

```
Trigger:     Receives LinkedIn URLs from linkedin_discovery via RabbitMQ
Input:       { alumni_id, linkedin_url }
Process:
  1. Call Apollo People Enrichment API with linkedin_url
  2. Extract: emails[], phones[], company, title, industry
  3. Tag as source_tier=4
  4. Publish to import.enriched queue
Rate limit:  300 requests/hour (Apollo API limit)
Cost:        Track credit usage per batch in Redis
Libraries:   requests, pika, redis
```

### portal_sync.py

```
Trigger:     APScheduler — cron at 3 AM IST nightly
Process:
  1. Connect to portal DB / API
  2. Query for records updated since last sync
  3. Map fields to system schema, tag as source_tier=2
  4. Publish to import.enriched queue
  5. Update last_sync_timestamp in Redis
Libraries:   requests, psycopg2 or sqlalchemy, pika, redis
```

### gmass_remine.py

```
Trigger:     APScheduler — runs after SMTP verification batch completes
Process:
  1. Query DB for emails with smtp_status = "invalid"
  2. Re-mine via GMass API for updated contact info
  3. Publish results to import.enriched queue
Libraries:   requests, psycopg2, pika
```

### bounce_handler.py

```
Trigger:     Called by Node API enrichment route on GMass bounce webhook receipt
             OR runs as a standalone queue consumer on campaign.bounce queue
Process:
  1. Parse bounce data from GMass webhook payload
  2. Update campaign_recipients status in DB
  3. Auto-demote bounced email confidence, promote next ranked email
Libraries:   pika, psycopg2
```

### scheduler.py

```
Entry point: python pipeline/scheduler.py
Purpose:     Starts APScheduler with all registered jobs
Jobs:
  - linkedin_discovery  → daily at 2:00 AM IST
  - portal_sync         → daily at 3:00 AM IST
  - gmass_remine        → daily at 5:00 AM IST
Also starts: RabbitMQ consumer threads for on-demand triggers
Libraries:   APScheduler, pika
```

---

## Environment variables

```env
# Application
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://alumni.thapar.edu

# PostgreSQL
DATABASE_URL=postgresql://api_user:password@localhost:5432/alumni_portal
DATABASE_POOL_MAX=20

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_redis_password

# RabbitMQ
RABBITMQ_URL=amqp://user:password@localhost:5672

# JWT (RS256)
JWT_PRIVATE_KEY_PATH=/secrets/jwt_private.pem
JWT_PUBLIC_KEY_PATH=/secrets/jwt_public.pem
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Encryption
ENCRYPTION_KEY=64_char_hex_string_for_aes256
BLIND_INDEX_KEY=64_char_hex_string_for_hmac

# HMAC (service-to-service signing)
INTERNAL_HMAC_SECRET=your_hmac_secret

# Python Pipeline
APOLLO_API_KEY=your_apollo_key
GMASS_API_KEY=your_gmass_key

# S3 / MinIO
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_BUCKET=alumni-uploads

# 2FA
TOTP_ISSUER=ThaparAlumniPortal
```

---

## Local development setup

```bash
# 1. Clone the repo
git clone git@github.com:your-org/alumni-portal.git
cd alumni-portal

# 2. Copy environment file
cp .env.example .env
# Edit .env with local values

# 3. Generate JWT key pair
openssl genrsa -out secrets/jwt_private.pem 4096
openssl rsa -in secrets/jwt_private.pem -pubout -out secrets/jwt_public.pem

# 4. Generate encryption keys
openssl rand -hex 32   # → paste as ENCRYPTION_KEY
openssl rand -hex 32   # → paste as BLIND_INDEX_KEY

# 5. Start infrastructure
docker-compose up -d postgres redis rabbitmq

# 6. Run database migrations
cd backend && npm install && npm run migrate:up

# 7. Seed development data
cd ../scripts && pip install -r requirements.txt && python seed_dev_data.py

# 8. Start Node API
cd ../backend && npm run dev

# 9. Start Go services (separate terminals)
cd ../go-backend && go run cmd/matcher/main.go
cd ../go-backend && go run cmd/verifier/main.go
cd ../go-backend && go run cmd/importer/main.go

# 10. Start frontend
cd ../frontend && npm install && npm run dev

# 11. Start Python pipeline scheduler (optional — runs enrichment jobs)
cd ../pipeline && pip install -r requirements.txt && python scheduler.py
```

---

## Node.js backend package.json

```json
{
  "name": "alumni-portal-backend",
  "version": "1.0.0",
  "main": "src/server.js",
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "migrate:up": "node-pg-migrate up --database-url-var DATABASE_URL --migrations-dir migrations",
    "migrate:down": "node-pg-migrate down --database-url-var DATABASE_URL --migrations-dir migrations",
    "test": "jest --coverage",
    "lint": "eslint src/"
  },
  "dependencies": {
    "express": "^4.18.0",
    "pg": "^8.11.0",
    "ioredis": "^5.3.0",
    "amqplib": "^0.10.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "cookie-parser": "^1.4.6",
    "joi": "^17.11.0",
    "otplib": "^12.0.1",
    "pino": "^8.16.0",
    "pino-pretty": "^10.2.0",
    "multer": "^1.4.5-lts.1",
    "node-pg-migrate": "^6.2.0",
    "dotenv": "^16.3.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0",
    "jest": "^29.7.0",
    "eslint": "^8.50.0",
    "supertest": "^6.3.0"
  }
}
```

---

## Deployment checklist

```
Pre-deploy:
  [ ] All environment variables set in secrets manager
  [ ] JWT key pair generated and stored securely
  [ ] Encryption keys generated (NOT the same as JWT keys)
  [ ] PostgreSQL roles created (api_user, audit_user, go_worker)
  [ ] RabbitMQ queues declared (use definitions.json)
  [ ] TLS certificates provisioned
  [ ] Nginx reverse proxy configured
  [ ] Backup strategy configured (daily DB dumps, encrypted)

Security hardening:
  [ ] PostgreSQL pg_hba.conf restricts connections by IP
  [ ] Redis password set, not publicly exposed
  [ ] RabbitMQ default guest user deleted
  [ ] All services on private network (only nginx is public)
  [ ] HSTS + CSP + security headers enabled
  [ ] Rate limiting tested under load
  [ ] Audit log INSERT-only permission verified

Post-deploy:
  [ ] Create super_admin account via migration script
  [ ] Verify 2FA flow works end-to-end
  [ ] Test import with sample CSV
  [ ] Verify data masking per role
  [ ] Run initial SMTP verification on existing emails
  [ ] Set up dedup cron job
  [ ] Configure Python pipeline with API credentials (Apollo, GMass)
```

---

## API endpoint reference

| Method | Endpoint | Auth | Min role | Description |
|--------|----------|------|----------|-------------|
| POST | /api/auth/login | No | — | Login |
| POST | /api/auth/verify-2fa | Temp | — | Verify TOTP |
| POST | /api/auth/refresh | Cookie | — | Rotate tokens |
| POST | /api/auth/logout | Yes | Any | End session |
| POST | /api/auth/forgot-password | No | — | Request reset |
| POST | /api/auth/reset-password | Token | — | Set new password |
| GET | /api/alumni | Yes | Any | Search (masked per role) |
| GET | /api/alumni/:id | Yes | Any | Detail (masked per role) |
| PUT | /api/alumni/:id | Yes | TL | Update fields |
| DELETE | /api/alumni/:id | Yes | Admin | Soft delete |
| POST | /api/alumni/:id/reveal | Yes | TM | Request field reveal |
| POST | /api/alumni/:id/reveal/approve | Yes | TL | Approve reveal |
| POST | /api/import | Yes | TL | Upload CSV/sheet |
| GET | /api/import/:id | Yes | TL | Import status |
| POST | /api/import/:id/rollback | Yes | Admin | Rollback import |
| GET | /api/review | Yes | TL | Review queue |
| POST | /api/review/:id/resolve | Yes | TL | Merge or separate |
| POST | /api/enrichment/trigger | Yes | Admin | Start enrichment |
| GET | /api/enrichment/:jobId | Yes | Any | Progress |
| GET | /api/enrichment/email-health | Yes | TL | SMTP stats |
| GET | /api/campaigns | Yes | TL | List campaigns |
| POST | /api/campaigns | Yes | Admin | Create |
| POST | /api/campaigns/:id/send | Yes | Admin | Send |
| GET | /api/campaigns/:id | Yes | TL | Report |
| GET | /api/admin/users | Yes | Admin | List users |
| POST | /api/admin/users | Yes | Admin | Invite user |
| PUT | /api/admin/users/:id | Yes | Admin | Edit role |
| GET | /api/admin/audit | Yes | Admin | Audit log |
| GET | /api/admin/sessions | Yes | SA | Active sessions |
| DELETE | /api/admin/sessions/:id | Yes | SA | Force logout |
| GET | /api/admin/settings | Yes | SA | Settings |
| PUT | /api/admin/settings | Yes | SA | Update settings |
| POST | /api/export | Yes | SA | Export (rate limited) |

*Roles: SA = Super Admin, Admin, TL = Team Lead, TM = Team Member*
