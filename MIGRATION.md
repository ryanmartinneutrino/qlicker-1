# Qlicker Migration Plan: MeteorJS → Fastify/React

> **This is the master migration document.** All agents should consult this file to understand the overall plan, current status, and their role in the migration. Cross-check [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md) regularly to ensure alignment.

## Status: Phase 4 Complete — Sessions & Questions; Phase 5 Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Legacy App Analysis](#legacy-app-analysis)
4. [Agent Assignments](#agent-assignments)
5. [Milestones & Phases](#milestones--phases)
6. [Detailed Work Breakdown](#detailed-work-breakdown)
7. [Dependency Graph](#dependency-graph)
8. [Cross-Cutting Concerns](#cross-cutting-concerns)
9. [Progress Tracking](#progress-tracking)

---

## Overview

We are migrating Qlicker from MeteorJS to a modern Fastify (backend) + React (frontend) stack. The goals are:

- **Same functionality** as the MeteorJS app, redesigned from the ground up
- **Same database** — must be compatible with the existing MongoDB production database
- **Fewer dependencies** — use well-maintained packages with long-term support
- **API-first** — all functionality exposed through REST/WebSocket API endpoints
- **Performance** — support thousands of concurrent users with real-time features
- **Deployable** — run natively or via Docker Compose with load balancing

---

## Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Fastify | HTTP API server (REST + WebSocket) |
| **Frontend** | React 18+ (Vite) | Single-page application |
| **Database** | MongoDB | Data persistence (existing) |
| **ODM** | Mongoose | MongoDB object modeling |
| **Real-time** | @fastify/websocket | WebSocket for live session updates |
| **Auth** | @fastify/jwt + @fastify/cookie | JWT-based authentication |
| **SSO** | @node-saml/passport-saml | SAML-based SSO |
| **Email** | Nodemailer | Password reset, verification emails |
| **File Upload** | AWS SDK v3, @azure/storage-blob | S3, Azure, local storage |
| **UI Framework** | Material UI (MUI) | Material Design components |
| **Charts** | Recharts | Data visualization |
| **Math** | MathJax / KaTeX | Equation rendering |
| **Rich Text** | TipTap or CKEditor 5 | WYSIWYG editor |
| **Testing** | Vitest + Playwright | Unit + E2E tests |
| **Containerization** | Docker + Docker Compose | Deployment |

### Directory Structure

```
qlicker-1/
├── server/                      # Fastify backend
│   ├── src/
│   │   ├── app.js               # Fastify app factory
│   │   ├── server.js            # Entry point
│   │   ├── config/              # Environment config
│   │   ├── models/              # Mongoose models
│   │   │   ├── User.js
│   │   │   ├── Course.js
│   │   │   ├── Session.js
│   │   │   ├── Question.js
│   │   │   ├── Response.js
│   │   │   ├── Grade.js
│   │   │   ├── Image.js
│   │   │   └── Settings.js
│   │   ├── routes/              # API route modules
│   │   │   ├── auth.js
│   │   │   ├── users.js
│   │   │   ├── courses.js
│   │   │   ├── sessions.js
│   │   │   ├── questions.js
│   │   │   ├── responses.js
│   │   │   ├── grades.js
│   │   │   ├── images.js
│   │   │   └── settings.js
│   │   ├── plugins/             # Fastify plugins
│   │   │   ├── auth.js          # JWT + session auth
│   │   │   ├── websocket.js     # WebSocket manager
│   │   │   ├── saml.js          # SAML SSO
│   │   │   ├── mailer.js        # Email
│   │   │   └── upload.js        # File upload
│   │   ├── services/            # Business logic
│   │   │   ├── grading.js
│   │   │   ├── sessions.js
│   │   │   └── courses.js
│   │   ├── middleware/           # Auth guards, validators
│   │   └── websocket/           # WS event handlers
│   │       ├── session-live.js
│   │       └── course-updates.js
│   ├── test/
│   ├── package.json
│   └── Dockerfile
├── client/                      # React frontend
│   ├── src/
│   │   ├── main.jsx             # Entry point
│   │   ├── App.jsx              # Root with router
│   │   ├── theme/               # MUI theme, colors, fonts
│   │   ├── api/                 # API client + WebSocket hooks
│   │   │   ├── client.js        # Axios/fetch wrapper
│   │   │   ├── ws.js            # WebSocket client
│   │   │   └── hooks/           # React Query hooks
│   │   ├── contexts/            # React contexts
│   │   │   ├── AuthContext.jsx
│   │   │   └── WSContext.jsx
│   │   ├── components/          # Shared components
│   │   │   ├── layout/
│   │   │   ├── forms/
│   │   │   ├── questions/
│   │   │   ├── sessions/
│   │   │   ├── grades/
│   │   │   └── common/
│   │   ├── pages/               # Route pages
│   │   │   ├── Login.jsx
│   │   │   ├── Home.jsx
│   │   │   ├── Profile.jsx
│   │   │   ├── admin/
│   │   │   ├── professor/
│   │   │   └── student/
│   │   └── utils/
│   ├── test/
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
├── scripts/                     # Setup and management
│   ├── setup-native.sh
│   ├── setup-docker.sh
│   ├── qlicker.sh
│   ├── seed-db.sh
│   └── seed-db-docker.sh
├── docker-compose.yml
├── .env.example
├── MIGRATION.md                 # This file
├── REQUIREMENTS_FOR_MIGRATION_FASTIFY.md
└── agents/                      # Agent task files
```

### API Design

All routes are prefixed with `/api/v1`. WebSocket endpoint at `/ws`.

| Method | Route | Description |
|--------|-------|-------------|
| **Auth** | | |
| POST | `/api/v1/auth/login` | Email/password login |
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/logout` | Logout |
| POST | `/api/v1/auth/forgot-password` | Request password reset |
| POST | `/api/v1/auth/reset-password` | Reset password with token |
| POST | `/api/v1/auth/verify-email` | Verify email with token |
| GET | `/api/v1/auth/sso/login` | Initiate SAML SSO |
| POST | `/api/v1/auth/sso/callback` | SAML assertion consumer |
| GET | `/api/v1/auth/sso/metadata` | SAML SP metadata |
| **Users** | | |
| GET | `/api/v1/users/me` | Current user profile |
| PATCH | `/api/v1/users/me` | Update profile |
| PATCH | `/api/v1/users/me/password` | Change password |
| PATCH | `/api/v1/users/me/image` | Update profile image |
| GET | `/api/v1/users` | List users (admin) |
| GET | `/api/v1/users/:id` | Get user (admin) |
| PATCH | `/api/v1/users/:id/role` | Change role (admin) |
| DELETE | `/api/v1/users/:id` | Delete user (admin) |
| POST | `/api/v1/users` | Create user (admin) |
| **Courses** | | |
| GET | `/api/v1/courses` | List user's courses |
| POST | `/api/v1/courses` | Create course |
| GET | `/api/v1/courses/:id` | Get course |
| PATCH | `/api/v1/courses/:id` | Update course |
| DELETE | `/api/v1/courses/:id` | Delete course |
| POST | `/api/v1/courses/enroll` | Enroll by code |
| DELETE | `/api/v1/courses/:id/students/:studentId` | Remove student |
| POST | `/api/v1/courses/:id/students` | Add student |
| POST | `/api/v1/courses/:id/tas` | Add TA |
| DELETE | `/api/v1/courses/:id/tas/:taId` | Remove TA |
| POST | `/api/v1/courses/:id/regenerate-code` | New enrollment code |
| PATCH | `/api/v1/courses/:id/active` | Toggle active |
| POST | `/api/v1/courses/:id/copy-sessions` | Copy all sessions |
| **Course Groups** | | |
| GET | `/api/v1/courses/:id/groups` | List group categories |
| POST | `/api/v1/courses/:id/groups` | Create category |
| DELETE | `/api/v1/courses/:id/groups/:catId` | Delete category |
| POST | `/api/v1/courses/:id/groups/:catId/groups` | Add group |
| DELETE | `/api/v1/courses/:id/groups/:catId/groups/:gId` | Delete group |
| PATCH | `/api/v1/courses/:id/groups/:catId/groups/:gId` | Update group |
| **Sessions** | | |
| POST | `/api/v1/courses/:courseId/sessions` | Create session |
| GET | `/api/v1/sessions/:id` | Get session |
| PATCH | `/api/v1/sessions/:id` | Update session |
| DELETE | `/api/v1/sessions/:id` | Delete session |
| POST | `/api/v1/sessions/:id/start` | Start session |
| POST | `/api/v1/sessions/:id/end` | End session |
| POST | `/api/v1/sessions/:id/join` | Student joins |
| POST | `/api/v1/sessions/:id/submit` | Submit quiz |
| PATCH | `/api/v1/sessions/:id/current` | Set current question |
| PATCH | `/api/v1/sessions/:id/reviewable` | Toggle reviewable |
| PATCH | `/api/v1/sessions/:id/extensions` | Set quiz extensions |
| POST | `/api/v1/sessions/:id/copy` | Copy session |
| **Questions** | | |
| POST | `/api/v1/questions` | Create question |
| GET | `/api/v1/questions/:id` | Get question |
| PATCH | `/api/v1/questions/:id` | Update question |
| DELETE | `/api/v1/questions/:id` | Delete question |
| POST | `/api/v1/questions/:id/copy` | Copy to library |
| POST | `/api/v1/questions/:id/copy-to-session` | Copy to session |
| POST | `/api/v1/sessions/:id/questions` | Add question to session |
| DELETE | `/api/v1/sessions/:id/questions/:qId` | Remove from session |
| PATCH | `/api/v1/sessions/:id/questions/order` | Reorder questions |
| POST | `/api/v1/questions/:id/attempt` | Start new attempt |
| PATCH | `/api/v1/questions/:id/attempt-status` | Open/close attempt |
| PATCH | `/api/v1/questions/:id/visibility` | Show/hide question |
| PATCH | `/api/v1/questions/:id/stats` | Show/hide stats |
| PATCH | `/api/v1/questions/:id/correct` | Show/hide correct |
| **Responses** | | |
| POST | `/api/v1/responses` | Submit response |
| PATCH | `/api/v1/responses/:id` | Update response |
| GET | `/api/v1/questions/:id/responses` | Get responses for question |
| GET | `/api/v1/sessions/:id/responses` | Get session responses |
| **Grades** | | |
| GET | `/api/v1/sessions/:id/grades` | Get session grades |
| GET | `/api/v1/courses/:id/grades` | Get course grades |
| POST | `/api/v1/sessions/:id/grades/calculate` | Calculate grades |
| PATCH | `/api/v1/grades/:id` | Update grade |
| PATCH | `/api/v1/grades/:id/marks/:questionId` | Update mark |
| PATCH | `/api/v1/sessions/:id/grades/visibility` | Show/hide grades |
| **Images** | | |
| POST | `/api/v1/images/upload-url` | Get signed upload URL |
| POST | `/api/v1/images` | Register image |
| DELETE | `/api/v1/images/:id` | Delete image |
| POST | `/api/v1/images/clean` | Clean unused images |
| **Settings** | | |
| GET | `/api/v1/settings` | Get settings (admin) |
| PATCH | `/api/v1/settings` | Update settings (admin) |
| GET | `/api/v1/settings/public` | Public settings (SSO status, etc.) |
| **WebSocket** | | |
| WS | `/ws` | Real-time updates (auth via token) |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `session:join` | Client → Server | Student joins live session |
| `session:question-changed` | Server → Client | Prof changes current question |
| `session:response-added` | Server → Client | New response (for stats) |
| `session:status-changed` | Server → Client | Session started/ended |
| `session:question-updated` | Server → Client | Question visibility/stats/correct toggled |
| `course:session-updated` | Server → Client | Session status change on course page |
| `course:students-updated` | Server → Client | Student list updated |

---

## Legacy App Analysis

### Legacy Dump Snapshot (Observed 2026-03-02)

- Local dump contains two DB namespaces: `qlickerdb` (application data) and `admin` (Mongo system collections).
- `admin` includes `system.users` and `system.version`; these are Mongo instance-level auth/version artifacts, not Qlicker domain collections.
- Restoring `qlickerdb` into the Fastify target DB produced:
  - `users`: 20,901
  - `courses`: 472
  - `sessions`: 5,766
  - `questions`: 63,257
  - `responses`: 1,700,441
  - `grades`: 510,617
  - `images`: 6,803
  - `settings`: 1
  - `meteor_accounts_loginServiceConfiguration`: 0
- IDs across core app collections are Meteor-style strings (not ObjectId), which matches current model assumptions.
- Updated restore scripts now restore from a selected top-level dump directory and include both namespaces: application data (`qlickerdb`) is mapped into the configured app DB, while `admin` is restored in-place.

### Collection Mapping and Compatibility

| Legacy Collection | Fastify Model | Compatibility | Notes |
|------------------|---------------|---------------|-------|
| `users` | `User` | ✅ Compatible | Core fields align (`_id` string, `emails[]`, `profile.roles`). Password storage now uses `services.password.hash` (argon2id) for new writes. Legacy `services.password.bcrypt` is detected and triggers reset-required flow. `lastLogin` optional. Legacy `services.password.reset.*` path differs from new `services.resetPassword.*`. |
| `courses` | `Course` | Partial | Main fields align. Legacy `groupCategories.groups` uses `groupNumber/groupName/students`; current model uses `name/members`, so direct shape mismatch exists. |
| `sessions` | `Session` | Mostly aligned | Core legacy fields align (`status`, `quiz`, `questions`, `currentQuestion`, `joined`, `quizStart`, `quizEnd`, `reviewable`). New fields like `practiceQuiz`/`submittedQuiz` are additive and optional. |
| `questions` | `Question` | Mostly aligned | Legacy fields align for session/course ownership, options, tags, and session options. New schema fields (`toleranceNumerical`, `correctNumerical`, `solution*`, `imagePath`) are additive. |
| `responses` | `Response` | ✅ Compatible | Legacy fields `attempt`, `questionId`, `studentUserId`, `answer`, `createdAt`, and `mark` are all in the model. New fields `correct`, `updatedAt`, `editable`, `answerWysiwyg` are optional with defaults. |
| `grades` | `Grade` | Mostly aligned | Legacy marks and aggregate grade fields align with current schema; newer fields like `feedback` are additive defaults. |
| `images` | `Image` | ✅ Compatible | Legacy documents (`_id`, `url`, `UID`) load without errors. `key`, `type`, and `size` are now optional with defaults (were previously `required`). |
| `settings` | `Settings` | ✅ Compatible | Schema now includes both new and legacy field names (`email`/`adminEmail`, `AWS_accessKey`/`AWS_accessKeyId`, etc.). Schema uses `strict: false` to preserve any extra legacy fields (Jitsi, image limits) on save. Virtual getters resolve either field name. |
| `meteor_accounts_loginServiceConfiguration` | none | Gap | Legacy collection exists (empty in this snapshot) but has no equivalent model yet. |

### Legacy Indexes Observed

- `users`: unique/sparse indexes on `username`, `emails.address`, `services.resume.loginTokens.(hashedToken|token)`, `services.email.verificationTokens.token`, `services.password.reset.token`; additional sparse indexes on `services.resume.haveLoginTokensToDelete`, `services.resume.loginTokens.when`, `services.password.reset.when`.
- `questions`: indexes on `sessionId`, `courseId`, `owner`.
- `responses`: indexes on `questionId`, `studentUserId`.
- `sessions`: index on `courseId`.
- `grades`: indexes on `userId`, `courseId`, `sessionId`.
- `images`: index on `UID`.
- `meteor_accounts_loginServiceConfiguration`: unique index on `service`.

### Seed/Reset Verification Notes

- `--reset` on `seed-db.js` now uses `dropDatabase()` and exits with an empty database (no seed data inserted).
- Native and Docker seed wrappers now support:
  - no-arg default: seed with the 3 example users
  - `--reset`: reset database to empty (no seed users)
  - legacy dump restore with dynamic dump discovery
  - reset-to-empty flow
- Docker seeding cleanup now succeeds (previous temp-script permission failure removed).

### Auth Compatibility Findings (API Validation, 2026-03-02)

- API and DB wiring are functional in Docker (`:3201` API against restored `qlicker` DB): register and login for newly created users work.
- Legacy snapshot user auth profile:
  - total users: `20,901`
  - users with password hashes (`services.password.bcrypt`): `1,725`
  - users with SSO identities (`services.sso.id`): `19,887`
  - users with mixed-case/non-lowercased stored emails: `8,081`
  - users with password hashes + mixed-case stored emails: `188` (`51` are password-only users without SSO fallback)
- ~~Confirmed compatibility gap in current login lookup:~~ **FIXED** — all email lookups now use case-insensitive regex matching (`emailRegex()` utility in `server/src/utils/email.js`). This applies to login, register (duplicate check), forgot-password, SSO callback, and admin create-user routes.
- Password policy updated to a single modern scheme: **argon2id only** for login verification and all new writes (`register`, `reset-password`, `change password`, admin user create, SSO random password bootstrap).
- Legacy bcrypt hashes (`$2a$`/`$2b$`) are intentionally not verified directly; login returns `PASSWORD_RESET_REQUIRED` so users must reset and move to argon2id.
- Users with no local password hash (common in legacy SSO-only accounts) also receive `PASSWORD_RESET_REQUIRED` with reason `no_local_password`.
- **Client interceptor fix:** The API client (`client/src/api/client.js`) no longer intercepts 401 responses from `/auth/*` endpoints. Previously, a login failure (401) would trigger the token-refresh interceptor which would redirect to `/login` before the error message could be displayed, causing the error to "flash by" too quickly to read.

### Legacy Compatibility Fixes Applied

The following code changes were made to ensure the app works correctly with a restored legacy database:

| Fix | Files Changed | Description |
|-----|---------------|-------------|
| Case-insensitive email lookup | `server/src/routes/auth.js`, `server/src/routes/users.js`, `server/src/utils/email.js` | All email lookups use `emailRegex()` for case-insensitive matching. Fixes login failure for legacy users with mixed-case emails (8,081 affected users). |
| Client auth interceptor | `client/src/api/client.js` | 401 responses from `/auth/*` endpoints are no longer intercepted by the token-refresh logic. Login errors now display properly instead of flashing by. |
| Image model compatibility | `server/src/models/Image.js` | `key`, `type`, and `size` changed from `required` to optional with defaults. Legacy images only have `_id`, `url`, `UID`. |
| Settings model compatibility | `server/src/models/Settings.js` | Added legacy field names (`email`, `AWS_accessKey`, `AWS_secret`, `Azure_accountName`, `Azure_accountKey`, `Azure_containerName`). Added `strict: false` to preserve extra legacy fields. Added virtual getters that resolve either field name. |
| Upload plugin compatibility | `server/src/plugins/upload.js` | Storage config resolution checks both new and legacy field names (e.g., `AWS_accessKeyId || AWS_accessKey`). |
| Response model `mark` field | `server/src/models/Response.js` | Added `mark: { type: Number }` field present in legacy response documents for grading. |
| Password hashing modernization | `server/src/utils/password.js`, `server/src/models/User.js`, `server/src/routes/auth.js`, `server/src/routes/users.js`, `scripts/seed-db.js` | Switched to argon2id for new password hashes. Added explicit reset-required detection for both legacy bcrypt hashes and accounts without a local password (`code: PASSWORD_RESET_REQUIRED`, reason `legacy_hash` or `no_local_password`). Seed script now creates argon2id hashes. |
| Seed script behavior alignment | `scripts/seed-db.js`, `scripts/seed-db.sh`, `scripts/seed-db-docker.sh` | `--reset` now always leaves the database empty. Default no-argument execution seeds the 3 example users in both native and Docker wrappers. |

### UI Updates from Testing (Pre-Milestone Follow-Up)

- Professor dashboard course tiles now sort with active courses first, then newest first.
- Course tiles on professor/student dashboards use fixed-width cards for consistent wrapping and scanability.
- Professor course page header is compact and starts directly with course identity (`DEPT NUMBER: Name (Semester)`), with section on a smaller line.
- Professor course tabs were reorganized to: `Interactive Sessions`, `Quizzes`, `Students`, `Instructors`, `Settings`.
- Session rows on the professor course page now have stronger hover feedback and are sorted with live sessions first, then most recent by date.
- Session editor now exposes status using user-facing labels (`Draft`, `Upcoming`, `Live`, `Ended`) mapped to backend values (`hidden`, `visible`, `running`, `done`).
- Session editor supports a session `date` field for non-quiz sessions (`server/src/routes/sessions.js` updated to accept `date` on create/update).
- Legacy question rendering in session editor now:
  - uses one canonical question type mapping for all data (legacy + new): `MC=0`, `TF=1`, `SA=2`, `MS=3`, `NU=4`,
  - trusts stored `type` for canonical values `0..4` (no structural remapping between MC/MS/NU),
  - falls back to `SA` only when a record has an invalid type value,
  - renders HTML `content`/options/solution fields,
  - typesets KaTeX formulas on render with inline `$...$` and block `$$...$$` delimiters.
- Session editor settings now auto-save directly to the database on change (manual `Save Settings` removed).
- Session question editor now auto-saves while typing (manual save removed); dialog uses a close action only.
- New question dialog always opens as a blank Multiple Choice question with two empty options.
- Drag-and-drop images in the question editor are now resizable directly in the TipTap canvas.
- Session status changes to `Live` now require explicit confirmation, then apply immediately.
- Session editor question list now displays dynamic question numbering (`1.`, `2.`, `3.`) that updates with reordering.
- Session editor multiple-choice/multi-select option rendering now keeps option labels (`A.`, `B.`, `C.`) horizontally aligned with option content, including HTML-rich legacy options.
- UI date display is standardized to `DD-Mmm-YYYY` (for example `02-Mar-2026`), including professor session lists and admin user last-login.
- Professor course session list now shows date-only (no time) in the session metadata row.
- Student course session list now follows the same ordering/date rules as professor session lists (live first, then most recent; date-only `DD-Mmm-YYYY`).
- App bar `Dashboard` button styling updated to be larger and offset slightly to the right of the app title for better prominence.

### One-Time Legacy Question Type Cleanup (Required)

Use this script once per restored legacy database to normalize invalid question `type` values into canonical Meteor mapping:

- Canonical mapping: `MC=0`, `TF=1`, `SA=2`, `MS=3`, `NU=4`
- Script path: `server/scripts/migrate-question-types.js`
- Behavior:
  - default mode is dry-run (reports only),
  - `--apply` writes updates,
  - canonical `0..4` types are left unchanged,
  - legacy `type=5` is mapped to `4` (Numerical),
  - any other invalid values are inferred once using option shape/flags, then written as canonical values.

Run steps:

```bash
cd /home/rmartin/qlicker-1/server
node scripts/migrate-question-types.js
node scripts/migrate-question-types.js --apply
```

Verification (optional):

```bash
mongosh "mongodb://localhost:27071/qlicker" --quiet --eval \
'db.questions.aggregate([{ $group:{ _id:"$type", count:{ $sum:1 } } }, { $sort:{ _id:1 } }]).forEach(printjson)'
```

After this script has been applied in all environments, remove temporary client normalization fallbacks in `client/src/components/questions/constants.js`:

- remove legacy `rawType === 5` compatibility branch,
- remove the final unknown-type fallback (`return QUESTION_TYPES.SHORT_ANSWER`) if strict rejection is preferred.

### Remaining Follow-Up Items

- Decide whether to support legacy `users.services.password.reset.*` path directly or transform into the new `services.resetPassword` path (affects users with pending reset tokens from the old app).
- Add missing model indexes (especially `users`, `responses`, `questions`, `sessions`, `grades`) to preserve legacy query performance/uniqueness expectations.
- Confirm whether `meteor_accounts_loginServiceConfiguration` should remain unsupported, be migrated, or be explicitly deprecated.
- Legacy `groupCategories.groups` shape mismatch (`groupNumber/groupName/students` vs `name/members`) needs migration logic or schema alignment before group features are implemented.

---

## Agent Assignments

Work is divided into **8 parallel lanes**, each with a dedicated agent. Dependencies between agents are minimized and managed through well-defined interfaces.

| Agent | Focus Area | File |
|-------|-----------|------|
| **Agent 1** | Foundation & Infrastructure | [AGENT_1_FOUNDATION.md](agents/AGENT_1_FOUNDATION.md) |
| **Agent 2** | Authentication & Users | [AGENT_2_AUTH.md](agents/AGENT_2_AUTH.md) |
| **Agent 3** | Course Management | [AGENT_3_COURSES.md](agents/AGENT_3_COURSES.md) |
| **Agent 4** | Sessions & Questions | [AGENT_4_SESSIONS.md](agents/AGENT_4_SESSIONS.md) |
| **Agent 5** | Responses & Real-Time | [AGENT_5_RESPONSES.md](agents/AGENT_5_RESPONSES.md) |
| **Agent 6** | Grading System | [AGENT_6_GRADING.md](agents/AGENT_6_GRADING.md) |
| **Agent 7** | Frontend Shell & Shared Components | [AGENT_7_FRONTEND.md](agents/AGENT_7_FRONTEND.md) |
| **Agent 8** | Testing, CI/CD & Documentation | [AGENT_8_TESTING.md](agents/AGENT_8_TESTING.md) |

---

## Milestones & Phases

The milestones are defined in [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md). Below is how they map to phases and agent work.

### Phase 1 — Foundation (Milestone 1: Login Works)

**Goal:** A working app where users can create accounts, log in, access the admin panel, and manage user roles. Password reset by email works.

| Agent | Tasks |
|-------|-------|
| 1 | Project scaffolding, Docker setup, scripts, DB connection, .env config |
| 2 | User model, auth routes (register, login, logout), JWT, password reset, email verification, admin role logic, first-user-is-admin |
| 7 | React app scaffold, MUI theme, login page, registration form, admin panel shell, user management UI |
| 8 | Test infrastructure (Vitest + Playwright), CI pipeline, login flow E2E test |
| 3 | (Waiting) Define Course model interfaces |
| 4 | (Waiting) Define Session/Question model interfaces |
| 5 | (Waiting) Define WebSocket infrastructure |
| 6 | (Waiting) Define Grade model interfaces |

**Testable by human:** Navigate to app → create first account (admin) → log in → admin panel → create another user → change roles → logout → login as other user → reset password → login again.

### Phase 2 — Profile & Images (Milestone 2: Profile & Uploads)

**Goal:** Users can update profile pictures. Image upload works with Azure, S3, and local storage. SAML SSO preliminary testing.

| Agent | Tasks |
|-------|-------|
| 1 | File upload plugin (S3, Azure, local), image route |
| 2 | SAML SSO implementation, legacy DB user loading |
| 7 | Profile page, image upload UI, admin image settings UI, admin SSO settings UI |
| 8 | Profile update flow E2E test, image upload tests |
| 3 | Begin Course model and routes |
| 4 | Begin Session/Question models |
| 5 | Begin WebSocket infrastructure |
| 6 | Begin Grade model |

**Testable by human:** Log in → update profile pic → admin configures S3/Azure → upload works → SAML login attempt.

### Phase 3 — Courses (Milestone 3: Course Management)

**Goal:** Professors can create courses. Students can enroll/unenroll. TA roles work.

| Agent | Tasks |
|-------|-------|
| 3 | Course CRUD, enrollment, student/TA management, course settings |
| 7 | Professor dashboard, course pages, student dashboard, enrollment UI |
| 8 | Course management flow E2E tests |
| 1 | Refinements, script updates |
| 2 | Role guard middleware refinements |
| 4 | Continue session/question work |
| 5 | Continue WebSocket work |
| 6 | Continue grade work |

**Testable by human:** Prof creates course → students enroll by code → prof adds TA → student unenrolls → prof removes student.

### Phase 4 — Sessions & Questions (Milestone 4: Session Editor)

**Goal:** Professors can create sessions/quizzes, add questions, edit them (with attachments, MathJax), set dates, give extensions. Course page shows sessions with status.

| Agent | Tasks |
|-------|-------|
| 4 | Session CRUD, question CRUD, question types, session editor, quiz config, extensions |
| 7 | Session editor UI, question editor UI (WYSIWYG, MathJax), session list, quiz date picker |
| 3 | Session list on course page, session status display |
| 8 | Session/question CRUD tests, editor E2E tests |
| 5 | Finalize WebSocket for live sessions |
| 6 | Continue grade integration |

**Testable by human:** Prof creates session → adds questions (all types) → edits with images/MathJax → sets quiz dates → gives extension → course page shows session status.

### Phase 5 — Live Sessions & Quizzes (Milestone 6: Interactive Sessions Work)

**Goal:** Interactive sessions and quizzes are fully functional with real-time updates.

| Agent | Tasks |
|-------|-------|
| 5 | Response submission, real-time stats, WebSocket live session events, quiz auto-save |
| 4 | Start/end session, current question, attempt management, show/hide stats/correct |
| 7 | Run session UI (prof), present session UI (student), quiz UI, answer distribution charts |
| 8 | Live session flow E2E tests, quiz submission tests |
| 3 | Course page real-time session status updates |
| 6 | Begin grade calculation integration |

**Testable by human:** Prof starts session → students see questions → answer → prof sees stats in real-time → toggles correct → new attempt → ends session. Student takes quiz → auto-saves → submits → cannot reaccess.

### Phase 6 — Grading (Milestone 7: Grading Works)

**Goal:** Full grading system — manual and automatic grading, grade tables, CSV export, session review.

| Agent | Tasks |
|-------|-------|
| 6 | Grade calculation, manual grading, mark editing, CSV export, grade visibility |
| 7 | Grade session UI, grade table, student results view, CSV download, session review UI |
| 8 | Grading flow E2E tests, CSV export tests |
| 4 | Session reviewable toggle integration |
| 5 | Grade-related WebSocket events |

**Testable by human:** Prof opens grading → auto-grade → manual override → download CSV → student reviews session and sees grades.

### Phase 7 — Groups & Video (Milestone 8: Groups, Video, SSO Confirmed)

**Goal:** Group management, video chat (Jitsi), confirmed SSO, comprehensive testing, documentation.

| Agent | Tasks |
|-------|-------|
| 3 | Group categories, group management, video chat integration |
| 2 | SSO SAML confirmed working, Microsoft AD exploration |
| 7 | Group management UI, video chat UI (Jitsi) |
| 8 | Full regression tests, security audit, documentation |
| 1 | Load balancing Docker config, production readiness |

**Testable by human:** Prof creates groups → assigns students → video chat works → SSO login confirmed → all previous features still work.

### Phase 8 — Polish & Production (Milestone 9: Production Ready)

**Goal:** All functionality restored, legacy DB compatible, load-balanced Docker deployment, complete documentation.

| Agent | Tasks |
|-------|-------|
| ALL | Bug fixes, legacy DB compatibility testing, performance optimization, documentation |
| 1 | Production Docker Compose, backup scripts |
| 8 | Full E2E suite, load testing, security scanning |

---

## Detailed Work Breakdown

### Agent 1: Foundation & Infrastructure
See [agents/AGENT_1_FOUNDATION.md](agents/AGENT_1_FOUNDATION.md)

**Summary of tasks:**
- [x] Project scaffolding (server package.json, client package.json, monorepo config)
- [x] Fastify app factory with plugin system
- [x] MongoDB/Mongoose connection with config
- [x] Environment configuration (.env, config module)
- [x] Docker Compose file (app, API, MongoDB, Nginx)
- [x] Dockerfiles for server and client
- [x] `setup-native.sh` script
- [x] `setup-docker.sh` script
- [x] `qlicker.sh` start/stop/restart/status script
- [x] `seed-db.sh` and `seed-db-docker.sh` scripts
- [x] `.env.example` file
- [x] File upload plugin (S3, Azure, local)
- [x] Image routes
- [x] CORS and security headers
- [x] Production Docker Compose with load balancing (Nginx)

### Agent 2: Authentication & Users
See [agents/AGENT_2_AUTH.md](agents/AGENT_2_AUTH.md)

**Summary of tasks:**
- [x] User Mongoose model (backward compatible with Meteor users collection)
- [x] JWT authentication plugin
- [x] Auth routes (register, login, logout)
- [x] First-user-is-admin logic
- [x] Password hashing (argon2id), with legacy bcrypt reset-required detection
- [x] Email verification flow
- [x] Password reset flow (Nodemailer)
- [x] User CRUD routes (admin)
- [x] Role management (admin changes roles, prof promotes)
- [x] Profile update routes
- [x] SAML SSO plugin (node-saml with encrypted logout handling)
- [x] SSO routes (login, callback, metadata, logout)
- [x] Legacy user compatibility (case-insensitive email lookup for mixed-case legacy emails)
- [x] Auth middleware (role guards)

### Agent 3: Course Management
See [agents/AGENT_3_COURSES.md](agents/AGENT_3_COURSES.md)

**Summary of tasks:**
- [x] Course Mongoose model
- [x] Course CRUD routes
- [x] Enrollment (by code, by email, by admin add)
- [x] Student management (add, remove)
- [x] TA management (add, remove)
- [x] Enrollment code generation/regeneration
- [x] Course settings (active/inactive, verification, student questions)
- [ ] Group category CRUD
- [ ] Group management (add/remove students, rename)
- [ ] Video chat integration (Jitsi room management)
- [ ] Copy sessions between courses

### Agent 4: Sessions & Questions
See [agents/AGENT_4_SESSIONS.md](agents/AGENT_4_SESSIONS.md)

**Summary of tasks:**
- [x] Session Mongoose model
- [x] Question Mongoose model
- [x] Session CRUD routes (create, read, update, delete, list)
- [x] Question CRUD routes (create, read, update, delete)
- [x] Session lifecycle (start, end, set current question)
- [x] Quiz configuration (dates, extensions)
- [x] Question ordering within sessions
- [x] Question types (SA, MC, TF, MS, NU)
- [x] Question sessionOptions (attempts, stats, correct, visibility)
- [x] Question library (personal, public, course) — copy to library, copy to session
- [x] Question tagging
- [x] Copy questions/sessions
- [ ] Question approval (student submissions)

### Agent 5: Responses & Real-Time
See [agents/AGENT_5_RESPONSES.md](agents/AGENT_5_RESPONSES.md)

**Summary of tasks:**
- [x] Response Mongoose model
- [ ] Response submission routes
- [ ] Response update (quiz editable responses)
- [x] WebSocket infrastructure (@fastify/websocket)
- [x] WebSocket authentication
- [ ] Live session events (question changed, response added, status changed)
- [ ] Course page events (session status, student list)
- [ ] Response statistics calculation
- [ ] Quiz auto-save mechanism
- [ ] Rate limiting and security for WebSocket

### Agent 6: Grading System
See [agents/AGENT_6_GRADING.md](agents/AGENT_6_GRADING.md)

**Summary of tasks:**
- [x] Grade Mongoose model
- [ ] Grade calculation service (auto-grade MC/TF/MS/NU)
- [ ] Manual grade/mark editing
- [ ] Feedback per mark
- [ ] Grade visibility (show/hide to students)
- [ ] Grade routes (session grades, course grades)
- [ ] CSV export
- [ ] Session review data routes
- [ ] Participation calculation
- [ ] Attempt weighting

### Agent 7: Frontend Shell & Shared Components
See [agents/AGENT_7_FRONTEND.md](agents/AGENT_7_FRONTEND.md)

**Summary of tasks:**
- [x] React app scaffold (Vite + React 18)
- [x] MUI theme (colors, fonts matching existing app)
- [x] App layout (navbar, sidebar, routing)
- [x] Auth context (JWT storage, auto-refresh)
- [x] API client (fetch/axios wrapper)
- [ ] WebSocket context
- [x] Login/Register page
- [x] Admin panel (settings, users, images, SSO)
- [x] Profile page
- [x] Professor dashboard and course pages
- [x] Student dashboard and course pages
- [x] Session editor page
- [ ] Run session page (professor)
- [ ] Present session page (student)
- [ ] Quiz page (student)
- [ ] Grading pages and components
- [ ] Session review pages
- [x] Question components (display, edit, all types)
- [ ] Answer distribution charts
- [ ] Group management UI
- [ ] Video chat (Jitsi) integration
- [x] Shared components (tables, forms, modals, lists)
- [x] Connection status indicator (health check banner)
- [x] Session list on professor and student course pages

### Agent 8: Testing, CI/CD & Documentation
See [agents/AGENT_8_TESTING.md](agents/AGENT_8_TESTING.md)

**Summary of tasks:**
- [x] Vitest configuration for server
- [x] Vitest configuration for client
- [ ] Playwright configuration for E2E
- [ ] CI pipeline (GitHub Actions)
- [ ] Login flow E2E test
- [ ] Profile update flow E2E test
- [ ] Course management flow E2E test
- [ ] Session creation flow E2E test
- [ ] Live session flow E2E test
- [ ] Quiz flow E2E test
- [ ] Grading flow E2E test
- [ ] Legacy DB compatibility tests
- [x] API unit tests per route module
- [ ] Component tests for critical UI
- [ ] Documentation (README, developer guide, user guide)
- [ ] Security audit

---

## Dependency Graph

```
Phase 1 (Foundation):
  Agent 1 (scaffolding) ──────────────────┐
  Agent 2 (auth model + routes) ──────────┤──→ Phase 1 Complete
  Agent 7 (React scaffold + login UI) ────┤
  Agent 8 (test infra + login test) ──────┘

Phase 2 (Profiles & Images):
  Agent 1 (upload plugin) ────────────────┐
  Agent 2 (SAML SSO) ────────────────────┤──→ Phase 2 Complete
  Agent 7 (profile UI + admin settings) ──┤
  Agent 8 (profile tests) ────────────────┘

Phase 3 (Courses):
  Agent 3 (course routes) ────────────────┐
  Agent 7 (course UI) ───────────────────┤──→ Phase 3 Complete
  Agent 8 (course tests) ────────────────┘

Phase 4 (Sessions):
  Agent 4 (session + question routes) ────┐
  Agent 7 (session editor UI) ────────────┤──→ Phase 4 Complete
  Agent 8 (session tests) ────────────────┘

Phase 5 (Live Sessions):
  Agent 5 (responses + WebSocket) ────────┐
  Agent 4 (session lifecycle) ────────────┤──→ Phase 5 Complete
  Agent 7 (live session UI) ──────────────┤
  Agent 8 (live session tests) ───────────┘

Phase 6 (Grading):
  Agent 6 (grade calculation) ────────────┐
  Agent 7 (grading UI) ──────────────────┤──→ Phase 6 Complete
  Agent 8 (grading tests) ────────────────┘

Phase 7 (Groups & Polish):
  Agent 3 (groups + video) ───────────────┐
  Agent 2 (SSO confirmed) ───────────────┤──→ Phase 7 Complete
  Agent 7 (groups + video UI) ────────────┤
  Agent 8 (regression tests + docs) ──────┘

Phase 8 (Production):
  ALL agents ─────────────────────────────→ Phase 8 Complete
```

### Inter-Agent Dependencies

| Consuming Agent | Depends On | Interface |
|-----------------|-----------|-----------|
| Agent 7 (Frontend) | Agent 1 (Foundation) | API base URL, CORS setup |
| Agent 7 (Frontend) | Agent 2 (Auth) | Auth API endpoints, JWT format |
| Agent 3 (Courses) | Agent 1 (Foundation) | Fastify app factory, DB connection |
| Agent 3 (Courses) | Agent 2 (Auth) | Auth middleware, role guards |
| Agent 4 (Sessions) | Agent 3 (Courses) | Course model, course-session relationship |
| Agent 5 (Responses) | Agent 4 (Sessions) | Session/Question models |
| Agent 6 (Grading) | Agent 4 (Sessions) | Session/Question models |
| Agent 6 (Grading) | Agent 5 (Responses) | Response model |

**Strategy to minimize blocking:** Agents define their model schemas and interfaces early. Other agents can import and use these schemas even before the full routes are complete. The Fastify plugin system allows isolated development.

---

## Cross-Cutting Concerns

### Database Backward Compatibility

The existing MongoDB database uses Meteor's conventions:
- **Users collection**: Named `users` (standard Meteor). Legacy records may have `services.password.bcrypt` (`$2a$`/`$2b$`). New app writes use `services.password.hash` with argon2id and require reset for legacy bcrypt-only users.
- **Collection IDs**: Meteor uses string `_id` fields (17-char random strings), not ObjectIds. The new app must preserve this behavior for compatibility.
- **Dates**: Stored as JavaScript Date objects.
- **Document structure**: Must match exactly — the new Mongoose models must use the same field names and types.

### Security

- JWT tokens with short expiry + refresh tokens
- CORS restricted to frontend origin
- Rate limiting on auth endpoints
- Input validation (Fastify schema validation)
- WebSocket authentication required
- File upload validation (type, size)
- SAML assertion validation
- No sensitive data in client bundles

### Styling Guidelines

- **Primary color**: Match existing Qlicker blue (#2196F3 family)
- **Font**: Clean sans-serif (Roboto via MUI)
- **Design system**: Material Design via MUI
- **Consistent spacing**: 8px grid system (MUI default)
- **Responsive**: Mobile-friendly, especially for student quiz views
- **Dark/light**: Plan for theme switching in the future
- **Component inheritance**: Use MUI's `ThemeProvider` and `styled` components for consistent styling that propagates globally

### Documentation Standards

- README.md: Setup instructions, quick start
- MIGRATION.md: This file — plan, status, progress
- Agent files: Detailed task lists with acceptance criteria
- Code comments: JSDoc for API routes and services
- API documentation: Auto-generated from Fastify schemas (using @fastify/swagger)

---

## Progress Tracking

### Overall Status

| Milestone | Status | Target Phase |
|-----------|--------|-------------|
| 1. Login works | ✅ Complete | Phase 1 |
| 2. Profile & uploads | ✅ Complete (bugs fixed) | Phase 2 |
| 3. Course management | ✅ Complete | Phase 3 |
| 4. Session editor | ✅ Complete | Phase 4 |
| 6. Live sessions & quizzes | ⬜ Not started | Phase 5 |
| 7. Grading | ⬜ Not started | Phase 6 |
| 8. Groups, video, SSO confirmed | ⬜ Not started | Phase 7 |
| 9. Production ready | ⬜ Not started | Phase 8 |

### Phase 2 Bug Fixes (from Comments.md)

The following issues were identified during Phase 2 testing and have been resolved:

| Issue | Fix | Status |
|-------|-----|--------|
| No "Forgot Password" button on login | Added forgot password dialog to Login.jsx | ✅ Fixed |
| ResetPassword page was a stub | Implemented full reset password flow | ✅ Fixed |
| Profile picture upload not working in dev | Added /uploads proxy to vite.config.js and nginx.conf | ✅ Fixed |
| SSO users could change their name | Server blocks name changes for SSO users; UI disables fields | ✅ Fixed |
| Hardcoded port numbers throughout | All ports now use env variables with fallback defaults | ✅ Fixed |

### Phase 3 Progress

| Component | Task | Status |
|-----------|------|--------|
| Backend | Course CRUD routes (create, read, update, delete) | ✅ Complete |
| Backend | Enrollment by code | ✅ Complete |
| Backend | Student management (add/remove) | ✅ Complete |
| Backend | Instructor/TA management (add/remove) | ✅ Complete |
| Backend | Enrollment code regeneration | ✅ Complete |
| Backend | Active/inactive toggle | ✅ Complete |
| Backend | Populate user data in course detail endpoint | ✅ Complete |
| Backend | Enforce requireVerified on enrollment | ✅ Complete |
| Frontend | Professor Dashboard with course list and create dialog | ✅ Complete |
| Frontend | Student Dashboard with enrollment | ✅ Complete |
| Frontend | Professor Course Detail (students, instructors, settings tabs) | ✅ Complete |
| Frontend | Student Course Detail with unenroll | ✅ Complete |
| Frontend | App.jsx routes for course pages | ✅ Complete |
| Frontend | Clickable course titles in dashboards | ✅ Complete |
| Frontend | Smart semester pre-fill with season dropdown | ✅ Complete |
| Frontend | Course settings: requireVerified, allowStudentQuestions toggles | ✅ Complete |
| Testing | Course routes unit tests (21 tests) | ✅ Complete |
| Testing | Course management E2E tests | ⬜ Not started |

### Comments.md Bug Fixes

The following issues were identified during testing and have been resolved:

| Issue | Fix | Status |
|-------|-----|--------|
| Password reset URL mismatch | Email now sends `/reset/:token` matching App.jsx route | ✅ Fixed |
| Email verification route missing | Added `/verify-email/:token` route and VerifyEmail page | ✅ Fixed |
| Course members showing "Unknown" | Backend populates student/instructor data in GET /courses/:id | ✅ Fixed |
| Course titles not clickable | Titles now navigate to course detail page in both dashboards | ✅ Fixed |
| Create course: no semester pre-fill | Smart season suggestion + dropdown (Fall/Winter/Summer etc.) | ✅ Fixed |
| Admin: no email verified column | Added Verified column with clickable verify toggle | ✅ Fixed |
| Admin: no last login tracking | Added lastLogin field to User model, displayed in admin table | ✅ Fixed |
| SSO users email not auto-verified | SSO login now marks email as verified for existing users | ✅ Fixed |
| Course missing verified enrollment setting | Added requireVerified toggle in course settings, enforced on enrollment | ✅ Fixed |
| lastLogin breaks legacy DB users | Field is optional (no default/required), UI shows 'Never' for missing values | ✅ Verified |
| Legacy DB agent instructions needed | Created AGENT_LEGACY_DB.md with instructions for discovering legacydb/ structure and updating seed scripts | ✅ Created |
| Password reset modal UX | Modal auto-closes after 5s on success, warns user to check spam/junk folder | ✅ Fixed |
| Admin can change their own role | Server returns 403 for self-role-change; UI disables dropdown with tooltip | ✅ Fixed |
| Cross-tab login not synced | Added localStorage 'storage' event listener in AuthContext for cross-tab auth sync | ✅ Fixed |
| Prof course page: no avatars | Avatar shown at far left of each student/instructor row, clickable for full-size dialog | ✅ Fixed |
| Prof course page: no removal confirmation | Added confirmation dialogs before removing students or instructors | ✅ Fixed |
| Prof course page: no reactive updates | Added 15-second polling interval for auto-refresh of member lists | ✅ Fixed |
| Student unenroll: "Insufficient permissions" | Server now allows students to remove themselves (self-unenroll) | ✅ Fixed |
| Create course: "Season" label | Changed label from "Season" to "Semester" | ✅ Fixed |
| Create course: Fall/Winter year format | Fall/Winter now generates year/year+1 format (e.g., 2025/2026) | ✅ Fixed |
| Course tiles: inconsistent sizing | Fixed card sizes with minHeight, uniform layout across dashboards | ✅ Fixed |
| Course tiles: layout order | Now shows: bold dept+number → semester → name (wrapped) → section | ✅ Fixed |
| No connection status feedback | Added ConnectionStatus component that polls /api/v1/health every 15s and shows warning banner when disconnected | ✅ Fixed |

### Phase 4 Progress

| Component | Task | Status |
|-----------|------|--------|
| Backend | Session CRUD routes (create, read, update, delete, list) | ✅ Complete |
| Backend | Session lifecycle (start, end, current question) | ✅ Complete |
| Backend | Session copy, reviewable toggle, quiz extensions | ✅ Complete |
| Backend | Question CRUD routes (create, read, update, delete) | ✅ Complete |
| Backend | Question session management (add/remove/reorder) | ✅ Complete |
| Backend | Question session options (attempts, visibility, stats, correct) | ✅ Complete |
| Backend | Question library (copy to library, copy to session) | ✅ Complete |
| Testing | Session routes unit tests (20 tests) | ✅ Complete |
| Testing | Question routes unit tests (19 tests) | ✅ Complete |
| Frontend | Session editor page | ✅ Complete |
| Frontend | Session list on course pages | ✅ Complete |
| Frontend | Question editor components (all 5 types: SA, MC, TF, MS, NU) | ✅ Complete |
| Frontend | Question display component | ✅ Complete |
| Frontend | Connection status indicator (health check banner) | ✅ Complete |
| Frontend | Avatar position fix (moved to far left per Comments.md) | ✅ Complete |

### Agent Status

| Agent | Current Task | Status |
|-------|-------------|--------|
| 1 - Foundation | Port configuration cleanup, Docker improvements | ✅ Phase 3 done |
| 2 - Auth | SSO auto-verify, lastLogin tracking, verify-email endpoint, admin self-role protection | ✅ Phase 4 done |
| 3 - Courses | Course CRUD + enrollment verification + user population + student self-unenroll | ✅ Phase 4 done |
| 4 - Sessions | Session & Question CRUD routes with full lifecycle | ✅ Phase 4 backend done |
| 5 - Responses | Response model + WebSocket infrastructure complete | ✅ Phase 2 done |
| 6 - Grading | Grade Mongoose model complete | ✅ Phase 2 done |
| 7 - Frontend | Session editor, question editor/display, session lists on course pages, connection status, avatar fix | ✅ Phase 4 frontend done |
| 8 - Testing | All route tests passing (93 tests: auth 20, courses 23, models 11, sessions 20, questions 19) | ✅ Phase 4 done |

---

## How to Resume Work

1. Read this file (MIGRATION.md) to understand the overall plan and current status
2. Cross-check [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md) for alignment
3. Check the Agent Status table above to see what's in progress
4. Read the relevant agent file in [agents/](agents/) for detailed task instructions
5. Complete the next pending task, update the agent file, and update this file's status tables
6. Submit a PR with your changes

### Current Next Steps (Phase 5)

Phase 4 is now complete — both backend and frontend work is done. All Comments.md issues have been resolved. Legacy database compatibility has been verified and fixes applied. The following should happen next:

1. **Phase 5 Start:** Response submission routes, WebSocket live session events (Agent 5)
2. **Phase 5 Start:** Response statistics calculation, quiz auto-save (Agent 5)
3. **Phase 5 Start:** Run session page (professor), Present session page (student), Quiz page (Agent 7)
4. **Phase 6 Prep:** Grade calculation service (Agent 6)
5. **Ongoing:** E2E tests for course management and session creation flows (Agent 8)
6. **Image uploads:** Verify that both thumbnail and full-size versions are saved when uploading profile pictures (referenced in Comments.md)
7. **Legacy DB indexes:** Add Mongoose indexes matching the legacy index definitions to preserve query performance

**Testable by human (all phases through Phase 4):**
- Log in as professor → create a course → click course title to view
- Students can enroll → student sees course in dashboard → click title to view
- Professor: add/remove students with confirmation dialog, avatars shown at far left
- Professor: toggle requireVerified and allowStudentQuestions settings
- Professor: Sessions tab shows list of sessions with status chips, create/copy/delete sessions
- Professor: Click session → session editor with settings, question list, add/edit/delete/reorder questions
- Student: Course page shows visible/running/done sessions with status chips
- Question editor supports all 5 types: Short Answer, Multiple Choice, True/False, Multi-Select, Numerical
- Connection status: warning banner appears when backend is unreachable, disappears when restored
- Admin: see Verified column, click to verify email, see Last Login column
- Admin: **cannot change their own role** (dropdown is disabled with tooltip)
- Forgot password: click "Forgot Password?" → receive email → modal auto-closes with spam warning
- Email verification: click link in email → /verify-email/:token page → email marked verified
- Smart semester: create course dialog uses "Semester" label, Fall/Winter shows 2025/2026
- Course tiles: uniform size, bold dept+number, semester, wrapped name, section line
- Cross-tab auth: login in one tab → other tabs automatically show logged-in state
- Student can unenroll from a course (no more "Insufficient permissions" error)
- Student/instructor lists auto-refresh every 15 seconds
- API: POST/GET/PATCH/DELETE sessions and questions via REST endpoints

**Important:** Always cross-check REQUIREMENTS_FOR_MIGRATION_FASTIFY.md before starting new work to ensure alignment with the master requirements.
