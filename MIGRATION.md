# Qlicker Migration Plan: MeteorJS → Fastify/React

> **This is the master migration document.** All agents should consult this file to understand the overall plan, current status, and what remains. For coding conventions, see [CODING_STANDARDS.md](CODING_STANDARDS.md). For legacy database details, see [LEGACY_DB.md](LEGACY_DB.md). For completed work history, see [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md).

## Status: Phase 7 Complete — SSO Confirmed Against Production IdP; Follow-Up Items Moved to Phase 8

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Current Status](#current-status)
4. [Phase 7 — Complete](#phase-7--complete)
5. [Phase 8 — Production Readiness](#phase-8--production-readiness)
6. [Production Deployment](#production-deployment)
7. [Agent Assignments](#agent-assignments)
8. [Code Review Findings (2026-03-12)](#code-review-findings-2026-03-12)
9. [How to Resume Work](#how-to-resume-work)


---

## Overview

We are migrating Qlicker from MeteorJS to a modern Fastify (backend) + React (frontend) stack. The goals are:

- **Same functionality** as the MeteorJS app, redesigned from the ground up
- **Same database** — must be compatible with the existing MongoDB production database (see [LEGACY_DB.md](LEGACY_DB.md))
- **Fewer dependencies** — use well-maintained packages with long-term support
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
| **Real-time** | @fastify/websocket | WebSocket for live session updates |
| **Auth** | @fastify/jwt + @fastify/cookie | JWT-based authentication |
| **SSO** | @node-saml/node-saml | SAML-based SSO |
| **UI Framework** | Material UI v7 | Material Design components |
| **Rich Text** | TipTap v3 | WYSIWYG editor |
| **Math** | KaTeX | Equation rendering |
| **Testing** | Vitest 4 + Playwright | Unit tests (344 server + 63 client) plus E2E flows |
| **Containerization** | Docker + Docker Compose | Production deployment |

For the full directory structure, API routes, standard packages, and coding conventions, see [CODING_STANDARDS.md](CODING_STANDARDS.md).

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
| `session:response-added` | Server → Instructors + joined students when stats are visible | Delta: `{ questionId, attempt, responseCount, joinedCount }` |
| `session:attempt-changed` | Server → Client | Delta: `{ questionId, currentAttempt, stats, correct, resetResponses }` |
| `session:participant-joined` | Server → Instructors | Delta: `{ joinedCount, joinedStudent }` |
| `session:join-code-changed` | Server → Client | Delta: `{ joinCodeEnabled, joinCodeActive, ... }` with student-safe payloads |
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
| 6. Live sessions & quizzes | ✅ Complete | Phase 5 |
| 7. Grading | ✅ Complete | Phase 6 |
| 8. Groups, video, SSO confirmed | ✅ Complete | Phase 7 |
| 9. Production ready | ⬜ Not started | Phase 8 |

### Phase 7 Completed Items

- ✅ Group management (categories, groups, membership, CSV import/export, legacy normalization) — 10 API endpoints, 17 tests
- ✅ Video chat (Jitsi) — admin/professor/student UI, 13 API endpoints, 18 tests
- ✅ WebSocket delta messages — ~98% reduction in DB queries during live sessions
- ✅ Course page WebSocket push — replaced polling for session status events
- ✅ Legacy DB indexes — all models indexed
- ✅ i18n — react-i18next with 1085 translation keys (en/fr), all 30+ components wired
- ✅ CSRF protection — custom header pattern (X-Requested-With) with CORS enforcement
- ✅ JWT access token security — moved from localStorage to in-memory with httpOnly cookie refresh
- ✅ SAML logout validation — node-saml crypto validation with XML fallback
- ✅ Local SAML smoke infrastructure — `ssoserver/` now provides an isolated SimpleSAMLphp IdP with seeded users, generated local certificates, signed + encrypted assertions, SP-initiated logout coverage, Qlicker settings helper scripts, and a dedicated Playwright smoke run that verifies professor/student SSO login plus logout against the new app on local test ports
- ✅ Legacy Meteor SAML route compatibility — the Fastify app now also serves `/SSO/SAML2`, `/SSO/SAML2/logout`, `/SSO/SAML2/metadata`, and `/SSO/SAML2/metadata.xml` so the production cutover can preserve the old public ACS/SLO/metadata surface while keeping the newer `/api/v1/auth/sso/*` routes available
- ✅ SSO account controls — SSO-created accounts are tracked separately, profile name/password edits are disabled when SSO governs them, password reset/email login stay blocked until an admin explicitly approves local email login, and the admin users table now includes a per-user properties modal for toggles such as `canPromote`
- ✅ Profile/question-library/admin/grading polish — the Profile page now leads with per-user language selection and fully locks SSO-managed name/password fields; question visibility controls are confined to the library with clearer “any prof on Qlicker” wording plus bulk visibility changes and reviewable-session warnings; student-only accounts cannot retain `canPromote`; and manual grading can now explicitly save zero-point grades while the row-selection UI avoids unnecessary full-row rerenders
- ✅ File upload content validation — magic bytes via `file-type` library
- ✅ Settings PATCH field whitelist — prevents injection of unexpected fields
- ✅ Client bundle optimization — route lazy-loading plus Vite manual chunks removed the `>500 kB` chunk warning in production builds
- ✅ Session UI polish — back-to-course buttons are left-aligned and professor live-session controls keep Prev/Next paired with New attempt centered between them when space allows, then stack New attempt above on narrow screens
- ✅ Session/course workflow polish — instructor course pickers now use compact code+semester labels sorted newest-first; the course manage page can copy one or many sessions across instructor courses; copied sessions/questions reset session-specific draft/live state (including quiz/live dates and per-question attempt visibility state); student live-session pages always expose a back-to-course button; live-session controls now include a page ribbon; session counts refresh after question-library changes; wrapped course tabs keep the active underline on the selected row; grading now accepts explicit zero scores, can filter to students with responses, and applies bulk edits only to explicitly selected filtered students
- ✅ Session export/import — the session editor can now export portable session JSON (including full question content for re-import into another database), import that JSON into the current course as a draft session with fresh question documents, and open compact print-friendly PDF export views for questions-only, answers-highlighted, or answers+solutions handouts
- ✅ Session slides — added a first-class `Slide` item type in the session/question editor so instructors can place content-only slides before, between, or after graded questions; slides now render across professor live view, student live view, presentation/second desktop, quizzes, and review screens, while staying out of response collection, grading, participation, and quiz-completion requirements; live-facing UIs now distinguish full session-page progress from question-only progress when slides are present
- ✅ Session sequencing simplification — sessions once again use the ordered `questions` array as the single source of truth, matching the legacy Meteor database; slides are represented as question documents with `type: 6`, so interactive sessions and quizzes can mix slides and response-collecting questions without a second session-level array
- ✅ Live session editing and delta sync — question/slide edits now save reliably from the session editor and live sessions, including rich-text image resizing; legacy session-linked questions authorize correctly through session/course fallback metadata; live websocket traffic now uses audience-scoped deltas (`session:question-updated`, `session:attempt-changed`, `session:participant-joined`, `session:join-code-changed`) and limits response-count updates to instructors plus joined students when visible stats need histogram refreshes
- ✅ Student library/practice follow-up fixes — dashboard live-session loading now avoids oversized course/session payloads, student question-library topic suggestions now come only from professor-managed course topics, student bulk library actions can add selected questions only to the student’s own practice sessions while keeping visibility controls hidden, the practice-session editor now supports inline student question creation and valid question pagination, and the student review page no longer trips React’s hook-order warning
- ✅ Question-library/session-editor follow-up fixes — student/practice and professor/session question insertion now both start from a create-vs-library chooser with searchable library pickers, filtered random selection, and import previews that allow pruning imported questions plus applying suggested tags; course/question/session tagging is now limited to course topics for new edits; professor library rows can show response counts; delete refreshes more gracefully; question-library bundles are lazy-loaded from the course page; practice-session cards expose review once they contain questions; and shared student identity rows only make the text area clickable so avatar expansion no longer triggers group membership changes
- ✅ Additional student/practice question-library polish — instructor-facing question editors now explain when course-topic tags are required and disabled until course topics exist; student libraries hide edit/response-management affordances for questions they cannot manage, hide response-count chips, and keep bulk delete disabled whenever any selected question is not student-manageable; practice-session editors now expose insert slots before, between, and after questions plus bottom-of-modal actions for adding selected or random library questions; and hidden question-editor visibility settings are permission-locked so student/practice flows cannot mutate them indirectly
- ✅ Practice-session and SSO follow-up polish — practice-session cards now route directly into review once they contain questions, course and question topic tags are visible in the student/practice and professor/session lists, student-owned practice-session questions can be edited inline and recopied from visible library rows, practice reviews stop requesting unnecessary session grades, and SSO-enabled courses now treat enrollment emails as verified while hiding the redundant per-course verified-email toggle
- ✅ Session/editor/search follow-up polish — professor and student session editors can now apply session topic tags to all questions using course-topic-only tags; student-created practice sessions no longer surface as live dashboard items and the quiz return-tab crash is fixed; professor course student lists can be filtered by name/email; instructor assignment and admin user search now match SSO-backed email fields; student course question-library tabs once again expose new-question creation; practice-session question counts now follow reviewability rules for non-practice items; and the TipTap toolbar now includes text-alignment controls
- ✅ Remaining Phase 7 security hardening — refresh tokens now rotate on each use and are invalidated on logout/password changes, password logins temporarily lock after repeated failures, development JWT secrets are generated at runtime when env values are omitted outside production, profile image URLs accept only http(s) or site-relative paths, and file uploads plus inbound websocket messages are rate limited
- ✅ Remaining Phase 7 additional items — professor/student live-session pages now share a common websocket context, Playwright uses axe-core accessibility regression checks across the existing browser flows, the student question approval workflow is complete, and the question library expansion work is complete enough that only SSO confirmation plus follow-up decisions remain in Phase 7
- ✅ Performance pagination improvements — session list API now supports optional `page`/`limit` pagination (backward-compatible); student question-library visibility now uses a DB-level query (invisible questions never enter server memory, true DB-level pagination); client-side session tabs paginate at 15 items per page with Previous/Next controls
- ✅ Query efficiency sweep — added missing indexes on Course model (`students`, `instructors`, `owner`) and a composite index on Session (`courseId + status`) to eliminate collection scans on the most frequent student lookups; converted 14 read-only `findById()` calls from full Mongoose documents to `.lean()` plain objects across grades, sessions, and user routes; moved student-created-session filtering from JavaScript post-processing into the MongoDB query in the live-sessions endpoint so the database returns only the sessions a student is allowed to see
- ✅ SSO SAML production IdP confirmation — login, professor-role promotion, and logout all verified against the institutional IdP (Microsoft Entra). PR 189 relaxed `wantAssertionsSigned` to `false` (matching the legacy `passport-saml` default) so the library accepts a valid signature at either the Response or Assertion level without mandating both. See [SAML Defaults Reference](#saml-defaults-reference) below for the full default configuration and security notes.

See [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md) for detailed Phase 1-6 history and all completed Phase 7 items.

### Test Summary

- **Server:** 359 tests across 16 test files
- **Client:** 82 tests across 22 files
- **Run:** `cd server && npx vitest run` / `cd client && npx vitest run`
- **Build:** `cd client && npx vite build`
- **E2E:** 9 baseline Playwright flows via `./scripts/qlicker.sh e2e` or `cd client && npx playwright test` (Playwright reads `APP_PORT` / `API_PORT` from the repo root `.env`, defaulting to `3000` / `3001`)
- **SSO Smoke:** `./ssoserver/scripts/run-smoke.sh` provisions the isolated SimpleSAMLphp IdP and runs 2 dedicated Playwright SSO login/logout flows via `client/playwright.sso.config.js` on ports `3300/3301/4100`

---

## Phase 7 — Complete

### SSO SAML Production Confirmation (Done)

- [x] Verify SAML login/callback/metadata/logout work end-to-end against the local SimpleSAMLphp test IdP in `ssoserver/`
- [x] Test with institutional IdP (Microsoft Entra) — login, professor-role promotion, and logout all confirmed (PR 189)
- [x] Verify SP-initiated logout generates correct redirect URL — logout confirmed working
- [x] Confirm encrypted assertion decryption — encrypted assertions work with the local SimpleSAMLphp IdP; production IdP testing used signed (not encrypted) assertions, so decryption with production certificates was not explicitly exercised but the code path is covered by the local smoke tests

All Phase 7 work is complete. Follow-up items have been moved to Phase 8.

### SAML Defaults Reference

PR 189 chose the following `@node-saml/node-saml` configuration defaults to match the legacy `passport-saml` (Meteor) behavior. These defaults are appropriate for Microsoft Entra but may need adjustment for other IdPs:

| Setting | Value | Why | IdP Considerations |
|---------|-------|-----|-------------------|
| `wantAssertionsSigned` | `false` | `passport-saml` defaulted to `false`; node-saml v5 defaults to `true`. Setting `false` means the library does not **require** the Assertion specifically to be signed — it only requires at least one valid signature somewhere in the response. | Setting to `true` would still work for Entra (which signs the Assertion), but would break IdPs that sign **only** the Response envelope. Kept `false` for maximum IdP compatibility and legacy parity. |
| `wantAuthnResponseSigned` | `false` | Same rationale — matches `passport-saml` legacy default. Does not require the outer Response to be signed. | Setting to `true` would break IdPs that sign **only** the Assertion (like Entra). Kept `false` for maximum compatibility. |
| `acceptedClockSkewMs` | `60000` (60 s) | Tolerates minor clock drift between SP and IdP servers. | 60 seconds is a conservative, widely-used default. Increase if the IdP's clock is significantly out of sync; decrease (or set to 0) if your infrastructure uses tight NTP synchronization and you want stricter replay protection. |
| `disableRequestedAuthnContext` | `true` | Microsoft AD / Entra does not reliably support the `RequestedAuthnContext` element in SAML AuthnRequests. | If your IdP requires a specific authentication context (e.g. `urn:oasis:…:ac:classes:PasswordProtectedTransport`), set this to `false` and configure `authnContext` accordingly. |

**Security note:** Even with both `wantAssertionsSigned` and `wantAuthnResponseSigned` set to `false`, `@node-saml/node-saml` **always requires at least one valid XML signature** — either on the Response envelope or on an individual Assertion. An unsigned SAML response will be rejected. The IdP certificate (`SSO_cert` in Settings) is used to verify the signature.

### Current Auth, Storage, and Upload Defaults

The current Fastify/React app now treats the following defaults as part of the migration baseline:

| Area | Current default / rule | Notes |
|------|------------------------|-------|
| Email login while `SSO_enabled=true` | Blocked for non-admin users unless `allowEmailLogin` is explicitly granted | Admin accounts always retain local email login access. |
| Admin user support | User modal includes password reset and email-login exception controls | This replaces ad hoc support workflows for SSO-managed accounts. |
| SAML route set presented to the IdP | Legacy `/SSO/SAML2` routes | Admin can switch to `/api/v1/auth/sso/*` in Advanced SSO settings for other IdPs. |
| SAML advanced settings | Production-safe defaults from PR 189 | The advanced UI exposes `wantAssertionsSigned`, `wantAuthnResponseSigned`, `acceptedClockSkewMs`, `disableRequestedAuthnContext`, `authnContext`, and route mode. |
| Login/session lifetime | `120` minutes | `tokenExpiryMinutes` now governs both access-token expiry and the refresh-session hard expiry, so users are logged out after the configured interval by default. |
| Storage backend on first boot | `local` | Runtime storage selection is database-driven from Admin -> Storage; `.env` storage variables are no longer used by the app. |
| Maximum image upload width | `1920px` | Rich-text-editor images and profile uploads are normalized before upload. |
| Profile avatars | Crop/rotate dialog plus separate thumbnail asset | Existing full-size profile images can be re-cropped without re-uploading. |

---

## Phase 8 — Production Readiness

**Goal:** All functionality restored, legacy DB compatible, load-balanced Docker deployment, complete documentation.

### Phase 8 Checklist

- [x] Full E2E test suite with Playwright (9 baseline flows plus 2 SSO smoke flows; grading, groups, and question copy/export are covered)
- [x] Load testing with realistic concurrent user counts (see [`load-testing/`](load-testing/))
- [ ] Security scanning and penetration testing
- [x] Production Docker Compose validation with Nginx load balancer (see [`production_setup/`](production_setup/))
- [x] Backup and restore scripts (see [`production_setup/backup.sh`](production_setup/backup.sh), [`production_setup/restore.sh`](production_setup/restore.sh))
- [x] Private-bucket cutover for S3 images — sanitization script ready (see [`production_setup/sanitize-s3.js`](production_setup/sanitize-s3.js) and [Planned Private-Bucket Cutover](#planned-private-bucket-cutover))
- [x] Complete developer guide
- [x] Complete user manual refresh (role-specific markdown guides, in-app left-nav manual layout, and current screenshot coverage including admin storage)
- [x] Refresh token rotation
- [x] Account lockout after repeated failures
- [x] npm audit 0 vulnerabilities (server + client)
- [x] Patch-level dependency updates applied
- [x] Major dependency upgrades (React 19, MUI 7, Vite 8, Mongoose 9, react-router-dom 7, nodemailer 8, dotenv 17, Vitest 4)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Component tests for critical UI components
- [ ] Service unit tests for email, questionCopy, sessionCopy, questionImportExport
- [x] Redis pub/sub for multi-instance WebSocket scaling
- [x] Session list pagination (`GET /courses/:courseId/sessions`)
- [ ] Audit logging for settings/role/grade changes
- [ ] French translation review by native speaker (71 identical en/fr keys to verify)

### Phase 8 Follow-Up Items (from Phase 7)

- Decide whether to support legacy `users.services.password.reset.*` path directly or transform into the new `services.resetPassword` path
- Confirm whether `meteor_accounts_loginServiceConfiguration` should be deprecated or migrated
- **Confirm encrypted assertion decryption with production certificates** — encrypted assertions were verified against the local SimpleSAMLphp IdP, but the production IdP uses signed (not encrypted) assertions. If the institution switches to encrypted assertions in the future, test with production certificates at that time.
- **Statistical data storage on questions:** In MeteorJS, per-question statistical summaries (e.g. response distributions, word frequency maps) were stored directly on the question document to avoid every client device computing them independently. The new app follows this same pattern for the word cloud feature (`wordCloudData` on the Question schema stores word frequencies, visibility, and generation timestamp). This pattern should be considered for other aggregate statistics as well. Currently, `buildResponseStats()` in `sessions.js` recomputes distribution/numerical stats on each API call. For high-concurrency sessions, pre-computing and caching these stats on the question document (like `wordCloudData`) would reduce redundant computation. This is a future optimization opportunity — it is not blocking for the current release but should be addressed when scaling to thousands of concurrent users.

### Planned Private-Bucket Cutover

Target state: private S3 bucket for all image assets. Stages:

1. **Compatibility mode (current):** keep uploads with `ACL: public-read` matching Meteor behavior
2. **Introduce private read path:** add signed URL and/or backend proxy delivery
3. **Staged DB migration:** backfill image references in batches with dry-run and rollback
4. **Validation window:** verify rendering through new read path in staging
5. **Bucket cutover:** enable private-bucket policy after confirmation

A sanitization script ([`production_setup/sanitize-s3.js`](production_setup/sanitize-s3.js)) is available to perform step 2–3 in a dry-run + apply workflow. See the [Production Deployment](#production-deployment) section for details.

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

- **Nginx** terminates TLS on ports 443/80 (the only host-exposed ports) and load-balances across server replicas.
- **Server** replicas (configurable via `SERVER_REPLICAS`) run the Fastify API + WebSocket, synchronized through **Redis** pub/sub.
- **MongoDB** (single instance with WiredTiger) stores all data. A single instance is sufficient for thousands of concurrent users; replica sets are only needed for HA failover.
- **Certbot** (optional) auto-renews Let's Encrypt certificates every 12 hours.

### Quick Start

```bash
# Copy to server
scp -r production_setup/ user@server:/opt/qlicker/
ssh user@server
cd /opt/qlicker

# Interactive setup — generates .env from prompts
chmod +x *.sh
./setup.sh

# (Optional) Obtain Let's Encrypt certificate
./setup.sh --init-certs

# Start
docker compose up -d
```

### Setup Script Behaviour

`setup.sh` loads defaults from existing configuration files in priority order:

| Priority | Source | When used |
|----------|--------|-----------|
| 1 | `production_setup/.env` | Re-running setup — proposes all current production values |
| 2 | Root `.env` (dev config) | First-time setup when migrating from dev — inherits JWT secrets, MAIL_URL, storage settings |
| 3 | `.env.example` | Fresh install — uses documented static defaults |

At each prompt the loaded default is shown in brackets. Press Enter to keep it, or type a new value.

### Scripts Reference

| Script | Description |
|--------|-------------|
| `setup.sh` | Interactive setup wizard — generates `.env`, configures replicas, TLS, JWT secrets |
| `setup.sh --init-certs` | Obtain initial Let's Encrypt certificate via Certbot ACME challenge |
| `init-from-legacy.sh` | Restore a legacy MeteorJS mongodump, run question-type migration, optionally sanitize S3 |
| `sanitize-s3.js` | Switch S3 objects from `public-read` to `private` ACL (dry-run + apply modes) |
| `backup.sh` | Create compressed, timestamped MongoDB backup; prune old backups per retention policy |
| `backup.sh --cron` | Silent mode for cron jobs (only prints errors) |
| `restore.sh` | Restore database from a backup archive (interactive or specific file) |
| `update.sh` | Pull/rebuild images, create pre-update backup, rolling restart, health check |
| `manage-user.sh` | CLI user management: `change-password`, `create`, `promote`, `list` |
| `scripts/build-images.sh` *(repo root)* | Build + tag Docker images; optional `--push` to registry |

### Scaling Recommendations

| Concurrent Users | Server Replicas | Notes |
|-----------------|-----------------|-------|
| < 500 | 2 | Minimum for availability |
| 500–1,000 | 3 | Good balance |
| 1,000–2,000 | 4 | ~500 WS connections per replica |
| 2,000+ | 4+ | Consider dedicated hardware |

MongoDB: a single instance is typically sufficient. Increase `--wiredTigerCacheSizeGB` for more RAM. Redis: default 256 MB max memory is sufficient for pub/sub.

### Backup Strategy

- **Manual:** `./backup.sh`
- **Automated:** cron entry — `0 2 * * * /opt/qlicker/backup.sh --cron`
- **Retention:** configurable via `BACKUP_RETENTION_DAYS` (default 30)
- **Restore:** `./restore.sh` (interactive) or `./restore.sh backups/<file>.tar.gz`

---

## Agent Assignments

Work is divided into **8 parallel lanes**. Dependencies between agents are minimized through well-defined interfaces.

| Agent | Focus Area | File |
|-------|-----------|------|
| **Agent 1** | Foundation & Infrastructure | [agents/AGENT_1_FOUNDATION.md](agents/AGENT_1_FOUNDATION.md) |
| **Agent 2** | Authentication & Users | [agents/AGENT_2_AUTH.md](agents/AGENT_2_AUTH.md) |
| **Agent 3** | Course Management | [agents/AGENT_3_COURSES.md](agents/AGENT_3_COURSES.md) |
| **Agent 4** | Sessions & Questions | [agents/AGENT_4_SESSIONS.md](agents/AGENT_4_SESSIONS.md) |
| **Agent 5** | Responses & Real-Time | [agents/AGENT_5_RESPONSES.md](agents/AGENT_5_RESPONSES.md) |
| **Agent 6** | Grading System | [agents/AGENT_6_GRADING.md](agents/AGENT_6_GRADING.md) |
| **Agent 7** | Frontend Shell & Shared Components | [agents/AGENT_7_FRONTEND.md](agents/AGENT_7_FRONTEND.md) |
| **Agent 8** | Testing, CI/CD & Documentation | [agents/AGENT_8_TESTING.md](agents/AGENT_8_TESTING.md) |

### Agent Status

| Agent | Current Status | Remaining Work |
|-------|---------------|----------------|
| 1 - Foundation | ✅ Phase 7 done | Phase 8: production Docker, backup scripts |
| 2 - Auth | ✅ Phase 7 done | — |
| 3 - Courses | ✅ Phase 7 done | — |
| 4 - Sessions | ✅ Phase 7 done | — |
| 5 - Responses | ✅ Phase 7 done | — |
| 6 - Grading | ✅ Phase 6 done | — |
| 7 - Frontend | ✅ Phase 7 done | — |
| 8 - Testing | ✅ Phase 7 done | Phase 8: CI pipeline, component tests |

---

## Code Review Findings (2026-03-12, refreshed 2026-03-18)

A comprehensive security, performance, i18n, accessibility, dependency, and testing review was conducted. Below are the remaining findings that still need attention, followed by items fixed in this review.

### Security — Remaining

| Issue | Severity | Recommendation | Target |
|-------|----------|----------------|--------|
| **Settings PATCH accepts unvalidated SSO keys** | LOW | While field whitelist is in place, individual value validation for sensitive SSO fields should be added | Phase 8 |
| **SSO logout XML fallback uses regex** | LOW | The SAML logout handler falls back to regex-based XML extraction when crypto validation fails; consider a proper XML parser with XXE protection | Phase 8 |
| **No audit logging** | LOW | Settings changes, role changes, and grade overrides are not logged to an audit trail | Phase 8 |
| **WebSocket state now multi-instance** | ✅ RESOLVED | Redis pub/sub added via `ioredis`; when `REDIS_URL` is set, all `wsBroadcast`/`wsSendToUser`/`wsSendToUsers` calls publish to a shared Redis channel so every server instance delivers messages to its local WebSocket connections | Phase 8 |

### Security — Fixed (This Review)

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| **npm audit vulnerabilities** | HIGH | Server: `fast-xml-parser` override to >=5.5.6 resolves all 19 high-severity @aws-sdk CVEs; file-type/yauzl moderate CVEs fixed. Client: jspdf critical CVE fixed via audit fix. **0 vulnerabilities remaining in both packages.** |
| **Hardcoded English aria-labels** | LOW | 15+ hardcoded English aria-label strings replaced with `t()` i18n calls |

### Security — Fixed (Previously)

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| **No refresh token rotation** | LOW-MEDIUM | Refresh tokens now include a version claim and rotate atomically on refresh/logout/password changes |
| **No account lockout** | LOW-MEDIUM | Password login now locks for 15 minutes after repeated failures |
| **Profile image URL no validation** | MEDIUM | Profile images now allow only http(s) or site-relative URLs |
| **Hardcoded dev secrets in config** | LOW | Development/runtime secrets are generated when explicit JWT env vars are absent outside production |
| **File upload no rate limit** | LOW | Image upload route now opts into Fastify rate limiting |
| **No CSRF protection** | HIGH | Custom header (`X-Requested-With`) with CORS enforcement |
| **JWT access token in localStorage** | HIGH | Moved to in-memory with httpOnly cookie refresh |
| **SAML logout not validated** | MEDIUM | node-saml `validatePostRequestAsync` attempted first |
| **File upload no magic bytes** | MEDIUM | `file-type` library validates file content |
| **Settings PATCH no field whitelist** | HIGH | Explicit allowed-fields whitelist |
| **No WebSocket rate limiting** | LOW | WebSocket connections now close when inbound message limits are exceeded |

See [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md) for the full list of previously fixed security issues.

### Performance — Remaining

| Issue | Severity | Recommendation | Target |
|-------|----------|----------------|--------|
| **N+1 grade/response query in review** | MEDIUM | Batch-load responses instead of per-grade loop queries in session review/results endpoints | Phase 8 |
| **Missing field projections on live session** | LOW | Add `.select()` to Question queries in live session endpoint to limit transferred fields | Phase 8 |
| **Remaining Session reads without `.lean()`** | LOW | ~10 Session.findById() calls in sessions.js still return full Mongoose documents because they use `.toObject()`; converting these requires replacing `.toObject()` with plain spread | Phase 8 |

### Performance — Fixed (This Review)

- ✅ **N+1 in `userCanManageQuestion()`** — replaced two N+1 Course.findById() loops with a single batch `Course.find({ $in })` query with `.select('_id instructors').lean()`
- ✅ **N+1 in `userCanViewQuestion()`** — replaced Session.findById() loop with a single batch `Session.find({ $in })` query with targeted `.select().lean()`
- ✅ **29 missing `.lean()` calls** — added `.lean()` to 16 read-only Course/Session queries in sessions.js and 13 in courses.js
- ✅ **Sessions list pagination** — `GET /courses/:courseId/sessions` now accepts optional `page`/`limit` query params; returns `total`/`page`/`pages` when pagination is active; backward-compatible (returns all sessions when params omitted)
- ✅ **Student question-library DB-level visibility** — replaced in-memory `batchFilterVisibleQuestions()` (which loaded ALL course questions, then filtered) with a MongoDB-level `$or` visibility query that only fetches questions the student is allowed to see; enables true DB-level `skip`/`limit` pagination for students; invisible questions never enter server memory
- ✅ **Client-side session list pagination** — student and professor CourseDetail pages now paginate session lists within each tab (15 per page) with Previous/Next controls

### Performance — Fixed (Previously)

- ✅ Delta WebSocket events — ~98% query reduction in live sessions
- ✅ Duplicate response queries merged
- ✅ Course page WebSocket push replaces polling
- ✅ Client bundle split into route/vendor chunks — production build no longer reports the `>500 kB` chunk warning
- ✅ `.lean()` on all hot-path read-only queries
- ✅ `wsSendToUsers()` single-serialize broadcast

### i18n & Accessibility — Remaining

| Issue | Severity | Recommendation | Target |
|-------|----------|----------------|--------|
| **71 identical en/fr translations** | LOW | Most are legitimate (abbreviations, proper nouns like PDF, JSON, SSO) but a native French speaker should review the remaining ones | Phase 8 |
| **`vendor-pdf` chunk >500 kB** | LOW | The html2pdf.js/jspdf bundle (984 kB) is already lazy-loaded but could benefit from on-demand loading only when PDF export is triggered | Phase 8 |

### i18n & Accessibility — Fixed (This Review)

- ✅ **15+ hardcoded English aria-labels** replaced with i18n `t()` calls across 8 components
- ✅ **20+ missing aria-labels** added to IconButton elements across 7 components
- ✅ **35+ new translation keys** added to both `en.json` and `fr.json` with proper French translations
- ✅ **en/fr key parity confirmed** — both locale files have identical key structures (1396+ lines each)

### Dependencies — Status (This Review)

| Category | Status | Notes |
|----------|--------|-------|
| **npm audit** | ✅ 0 vulnerabilities | Server: fast-xml-parser override; Client: jspdf fix |
| **Patch-level updates** | ✅ Applied | @tiptap/* 3.20.4, dompurify 3.3.3, katex 0.16.38, fastify 5.8.2, file-type 21.3.3, jsonwebtoken 9.0.3 |
| **Major updates** | ✅ Applied | React 19.2.4, MUI 7.3.9, Vite 8.0.1, Mongoose 9.3.1, react-router-dom 7.13.1, nodemailer 8.0.3, dotenv 17.3.1, Vitest 4.1.0, @vitejs/plugin-react 6.0.1 |
| **Dependency minimization** | ✅ Good | No lodash/moment/styled-components; only essential packages; native JS used where possible |

### Testing Suite — Review (This Review)

| Aspect | Status | Notes |
|--------|--------|-------|
| **Server coverage** | ✅ Good (359 tests/16 files) | All 11 route modules have tests |
| **Client coverage** | ⚠️ Moderate (82 tests/22 files) | Critical auth, grading, question-editor, session-editor, and question-library flows have targeted unit coverage, but most UI components still rely on E2E coverage |
| **E2E coverage** | ✅ Good (11 Playwright flows) | 9 baseline flows plus 2 dedicated SSO smoke flows; grading, group management, and question copy/export paths now have browser coverage |
| **Test granularity** | ✅ Appropriate | Auth/permission tests are individually useful for catching regressions; no excessive duplication |
| **Consolidation opportunity** | LOW | Authorization 403 tests could share a parametrized matrix, but individual tests are clearer for debugging |
| **Missing service tests** | MEDIUM | `email.js`, `questionCopy.js`, `sessionCopy.js`, `questionImportExport.js` lack unit tests | Phase 8 |
| **Setup efficiency** | LOW | Per-test `createApp()` adds overhead but ensures isolation; consider shared fixtures in Phase 8 |

### Alignment with Requirements

| Requirement | Status |
|-------------|--------|
| Same functionality as MeteorJS | ✅ Verified — all features restored including SSO against institutional IdP |
| Same database compatibility | ✅ Verified — see [LEGACY_DB.md](LEGACY_DB.md) |
| Fewer dependencies / well-maintained | ✅ Verified — 0 npm audit vulnerabilities, patch updates applied, no unnecessary packages |
| API-first design | ✅ Complete — 30+ REST endpoints + WebSocket |
| Fast with thousands of concurrent users | ✅ Optimized — delta WebSocket events, `.lean()` on 29+ additional queries, N+1 fixes, single-serialize broadcast |
| Docker Compose with load balancing | ✅ Complete |
| SAML SSO | ✅ Complete — confirmed against institutional IdP (Microsoft Entra); see [SAML Defaults Reference](#saml-defaults-reference) |
| Unit tests | ✅ 441 automated checks (359 server + 82 client) plus 11 Playwright browser flows (9 baseline + 2 SSO smoke) |
| Image uploads (S3/Azure/local) | ✅ Complete |
| Reactive UI for live sessions | ✅ Production-ready |
| Internationalization | ✅ Complete — 1085+ keys in en/fr, all components wired, no hardcoded English in aria-labels |
| Accessibility | ✅ Improved — axe-core E2E checks, aria-labels on all interactive elements |

---

## How to Resume Work

1. Read this file (MIGRATION.md) for current status and remaining work
2. Read [CODING_STANDARDS.md](CODING_STANDARDS.md) for all coding conventions, API patterns, and the pre-PR checklist
3. Read [LEGACY_DB.md](LEGACY_DB.md) if working with legacy database compatibility
4. Check [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md) for alignment with master requirements
5. Check the Agent Status table to see remaining work per agent
6. Read the relevant agent file in [agents/](agents/) for detailed task instructions
7. Complete the next pending task, run tests, update this file's status
8. Submit a PR with your changes

### Build & Test Commands

```bash
# Server tests (359 tests, 16 files)
cd server && npm install && npx vitest run

# Client build
cd client && npm install && npx vite build

# Client tests (82 tests, 22 files)
cd client && npx vitest run

# Client E2E tests (9 Playwright flows)
./scripts/qlicker.sh e2e
```

### Key Files

| File | Purpose |
|------|---------|
| [MIGRATION.md](MIGRATION.md) | This file — active plan and remaining work |
| [CODING_STANDARDS.md](CODING_STANDARDS.md) | Coding conventions, API patterns, pre-PR checklist |
| [LEGACY_DB.md](LEGACY_DB.md) | Legacy MongoDB database schema and compatibility |
| [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md) | Archive of completed work, bug fixes, PR history |
| [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md) | Master requirements document |
| [production_setup/README.md](production_setup/README.md) | Production deployment guide (Docker Compose, TLS, scaling, backups) |

### i18n Guardrail for Ongoing UI Work

- Treat i18n as part of the definition of done for **every** UI change.
- Any new or changed user-facing copy, including tooltips and accessibility labels, must use `t()` and must be added to both `client/src/i18n/locales/en.json` and `client/src/i18n/locales/fr.json` in the same PR.
- Do not rely on `defaultValue` as the only translation source for shipped features; it is a safety fallback, not a substitute for updating locale files.
