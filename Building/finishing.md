# AlumVault — Status & Roadmap

Last updated: 2026-05-27

This file tracks the live state of the project: what's actually working, what's
been built but not wired in, and what's still ahead. It supersedes `remaining.md`
and `milestone.md` (both were written against the original blueprint before any
real-world ingestion work began).

---

## ✅ What's done

### Infrastructure & local-dev setup
- [x] `docker-compose.dev.yml` — data-services-only compose (Postgres, Redis,
      RabbitMQ, MinIO). All credentials/ports sourced from `.env`.
- [x] Project-root `.env` with real generated secrets
      (`ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `INTERNAL_HMAC_SECRET`,
      `JWT_SECRET`). `backend/.env` is kept in sync.
- [x] JWT keypair generated at `secrets/jwt_private.pem` / `jwt_public.pem`
      (note: code currently uses HS256 with `JWT_SECRET`; RS256 keys are kept
      for future use).
- [x] Node 22, Go 1.26, Python 3.13 verified on host. Native Postgres / Redis /
      RabbitMQ services were conflicting on default ports — stopped manually.

### Node.js backend (`backend/`)
- [x] Dependencies installed, server boots on port 3001.
- [x] All 10 migrations applied. Schema is live.
- [x] Admin seeded (`garvnoor111@gmail.com` / `1234567890`, role
      `super_admin`).
- [x] `/health` endpoint returns OK.
- [x] Postgres, Redis, RabbitMQ connections all established on startup.
- [x] WebSocket server initialised on `/ws`.
- [x] Routes mounted: auth, alumni, import, campaign, review, enrichment,
      audit, dashboard, admin, user, export.

### Next.js frontend (`Frontend/`)
- [x] Dependencies installed, dev server boots on port 3000.
- [x] Returns HTTP 200 on `/`.
- [x] `/api/*` rewrite to `localhost:3001` is in place.

### Schema work for ingestion path
- [x] New migration: `1700000000010_create_alumni_companies.sql`
  - `alumni_companies` table (employment history with `is_current` + `source`
    tracking).
  - Unique index on `LOWER(linkedin_url)` where not null — LinkedIn URL is the
    primary dedup key.
  - Fallback dedup index on `(full_name_blind, batch_year, branch)`.
  - `alumni.missing_in_apollo` + `alumni.apollo_checked_at` columns to cache
    negative Apollo lookups.

### Excel ingestion pipeline
- [x] Canonical Excel import template at
      `scripts/templates/alumni_import_template.xlsx` with three sheets:
      README, alumni_data (with example rows), and branch_synonyms reference.
- [x] Template generator script: `scripts/templates/generate_import_template.py`.
- [x] Normaliser library: `scripts/import/normalizer.py`.
      Handles: empty-token detection (`N/A`, `-`, `—`, etc.), email
      lowercasing, phone +91/dash/space stripping, LinkedIn URL canonicalisation,
      branch synonym mapping (CSE/ECE/EE/EIC/ME/CHE/CIVIL/BIO/MBA/MCA/BBA),
      date parsing (multiple formats), pipe-list splitting for
      `past_companies` and `tags`, HMAC blind-index hashing.
- [x] CLI importer: `scripts/import/import_excel.py`. Does:
      - within-sheet dedup (LinkedIn → email → name+batch+branch),
      - cross-DB matching with weighted scoring
        (LinkedIn=100, email=90, phone=60, name=40, batch=20, branch=20,
         company=10),
      - auto-merge ≥ 100, review-queue 70–99, new row < 70,
      - union-on-merge for emails/phones/companies/tags,
      - records source label in `alumni.field_sources` JSONB.
- [x] Synthetic test sheet: `scripts/import/test_sheet.xlsx`.
- [x] End-to-end verified: 9 raw rows → 6 candidates → 6 inserted on first run;
      re-import of same sheet produced 0 inserts, 3 auto-merges, 3 review-queue
      entries. Branch synonyms, company union, source tracking all confirmed
      working against the live DB.

---

## 🟡 Built but not wired in / not yet validated

These exist in the repo but haven't been exercised end-to-end yet.

- Go workers (`GO_Backend/cmd/{importer,matcher,verifier,dedup}/main.go`).
  Compile and run, but not running locally yet — RabbitMQ messages
  published by the Node API currently have no consumers.
- Python pipeline (`pipeline/scheduler.py`, `apollo_enrichment.py`,
  `linkedin_discovery.py`, `gmass_remine.py`, `portal_sync.py`,
  `bounce_handler.py`). APScheduler infrastructure is there, but not running.
- Frontend pages beyond the root route — not opened/tested yet.
- `nginx`, `minio` containers exist in `docker-compose.yml` but only MinIO
  is part of the dev compose.

---

## 🚧 Next up (in priority order)

### 1. Validate one of the user's real Excel sheets (immediate)
Run the importer end-to-end against a real sheet from the Alumni Relations cell.
Capture: which columns the user's sheet has vs. the canonical template, how
many rows merge vs. land in review, what normalisation edge cases need
expanding.

### 2. LinkedIn URL lookup endpoint + frontend page
- `POST /api/alumni/lookup` — accepts a LinkedIn URL, returns the cached
  alumnus record if known. Audit-logged with `cache_hit: true|false`.
- If cache miss and `missing_in_apollo` is false → optionally call Apollo,
  store the result, return.
- If Apollo returns nothing → set `missing_in_apollo = true` so future
  lookups don't burn credits on the same dead URL.
- Frontend: simple paste-URL-get-contact-info page. The single
  highest-ROI feature for the cell's daily reactive lookups.

### 3. Apollo "mine the gaps" bulk job
One-time enrichment of the existing DB:
`for each alumnus where overall_confidence < 0.7 OR last_verified_at older
than 6 months: enrich via Apollo, update field_sources, bump confidence.`
Skips records that already have complete data, so credits are spent only
where they add value.

### 4. Faceted search UI
Replace the team's current "Thapar portal → filter → copy names → look up on
Apollo" workflow with a search page that supports filters for company
(via `alumni_companies` for "ex-X" / "current X"), batch year, branch, city,
tags. Click an alumnus → reveal flow (already implemented at
`POST /api/alumni/:id/reveal` with audit).

### 5. Cross-source merge from existing data
Bulk-import the team's existing Excel sheets and the Thapar alumni portal
exports. The matcher already dedups across them, so this is the
"consolidate institutional memory" step before Apollo enrichment in (3).

### 6. Wire up the Go workers
Start the four Go services (`importer`, `matcher`, `verifier`, `dedup`) so
that uploads via the API route do async parsing + matching instead of the
sync CLI path. Until then, bulk imports stay CLI-driven, which is fine for
the initial load but won't scale to self-serve uploads from the frontend.

### 7. Start the Python enrichment scheduler
Once Apollo / LinkedIn / GMass workflows are agreed on, run
`pipeline/scheduler.py` so cron-driven enrichment + bounce handling
actually fire.

---

## 🔮 Future (post-MVP)

- Mapping UI on import: let users upload sheets with any column layout and
  pick which column maps to which field via dropdowns (instead of
  re-formatting to the canonical template).
- Apollo budget guardrails (per-month credit cap, soft-warning UI).
- Bulk Apollo discovery (find new Thapar alumni Apollo knows about that
  AlumVault doesn't).
- Replace HS256 JWT with the RS256 keypair at `secrets/`.
- Production deployment: `docker-compose.prod.yml`, NGINX TLS, CI/CD
  workflows (these files exist as scaffolds but are untested).
- Audit dashboard showing Apollo credits saved by the cache hit-rate.

---

## 🐞 Known issues / quirks

- **Same-name "Priya Verma" rows can stay split** when one source has only
  a LinkedIn URL and another has only an email — there's no shared key
  for the within-sheet pass to recognise them as the same person. Will
  resolve naturally once any later row carries both, or when the Go dedup
  worker runs a global pass.
- **`alumni.current_company` is a single field** but `alumni_companies` can
  carry multiple `is_current=true` rows after a merge. The denormalised
  field reflects only the last write. Low priority; the canonical answer
  is the join table.
- **`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` env vars are required by
  `env.js`** but unused by `utils/jwt.js` (which uses HS256). Placeholders
  are in `.env` to pass validation. To be cleaned up when RS256 is wired
  in.
- **Native Windows services for Postgres / Redis / RabbitMQ** are stopped
  but still installed. They may auto-restart on reboot — startup type
  should be set to "Manual" via `services.msc` if persistent.
