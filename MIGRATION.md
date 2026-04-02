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
7. [How to Resume Work](#how-to-resume-work)

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
