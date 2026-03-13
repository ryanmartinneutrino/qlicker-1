# Qlicker Migration Plan: MeteorJS → Fastify/React

> **This is the master migration document.** All agents should consult this file to understand the overall plan, current status, and what remains. For coding conventions, see [CODING_STANDARDS.md](CODING_STANDARDS.md). For legacy database details, see [LEGACY_DB.md](LEGACY_DB.md). For completed work history, see [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md).

## Status: Phase 7 In Progress — Security Hardening Complete, Remaining Work Below

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
| **Testing** | Vitest | Unit tests (216 server + 7 client) |
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
| `session:response-added` | Server → Instructors | Delta: `{ questionId, attempt, responseCount, joinedCount }` |
| `session:status-changed` | Server → Client | Delta: `{ status }` |
| `session:visibility-changed` | Server → Client | Delta: `{ questionId, hidden, stats, correct }` |
| `session:updated` | Server → Client | Generic notification for non-live mutations |

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
- ✅ i18n — react-i18next with 1073 translation keys (en/fr), all 30+ components wired
- ✅ CSRF protection — custom header pattern (X-Requested-With) with CORS enforcement
- ✅ JWT access token security — moved from localStorage to in-memory with httpOnly cookie refresh
- ✅ SAML logout validation — node-saml crypto validation with XML fallback
- ✅ File upload content validation — magic bytes via `file-type` library
- ✅ Settings PATCH field whitelist — prevents injection of unexpected fields
- ✅ Client bundle optimization — route lazy-loading plus Vite manual chunks removed the `>500 kB` chunk warning in production builds

See [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md) for detailed Phase 1-6 history and all completed Phase 7 items.

### Test Summary

- **Server:** 218 tests across 11 test files (auth, courses, sessions, questions, grades, models, settings, grading service, users, groups, video)
- **Client:** 9 tests in 2 files (grading UI, student quiz CTA)
- **Run:** `cd server && npx vitest run` / `cd client && npx vitest run`
- **Build:** `cd client && npx vite build`

---

## Phase 7 — Remaining Work

### Priority 1: SSO SAML Production Confirmation

- [ ] Verify SAML login/callback/metadata work end-to-end in a production-like environment
- [ ] Test with institutional IdP (Azure AD, ADFS, Shibboleth)
- [ ] Verify SP-initiated logout generates correct redirect URL
- [ ] Confirm encrypted assertion decryption works with production certificates

### Priority 2: Question Library UI

- [ ] Implement question library browsing interface for professors
  - Browse personal, public, and course question libraries
  - Search/filter by tags, type, content
  - Preview questions before copying to session
  - Copy from library to session (API exists: `POST /questions/:id/copy-to-session`)
  - Copy from session to library (API exists: `POST /questions/:id/copy`)
- [ ] Student question submission and approval workflow (if `allowStudentQuestions` is enabled)

### Priority 3: Remaining Security Hardening

| Item | Severity | Status | Notes |
|------|----------|--------|-------|
| Refresh token rotation | LOW-MEDIUM | ⬜ TODO | Implement one-time-use refresh tokens (currently valid for 7 days) |
| Account lockout | LOW-MEDIUM | ⬜ TODO | Temporary lockout after repeated failed login attempts |
| Hardcoded dev secrets | LOW | ⬜ TODO | Remove `'dev-secret-change-me'` fallbacks in config (guarded in production but should be explicit) |
| Profile image URL validation | MEDIUM | ⬜ TODO | Validate URLs to prevent `javascript:` or `data:` URIs |
| Rate limiting on file uploads | LOW | ⬜ TODO | Prevent abuse of 5MB image upload endpoint |

### Priority 4: API Documentation

- [ ] Register `@fastify/swagger` in `app.js` (dependency installed but not wired up)
- [ ] Add `@fastify/swagger-ui` for interactive API explorer
- [ ] Add JSON Schema to all routes for auto-generated docs

### Priority 5: E2E Tests (Playwright)

- [ ] Set up Playwright configuration
- [ ] Login flow E2E test
- [ ] Course management flow E2E test
- [ ] Session creation flow E2E test
- [ ] Live session flow E2E test
- [ ] Quiz flow E2E test
- [ ] Grading flow E2E test
- [ ] Legacy DB compatibility E2E tests

### Priority 6: Additional Items

- [ ] Copy sessions between courses (Agent 3 remaining task)
- [ ] Extract WebSocket context from inline LiveSession pages to shared context
- [ ] Add automated accessibility regression checks (axe-core in Playwright)
- [ ] Question approval workflow (student submissions)
- [ ] WebSocket rate limiting

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
- [ ] Refresh token rotation
- [ ] Account lockout after repeated failures
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
| 3 - Courses | ✅ Phase 7 done | Copy sessions between courses |
| 4 - Sessions | ✅ Phase 7 done | Question approval workflow |
| 5 - Responses | ✅ Phase 7 done | WebSocket rate limiting |
| 6 - Grading | ✅ Phase 6 done | — |
| 7 - Frontend | ✅ Phase 7 done | Question library UI, WebSocket context extraction |
| 8 - Testing | ✅ Phase 7 done | Playwright E2E, CI pipeline, component tests |

---

## Code Review Findings (2026-03-12)

A comprehensive security and performance code review was conducted. Below are the remaining findings that need attention.

### Security — Remaining

| Issue | Severity | Recommendation | Target |
|-------|----------|----------------|--------|
| **No refresh token rotation** | LOW-MEDIUM | Implement one-time-use refresh tokens | Phase 8 |
| **No account lockout** | LOW-MEDIUM | Temporary lockout after repeated failed attempts | Phase 8 |
| **Profile image URL no validation** | MEDIUM | Validate URLs to prevent `javascript:` / `data:` URIs | Phase 7 |
| **Hardcoded dev secrets in config** | LOW | Remove fallback strings to force explicit configuration | Phase 8 |
| **File upload no rate limit** | LOW | Add rate limiting to image upload endpoint | Phase 7 |
| **Settings PATCH accepts unvalidated SSO keys** | LOW | While field whitelist is in place, individual value validation for sensitive SSO fields should be added | Phase 8 |

### Security — Fixed (This Review)

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| **No CSRF protection** | HIGH | Custom header (`X-Requested-With`) with CORS enforcement |
| **JWT access token in localStorage** | HIGH | Moved to in-memory with httpOnly cookie refresh |
| **SAML logout not validated** | MEDIUM | node-saml `validatePostRequestAsync` attempted first |
| **File upload no magic bytes** | MEDIUM | `file-type` library validates file content |
| **Settings PATCH no field whitelist** | HIGH | Explicit allowed-fields whitelist |

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
| Same functionality as MeteorJS | 🔄 In progress — Phases 1–7 mostly complete; question library UI and SSO confirmation remain |
| Same database compatibility | ✅ Verified — see [LEGACY_DB.md](LEGACY_DB.md) |
| Fewer dependencies / well-maintained | ✅ On track |
| API-first design | ✅ Complete — 30+ REST endpoints + WebSocket |
| Fast with thousands of concurrent users | ✅ Optimized — delta WebSocket events, `.lean()`, single-serialize broadcast |
| Docker Compose with load balancing | ✅ Complete |
| SAML SSO | ✅ Implemented — needs production confirmation |
| Unit tests | ✅ 227 tests (218 server + 9 client) |
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
# Server tests (218 tests, 11 files)
cd server && npm install && npx vitest run

# Client build
cd client && npm install && npx vite build

# Client tests (9 tests, 2 files)
cd client && npx vitest run
```

### Key Files

| File | Purpose |
|------|---------|
| [MIGRATION.md](MIGRATION.md) | This file — active plan and remaining work |
| [CODING_STANDARDS.md](CODING_STANDARDS.md) | Coding conventions, API patterns, pre-PR checklist |
| [LEGACY_DB.md](LEGACY_DB.md) | Legacy MongoDB database schema and compatibility |
| [MIGRATION_COMPLETED.md](MIGRATION_COMPLETED.md) | Archive of completed work, bug fixes, PR history |
| [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md) | Master requirements document |
