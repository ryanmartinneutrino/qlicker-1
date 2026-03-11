# Qlicker Migration Plan: MeteorJS → Fastify/React

> **This is the master migration document.** All agents should consult this file to understand the overall plan, current status, and their role in the migration. Cross-check [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md) regularly to ensure alignment.

## Status: Phase 6 Complete — Grading Functional

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
10. [Code Review Findings (2026-03-07)](#code-review-findings-2026-03-07)

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
| **SSO** | @node-saml/node-saml | SAML-based SSO |
| **Email** | Nodemailer | Password reset, verification emails |
| **File Upload** | AWS SDK v3, @azure/storage-blob | S3, Azure, local storage |
| **UI Framework** | Material UI (MUI) | Material Design components |
| **Typography** | Helvetica Neue, Helvetica, Arial | Global UI font stack (client theme) |
| **Charts** | MUI + custom components | Data visualization (HistogramBars, LinearProgress bars) |
| **Math** | KaTeX | Equation rendering |
| **Rich Text** | TipTap | WYSIWYG editor |
| **Testing** | Vitest | Unit tests (Playwright planned for E2E) |
| **Containerization** | Docker + Docker Compose | Deployment |

### Directory Structure

```
qlicker-1/
├── server/                      # Fastify backend
│   ├── src/
│   │   ├── app.js               # Fastify app factory
│   │   ├── server.js            # Entry point
│   │   ├── config/              # Environment config
│   │   │   └── index.js
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
│   │   │   ├── sessions.js      # Also handles responses (no separate responses.js)
│   │   │   ├── questions.js
│   │   │   ├── grades.js
│   │   │   ├── images.js
│   │   │   └── settings.js
│   │   ├── plugins/             # Fastify plugins
│   │   │   ├── db.js            # MongoDB/Mongoose connection
│   │   │   ├── websocket.js     # WebSocket manager (wsBroadcast, wsSendToUser)
│   │   │   ├── saml.js          # SAML SSO
│   │   │   └── upload.js        # File upload (S3, Azure, local)
│   │   ├── services/            # Business logic
│   │   │   ├── grading.js       # Grade calculation engine
│   │   │   ├── email.js         # Nodemailer email sending
│   │   │   └── questionCopy.js  # Question copy/clone logic
│   │   ├── middleware/           # Auth guards, validators
│   │   │   └── auth.js          # JWT verification + role guards
│   │   ├── utils/               # Shared utilities
│   │   │   ├── email.js         # Case-insensitive email regex
│   │   │   ├── meteorId.js      # Meteor-compatible _id generation
│   │   │   ├── password.js      # Argon2id hashing
│   │   │   └── regex.js         # ReDoS-safe regex escaping
│   │   └── websocket/           # WS event handlers (planned, currently empty)
│   ├── scripts/
│   │   └── migrate-question-types.js  # One-time legacy type cleanup
│   ├── test/                    # Vitest test suites (141 tests, 8 files)
│   ├── package.json
│   └── Dockerfile
├── client/                      # React frontend
│   ├── src/
│   │   ├── main.jsx             # Entry point
│   │   ├── App.jsx              # Root with router
│   │   ├── theme/               # MUI theme (Helvetica font stack)
│   │   │   └── index.js
│   │   ├── api/                 # API client
│   │   │   └── client.js        # Axios wrapper with JWT interceptor
│   │   ├── contexts/            # React contexts
│   │   │   └── AuthContext.jsx   # JWT storage, auto-refresh, cross-tab sync
│   │   ├── components/          # Shared components
│   │   │   ├── common/          # AutoSaveStatus, ConnectionStatus, HistogramBars,
│   │   │   │                    # RequireAuth, RequireRole, SessionStatusChip
│   │   │   ├── grades/          # CourseGradesPanel, SessionQuestionGradingPanel
│   │   │   ├── layout/          # AppLayout
│   │   │   └── questions/       # QuestionDisplay, QuestionEditor, RichTextEditor,
│   │   │                        # StudentRichTextEditor, ResizableImage, constants,
│   │   │                        # richTextUtils
│   │   ├── pages/               # Route pages
│   │   │   ├── Home.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── Profile.jsx
│   │   │   ├── ResetPassword.jsx
│   │   │   ├── SSOCallback.jsx
│   │   │   ├── VerifyEmail.jsx
│   │   │   ├── admin/           # AdminDashboard
│   │   │   ├── professor/       # ProfDashboard, CourseDetail, SessionEditor,
│   │   │   │                    # LiveSession, SecondDesktop, SessionReview
│   │   │   └── student/         # StudentDashboard, CourseDetail, LiveSession,
│   │   │                        # QuizSession, SessionReview
│   │   └── utils/               # courseSemester, courseTitle, date, histogram
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
├── scripts/                     # Setup and management
│   ├── setup-native.sh
│   ├── setup-docker.sh
│   ├── qlicker.sh               # start/stop/restart/status
│   ├── seed-db.js               # Node.js seed/reset script
│   ├── seed-db.sh               # Native seed wrapper
│   ├── seed-db-docker.sh        # Docker seed wrapper
│   ├── changeuserpwd.js         # Password change utility
│   └── changeuserpwd.sh         # Password change wrapper
├── docs/                        # Documentation
│   ├── developer/
│   │   └── grading.md
│   └── user-manual/
│       └── grading.md
├── docker-compose.yml
├── docker-compose.prod.yml      # Production with Nginx load balancer
├── .env.example
├── MIGRATION.md                 # This file
├── REQUIREMENTS_FOR_MIGRATION_FASTIFY.md
└── agents/                      # Agent task files (8 agent docs)
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
| POST | `/api/v1/courses/:id/instructors` | Add instructor/TA |
| DELETE | `/api/v1/courses/:id/instructors/:instructorId` | Remove instructor/TA |
| POST | `/api/v1/courses/:id/regenerate-code` | New enrollment code |
| PATCH | `/api/v1/courses/:id/active` | Toggle active |
| POST | `/api/v1/courses/:id/copy-sessions` | Copy all sessions *(not yet implemented — Phase 7)* |
| **Course Groups** | | *(Not yet implemented — Phase 7)* |
| GET | `/api/v1/courses/:id/groups` | List group categories |
| POST | `/api/v1/courses/:id/groups` | Create category |
| DELETE | `/api/v1/courses/:id/groups/:catId` | Delete category |
| POST | `/api/v1/courses/:id/groups/:catId/groups` | Add group |
| DELETE | `/api/v1/courses/:id/groups/:catId/groups/:gId` | Delete group |
| PATCH | `/api/v1/courses/:id/groups/:catId/groups/:gId` | Update group |
| **Sessions** | | |
| POST | `/api/v1/courses/:courseId/sessions` | Create session |
| GET | `/api/v1/courses/:courseId/sessions` | List course sessions |
| GET | `/api/v1/sessions/:id` | Get session |
| PATCH | `/api/v1/sessions/:id` | Update session |
| DELETE | `/api/v1/sessions/:id` | Delete session |
| POST | `/api/v1/sessions/:id/start` | Start session |
| POST | `/api/v1/sessions/:id/end` | End session |
| POST | `/api/v1/sessions/:id/join` | Student joins |
| GET | `/api/v1/sessions/:id/quiz` | Get student quiz payload |
| PATCH | `/api/v1/sessions/:id/quiz-response` | Auto-save student quiz response |
| POST | `/api/v1/sessions/:id/quiz-question-submit` | Lock one practice-quiz answer |
| POST | `/api/v1/sessions/:id/submit` | Submit quiz |
| PATCH | `/api/v1/sessions/:id/current` | Set current question |
| PATCH | `/api/v1/sessions/:id/reviewable` | Toggle reviewable |
| PATCH | `/api/v1/sessions/:id/extensions` | Set quiz extensions |
| POST | `/api/v1/sessions/:id/copy` | Copy session |
| GET | `/api/v1/sessions/:id/live` | Get live session data (student/prof) |
| GET | `/api/v1/sessions/:id/review` | Get session review data |
| GET | `/api/v1/sessions/:id/results` | Get session results (prof) |
| POST | `/api/v1/sessions/:id/respond` | Submit response (live session) |
| PATCH | `/api/v1/sessions/:id/question-visibility` | Show/hide question |
| POST | `/api/v1/sessions/:id/new-attempt` | Start new attempt |
| PATCH | `/api/v1/sessions/:id/toggle-responses` | Open/close responses |
| POST | `/api/v1/sessions/:id/refresh-join-code` | Refresh join code |
| PATCH | `/api/v1/sessions/:id/join-code-settings` | Configure join code |
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
| | *(Response endpoints are implemented within the sessions route module — see `/sessions/:id/respond`, `/quiz-response`, `/quiz-question-submit`, `/submit` above)* | |
| **Grades** | | |
| POST | `/api/v1/sessions/:id/grades/recalculate` | Recalculate session grades |
| GET | `/api/v1/sessions/:id/grades` | Get session grades |
| PATCH | `/api/v1/sessions/:id/grades/visibility` | Show/hide grades to students |
| PATCH | `/api/v1/grades/:gradeId/marks/:questionId` | Update mark for a question |
| POST | `/api/v1/grades/:gradeId/marks/:questionId/set-automatic` | Restore auto mark |
| PATCH | `/api/v1/grades/:gradeId/value` | Update grade value |
| POST | `/api/v1/grades/:gradeId/value/set-automatic` | Restore auto grade value |
| GET | `/api/v1/courses/:courseId/grades` | Get course grades |
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

> **Note:** Granular delta events are implemented for live session scalability. The generic `session:updated` is retained for non-live-critical mutations (session CRUD, join, quiz auto-close). Clients handle both granular and generic events.

| Event | Direction | Status | Description |
|-------|-----------|--------|-------------|
| `session:updated` | Server → Client | ✅ Implemented | Generic notification for non-live mutations; clients re-fetch live data |
| `session:question-changed` | Server → Client | ✅ Implemented | Prof changes current question — delta payload: `{ questionId, questionIndex, questionNumber, questionCount }` |
| `session:response-added` | Server → Instructors | ✅ Implemented | New response count — delta payload: `{ questionId, attempt, responseCount, joinedCount }`. Sent only to instructors (students don't need real-time response notifications). |
| `session:status-changed` | Server → Client | ✅ Implemented | Session started/ended — delta payload: `{ status }` |
| `session:visibility-changed` | Server → Client | ✅ Implemented | Question visibility/stats/correct toggled — delta payload: `{ questionId, hidden, stats, correct }` |
| `course:session-updated` | Server → Client | ⬜ Planned | Session status change on course page |
| `course:students-updated` | Server → Client | ⬜ Planned | Student list updated |

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
  - uses one canonical question type mapping for all data (legacy + new): `MC=0` (exactly one correct option), `TF=1`, `SA=2`, `MS=3` (one or more correct options), `NU=4`,
  - trusts stored `type` for canonical values `0..4`, with a narrow guard for malformed legacy outliers (`type=4` + multiple options => option-based type),
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

- Canonical mapping: `MC=0` (exactly one correct option), `TF=1`, `SA=2`, `MS=3` (one or more correct options), `NU=4`
- Script path: `server/scripts/migrate-question-types.js`
- Behavior:
  - default mode is dry-run (reports only),
  - `--apply` writes updates,
  - canonical `0..4` types are left unchanged, except malformed numerical outliers (`type=4` with multiple options) which are rewritten to option-based canonical types (`MC`/`MS`/`TF`),
  - legacy `type=5` is mapped to `4` (Numerical),
  - any other invalid values are inferred once using option shape/flags, then written as canonical values.

Run steps:

```bash
cd server
node scripts/migrate-question-types.js
node scripts/migrate-question-types.js --apply
```

Verification (optional):

```bash
mongosh "mongodb://localhost:27071/qlicker" --quiet --eval \
'db.questions.aggregate([{ $group:{ _id:"$type", count:{ $sum:1 } } }, { $sort:{ _id:1 } }]).forEach(printjson)'
```

After this script has been applied in all environments, remove temporary client normalization fallbacks in `client/src/components/questions/constants.js`:

- remove the malformed numerical guard (`type=4` with multiple options),
- remove legacy `rawType === 5` compatibility branch,
- remove the final unknown-type fallback (`return QUESTION_TYPES.SHORT_ANSWER`) if strict rejection is preferred.

### Remaining Follow-Up Items

- Decide whether to support legacy `users.services.password.reset.*` path directly or transform into the new `services.resetPassword` path (affects users with pending reset tokens from the old app).
- ~~Add missing model indexes (especially `users`, `responses`, `questions`, `sessions`, `grades`) to preserve legacy query performance/uniqueness expectations.~~ ✅ **Done** — Added indexes to User (`emails.address`), Question (`sessionId`, `courseId`, `owner`), Session (`courseId`), Grade (`userId`, `sessionId`, `courseId`, compound `userId+sessionId`), and Image (`UID`). Response already had compound indexes.
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

**Goal:** Professors can create sessions/quizzes, add questions, edit them (with attachments, KaTeX), set dates, give extensions. Course page shows sessions with status. Question editor uses TipTap for rich text and KaTeX for math rendering.

| Agent | Tasks |
|-------|-------|
| 4 | Session CRUD, question CRUD, question types, session editor, quiz config, extensions |
| 7 | Session editor UI, question editor UI (TipTap WYSIWYG, KaTeX math), session list, quiz date picker |
| 3 | Session list on course page, session status display |
| 8 | Session/question CRUD tests, editor E2E tests |
| 5 | Finalize WebSocket for live sessions |
| 6 | Continue grade integration |

**Testable by human:** Prof creates session → adds questions (all types) → edits with images/KaTeX → sets quiz dates → gives extension → course page shows session status.

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
- [x] Response submission routes (implemented within `sessions.js`: POST respond, PATCH quiz-response, POST quiz-question-submit, POST submit)
- [x] Response update (quiz editable responses — auto-save via PATCH quiz-response)
- [x] WebSocket infrastructure (@fastify/websocket)
- [x] WebSocket authentication (JWT via query parameter)
- [x] Live session events (generic `session:updated` broadcast — see Performance section for planned granular events)
- [x] Course page WebSocket events (professor CourseDetail now uses WS push for session status changes; student CourseDetail updated to handle delta events)
- [x] Response statistics calculation (`buildResponseStats()` in sessions.js)
- [x] Quiz auto-save mechanism (PATCH /sessions/:id/quiz-response)
- [x] Granular delta WebSocket messages (`session:response-added`, `session:question-changed`, `session:visibility-changed`, `session:status-changed` replace generic `session:updated` for live session scalability)
- [ ] WebSocket rate limiting

### Agent 6: Grading System
See [agents/AGENT_6_GRADING.md](agents/AGENT_6_GRADING.md)

**Summary of tasks:**
- [x] Grade Mongoose model
- [x] Grade calculation service (auto-grade MC/TF/MS/NU)
- [x] Manual grade/mark editing
- [x] Feedback per mark
- [x] Grade visibility (show/hide to students)
- [x] Grade routes (session grades, course grades)
- [x] CSV export
- [x] Session review data routes
- [x] Participation calculation
- [x] Attempt weighting

### Agent 7: Frontend Shell & Shared Components
See [agents/AGENT_7_FRONTEND.md](agents/AGENT_7_FRONTEND.md)

**Summary of tasks:**
- [x] React app scaffold (Vite + React 18)
- [x] MUI theme (Helvetica font stack matching existing app)
- [x] App layout (navbar, sidebar, routing)
- [x] Auth context (JWT storage, auto-refresh, cross-tab sync)
- [x] API client (Axios wrapper with JWT interceptor)
- [ ] WebSocket context (currently inline in LiveSession pages; should extract to shared context)
- [x] Login/Register page
- [x] Admin panel (settings, users, images, SSO, token expiry)
- [x] Profile page
- [x] Professor dashboard and course pages
- [x] Student dashboard and course pages
- [x] Session editor page (TipTap rich text, KaTeX math, resizable images, autosave)
- [x] Run session page (professor) — LiveSession with toggle controls, join code management
- [x] Present session page (student) — LiveSession with answer submission
- [x] Quiz page (student) — QuizSession with autosave, submit, practice mode
- [x] Grading pages and components (CourseGradesPanel, SessionQuestionGradingPanel)
- [x] Session review pages (professor + student, per-attempt, CSV export)
- [x] Question components (display, edit, all 5 types: SA, MC, TF, MS, NU)
- [x] Answer distribution display — MUI LinearProgress bars for MC/MS/TF, custom HistogramBars for NU
- [x] SecondDesktop projector view (popup window, auto-close on session end)
- [ ] Group management UI
- [ ] Video chat (Jitsi) integration
- [x] Shared components (tables, forms, modals, lists, AutoSaveStatus)
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
- [x] API unit tests per route module (141 server tests across 8 suites: auth, courses, sessions, questions, grades, models, settings, grading service)
- [x] Client grading UI test (2 tests in CourseGradesPanel.test.jsx)
- [ ] Component tests for critical UI (beyond grading panel)
- [ ] Documentation (README updated ✅, developer guide partial, user guide partial)
- [ ] Security audit (rate limiting ✅, helmet ✅, ReDoS ✅; CSRF, token storage, SAML logout remain)

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

- JWT tokens with short expiry + refresh tokens (httpOnly cookie)
- CORS restricted to frontend origin
- Rate limiting on auth endpoints (`@fastify/rate-limit`, 10 requests / 15 minutes)
- Security headers via `@fastify/helmet` (X-Content-Type-Options, X-Frame-Options, HSTS, etc.)
- Input validation (Fastify schema validation)
- Regex user input escaped to prevent ReDoS (`escapeForRegex()` utility)
- Password minimum length: 8 characters
- Failed login attempts logged with email and userId for audit trail
- WebSocket authentication required
- File upload validation (type, size)
- SAML assertion validation
- No sensitive data in client bundles
- See [Code Review Findings](#code-review-findings-2026-03-07) for remaining items

### Internationalization (i18n) Readiness

- **Current state:** No i18n framework. All UI strings are hardcoded in English.
- **Future-proofing strategy:** When `react-i18next` (or equivalent) is introduced, all hardcoded strings must be extracted to translation files. Until then, new UI text should be kept in clearly identifiable constants or component-level variables (not buried in JSX) to simplify future extraction.
- **Date/number formatting:** `client/src/utils/date.js` uses hardcoded English month abbreviations. Should eventually switch to `Intl.DateTimeFormat` for locale-aware formatting. New formatting code should prefer the built-in `Intl` APIs.
- **Error messages:** Server error messages are in English. Client-side messages should avoid duplicating server text when possible — prefer error codes that the client maps to localized messages.

### Styling Guidelines

- **Primary color**: Match existing Qlicker blue (#2196F3 family)
- **Font**: Helvetica Neue, Helvetica, Arial sans-serif stack (configured in `client/src/theme/index.js`)
- **Design system**: Material Design via MUI
- **Consistent spacing**: 8px grid system (MUI default)
- **Responsive**: Mobile-friendly, especially for student quiz views
- **Dark/light**: Plan for theme switching in the future
- **Component inheritance**: Use MUI's `ThemeProvider` and `styled` components for consistent styling that propagates globally

### UI Autosave Standard (Design Choice)

- **Default behavior**: UI settings/forms should autosave by default. Add manual save buttons only for destructive flows, multi-step drafts, or explicit product requirements.
- **Shared pattern required**: Use a common autosave status pattern instead of one-off messages/snackbars to keep behavior consistent and avoid spaghetti code.
- **Canonical autosave state machine**:
  - `idle`: `Changes save automatically.` (neutral text)
  - `saving`: `Saving changes...` (neutral text)
  - `success`: `Changes saved automatically.` (green/success text)
  - `error`: `<backend message>. Your last change was not recorded.` (red/error text)
- **Implementation rule**:
  - Keep `saveStatus` + `saveError` state per autosave form/section.
  - On trigger, set `saveStatus='saving'` and clear old error text.
  - On successful backend response, set `saveStatus='success'`.
  - On backend error/negative response, set `saveStatus='error'` and show the error text with the explicit "not recorded" warning.
- **Reuse existing component**: Prefer shared `client/src/components/common/AutoSaveStatus.jsx` for display, and follow this same status contract for any new autosave surface.

### Documentation Standards

- README.md: Setup instructions, quick start
- MIGRATION.md: This file — plan, status, progress
- Agent files: Detailed task lists with acceptance criteria
- Code comments: JSDoc for API routes and services
- API documentation: `@fastify/swagger` is installed as a dependency but **not yet registered** in `app.js`. Needs to be wired up (Phase 7/8).

---

## Progress Tracking

### Overall Status

| Milestone | Status | Target Phase |
|-----------|--------|-------------|
| 1. Login works | ✅ Complete | Phase 1 |
| 2. Profile & uploads | ✅ Complete (bugs fixed) | Phase 2 |
| 3. Course management | ✅ Complete | Phase 3 |
| 4. Session editor | ✅ Complete | Phase 4 |
| 6. Live sessions & quizzes | ✅ Complete | Phase 5 |
| 7. Grading | ✅ Complete (auto/manual grading, visibility, CSV, review) | Phase 6 |
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

### Post-Phase 4: TipTap/KaTeX Question Editor Integration

| Component | Task | Status |
|-----------|------|--------|
| Frontend | Replace MathJax with KaTeX for math rendering | ✅ Complete |
| Frontend | Replace plain text fields with TipTap rich text editor | ✅ Complete |
| Frontend | Question editor autosave (inline editing, no manual save) | ✅ Complete |
| Frontend | Resizable image support in TipTap editor (drag-and-drop) | ✅ Complete |
| Frontend | Legacy math conversion (`<script type="math/tex">` → KaTeX `$...$`/`$$...$$`) | ✅ Complete |
| Frontend | Questions store both `content` (HTML) and `plainText` fields | ✅ Complete |
| Frontend | Live KaTeX preview in question editor | ✅ Complete |
| Frontend | Canonical question type mapping aligned to Meteor (MC=0, TF=1, SA=2, MS=3, NU=4) | ✅ Complete |
| Backend | Question route validation updated for canonical types (0–4) and MC single-correct enforcement | ✅ Complete |
| Backend | Migration script for legacy question type cleanup (`server/scripts/migrate-question-types.js`) | ✅ Complete |
| Testing | Server tests updated for canonical question type values | ✅ Complete |

### Agent Status

| Agent | Current Task | Status |
|-------|-------------|--------|
| 1 - Foundation | Port configuration cleanup, Docker improvements | ✅ Phase 3 done |
| 2 - Auth | SSO auto-verify, lastLogin tracking, verify-email endpoint, admin self-role protection | ✅ Phase 4 done |
| 3 - Courses | Course CRUD + enrollment verification + user population + student self-unenroll | ✅ Phase 4 done |
| 4 - Sessions | Session & Question CRUD routes with full lifecycle | ✅ Phase 5 done |
| 5 - Responses | Response model + WebSocket + response submission + quiz auto-save + stats | ✅ Phase 5 done (routes in sessions.js) |
| 6 - Grading | Core grading service/routes complete (auto/manual grading, visibility, conflicts, CSV, course/session grade tables) | ✅ Phase 6 done |
| 7 - Frontend | All phase 1–6 UI complete: login, admin, courses, sessions, live sessions, quizzes, grading, review | ✅ Phase 6 done |
| 8 - Testing | Server + client tests passing (143 total: 141 server across 8 suites + 2 client grading UI tests) | ✅ Phase 6 done |

---

## How to Resume Work

1. Read this file (MIGRATION.md) to understand the overall plan and current status
2. Cross-check [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md) for alignment
3. Check the Agent Status table above to see what's in progress
4. Read the relevant agent file in [agents/](agents/) for detailed task instructions
5. Complete the next pending task, update the agent file, and update this file's status tables
6. Submit a PR with your changes

### Current Next Steps (Phase 7: Groups, Video, SSO, Polish)

Phase 6 is complete (grading fully functional). A comprehensive code review (2026-03-07) identified performance, security, accessibility, and i18n items — see [Code Review Findings](#code-review-findings-2026-03-07) for full details. Low-hanging security fixes (rate limiting, helmet, ReDoS, password policy, login logging), HTML sanitization, and core accessibility hardening have been applied.

**Phase 7 priorities (in order):**

1. ~~**WebSocket delta messages (CRITICAL for production):** Replace generic `session:updated` events with granular delta payloads to eliminate N+1 re-fetch pattern — see Code Review § Performance. This is the single biggest scalability blocker.~~ ✅ Done — Implemented `session:response-added`, `session:question-changed`, `session:visibility-changed`, `session:status-changed` events with delta payloads. Added `wsSendToUsers()` for single-serialize broadcast. Professor LiveSession uses throttled 2s re-fetch for responses. Student LiveSession ignores response-added (sent only to instructors). Estimated 98%+ reduction in DB queries during live sessions.
2. **Group management:** Implement group category CRUD, group management (add/remove students), and legacy `groupCategories` shape migration (`groupNumber/groupName/students` → `name/members`).
3. **Video chat integration:** Jitsi room management for course groups.
4. **SSO SAML production confirmation:** Verify SAML login/callback/metadata/logout work end-to-end in a production-like environment. Fix SAML logout signature validation (currently manually parses XML without crypto verification).
5. **Security hardening:** CSRF protection (`@fastify/csrf-protection`), move JWT access token from localStorage to memory-only, refresh token rotation, file upload content validation (magic bytes).
6. **Swagger API documentation:** Register `@fastify/swagger` in `app.js` (dependency already installed but not wired up).
7. ~~**Course page WebSocket push:** Replace 15-second polling on course pages with WebSocket push events for session status changes.~~ ✅ Done — Professor CourseDetail now has WebSocket connection for session status events. Student CourseDetail updated to handle delta events. Professor CourseDetail retains 15s polling for member list only.
8. **E2E tests:** Set up Playwright and implement flow tests for login, course management, session creation, live session, quiz, and grading.
9. ~~**Legacy DB indexes:** Add Mongoose indexes matching the legacy index definitions to preserve query performance.~~ ✅ Done — Added to User, Question, Session, Grade, Image models.
10. **Storage hardening:** Move from public object URLs to private-bucket image delivery (staged DB migration + bucket policy cutover).
11. **i18n framework:** Introduce `react-i18next` and begin extracting hardcoded strings.
12. **Copy sessions between courses** (Agent 3 remaining task).
13. **Client bundle optimization:** Main JS chunk is 1.6 MB (482 KB gzipped). Apply code-splitting with dynamic imports for heavy pages (SessionEditor, LiveSession, etc.).

**Completed items from previous next steps:**

1. ~~**Additional UI reviews:** Review and finalize remaining UI updates before proceeding with Phase 5~~ ✅ Done (PRs 108–112)
2. ~~**Phase 5 Start:** Response submission routes, WebSocket live session events (Agent 5)~~ ✅ Done (PR 119)
3. ~~**Phase 5 Start:** Response statistics calculation, quiz auto-save (Agent 5)~~ ✅ Done (PR 119)
4. ~~**Phase 5 Start:** Run session page (professor), Present session page (student), Quiz page (Agent 7)~~ ✅ Done (PR 119)
5. ~~**Phase 5 Finish:** Quiz lifecycle + student quiz runtime + extension-aware access/review logic~~ ✅ Done
6. ~~**Phase 6:** Grade calculation service + routes + UI integration + tests~~ ✅ Done (PR 128)
7. ~~**Image uploads:** Verify all three backends (local, S3, Azure)~~ ✅ Done (PR 112)
8. ~~**HTML sanitization:** Add `dompurify` for `dangerouslySetInnerHTML` usage~~ ✅ Done
9. ~~**Accessibility hardening:** ARIA roles on rich text editors, `aria-live` regions~~ ✅ Done

### Phase 6 Progress (2026-03-09)

Core grading is now implemented and wired through backend + frontend:

- Added grading service in `server/src/services/grading.js` with:
  - Auto-grading support for MC/TF/MS/NU and manual-required handling for non-auto-gradeable question types
  - Manual mark/grade override preservation during recalculation
  - Conflict reporting when recalculated auto marks differ from existing manual marks
  - Participation and grade aggregation logic compatible with legacy behavior
  - Attempt weighting support (`sessionOptions.maxAttempts` + `attemptWeights`)
  - Low-response exclusion rule for single-attempt questions (`responses < 10% of joined`)
  - Session-level MS scoring method support (`right-minus-wrong`, `all-or-nothing`, `correctness-ratio`)

- Added grading routes in `server/src/routes/grades.js`:
  - `POST /sessions/:id/grades/recalculate`
  - `GET /sessions/:id/grades`
  - `PATCH /sessions/:id/grades/visibility`
  - `PATCH /grades/:gradeId/marks/:questionId`
  - `POST /grades/:gradeId/marks/:questionId/set-automatic`
  - `PATCH /grades/:gradeId/value`
  - `POST /grades/:gradeId/value/set-automatic`
  - `GET /courses/:courseId/grades`

- Integrated reviewable behavior with grading in `sessions` routes:
  - Making a session reviewable backfills missing grade rows and sets visibility to students
  - Making a session non-reviewable hides grades from students
  - Reviewable-triggered autograding now returns warnings for non-auto-gradeable questions

- Frontend grading UI integrated:
  - Course-level Grades tab for professors and students (`CourseGradesPanel`)
  - Session Review now includes a dedicated Grading tab (instructor)
  - Manual mark/grade editing dialog with per-mark feedback editor
  - Recalculate controls, conflict resolution dialog (accept auto per conflict or all), and CSV export
  - “Needs grading” chips on professor course session list and in grade table headers
  - Session Editor includes MS scoring method selection + formula tooltip text

- Phase 6 grading/student follow-up fixes (2026-03-09):
  - Student session review now emphasizes session-level grading only (session total + participation), and each question chip shows mark/out-of (or pending manual grading) instead of only max points.
  - Grading feedback editing was optimized with debounced editor updates + blur flush to eliminate per-keystroke blocking in large grading tables.
  - Student course page now includes a dedicated **Settings** tab; unenroll action moved there.
  - Student grade-table headers now show `Ungraded` (without numeric counts) in student view while retaining numeric ungraded counts for instructors.
  - Added grading-focused test coverage:
    - Server: `server/test/services/grading.test.js` now covers legacy point defaults by question type and zero-point exclusion behavior.
    - Client: `client/src/components/grades/CourseGradesPanel.test.jsx` verifies student-vs-instructor grade-table behavior for search visibility and ungraded labeling.

- Full verification run (2026-03-09):
  - `cd server && npm test` → 141 passed (8 files/suites).
  - `cd client && npm test` → 2 passed (1 file).
  - `cd client && npm run build` → success.

#### Grade Calculation Notes (Legacy-Compatible)

| Rule | Behavior |
|---|---|
| Default question points | SA defaults to `0` unless explicitly configured; other types default to `1` |
| Grade value | If `points > 0`: `value = 100 * points / outOf`; if `points > 0` and `outOf = 0`: `value = 100`; otherwise `0` |
| Participation | `100 * numAnswered / numQuestions` for questions with `outOf > 0`; if `numQuestions = 0` and student joined: `100` |
| Low-response exclusion | For single-attempt questions only, if unique responders `< 10%` of joined students, question `outOf` becomes `0` |
| Manual overrides | Marks with `automatic=false` and grades with `automatic=false` are preserved across recalculation |

#### Multiple-Select Scoring

| Method | Formula |
|---|---|
| `right-minus-wrong` (default) | `max(0, min(1, (2C - S) / K))` where `C=correct selections`, `S=total selections`, `K=# correct options` |
| `all-or-nothing` | `1` only if selected set exactly matches correct set; otherwise `0` |
| `correctness-ratio` | `correctly labeled options / total options` |

#### Planned Private-Bucket Cutover (Required Before Enforcing Private S3 Bucket)

Target state is a private S3 bucket for all image assets. To avoid breaking legacy image URLs, this must be done in stages:

1. **Compatibility mode (current):** keep Fastify S3 uploads readable by matching Meteor behavior (`ACL: public-read`) while migration work is prepared.
2. **Introduce private read path:** add signed URL and/or backend proxy delivery so clients do not depend on direct public S3 URLs.
3. **Staged DB migration:** backfill image references in batches (users profile fields, images collection URLs, and question HTML/image URL references), with dry-run and rollback support.
4. **Validation window:** verify old and new records render through the new read path in staging and production shadow checks.
5. **Bucket cutover:** enable private-bucket policy / Block Public Access after application read-path migration is confirmed.

### Phase 5 Progress

The following Phase 5 work has been completed:

- ✅ **Student session review page** — `GET /api/v1/sessions/:id/review` endpoint returns session questions with solutions for reviewable (done) sessions. Students access via `/student/course/:courseId/session/:sessionId/review`. Default single-question view with Previous/Next controls; toggle to view all questions at once. Each question has a "Show solution" button that reveals correct answers and solution text (rendered with KaTeX for math). 6 new backend tests cover permission checks.
- ✅ **Image upload backends verified** — Local, S3 (including MinIO via custom endpoint + path-style), and Azure Blob Storage backends are implemented and tested. See README for configuration instructions.
- ✅ **S3 Meteor-compat upload behavior restored** — Fastify S3 uploads now set `ACL: public-read` to match legacy Meteor Slingshot behavior and preserve compatibility with existing shared buckets during migration.
- ✅ **README updated** — All scripts documented, S3/Azure/MinIO/Azurite setup instructions added.
- ✅ **UI consistency** (PRs 108–112) — Helvetica font stack, student course page mirrors professor layout, image rendering constrained in questions, SSO-first login UX.
- ✅ **Quiz runtime implemented end-to-end** — Added `GET /api/v1/sessions/:id/quiz`, `PATCH /api/v1/sessions/:id/quiz-response`, `POST /api/v1/sessions/:id/quiz-question-submit`, and `POST /api/v1/sessions/:id/submit` for full quiz participation (autosave, practice-question submit/lock, final quiz submission lockout).
- ✅ **Time-window and extension enforcement** — Quiz access now uses server-side UTC timestamps, supports per-student extension windows, prevents timezone-based bypasses, and auto-closes scheduled quizzes after base + extension windows end.
- ✅ **Reviewable + extension safety** — Server now blocks making quizzes reviewable while active extensions exist.
- ✅ **Student quiz page shipped** — New `/student/course/:courseId/session/:sessionId/quiz` flow shows all questions at once (with optional one-question mode), autosaves responses, supports final submission for non-practice quizzes, and per-question solution reveal for practice quizzes.
- ✅ **Interactive session follow-up TODOs complete** — SessionReview Students tab now supports sortable Name/Email/In Session columns + autocomplete search; SecondDesktop stats now hide raw counts (percentages only); student lists default to last-name ordering.
- ✅ **Phase 5 quiz/student-review polish follow-up (2026-03-08)** — Added strict quiz window validation (`quizEnd > quizStart`) on session create/update with new backend tests, improved Session Editor quiz scheduling UX (default 24h window, quick `Today` and `Set 24h Window` actions), made quiz-tab session creation default to quiz mode with initial window values, updated practice quiz UX to keep solutions hidden until manually revealed after per-question submit, and preserved student quiz tab context when returning from quiz/review flows.

#### PR 119: Interactive Sessions (Full Live Session System)

- ✅ **10 new session API endpoints** — `POST start`, `POST join`, `GET live`, `POST respond`, `PATCH question-visibility`, `POST new-attempt`, `PATCH toggle-responses`, `POST refresh-join-code`, `PATCH join-code-settings`, `GET results`
- ✅ **Session model extensions** — `joinCodeEnabled`, `joinCodeActive`, `currentJoinCode`, `joinCodeInterval`, `joinCodeExpiresAt`; `joinRecords` array with join timestamps (backward-compatible with legacy `joined` string array)
- ✅ **Response model** — Compound indexes on `(questionId, studentUserId, attempt)` and `(questionId, attempt)`
- ✅ **Question sessionOptions** — `hidden`, `stats`, `correct` flags drive student-visible state; `attempts[]` tracks attempt lifecycle
- ✅ **Professor LiveSession page** — WebSocket real-time updates (polling fallback), question navigation, visibility/stats/correct toggles, join code controls, end session dialog (with reviewable prompt)
- ✅ **Professor SecondDesktop page** — Projector view: large join code overlay or clean student-facing question display
- ✅ **Professor SessionReview page** — Questions/Students tabs, response distributions, participation scores, CSV blob download
- ✅ **Student LiveSession page** — Auto-join or 6-digit numpad code entry, question display with MC/MS/SA/numerical answer controls, submit + lock, stats/correct/solution views
- ✅ **WebSocket session:updated events** — Real-time notifications broadcast to all course members on session mutations (start, end, question change, visibility, responses)
- ✅ **Response distribution calculation** — `buildResponseStats()` computes per-option counts for MC/MS/TF, numerical stats (mean/median/min/max) with values array, and short answer lists with answerWysiwyg support

#### PR 120: Interactive Session Refinements

- ✅ **Token expiry (2h default, admin-adjustable)** — Added `tokenExpiryMinutes` field to Settings model (default: 120). `signAccessToken()` reads from DB. Admin dashboard has "Login Token Expiry (minutes)" field with auto-save.
- ✅ **Controls above the question** — Professor LiveSession control bar (visibility, navigation, stats, correct, new attempt, toggle responses) moved from bottom of page to above the question content (applies to both desktop and mobile).
- ✅ **Meteor-style response bars for MC/MS/TF** — Replaced Recharts BarChart with inline LinearProgress bars showing percentage fill for each option. Color-coded green/red when correct answer is shown. Applied to professor LiveSession, student LiveSession, and SecondDesktop.
- ✅ **Numerical histogram** — Added Recharts BarChart histogram for numerical question responses, with automatic binning (sqrt-n bins, capped at 20). Displayed alongside summary stats cards (count, mean, median, min, max). Applied to all three views.
- ✅ **Short answer rendered list** — SA responses display rich text via RichContent component (renders answerWysiwyg HTML with KaTeX). Scrollable container (max-height 400px). Applied to all three views.
- ✅ **Student SA input with TipTap** — Created `StudentRichTextEditor` component using TipTap with StarterKit + Underline + Placeholder. Supports bold/italic/underline via bubble menu. Math via `\(...\)` inline and `$$...$$` display delimiters. Live KaTeX preview shown only when math delimiters are detected. Submits both `answer` (plain text) and `answerWysiwyg` (HTML).

#### PR 121: Interactive Session Improvements (UI Overhaul & Passcode Join Tracking)

- ✅ **Second desktop popup window** — SecondDesktop route moved outside AppLayout (no appbar/avatar). Opens as popup window via `window.open()` with specific dimensions. Auto-closes after 3 seconds when session ends.
- ✅ **Option text in stats bars** — Student DistributionBars now renders actual option text (rich HTML) alongside letter labels and percentages. Previously only showed A, B, C letters. Applied consistently to professor LiveSession, student LiveSession, SecondDesktop, and SessionReview.
- ✅ **Control bar toggle switches** — Professor LiveSession visibility/stats/correct controls converted from buttons to MUI Switch toggles. Join code controls moved to top control bar. Session settings button added.
- ✅ **Visibility persistence** — First question set to hidden (`sessionOptions.hidden: true`) on session launch. When navigating to next/prev question, visibility state carries over from current question.
- ✅ **Reviewable enforcement** — Reviewable toggle disabled in professor CourseDetail unless session status is 'done'. Server validates: returns 400 if attempting to set reviewable on non-ended session (both PATCH /sessions/:id and PATCH /sessions/:id/reviewable endpoints). Student CourseDetail only shows reviewable chip for ended sessions.
- ✅ **Passcode join lifecycle** — `joinCodeEnabled` is the passcode-required toggle (available in SessionEditor and LiveSession), and `joinCodeActive` is the explicit join period start/stop control. Students can join with a passcode only during an active join period; when passcode requirement is off they can join without a code. Disabling passcode requirement auto-closes the join period and clears the active code.
- ✅ **Non-retroactive passcode enforcement** — passcode requirement applies to new joins only; students already in `joined` remain joined if requirement is turned on mid-session.
- ✅ **End session reviewable atomically** — `POST /api/v1/sessions/:id/end` now accepts optional `{ reviewable: boolean }` so ending and making reviewable happen in one write (avoids ordering failures from separate calls).
- ✅ **Meteor-compatible participation scoring** — Session review participation follows legacy Meteor logic: default question points are `1` (except Short Answer defaults to `0` unless explicit `sessionOptions.points` exists), participation is based on answered questions with points > 0, and participation is reported as a percentage (0–100, one decimal).
- ✅ **Session settings button** — Settings button in session control bar navigates to session editor page.
- ✅ **Meteor-style inline stats in SessionReview** — SessionReview Questions tab now shows all questions at once (removed prev/next navigation). Each question includes inline DistributionBars with option text and percentage fill. "Students" tab renamed to "Response Data".
- ✅ **Solution display in SecondDesktop** — When showCorrect is enabled, SecondDesktop now renders the solution text (consistent with student LiveSession behavior).

#### PR 123: Interactive Session Review & Rendering Compatibility Fixes

- ✅ **Student review compatibility with legacy records** — `GET /api/v1/sessions/:id/review` now normalizes legacy question fields (`solutionHtml`, `solutionText`, legacy correct-answer hints/flags) into review payloads so "Show solution" consistently reveals both correct answers and solution content.
- ✅ **Student review response UX** — Student responses are hidden by default and can be toggled per question. Multiple-attempt controls remain available and cycle the loaded attempt.
- ✅ **Student review answer rendering by type** — MC/MS/TF responses are overlaid directly on options (selected choices highlighted), while SA/NU responses continue to render as answer content (with rich-text math rendering for SA).
- ✅ **Legacy answer-shape resilience** — Option-answer resolution now supports numeric/string indices, letters, option IDs, rich-text text matching, object payloads, and delimited/JSON-like legacy values.
- ✅ **Short-answer live preview improvements** — SA input preview now shows full typed content (not only math-only cases), renders KaTeX, and uses debounced updates for smoother typing feedback.
- ✅ **Resizable SA input** — Student SA editor is vertically resizable (matching editor-style affordance for longer responses).
- ✅ **KaTeX re-render safety hardening** — `renderKatexInElement()` now avoids rewriting interactive DOM subtrees, preventing React event-handler detachment in containers that include inputs/buttons/labels.
- ✅ **Live-session solution gating** — Student live payload continues to withhold solution fields until `showCorrect` is enabled; when enabled, normalized solution fields are returned for consistent rendering.
- ✅ **Short-answer identity privacy by default** — Instructor live payload now omits raw responder identifiers by default, with optional `includeStudentNames=true` for control-view attribution only.
- ✅ **Professor review by attempt** — Session review now renders per-attempt rows for each question (attempts are clearly labeled and reported with per-attempt response counts/distributions).
- ✅ **Coverage expansion** — Added sessions route tests covering student solution gating in live payloads, instructor short-answer name opt-in behavior, and legacy review-field normalization.

#### PR 124: Interactive Session + Professor Editor Follow-up Fixes

- ✅ **Session review option rendering fix** — Professor SessionReview now prefers option rich text/content over legacy label fields, preventing duplicate A/B/C label rendering in MC/MS/TF views.
- ✅ **CSV export includes all attempts** — SessionReview CSV export now emits per-attempt response/points columns for each question (attempts are labeled explicitly, with one column pair per attempt).
- ✅ **SessionReview Students tab** — Added a new Students tab (to the right of Response Data) with avatars, roster-wide coverage, in-session indicator, and sortable columns for participation, percent correct (latest attempt), and joined timestamp.
- ✅ **Roster/join metadata in review payload** — `GET /api/v1/sessions/:id/results` now includes all course students (plus joined/responders), avatar fields, `inSession`, `joinedAt`, and normalized review questions for compatibility.
- ✅ **LiveSession control layout update** — Settings moved to the top action area beside End Session; control area reorganized into passcode row, toggle row (including Responses Open as a switch), and bottom nav row with Prev / New Attempt / Next.
- ✅ **LiveSession panel chips** — Top chips now switch between question/control view and a live “students currently in session” list with avatars and join times.
- ✅ **Professor SessionEditor safeguards (ended sessions + response data)** — Ended sessions now lock the question list behind an explicit unlock action; questions with response data cannot be deleted or have their type changed (UI + API enforcement).
- ✅ **Session editor accessible tooltips** — Added hover tooltips to key settings controls, including Require Passcode (“Students have to enter a passcode to enter.”).
- ✅ **Local validation for this PR** — `cd server && npm test` (122 tests passed) and `cd client && npm run build` succeeded.

**Known issues / future work:**
- ~~Rate limiting is not implemented on any route (CodeQL flags `js/missing-rate-limiting`).~~ ✅ Fixed: `@fastify/rate-limit` added on auth endpoints; `@fastify/helmet` added for security headers.
- Client has no unit tests. Playwright E2E tests should be added for interactive session flows.
- RequireAuth component now renders `<Outlet />` when no children provided (needed for routes outside AppLayout). This pattern should be kept consistent if more layout-free routes are added.
- See [Code Review Findings (2026-03-07)](#code-review-findings-2026-03-07) for comprehensive performance, security, accessibility, and i18n findings.

**Testable by human (all phases through Phase 5):**
- Log in as professor → create a course → click course title to view
- Students can enroll → student sees course in dashboard → click title to view
- Professor: add/remove students with confirmation dialog, avatars shown at far left
- Professor: toggle requireVerified and allowStudentQuestions settings
- Professor: Sessions tab shows list of sessions with status chips, create/copy/delete sessions
- Professor: Click session → session editor with settings, question list, add/edit/delete/reorder questions
- Student: Course page shows visible/running/done sessions with status chips
- Question editor supports all 5 types: Short Answer, Multiple Choice, True/False, Multi-Select, Numerical
- Question editor uses TipTap rich text editor with bold/italic/underline formatting toolbar
- Question editor supports inline `$...$` and block `$$...$$` KaTeX math rendering
- Question editor supports drag-and-drop image upload with resizable images
- Question editor autosaves while typing (no manual save button)
- Legacy questions with MathJax `<script type="math/tex">` tags render correctly in KaTeX
- Connection status: warning banner appears when backend is unreachable, disappears when restored
- Admin: see Verified column, click to verify email, see Last Login column
- Admin: **cannot change their own role** (dropdown is disabled with tooltip)
- Admin: Login Token Expiry (minutes) field with auto-save (default: 120 = 2 hours)
- Forgot password: click "Forgot Password?" → receive email → modal auto-closes with spam warning
- Email verification: click link in email → /verify-email/:token page → email marked verified
- Smart semester: create course dialog uses "Semester" label, Fall/Winter shows 2025/2026
- Course tiles: uniform size, bold dept+number, semester, wrapped name, section line
- Cross-tab auth: login in one tab → other tabs automatically show logged-in state
- Student can unenroll from a course (no more "Insufficient permissions" error)
- Student/instructor lists auto-refresh every 15 seconds
- API: POST/GET/PATCH/DELETE sessions and questions via REST endpoints
- **Professor: Launch session → live session page with toggle switch controls above the question**
- **Professor: See Meteor-style response bars with actual option text for MC/MS/TF questions**
- **Professor: See histogram for numerical questions, scrollable rendered list for short answers**
- **Professor: Real-time updates via WebSocket when students respond**
- **Professor: SecondDesktop opens as popup window, shows question + stats + solution**
- **Professor: Session review page shows all questions with inline stats, CSV export, "Response Data" tab**
- **Professor: Reviewable toggle only available when session has ended**
- **Student: Join session → see question → select/type answer → submit**
- **Student: SA answer input uses TipTap editor with math preview**
- **Student: See Meteor-style response bars with option text when prof enables stats**
- **Student: Join code entry for passcode-protected sessions**
- **Student: See solution when prof enables show correct**

**Important:** Always cross-check REQUIREMENTS_FOR_MIGRATION_FASTIFY.md before starting new work to ensure alignment with the master requirements.

---

## Code Review Findings (2026-03-07)

A comprehensive code review was conducted covering performance, security, accessibility, and internationalization. This section documents all findings, what has been fixed immediately ("low-hanging fruit"), and what must be addressed in future phases. Items are tagged by priority.

### Alignment with REQUIREMENTS_FOR_MIGRATION_FASTIFY.md

| Requirement | Status | Notes |
|---|---|---|
| Same functionality as MeteorJS | 🔄 In progress | Phases 1–6 complete (including grading). Groups and video remain (Phase 7). |
| Same database compatibility | ✅ Verified | Legacy DB restores work. Case-insensitive emails, argon2id migration, legacy field compat all applied. |
| Fewer dependencies / well-maintained | ✅ On track | Using Fastify ecosystem, MUI, custom chart components, TipTap, KaTeX. All actively maintained. |
| API-first design | ✅ Complete | 30+ REST endpoints + WebSocket. `@fastify/swagger` installed but not yet registered in app.js. |
| Fast with thousands of concurrent users | ✅ Optimized | Granular delta WebSocket events eliminate N+1 re-fetch pattern (~98% query reduction). `wsSendToUsers()` single-serialize broadcast. `.lean()` on all hot-path queries. |
| Docker Compose with load balancing | ✅ Complete | Production Docker Compose with Nginx reverse proxy. |
| SAML SSO | ✅ Implemented | SAML login/callback/metadata/logout endpoints in place. Needs production confirmation (Phase 7). |
| Unit tests from onset | ✅ 143 tests | 9 test files total: 8 server suites (auth, courses, sessions, questions, models, settings, grades routes, grading service) + 1 client grading UI test file. E2E (Playwright) not yet in place. |
| Image uploads (S3/Azure/local) | ✅ Complete | All three backends verified. |
| Email (password reset) | ✅ Complete | Nodemailer integration with forgot-password flow. |
| Reactive UI for interactive sessions | ✅ Production-ready | Granular delta WebSocket events for live sessions. Professor response-added uses throttled 2s re-fetch. Student submit updates local state. |
| Reactive course pages | ✅ WebSocket + Polling | Professor CourseDetail has WS push for session status events + 15-second polling for member list. Student CourseDetail has full WS + polling fallback. |
| Clean, uniform look (Material Design) | ✅ Complete | MUI theme with Helvetica font stack, consistent spacing, status chips. |

### Performance

#### ✅ Fixed: N+1 Query Pattern in Live Sessions

**Impact: HIGH — was blocking production use with large classes (30+ students)**

The `/sessions/:id/live` endpoint (`server/src/routes/sessions.js`) executes 6+ separate database queries per request:
1. Session lookup
2. Question lookup
3. Join records check
4. Response count
5. Response data for stats (when stats enabled)
6. Response data for individual student (when student role)

Previously, every WebSocket `session:updated` notification caused **every connected client** to re-fetch the entire live endpoint. With 30 students responding:
- 1 submission → server broadcasts `session:updated` to all 31 clients → 31 × 6 queries = **186 database queries per response**

**Fix applied:** Replaced generic `session:updated` messages with **granular delta events**:

| Event | Payload | Client Action | Status |
|---|---|---|---|
| `session:response-added` | `{ questionId, attempt, responseCount, joinedCount }` | Professor: update count + throttled 2s re-fetch. Sent only to instructors. | ✅ Done |
| `session:question-changed` | `{ questionId, questionIndex, questionNumber, questionCount }` | Full re-fetch for new question content | ✅ Done |
| `session:visibility-changed` | `{ questionId, hidden, stats, correct }` | Full re-fetch (students may need new question/stats) | ✅ Done |
| `session:status-changed` | `{ status }` | Update status, navigate if done | ✅ Done |

**Additional optimizations applied:**
- `wsSendToUsers()` serializes JSON once for all recipients (was re-serializing per user)
- `.lean()` added to all hot-path read-only queries (respond, current, visibility, start, join, etc.)
- Student submit updates local state from API response instead of full re-fetch
- joinedStudents sort uses pre-normalized values

**Result:** ~98% reduction in database queries during live sessions. With 30 students responding, previously ~5,580 queries/minute → now ~90 queries/minute.

#### ✅ Fixed: Duplicate Response Queries

When `showStats=true` in the live endpoint, responses were queried twice — once for the stats calculation and once for the student's individual response. Now merged into a single query; the student's response is extracted from the batch result.

#### ✅ Fixed: Course Page Polling

Professor CourseDetail now has WebSocket connection for session status change events (was polling-only). Student CourseDetail updated to handle new delta event types. Professor CourseDetail retains 15s polling for member list updates only (enrollment events don't have WS push yet).

### Security

#### ✅ Fixed (Low-Hanging Fruit — Applied in This Review)

| Issue | Severity | Fix Applied |
|---|---|---|
| **No rate limiting** on auth endpoints | CRITICAL | Added `@fastify/rate-limit` with 10 req/15 min on register, login, forgot-password, reset-password |
| **No security headers** | HIGH | Added `@fastify/helmet` (X-Content-Type-Options, X-Frame-Options, X-DNS-Prefetch-Control, etc.) |
| **ReDoS vulnerability** in search endpoints | HIGH | User input now escaped via `escapeForRegex()` before use in `new RegExp()` (courses.js, users.js) |
| **Weak password policy** (6 char min) | MEDIUM | Increased minimum to 8 characters across register, reset-password, change-password, admin-create-user |
| **No failed login logging** | MEDIUM | Failed login attempts now logged with `request.log.warn()` including email and userId |
| **No HTML sanitization** for `dangerouslySetInnerHTML` | HIGH | Added `dompurify` and centralized sanitization in `client/src/components/questions/richTextUtils.js` for all rich-text render paths |

#### Remaining (Must Address Before Production)

| Issue | Severity | Recommendation | Target Phase |
|---|---|---|---|
| **No CSRF protection** | HIGH | Add `@fastify/csrf-protection` for state-changing endpoints, or rely on SameSite cookies + custom header pattern | Phase 7/8 |
| **JWT access token in localStorage** | HIGH | Access token is stored in `localStorage` (vulnerable to XSS). Refresh token is correctly in httpOnly cookie. Consider moving access token to memory-only storage with automatic refresh, or to an httpOnly cookie. | Phase 7/8 |
| **SAML logout not cryptographically validated** | MEDIUM | `POST /sso/logout` manually parses XML without signature verification. Should use node-saml's built-in validation. | Phase 7 |
| **No refresh token rotation** | LOW-MEDIUM | Refresh tokens remain valid for 7 days without rotation. Implement one-time-use refresh tokens. | Phase 8 |
| **File upload content validation** | MEDIUM | MIME type is checked from the extension but not validated against file content (magic bytes). Add `file-type` library check. | Phase 7 |
| **No account lockout** | LOW-MEDIUM | After rate limiting is in place, consider adding temporary account lockout after repeated failed attempts. | Phase 8 |
| **Hardcoded dev secrets in config** | LOW | `config/index.js` has fallback `'dev-secret-change-me'` strings. These are blocked in production by the existing guard, but the fallbacks should be removed to force explicit configuration. | Phase 8 |

### Accessibility

#### Current State: Strong (Core hardening completed on 2026-03-07)

MUI components provide a strong baseline for accessibility (proper ARIA roles, keyboard focus management, semantic HTML elements). The high-priority accessibility items identified in the 2026-03-07 review are now implemented.

#### Good Practices Already in Place

- ✅ ARIA labels on icon-only buttons (LiveSession navigation, controls)
- ✅ MUI Dialog/Menu components with built-in focus trapping
- ✅ `prefers-reduced-motion` respected in Home.jsx canvas animation
- ✅ `aria-hidden="true"` on decorative elements
- ✅ Semantic form elements via MUI TextField/Select/Checkbox
- ✅ `CircularProgress` with `aria-label="Loading live session"`
- ✅ Rich text editors now include `role="textbox"`, `aria-multiline`, and labels (`RichTextEditor.jsx`, `StudentRichTextEditor.jsx`)
- ✅ Live session counters/status now expose polite live regions in both professor and student views
- ✅ App logo is now keyboard-accessible as a semantic button (`AppLayout.jsx`)
- ✅ Rich HTML is now sanitized with `dompurify` before storage/render, preserving safe semantic structure
- ✅ Table header semantics (`scope`, `th`) added to admin and session review tables
- ✅ Skip-to-content link added in app shell
- ✅ Route-level page titles set in `App.jsx`
- ✅ Focus is moved to main content on route transitions (with heading fallback for pages without app shell)

#### Remaining Recommendations

- Add automated accessibility regression checks (e.g., `axe-core` in Playwright/Vitest) to prevent regressions.

### Internationalization (i18n)

#### Current State: Not Implemented

There is no i18n framework installed. All user-facing text is hardcoded in English across ~50+ components. This includes:
- UI labels ("Dashboard", "Courses", "Login", "Draft", "Live", "Ended")
- Status messages ("Changes saved", "Logging in...", "Failed to load")
- Error messages ("Invalid email or password", "Email already registered")
- Date formatting (`client/src/utils/date.js` uses hardcoded English month abbreviations)
- Number formatting (uses `.toFixed(2)` without locale awareness)

#### Recommended Approach

1. **Phase 7:** Install `react-i18next` + `i18next`. Create `client/src/i18n/` with English translation file as baseline.
2. **Phase 7–8:** Extract all hardcoded strings to translation keys. Start with high-traffic pages (Login, Dashboard, LiveSession).
3. **Phase 8:** Switch `client/src/utils/date.js` from `MONTH_SHORT[]` array to `Intl.DateTimeFormat` for locale-aware date display.
4. **Phase 8:** Switch number formatting to `Intl.NumberFormat`.

#### Immediate Best Practice (No Framework Needed)

Until `react-i18next` is introduced, new UI text should be placed in **named constants at the top of files** (not buried inline in JSX). This makes future extraction mechanical. Example:

```jsx
// Good — easy to extract later
const LABELS = { save: 'Save', cancel: 'Cancel', delete: 'Delete' };
// ...
<Button>{LABELS.save}</Button>

// Avoid — hard to find and extract
<Button>Save</Button>
```

### Legacy Database Compatibility Check

All findings from this review are consistent with the existing legacy compatibility work:

- ✅ Meteor-style string `_id` fields preserved in all models
- ✅ Case-insensitive email lookup via `emailRegex()` utility
- ✅ Legacy `services.password.bcrypt` triggers password-reset-required flow
- ✅ Legacy question types normalized via migration script
- ✅ Settings model uses `strict: false` to preserve extra legacy fields
- ✅ Image model has optional fields for legacy compatibility
- ⚠️ Group categories shape mismatch (`groupNumber/groupName/students` vs `name/members`) — noted in Phase 7 tasks
- ⚠️ `meteor_accounts_loginServiceConfiguration` collection has no equivalent model — decide if needed or can be deprecated

### Summary of Actions

| Category | Fixed Now | Remaining Items | Target |
|---|---|---|---|
| **Performance** | ✅ Delta WS, ✅ query dedup, ✅ WS push for course pages | Client bundle code-splitting | Phase 7 (major optimizations complete) |
| **Security** | Rate limiting, helmet, ReDoS, passwords, login logging, HTML sanitization | CSRF, localStorage token, SAML validation, token rotation, file magic bytes | Phases 7–8 |
| **Accessibility** | ARIA on editors, aria-live regions, semantic logo, table headers, skip link, page titles, route focus management | Add automated accessibility regression tests (axe-core) | Phase 7 |
| **i18n** | — | Install react-i18next, extract strings, locale-aware formatting | Phases 7–8 |
| **Legacy DB** | All known issues addressed | Group categories shape, loginServiceConfiguration decision, missing indexes | Phase 7 |
| **Documentation** | README ✅, grading docs ✅ | Swagger registration, complete developer guide, complete user manual | Phases 7–8 |
| **Testing** | 141 server + 2 client unit tests | Playwright E2E, CI pipeline, component tests, legacy DB compat tests | Phase 7–8 |
