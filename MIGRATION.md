# Qlicker Migration Plan: MeteorJS → Fastify/React

> **This is the master migration document.** All agents should consult this file to understand the overall plan, current status, and what remains. For coding conventions, see [CODING_STANDARDS.md](CODING_STANDARDS.md). For legacy database details, see [LEGACY_DB.md](LEGACY_DB.md). For completed work history, see [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md).

## Status: Phase 7 In Progress — Local SSO Validation Is Complete; Production IdP Confirmation and Follow-Up Items Remain

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Current Status](#current-status)
4. [Phase 7 — Remaining Work](#phase-7--remaining-work)
5. [Phase 8 — Production Readiness](#phase-8--production-readiness)
6. [Agent Assignments](#agent-assignments)
7. [Code Review Findings (2026-03-12)](#code-review-findings-2026-03-12)
8. [How to Resume Work](#how-to-resume-work)


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
| **Frontend** | React 18+ (Vite) | Single-page application |
| **Database** | MongoDB | Data persistence (existing legacy DB) |
| **ODM** | Mongoose v8 | MongoDB object modeling |
| **Real-time** | @fastify/websocket | WebSocket for live session updates |
| **Auth** | @fastify/jwt + @fastify/cookie | JWT-based authentication |
| **SSO** | @node-saml/node-saml | SAML-based SSO |
| **UI Framework** | Material UI v6 | Material Design components |
| **Rich Text** | TipTap v3 | WYSIWYG editor |
| **Math** | KaTeX | Equation rendering |
| **Testing** | Vitest + Playwright | Unit tests (241 server + 15 client) plus E2E flows |
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
| 8. Groups, video, SSO confirmed | 🔄 In Progress | Phase 7 |
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
- ✅ Remaining Phase 7 security hardening — refresh tokens now rotate on each use and are invalidated on logout/password changes, password logins temporarily lock after repeated failures, development JWT secrets are generated at runtime when env values are omitted outside production, profile image URLs accept only http(s) or site-relative paths, and file uploads plus inbound websocket messages are rate limited
- ✅ Remaining Phase 7 additional items — professor/student live-session pages now share a common websocket context, Playwright uses axe-core accessibility regression checks across the existing browser flows, the student question approval workflow is complete, and the question library expansion work is complete enough that only SSO confirmation plus follow-up decisions remain in Phase 7

See [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md) for detailed Phase 1-6 history and all completed Phase 7 items.

### Test Summary

- **Server:** 285 tests across 13 test files
- **Client:** 39 tests across 14 files
- **Run:** `cd server && npx vitest run` / `cd client && npx vitest run`
- **Build:** `cd client && npx vite build`
- **E2E:** 6 baseline Playwright flows via `./scripts/qlicker.sh e2e` or `cd client && npx playwright test` (Playwright reads `APP_PORT` / `API_PORT` from the repo root `.env`, defaulting to `3000` / `3001`)
- **SSO Smoke:** `./ssoserver/scripts/run-smoke.sh` provisions the isolated SimpleSAMLphp IdP and runs 2 dedicated Playwright SSO login/logout flows via `client/playwright.sso.config.js` on ports `3300/3301/4100`

---

## Phase 7 — Remaining Work

### Priority 1: SSO SAML Production Confirmation

- [x] Verify SAML login/callback/metadata/logout work end-to-end against the local SimpleSAMLphp test IdP in `ssoserver/`
- [ ] Test with institutional IdP (Azure AD, ADFS, Shibboleth)
- [ ] Verify SP-initiated logout generates correct redirect URL
- [ ] Confirm encrypted assertion decryption works with production certificates

All former Phase 7 Priorities 2–6 are complete. The only remaining Phase 7 work is confirmation against the real institutional IdP above plus the follow-up decisions below.

### Remaining Follow-Up Items

- Decide whether to support legacy `users.services.password.reset.*` path directly or transform into the new `services.resetPassword` path
- Confirm whether `meteor_accounts_loginServiceConfiguration` should be deprecated or migrated

---

## Phase 8 — Production Readiness

**Goal:** All functionality restored, legacy DB compatible, load-balanced Docker deployment, complete documentation.

### Phase 8 Checklist

- [ ] Full E2E test suite with Playwright
- [ ] Load testing with realistic concurrent user counts
- [ ] Security scanning and penetration testing
- [ ] Production Docker Compose validation with Nginx load balancer
- [ ] Backup and restore scripts
- [ ] Private-bucket cutover for S3 images (see [Planned Private-Bucket Cutover](#planned-private-bucket-cutover))
- [ ] Complete developer guide
- [ ] Complete user manual
- [x] Refresh token rotation
- [x] Account lockout after repeated failures
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Component tests for critical UI components

### Planned Private-Bucket Cutover

Target state: private S3 bucket for all image assets. Stages:

1. **Compatibility mode (current):** keep uploads with `ACL: public-read` matching Meteor behavior
2. **Introduce private read path:** add signed URL and/or backend proxy delivery
3. **Staged DB migration:** backfill image references in batches with dry-run and rollback
4. **Validation window:** verify rendering through new read path in staging
5. **Bucket cutover:** enable private-bucket policy after confirmation

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
| 2 - Auth | ✅ Phase 7 done | SSO production confirmation |
| 3 - Courses | ✅ Phase 7 done | — |
| 4 - Sessions | ✅ Phase 7 done | — |
| 5 - Responses | ✅ Phase 7 done | — |
| 6 - Grading | ✅ Phase 6 done | — |
| 7 - Frontend | ✅ Phase 7 done | — |
| 8 - Testing | ✅ Phase 7 done | Phase 8: CI pipeline, component tests |

---

## Code Review Findings (2026-03-12, refreshed 2026-03-17)

A comprehensive security and performance code review was conducted and refreshed after the latest Phase 7 hardening work. Below are the remaining findings that still need attention after addressing the straightforward items in this PR.

### Security — Remaining

| Issue | Severity | Recommendation | Target |
|-------|----------|----------------|--------|
| **Settings PATCH accepts unvalidated SSO keys** | LOW | While field whitelist is in place, individual value validation for sensitive SSO fields should be added | Phase 8 |

### Security — Fixed (This Review)

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
| **N+1 grade/response query in review** | MEDIUM | Batch-load responses instead of per-grade loop queries in session review/results endpoints | Phase 7/8 |
| **Sessions list no pagination** | MEDIUM | Add pagination to `GET /courses/:courseId/sessions` | Phase 8 |
| **Missing field projections** | LOW | Add `.select()` to Question queries in live session endpoint | Phase 8 |

### Performance — Fixed (Previously)

- ✅ Delta WebSocket events — ~98% query reduction in live sessions
- ✅ Duplicate response queries merged
- ✅ Course page WebSocket push replaces polling
- ✅ Client bundle split into route/vendor chunks — production build no longer reports the `>500 kB` chunk warning
- ✅ `.lean()` on all hot-path read-only queries
- ✅ `wsSendToUsers()` single-serialize broadcast

### Alignment with Requirements

| Requirement | Status |
|-------------|--------|
| Same functionality as MeteorJS | 🔄 In progress — only SSO production confirmation and follow-up decisions remain from Phase 7 |
| Same database compatibility | ✅ Verified — see [LEGACY_DB.md](LEGACY_DB.md) |
| Fewer dependencies / well-maintained | ✅ On track |
| API-first design | ✅ Complete — 30+ REST endpoints + WebSocket |
| Fast with thousands of concurrent users | ✅ Optimized — delta WebSocket events, `.lean()`, single-serialize broadcast |
| Docker Compose with load balancing | ✅ Complete |
| SAML SSO | ✅ Implemented — needs production confirmation |
| Unit tests | ✅ 322 automated checks (283 server + 39 client) plus 6 Playwright E2E flows |
| Image uploads (S3/Azure/local) | ✅ Complete |
| Reactive UI for live sessions | ✅ Production-ready |

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
# Server tests (283 tests, 13 files)
cd server && npm install && npx vitest run

# Client build
cd client && npm install && npx vite build

# Client tests (39 tests, 14 files)
cd client && npx vitest run

# Client E2E tests (6 Playwright flows)
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

### i18n Guardrail for Ongoing UI Work

- Treat i18n as part of the definition of done for **every** UI change.
- Any new or changed user-facing copy, including tooltips and accessibility labels, must use `t()` and must be added to both `client/src/i18n/locales/en.json` and `client/src/i18n/locales/fr.json` in the same PR.
- Do not rely on `defaultValue` as the only translation source for shipped features; it is a safety fallback, not a substitute for updating locale files.
