# Qlicker Migration Plan: MeteorJS → Fastify/React

> **This is the master migration document.** Read this file to understand the current state and what remains. For coding conventions, see [CODING_STANDARDS.md](CODING_STANDARDS.md). For legacy database details, see [LEGACY_DB.md](LEGACY_DB.md). For completed work history, see [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md).

## Status: Phase 8 (Production Readiness) — In Progress

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Current Status](#current-status)
4. [Phase 8 — Remaining Work](#phase-8--remaining-work)
5. [Production Deployment](#production-deployment)
6. [Code Review Findings](#code-review-findings)
7. [Security Hardening](#security-hardening)
8. [How to Resume Work](#how-to-resume-work)

---

## Overview

Qlicker is a classroom response system migrated from MeteorJS to a modern Fastify (backend) + React (frontend) stack. The goals are:

- **Same functionality** as the MeteorJS app, redesigned from the ground up
- **Same database** — compatible with the existing MongoDB production database (see [LEGACY_DB.md](LEGACY_DB.md))
- **Fewer dependencies** — well-maintained packages with long-term support
- **API-first** — all functionality exposed through REST/WebSocket API endpoints
- **Performance** — support thousands of concurrent users with real-time features
- **Deployable** — run natively or via Docker Compose with load balancing

---

## Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Fastify v5 | HTTP API server (REST + WebSocket) |
| **Frontend** | React 19 (Vite 8) | Single-page application |
| **Database** | MongoDB | Data persistence (existing legacy DB) |
| **ODM** | Mongoose v9 | MongoDB object modeling |
| **Real-time** | @fastify/websocket + Redis pub/sub | WebSocket for live session updates, multi-instance |
| **Auth** | @fastify/jwt + @fastify/cookie | JWT-based authentication (in-memory access token, httpOnly cookie refresh) |
| **SSO** | @node-saml/node-saml | SAML-based SSO (verified against Microsoft Entra) |
| **UI Framework** | Material UI v7 | Material Design components |
| **Rich Text** | TipTap v3 | WYSIWYG editor with KaTeX math rendering |
| **Testing** | Vitest 4 + Playwright | 374 server + 116 client unit tests, 14 E2E flows |
| **Containerization** | Docker + Docker Compose | Production deployment with Nginx load balancing |

For the full directory structure, API routes, and coding conventions, see [CODING_STANDARDS.md](CODING_STANDARDS.md).

### API Summary

All routes prefixed with `/api/v1`. WebSocket at `/ws`. **30+ REST endpoints** covering:

- **Auth:** register, login, logout, refresh, forgot/reset password, verify email, SSO (SAML)
- **Users:** profile CRUD, password change, admin user management
- **Courses:** CRUD, enrollment, student/TA management, groups (10 endpoints), video chat (13 endpoints)
- **Sessions:** CRUD, lifecycle (start/end), quiz management, live session, review, response submission
- **Questions:** CRUD, library (copy to library/session), question ordering
- **Grades:** recalculate, manual editing, visibility, CSV export, course/session grades
- **Images:** upload, delete, cleanup
- **Settings:** admin configuration, public settings

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `session:question-changed` | Server → Client | Delta: `{ questionId, questionIndex, questionNumber, questionCount }` |
| `session:question-updated` | Server → Client | Delta: `{ questionId, question? }` for current-question content edits |
| `session:response-added` | Server → Instructors + joined students when stats visible | Delta: `{ questionId, attempt, responseCount, joinedCount, responseStats?, response? }` so live views can patch counts, stats, and response lists locally |
| `session:attempt-changed` | Server → Client | Delta: `{ questionId, currentAttempt, stats, correct, resetResponses }` |
| `session:participant-joined` | Server → Instructors | Delta: `{ joinedCount, joinedStudent }` |
| `session:join-code-changed` | Server → Client | Delta: `{ joinCodeEnabled, joinCodeActive, ... }` with student-safe payloads |
| `session:chat-settings-changed` | Server → Client | Delta: `{ chatEnabled }` so live tabs can appear/disappear without refetching unrelated data |
| `session:chat-updated` | Server → Client | Delta: `{ postId, changeType, currentQuestionNumber?, post?, quickPostOption? }` so active chat tabs can patch local state before falling back to `/chat` |
| `session:status-changed` | Server → Client | Delta: `{ status }` |
| `session:visibility-changed` | Server → Client | Delta: `{ questionId, hidden, stats, correct }` |
| `session:updated` | Server → Client | Generic fallback for non-live mutations or targeted single-user refreshes |

---

## Current Status

### Milestone Completion

| Milestone | Status | Phase |
|-----------|--------|-------|
| 1. Login works | ✅ Complete | Phase 1 |
| 2. Profile & uploads | ✅ Complete | Phase 2 |
| 3. Course management | ✅ Complete | Phase 3 |
| 4. Session editor | ✅ Complete | Phase 4 |
| 5. Live sessions & quizzes | ✅ Complete | Phase 5 |
| 6. Grading | ✅ Complete | Phase 6 |
| 7. Groups, video, SSO confirmed | ✅ Complete | Phase 7 |
| 8. Production ready | 🔄 In progress | Phase 8 |

### Test Summary

- **Server:** 374 tests across 17 test files
- **Client:** 116 tests across 30 files
- **Run:** `cd server && npx vitest run` / `cd client && npx vitest run`
- **Build:** `cd client && npx vite build`
- **E2E:** 12 baseline Playwright flows via `./scripts/qlicker.sh e2e` or `cd client && npx playwright test`
- **SSO Smoke:** `./ssoserver/scripts/run-smoke.sh` runs 2 SSO login/logout flows against a local SimpleSAMLphp IdP

### Key Completed Features

All core Qlicker functionality has been restored: authentication (local + SAML SSO), course management, session/quiz editor with slides, live interactive sessions with real-time WebSocket updates, grading (auto + manual), question library, group management, Jitsi video chat, session export/import, PDF handouts, i18n (en/fr), and admin settings. See [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md) for full details.

### Recent 2026-03-26 Fixes

- Session grade rows are now seeded when a session reaches the **Ended** state, even before the session is marked reviewable for students.
- Manual grade editing and session grade recalculation are now locked until the session is **Ended**, which keeps grading writes aligned with when grade items exist.
- Latest-attempt grading is now standardized across server and client: the highest `attempt` wins for each student/question, with `updatedAt` / `createdAt` as the tie-breaker.
- Legacy duplicate `Grade` rows for the same `{ userId, courseId, sessionId }` identity are synchronized during recalculation so stale rows cannot keep outdated `outOf`, `needsGrading`, or attempt data.
- Professor and student course session lists now keep search and pagination controls inside a collapsible tools area; professor lists also support a **Needs grading** filter and show **Needs grading** chips plus joined-student counts on session cards.
- Student live-session stats now refresh word clouds and histograms automatically when the server publishes updates; a manual page refresh is no longer required.
- Admins can now disable and later restore user accounts. Disabled accounts are blocked from local login, SSO callback, token refresh, and authenticated API use.

### Recent 2026-03-27 Fixes

- Added a database-backed **Admin -> Backup** tab. It now controls whether scheduled backups run, what local time they run, and how many daily, weekly, and monthly archives are kept.
- Production backups now use labeled archives stored in `production_setup/backups/` with the format `qlicker_backup_YYYYMMDD_HHmmss_<daily|weekly|monthly>.tar.gz`.
- Added a `backup-manager` service to the production Docker Compose stack so live `mongodump` backups can run while the app stays online.
- Live interactive-session stats are additive again for MC, TF, MS, SA, and NU questions. If legacy or partial cache data is detected, the server rebuilds canonical stats from `Response` documents before applying new deltas.
- Blank short-answer submissions now count for participation, receive an automatic score of `0`, and no longer appear as needing manual grading.
- Live interactive-session review now loads while a session is still running, but grading edits remain locked until the session reaches **Ended**.
- Student-only accounts that instruct a course are now treated as instructor users for that course without granting course-creation rights. The UI labels these memberships as **TA** assignments only; no new role was added to the schema.
- Course membership rules now block the same user from being both student and instructor in one course, block professor/admin accounts from student enrollment, and keep student practice/question-library access tied to `course.allowStudentQuestions`.
- Login/session lifetime defaults remain **120 minutes (2 hours)**, and the configured timeout now applies to newly issued access and refresh sessions instead of silently allowing old sessions to continue indefinitely.
- Duplicate grade identities are now prevented in the backend, and the existing cleanup script is documented for one-time maintenance on legacy data.
- Added component coverage for the new Admin backup flow plus shared `SessionListCard` and `StudentIdentity` UI surfaces, and expanded Playwright coverage for backup-policy saves plus disabled-account login blocking/restoration.
- Fixed a `StudentCourseDetail` hook-order bug when dynamic tabs appear, and labeled grade/session-picker row checkboxes so the critical accessibility E2E checks pass.

### Recent 2026-03-28 Fixes

- Live short-answer response lists are now newest-first in both live-session controls and professor session review, using response timestamps as the tie-breaker.
- Professors now get a dedicated live-session toggle to hide or show the shared short-answer response list for students and the presentation window without affecting the professor's own control view.
- Live interactive-session review stays available while the session is running, and the page now warns that grading remains locked until the session reaches **Ended**.
- Course grade detail dialogs now label rows as `Q1(MC)`, `Q2(SA)`, and so on, with red/green grading cues that ignore stale zero-point `needsGrading` flags.

### Recent 2026-03-29 Fixes

- Admin-side password resets now save a working Argon2 local password immediately, clear pending reset tokens, and no longer leave affected users stuck with the **No local password is set** prompt after email login is allowed.
- Student and professor course pages now show course-scoped live-session tiles above the tabs, mirroring the dashboard quick-access pattern without repeating the course name.
- Course quiz cards now show date-and-time context directly in the list: **Quiz starts at**, **Quiz ends at**, or **Quiz ended at**, depending on status.
- Blank short-answer responses no longer keep professor review pages or course session lists flagged as **Needs grading**; they still count toward participation with an accepted score of `0`.
- Ending a live session from the live controls now stamps the session `date` with the actual end time instead of leaving the original draft timestamp in place.

### Recent 2026-04-01 Fixes

- Added session-scoped live chat with anonymous student posting, instructor moderation, quick-post upvotes, inline comments, and professor-only review visibility for dismissed posts.
- Session chat now uses its own lean REST payloads plus delta-only WebSocket events so live question traffic does not need to refetch chat data unless the active chat tab changes.
- Live `session:response-added` events now carry per-audience response deltas where possible, so professor/student views can update response counts, stats, and visible answer lists without broad `/live` refreshes on every new submission.

---

## Phase 8 — Remaining Work

**Goal:** Production readiness — security hardening, CI/CD, remaining tests, documentation polish.

### Checklist

- [x] Full E2E test suite with Playwright (12 baseline + 2 SSO smoke flows)
- [x] Load testing with realistic concurrent user counts (see [`load-testing/`](load-testing/))
- [x] Production Docker Compose with Nginx load balancer (see [`production_setup/`](production_setup/))
- [x] Backup and restore scripts (see [`production_setup/backup.sh`](production_setup/backup.sh), [`production_setup/restore.sh`](production_setup/restore.sh))
- [x] Private-bucket cutover for S3 images (sanitization scripts ready)
- [x] Complete developer guide and user manual refresh
- [x] Refresh token rotation and account lockout
- [x] npm audit 0 vulnerabilities (server + client)
- [x] Major dependency upgrades (React 19, MUI 7, Vite 8, Mongoose 9, etc.)
- [x] Redis pub/sub for multi-instance WebSocket scaling
- [x] Session list pagination
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Security scanning and penetration testing
- [x] Component tests for critical UI components
- [ ] Service unit tests for email, questionCopy, sessionCopy, questionImportExport
- [ ] Audit logging for settings/role/grade changes
- [ ] French translation review by native speaker (71 identical en/fr keys to verify)

### Follow-Up Items (from Phase 7)

- Decide whether to support legacy `users.services.password.reset.*` path directly or transform into the new `services.resetPassword` path
- Confirm whether `meteor_accounts_loginServiceConfiguration` should be deprecated or migrated
- **Confirm encrypted assertion decryption with production certificates** — encrypted assertions were verified against the local SimpleSAMLphp IdP, but the production IdP uses signed (not encrypted) assertions. Test with production certificates if the institution switches to encrypted assertions.

### Performance Optimization Opportunities

| Issue | Severity | Details |
|-------|----------|---------|
| **N+1 grade/response query in review** | MEDIUM | Batch-load responses instead of per-grade loop queries in session review/results endpoints |
| **Missing field projections on live session** | LOW | Add `.select()` to Question queries in live session endpoint |
| **~10 Session.findById() without `.lean()`** | LOW | Still return full Mongoose documents; converting requires replacing `.toObject()` with plain spread |
| **Statistical data caching** | LOW | `buildResponseStats()` recomputes on each API call; pre-compute and cache on question document (like `wordCloudData`) for high-concurrency sessions |

### Planned Private-Bucket Cutover

Target state: private S3 bucket for all image assets. Stages:

1. **Fastify read path:** images served through `/uploads/<key>` for all storage backends
2. **Staged DB migration:** [`production_setup/sanitize-s3.js`](production_setup/sanitize-s3.js) rewrites legacy public S3 URLs (dry-run + apply modes)
3. **Validation window:** verify old and new images render through Fastify path
4. **Bucket cutover:** remove public access, enable S3 Block Public Access
5. **Post-cutover:** Fastify is the sole reader for all image URLs

---

## Production Deployment

> **Full guide:** [`production_setup/README.md`](production_setup/README.md)

The [`production_setup/`](production_setup/) directory is a self-contained deployment package. Copy it to the production server — no source checkout or build tools required (only Docker).

### Architecture

```
Internet → Nginx :443/:80 → [ Server ×N ] → MongoDB + Redis
                ↓
            Client SPA
```

- **Nginx** terminates TLS (ports 443/80 only exposed) and load-balances across server replicas.
- **Server** replicas (via `SERVER_REPLICAS`) run the Fastify API + WebSocket, synchronized through **Redis** pub/sub.
- **MongoDB** (single instance with WiredTiger) stores all data. Sufficient for thousands of concurrent users.
- **Certbot** (optional) auto-renews Let's Encrypt certificates.

### Quick Start

```bash
scp -r production_setup/ user@server:/opt/qlicker/
ssh user@server && cd /opt/qlicker
chmod +x *.sh
./setup.sh                # Interactive setup — generates .env
./setup.sh --init-certs   # (Optional) Let's Encrypt certificate
docker compose up -d
```

### Scripts Reference

| Script | Description |
|--------|-------------|
| `setup.sh` | Interactive setup wizard — generates `.env`, configures replicas, TLS, JWT secrets |
| `setup.sh --init-certs` | Obtain initial Let's Encrypt certificate via Certbot ACME challenge |
| `init-from-legacy.sh` | Restore a legacy MeteorJS mongodump, run question-type migration, optionally sanitize S3 |
| `sanitize-s3.js` / `sanitize-s3.sh` | Rewrite legacy S3 image references to `/uploads/<key>` (dry-run + apply) |
| `backup.sh` | Create a live MongoDB archive with a `daily`, `weekly`, `monthly`, or `manual` label and prune retained archives per the Admin Backup policy |
| `restore.sh` | Restore MongoDB from a labeled backup archive (interactive or specific file) |
| `update.sh` | Pull/rebuild images, create pre-update backup, rolling restart, health check |
| `manage-user.sh` | CLI user management: `change-password`, `create`, `promote`, `set-email-login`, `list` |
| `scripts/build-images.sh` *(repo root)* | Build + tag Docker images; optional `--push` to registry |

### Scaling Recommendations

| Concurrent Users | Server Replicas | Notes |
|-----------------|-----------------|-------|
| < 500 | 2 | Minimum for availability |
| 500–1,000 | 3 | Good balance |
| 1,000–2,000 | 4 | ~500 WS connections per replica |
| 2,000+ | 4+ | Consider dedicated hardware |

MongoDB: increase `--wiredTigerCacheSizeGB` for more RAM (recommend 25–50% of available RAM). Redis: default 256 MB sufficient for pub/sub; increase to 512 MB+ for 4+ replicas at 2000+ users.

### Backup Strategy

- **Manual:** `./backup.sh`
- **Automated:** the `backup-manager` container checks the configured Admin backup time every minute and runs daily backups every day, weekly backups on Sundays, and monthly backups on the first day of the month.
- **Defaults:** enabled at `02:00` local server time with retention of 7 daily archives, 4 weekly archives, and 12 monthly archives.
- **Storage:** archives are written locally to `production_setup/backups/`.
- **Restore:** `./restore.sh` (interactive) or `./restore.sh backups/qlicker_backup_<timestamp>_<label>.tar.gz`
- **Legacy cleanup:** `node scripts/dedupe-grades.js --apply --mongo-uri <mongodb-uri>` removes duplicate grade identities before the unique backend constraint is relied upon.

---

## Code Review Findings

### 2026-03-26 Review

| Issue | Severity | Status | Details |
|-------|----------|--------|---------|
| **SSRF in profile image fetch** | MEDIUM | ✅ Fixed | `fetchRemoteProfileImageBuffer()` now blocks requests to private/internal IP ranges (RFC 1918, loopback, link-local, cloud metadata) |
| **Remaining hardcoded i18n strings** | LOW | ✅ Fixed | 3 hardcoded English aria-labels/placeholders replaced with `t()` calls |
| **Settings PATCH unvalidated SSO keys** | LOW | Open | Field whitelist exists; individual value validation for sensitive SSO fields recommended |
| **SSO logout XML fallback uses regex** | LOW | Open | Falls back to regex-based XML extraction when crypto validation fails; consider a proper XML parser |
| **No audit logging** | LOW | Open | Settings, role, and grade changes should be logged to an audit trail |
| **`update.sh` continues on backup failure** | LOW | Noted | Pre-update backup failure logs a warning but does not stop the update |
| **Swagger `/docs` exposed in production** | INFO | Noted | nginx.conf comment says "remove in hardened deployments" but enabled by default |

### Production Setup Recommendations

| Issue | Recommendation |
|-------|---------------|
| **MongoDB WiredTiger cache fixed at 1GB** | Recommend 25–50% of available RAM for larger deployments |
| **Redis 256MB may be tight at 2000+ users** | Consider 512MB+ for 4+ server replicas |
| **Docker resource limits not set** | Add `mem_limit` for production containers |
| **`.env` file permissions** | Run `chmod 600 .env` after setup to protect secrets |

### i18n Status

- **en/fr key parity:** ✅ All 1,499 keys match between en.json and fr.json
- **71 identical en/fr keys:** LOW — most are legitimate (abbreviations, proper nouns); native French speaker review recommended

### Previous Reviews (2026-03-07, 2026-03-12, 2026-03-18)

All previously identified critical and high severity issues have been resolved. See [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md) for the full history.

### SAML Defaults Reference

The SSO implementation has been verified against the institutional IdP (Microsoft Entra). The `@node-saml/node-saml` defaults match legacy `passport-saml` behavior:

| Setting | Value | Why |
|---------|-------|-----|
| `wantAssertionsSigned` | `false` | Matches `passport-saml` default; accepts signature at either Response or Assertion level |
| `wantAuthnResponseSigned` | `false` | Same rationale; maximum IdP compatibility |
| `acceptedClockSkewMs` | `60000` (60 s) | Tolerates minor clock drift |
| `disableRequestedAuthnContext` | `true` | Microsoft Entra does not reliably support `RequestedAuthnContext` |

**Security note:** Even with both set to `false`, `@node-saml/node-saml` **always requires at least one valid XML signature**. The SSO implementation should not be modified without thorough testing.

### Current Auth, Storage, and Upload Defaults

| Area | Default | Notes |
|------|---------|-------|
| Email login with SSO | Blocked unless `allowEmailLogin` granted | Admin accounts always retain local email login |
| SAML route set | Legacy `/SSO/SAML2` routes | Switchable to `/api/v1/auth/sso/*` in admin settings |
| Login session lifetime | 120 minutes | Governs both access-token and refresh-session expiry |
| Storage backend | `local` on first boot | Runtime-controlled from Admin → Storage |
| Max image upload width | 1920px | Normalized before upload |
| Avatar thumbnail size | 512px | Runtime-controlled from Admin → Storage |

---

## Security Hardening

> A full review of the `production_setup/` configuration against the **OWASP Application Security Verification Standard (ASVS) v4.0** and the **CIS Docker Benchmark v1.6** was performed on 2026-04-03. The sections below list what is already in place, what needs to be done before production, and additional recommendations.

### What Is Already Secure

| Area | Implementation | Reference |
|------|---------------|-----------|
| **TLS** | TLSv1.2/1.3 only, strong cipher suite, HSTS with preload (2 years), session tickets off | `production_setup/nginx/nginx.conf` lines 47–52 |
| **JWT tokens** | 15-minute access token, configurable refresh token (default 120 min), dual secrets required in production | `server/src/app.js`, `server/src/config/index.js` |
| **Cookie security** | `httpOnly: true`, `secure: true` (production), `sameSite: 'strict'` | `server/src/routes/auth.js` lines 151–158 |
| **Password hashing** | Argon2id with OWASP baseline parameters (19 MiB memory, 2 iterations) | `server/src/utils/password.js` |
| **CSRF protection** | All mutating requests require `X-Requested-With: XMLHttpRequest` header | `server/src/app.js` lines 109–125 |
| **Rate limiting** | Per-route Fastify limits + nginx `limit_req` zones (login: 5 req/min, API: 30 req/s) | `server/src/routes/auth.js`, `production_setup/nginx/nginx.conf` lines 15–17 |
| **Login lockout** | 5 failed attempts → 15-minute lockout | `server/src/routes/auth.js` lines 17–18 |
| **Token rotation** | Refresh tokens rotate on each use; version tracking for invalidation | `server/src/routes/auth.js` lines 115–133 |
| **CORS** | Restricted to `ROOT_URL` origin only, with credentials | `server/src/app.js` lines 42–46 |
| **Helmet** | Enabled; suppresses `X-Powered-By`, sets security defaults | `server/src/app.js` line 49 |
| **SSRF protection** | Profile image fetch blocks private/internal IP ranges (RFC 1918, link-local, metadata) | Code review finding — fixed |
| **Container isolation** | Server runs as non-root (`appuser`, UID 1001); MongoDB and Redis not exposed to host (`expose`, not `ports`) | `server/Dockerfile`, `production_setup/docker-compose.yml` |
| **File uploads** | 5 MB limit, image-only MIME whitelist (jpg/png/gif/webp), randomized filenames | `server/src/plugins/upload.js` |
| **Error handling** | Generic error messages to client; stack traces logged server-side only | `server/src/app.js`, all route error handlers |
| **Sensitive data logging** | JWT tokens and passwords are never logged; only generic identifiers on failed auth | Verified across `server/src/` |
| **Secret management** | `.env`, certs, and backup directories are `.gitignore`-d; setup generates secrets with `openssl rand -hex 32` | `.gitignore`, `production_setup/setup.sh` |

### Required — Do Before Production

The following items are **required** security hardening steps. Each one addresses a gap that could be exploited or that fails a standard compliance check.

#### 1. Enable MongoDB Authentication (CRITICAL — CIS Docker Benchmark 5.7, OWASP ASVS 2.10)

MongoDB runs without authentication. If any container is compromised, the attacker has full database access.

```bash
# 1. Start mongo and create an admin user:
docker exec -it <mongo-container> mongosh
use admin
db.createUser({
  user: "qlickerAdmin",
  pwd: passwordPrompt(),   // or a strong generated password
  roles: [{ role: "readWrite", db: "qlicker" }]
})

# 2. Update the mongod command in production_setup/docker-compose.yml:
command: ["mongod", "--auth", "--wiredTigerCacheSizeGB", "${MONGO_WIREDTIGER_CACHE_SIZE_GB:-0.25}"]

# 3. Update MONGO_URI in production_setup/.env to include credentials:
MONGO_URI=mongodb://qlickerAdmin:<password>@mongo:27017/qlicker?authSource=admin
```

#### 2. Enable Redis Authentication (CRITICAL — CIS Docker Benchmark 5.7)

Redis runs without a password. Any container on the Docker network can connect and read/write session data.

```bash
# 1. Generate a strong password:
openssl rand -hex 32

# 2. Add to production_setup/.env:
REDIS_PASSWORD=<generated-password>

# 3. Update the Redis command in production_setup/docker-compose.yml:
command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}", "--appendonly", "yes", "--maxmemory", "256mb", "--maxmemory-policy", "allkeys-lru"]

# 4. Update REDIS_URL in production_setup/.env:
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
```

#### 3. Add Content-Security-Policy Header (MEDIUM — OWASP ASVS 14.4)

No CSP header is configured. CSP is the primary defense against XSS attacks.

Add to `production_setup/nginx/nginx.conf` inside the HTTPS server block, after the existing security headers:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' wss://$DOMAIN; frame-ancestors 'none';" always;
```

> **Note:** The `'unsafe-inline'` for `style-src` is required by Material UI. Test thoroughly after adding; adjust as needed for third-party resources (e.g., KaTeX fonts).

#### 4. Restrict or Protect the `/docs` Endpoint (MEDIUM — OWASP ASVS 14.3) [Completed]

Swagger UI at `/docs` was publicly accessible and exposed the full API surface.


#### 5. Protect the `.env` File (MEDIUM — CIS Docker Benchmark 3.22)

After running `setup.sh`, restrict file permissions:

```bash
chmod 600 production_setup/.env
```

This is already noted in the Code Review Findings but should be part of the standard setup procedure.

#### 6. Add Docker Resource Limits (MEDIUM — CIS Docker Benchmark 5.11)

Prevent a single container from consuming all host resources. Add to each service in `production_setup/docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 512M      # Adjust per service
      cpus: '1.0'
    reservations:
      memory: 128M
```

Suggested limits: mongo 1–2 GB, redis 300 MB, server 512 MB per replica, client 128 MB, nginx 128 MB.

### Recommended — Additional Hardening

These are best-practice recommendations that improve security posture but are not strict blockers.

#### 7. Add Permissions-Policy Header (LOW — OWASP ASVS 14.4)

Restricts browser features not used by the app. Add to nginx security headers:

```nginx
add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" always;
```

#### 8. Enable OCSP Stapling (LOW — TLS best practice)

Improves TLS handshake performance and client privacy. Add to the HTTPS server block in `production_setup/nginx/nginx.conf`:

```nginx
ssl_stapling on;
ssl_stapling_verify on;
resolver 8.8.8.8 8.8.4.4 valid=300s;
resolver_timeout 5s;
```

> Requires the full certificate chain in `fullchain.pem` (standard for Let's Encrypt).

#### 9. Generate Custom Diffie-Hellman Parameters (LOW — TLS best practice for TLS 1.2)

Strengthens key exchange for TLS 1.2 connections (TLS 1.3 does not use static DH groups):

```bash
openssl dhparam -out production_setup/certs/dhparam.pem 2048
```

Then add to nginx:

```nginx
ssl_dhparam /etc/nginx/ssl/dhparam.pem;
```

And mount the file in `docker-compose.yml`:

```yaml
- ${DH_PARAM_PATH:-./certs/dhparam.pem}:/etc/nginx/ssl/dhparam.pem:ro
```

#### 10. HTML-Escape User Data in Email Templates (LOW — OWASP ASVS 5.2)

`server/src/services/email.js` embeds `user.profile.firstname` in HTML email templates via template literals without escaping. While email clients generally do not execute scripts, the value should be escaped:

```javascript
const escapeHtml = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// Then use: escapeHtml(user.profile?.firstname || '')
```

#### 11. Add Read-Only Filesystem to Containers (LOW — CIS Docker Benchmark 5.12)

Where possible, run containers with a read-only root filesystem:

```yaml
server:
  read_only: true
  tmpfs:
    - /tmp
  volumes:
    - uploads:/app/uploads
```

The `server` container only needs write access to `/app/uploads` and `/tmp`.

#### 12. Implement Audit Logging (LOW — OWASP ASVS 7.1)

Settings changes, role promotions, grade modifications, and admin actions are not currently audit-logged. This is already tracked in the Phase 8 checklist.

### Applicable Security Standards Reference

| Standard | Version | Relevance |
|----------|---------|-----------|
| **OWASP ASVS** | 4.0.3 | Application-level security verification; covers auth, sessions, input validation, HTTP headers, error handling |
| **OWASP Top 10** | 2021 | High-level risk categories; A01 Broken Access Control, A02 Cryptographic Failures, A03 Injection, A05 Security Misconfiguration all apply |
| **CIS Docker Benchmark** | 1.6.0 | Container and orchestration hardening; covers image security, runtime privileges, network isolation, resource limits |
| **Mozilla Observatory** | — | Grades HTTP security headers (HSTS, CSP, X-Content-Type-Options, etc.); use [observatory.mozilla.org](https://observatory.mozilla.org) to test after deployment |
| **SSL Labs** | — | Grades TLS configuration; use [ssllabs.com/ssltest](https://www.ssllabs.com/ssltest/) to verify after deployment; target grade A+ |
| **NIST SP 800-63B** | Rev. 3 | Password and authenticator requirements; current Argon2id config meets or exceeds NIST recommendations |

### Post-Deployment Verification Checklist

After applying the hardening steps above, verify with:

- [ ] `curl -I https://<domain>` — confirm HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Permissions-Policy headers present
- [ ] [Mozilla Observatory](https://observatory.mozilla.org) — target grade A or A+
- [ ] [SSL Labs](https://www.ssllabs.com/ssltest/) — target grade A+
- [ ] `docker exec <mongo-container> mongosh --eval "db.runCommand({connectionStatus:1})"` — confirm authentication required
- [ ] `docker exec <redis-container> redis-cli ping` — confirm `NOAUTH` error (authentication required)
- [ ] `curl https://<domain>/docs` — confirm 401/403 or not found
- [ ] `curl https://<domain>/api/v1/health` — confirm 200 OK
- [ ] Review `docker compose ps` — all containers healthy
- [ ] `docker stats --no-stream` — confirm resource limits enforced

---

## How to Resume Work

1. Read this file (MIGRATION.md) for current status and remaining work
2. Read [CODING_STANDARDS.md](CODING_STANDARDS.md) for coding conventions, API patterns, and the pre-PR checklist
3. Read [LEGACY_DB.md](LEGACY_DB.md) if working with legacy database compatibility
4. Check [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md) for alignment with master requirements
5. Complete the next pending task from [Phase 8 Checklist](#checklist)
6. Run tests, update this file's status, submit a PR

### Build & Test Commands

```bash
# Server tests (374 tests, 17 files)
cd server && npm install && npx vitest run

# Client build
cd client && npm install && npx vite build

# Client tests (94 tests, 24 files)
cd client && npx vitest run

# E2E tests (12 Playwright flows)
./scripts/qlicker.sh e2e

# SSO smoke tests (2 flows against local SimpleSAMLphp IdP)
./ssoserver/scripts/run-smoke.sh
```

### Key Files

| File | Purpose |
|------|---------|
| [MIGRATION.md](MIGRATION.md) | This file — active plan and remaining work |
| [CODING_STANDARDS.md](CODING_STANDARDS.md) | Coding conventions, API patterns, pre-PR checklist |
| [LEGACY_DB.md](LEGACY_DB.md) | Legacy MongoDB database schema and compatibility |
| [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md) | Archive of completed work, bug fixes, PR history |
| [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md) | Master requirements document |
| [production_setup/README.md](production_setup/README.md) | Production deployment guide |

### i18n Guardrail

- Treat i18n as part of the definition of done for **every** UI change.
- Any new or changed user-facing copy, including tooltips and accessibility labels, must use `t()` and must be added to both `client/src/i18n/locales/en.json` and `client/src/i18n/locales/fr.json` in the same PR.
- Do not rely on `defaultValue` as the only translation source for shipped features.
