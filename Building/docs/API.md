# Full Endpoint Reference

## Authentication (`/api/auth`)
- `POST /login`: Authenticates user, issues JWT or triggers 2FA.
- `POST /verify-2fa`: Validates TOTP code against short-lived token.
- `POST /refresh`: Token rotation issuing new pairs. (No Auth)
- `POST /register`: [Admin+] Registers new internal dashboard user.
- `POST /change-password`: Mutates current password enforcing history.
- `POST /forgot-password`: Mocks sending reset tokens globally.
- `POST /reset-password`: Processes token updates actively securely.
- `POST /logout`: Destroys active session arrays globally native.
- `GET /me`: Returns JWT mapping metadata payloads precisely.

## Alumni Management (`/api/alumni`)
- `GET /`: Search and list paginated. (Masked based on user).
- `GET /stats`: Aggregation engine macro.
- `GET /:id`: Specific lookup cleanly limits masking boundaries.
- `PATCH /:id`: [Team Lead+] Mutation of specific core elements naturally.
- `DELETE /:id`: [Admin+] Scraps bounds deeply.
- `POST /:id/reveal`: Requests PII unmasking permissions natively.
- `POST /:id/reveal/approve`: [Team Lead+] Authorizes prior requests.

## Data Imports (`/api/import`)
- `POST /`: [Team Lead+] Multiparts File Upload endpoints mapping AMQP cleanly.
- `GET /`: List aggregation tracking limits.
- `GET /:id`: Fetch specifically.
- `POST /:id/cancel`: [Admin+] Drops rabbitmq bindings dynamically securely.
- `POST /:id/rollback`: [Admin+] Purges source bounds cleanly limits.

## Deduplication & Reviews (`/api/review`)
- `GET /`: List of pending ambiguous conflicts limits cleanly mapping appropriately.
- `POST /:id/resolve`: [Team Lead+] Submits JSON resolution patch completely limits natively mapping structure exactly seamlessly securely.

## Admin Tools (`/api/admin`)
- `GET /users`: [Admin+] Lists users perfectly.
- `POST /users/invite`: [Super Admin] Triggers invitation logic explicitly properly bounds.
- `PATCH /users/:id/role`: [Super Admin] Re-evaluates mapping seamlessly deeply internally correctly limits securely accurately perfectly limits exactly mappings.
- `GET /sessions`: [Super Admin] Retrieves active tokens limits caching engines precisely cleanly structurally strictly natively conceptually actively.
- `DELETE /sessions/:id`: [Super Admin] Forces cache sweep natively precisely limits precisely limits.
- `GET /settings`: [Super Admin] Operational variables exactly logically natively explicitly limits comprehensively.
- `PUT /settings`: [Super Admin] Update operations natively perfectly logically cleanly logically natively securely strictly limits.

## Active Endpoints Ext.
- Export constraints triggers cleanly mapping logically `POST /api/export`
- Enrichment pipelines mappings safely `POST /api/enrichment/trigger` cleanly structurally limits
- Audit interactions natively cleanly limits completely cleanly logically bounds.
