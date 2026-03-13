# Qlicker Migration — Completed Work Archive

> **Purpose:** This document archives completed phases, bug fixes, detailed PR notes, and historical implementation details that have been moved out of [MIGRATION.md](MIGRATION.md) to keep the active migration plan focused and actionable.

---

## Table of Contents

1. [Completed Milestones Summary](#completed-milestones-summary)
2. [Phase 1 — Foundation](#phase-1--foundation)
3. [Phase 2 — Profile & Images](#phase-2--profile--images)
4. [Phase 3 — Courses](#phase-3--courses)
5. [Phase 4 — Sessions & Questions](#phase-4--sessions--questions)
6. [Phase 5 — Live Sessions & Quizzes](#phase-5--live-sessions--quizzes)
7. [Phase 6 — Grading](#phase-6--grading)
8. [Phase 7 — Groups, Video, i18n (Completed Items)](#phase-7--groups-video-i18n-completed-items)
9. [Bug Fix History](#bug-fix-history)
10. [PR History](#pr-history)
11. [Legacy Compatibility Fixes](#legacy-compatibility-fixes)
12. [UI Updates History](#ui-updates-history)
13. [Code Review Findings (2026-03-07) — Fixed Items](#code-review-findings-2026-03-07--fixed-items)
14. [Code Review Findings (2026-03-12) — Fixed Items](#code-review-findings-2026-03-12--fixed-items)

---

## Completed Milestones Summary

| Milestone | Status | Phase |
|-----------|--------|-------|
| 1. Login works | ✅ Complete | Phase 1 |
| 2. Profile & uploads | ✅ Complete | Phase 2 |
| 3. Course management | ✅ Complete | Phase 3 |
| 4. Session editor | ✅ Complete | Phase 4 |
| 6. Live sessions & quizzes | ✅ Complete | Phase 5 |
| 7. Grading | ✅ Complete | Phase 6 |

---

## Phase 1 — Foundation

**Goal:** Working app where users can create accounts, log in, manage roles.

### Agent Work Completed

| Agent | Tasks Completed |
|-------|----------------|
| 1 | Project scaffolding, Docker setup, scripts, DB connection, .env config |
| 2 | User model, auth routes (register, login, logout), JWT, password reset, email verification, admin role logic, first-user-is-admin |
| 7 | React app scaffold, MUI theme, login page, registration form, admin panel shell, user management UI |
| 8 | Test infrastructure (Vitest), CI pipeline skeleton |

---

## Phase 2 — Profile & Images

**Goal:** Users can update profile pictures. Image upload works with Azure, S3, and local storage.

### Agent Work Completed

| Agent | Tasks Completed |
|-------|----------------|
| 1 | File upload plugin (S3, Azure, local), image routes |
| 2 | SAML SSO implementation, legacy DB user loading |
| 7 | Profile page, image upload UI, admin image settings UI, admin SSO settings UI |
| 8 | Profile update flow tests, image upload tests |

---

## Phase 3 — Courses

**Goal:** Professors can create courses. Students can enroll/unenroll. TA roles work.

### Detailed Progress

| Component | Task | Status |
|-----------|------|--------|
| Backend | Course CRUD routes | ✅ Complete |
| Backend | Enrollment by code | ✅ Complete |
| Backend | Student management (add/remove) | ✅ Complete |
| Backend | Instructor/TA management | ✅ Complete |
| Backend | Enrollment code regeneration | ✅ Complete |
| Backend | Active/inactive toggle | ✅ Complete |
| Backend | Populate user data in course detail | ✅ Complete |
| Backend | Enforce requireVerified on enrollment | ✅ Complete |
| Frontend | Professor Dashboard with course list and create dialog | ✅ Complete |
| Frontend | Student Dashboard with enrollment | ✅ Complete |
| Frontend | Professor Course Detail (students, instructors, settings tabs) | ✅ Complete |
| Frontend | Student Course Detail with unenroll | ✅ Complete |
| Frontend | Clickable course titles, smart semester pre-fill | ✅ Complete |
| Testing | Course routes unit tests (21 tests) | ✅ Complete |

---

## Phase 4 — Sessions & Questions

**Goal:** Session/quiz creation, question editing with TipTap/KaTeX, extensions.

### Detailed Progress

| Component | Task | Status |
|-----------|------|--------|
| Backend | Session CRUD routes | ✅ Complete |
| Backend | Session lifecycle (start, end, current question) | ✅ Complete |
| Backend | Session copy, reviewable toggle, quiz extensions | ✅ Complete |
| Backend | Question CRUD routes | ✅ Complete |
| Backend | Question session management (add/remove/reorder) | ✅ Complete |
| Backend | Question session options | ✅ Complete |
| Backend | Question library (copy to library, copy to session) | ✅ Complete |
| Frontend | Session editor page (TipTap, KaTeX, resizable images, autosave) | ✅ Complete |
| Frontend | Session list on course pages | ✅ Complete |
| Frontend | Question editor components (all 5 types) | ✅ Complete |
| Testing | Session routes unit tests (20 tests) | ✅ Complete |
| Testing | Question routes unit tests (19 tests) | ✅ Complete |

### TipTap/KaTeX Integration

- Replaced MathJax with KaTeX for math rendering
- Replaced plain text fields with TipTap rich text editor
- Question editor autosave (inline editing, no manual save)
- Resizable image support in TipTap editor
- Legacy math conversion (`<script type="math/tex">` → KaTeX `$...$`/`$$...$$`)
- Canonical question type mapping aligned to Meteor (MC=0, TF=1, SA=2, MS=3, NU=4)

---

## Phase 5 — Live Sessions & Quizzes

**Goal:** Interactive sessions and quizzes fully functional with real-time updates.

### Key Deliverables

- **10 new session API endpoints** — start, join, live, respond, question-visibility, new-attempt, toggle-responses, refresh-join-code, join-code-settings, results
- **Session model extensions** — joinCodeEnabled, joinCodeActive, currentJoinCode, joinRecords array
- **Response model** — Compound indexes on `(questionId, studentUserId, attempt)` and `(questionId, attempt)`
- **Professor LiveSession** — WebSocket real-time, question navigation, toggle controls, join code, end session
- **Professor SecondDesktop** — Projector popup, auto-close on session end
- **Professor SessionReview** — Questions/Students tabs, distributions, CSV export
- **Student LiveSession** — Auto-join or passcode entry, answer controls, stats/correct views
- **Student QuizSession** — Autosave, submit, practice mode, per-question solution reveal
- **WebSocket delta events** — `session:response-added`, `session:question-changed`, `session:visibility-changed`, `session:status-changed`
- **Quiz runtime** — Full quiz participation (autosave, practice-question submit/lock, final submission lockout)
- **Time-window enforcement** — Per-student extensions, UTC timestamps, auto-close

### PR Details

#### PR 119: Interactive Sessions (Full Live Session System)
Full live session system with 10 API endpoints, session model extensions, professor/student UI, WebSocket events, response distribution calculation.

#### PR 120: Interactive Session Refinements
Token expiry (admin-adjustable), Meteor-style response bars, numerical histogram, short answer TipTap editor.

#### PR 121: Interactive Session Improvements (UI Overhaul & Passcode Join Tracking)
SecondDesktop popup, option text in stats bars, toggle switches, visibility persistence, reviewable enforcement, passcode join lifecycle.

#### PR 123: Interactive Session Review & Rendering Compatibility Fixes
Student review compatibility, legacy answer-shape resilience, SA preview improvements, KaTeX re-render safety.

#### PR 124: Interactive Session + Professor Editor Follow-up Fixes
Session review option rendering fix, CSV per-attempt export, Students tab, LiveSession layout update.

---

## Phase 6 — Grading

**Goal:** Full grading system — auto/manual grading, grade tables, CSV export, session review.

### Key Deliverables

- **Grading service** (`server/src/services/grading.js`): Auto-grading MC/TF/MS/NU, manual overrides, conflict reporting, participation, attempt weighting, MS scoring methods
- **8 grade API endpoints**: recalculate, get session/course grades, visibility, mark/grade editing, set-automatic
- **Frontend**: Course-level Grades tab, session Grading tab, manual editing, recalculate, CSV export, conflict resolution
- **Grade calculation rules**: Legacy-compatible point defaults, low-response exclusion, manual override preservation
- **Multiple-select scoring**: `right-minus-wrong` (default), `all-or-nothing`, `correctness-ratio`
- **Feedback flow**: Per-mark feedback with timestamps, student notification chips, dismiss endpoint

### Phase 6 Follow-Up Fixes (2026-03-09)

- Student session review emphasizes session-level grading
- Debounced grading feedback editor
- Student course Settings tab with unenroll
- Ungraded labeling in student vs instructor views
- Grading test coverage: legacy point defaults, zero-point exclusion

### Grading UX Improvements (2026-03-11)

- Grade table hidden by default with session-picker modal
- Recalculation progress and auto-refresh
- Conflict review modal with question display and accept/save actions
- Per-mark feedback timestamps and student notification flow
- Legacy msScoringMethod backfill via `ensureSessionMsScoringMethod()`
- Defensive array access hardening (`|| []` fallbacks)
- Student quiz state chips and progress tracking
- Numerical tolerance display consistency

---

## Phase 7 — Groups, Video, i18n (Completed Items)

### ✅ Group Management
- Full group API: 10 endpoints (CRUD categories, groups, membership, CSV import/export)
- GroupManagementPanel UI with StudentListItem/StudentInfoModal
- Legacy normalization (`groupNumber/groupName/students` → `name/members`)
- Group filter in grading interface
- 17 backend tests

### ✅ Video Chat (Jitsi) Integration
- Admin panel: Jitsi enable/disable, domain configuration, per-course enabling
- Professor: Video tab with enable/disable toggles, API options, participant tracking, clear rooms
- Student: Video tab with join buttons for course-wide and group chats, help button
- JitsiWindow popup: Dynamic API loading, join/leave tracking, tile view management
- Server: 13 video API endpoints, WebSocket notifications
- 18 video route tests

### ✅ WebSocket Delta Messages (Performance)
- Replaced generic `session:updated` with granular delta events
- `session:response-added`, `session:question-changed`, `session:visibility-changed`, `session:status-changed`
- `wsSendToUsers()` for single-serialize broadcast
- ~98% reduction in DB queries during live sessions

### ✅ Course Page WebSocket Push
- Professor CourseDetail WebSocket connection for session status events
- Student CourseDetail handles delta events
- Professor retains 15s polling for member list only

### ✅ Legacy DB Indexes
- Added to User, Question, Session, Grade, Image models

### ✅ i18n Framework
- `react-i18next` with 879 translation keys (en/fr)
- Admin locale selector, per-user locale override on Profile page
- All 30+ components wired with `useTranslation()` hook

---

## Bug Fix History

### Phase 2 Bug Fixes

| Issue | Fix | Status |
|-------|-----|--------|
| No "Forgot Password" button on login | Added forgot password dialog | ✅ Fixed |
| ResetPassword page was a stub | Implemented full reset password flow | ✅ Fixed |
| Profile picture upload not working in dev | Added /uploads proxy to vite.config.js and nginx.conf | ✅ Fixed |
| SSO users could change their name | Server blocks name changes; UI disables fields | ✅ Fixed |
| Hardcoded port numbers throughout | All ports use env variables with fallback defaults | ✅ Fixed |

### Phase 3+ Bug Fixes

| Issue | Fix | Status |
|-------|-----|--------|
| Password reset URL mismatch | Email now sends `/reset/:token` matching App.jsx route | ✅ Fixed |
| Email verification route missing | Added `/verify-email/:token` route and VerifyEmail page | ✅ Fixed |
| Course members showing "Unknown" | Backend populates student/instructor data | ✅ Fixed |
| Course titles not clickable | Titles now navigate to course detail page | ✅ Fixed |
| Create course: no semester pre-fill | Smart season suggestion + dropdown | ✅ Fixed |
| Admin: no email verified column | Added Verified column with clickable verify toggle | ✅ Fixed |
| Admin: no last login tracking | Added lastLogin field | ✅ Fixed |
| SSO users email not auto-verified | SSO login marks email as verified | ✅ Fixed |
| Password reset modal UX | Modal auto-closes after 5s, warns about spam | ✅ Fixed |
| Admin can change their own role | Server returns 403; UI disables with tooltip | ✅ Fixed |
| Cross-tab login not synced | Storage event listener in AuthContext | ✅ Fixed |
| Prof course page: no avatars | Avatar at far left of each row | ✅ Fixed |
| Prof course page: no removal confirmation | Confirmation dialogs added | ✅ Fixed |
| Prof course page: no reactive updates | 15-second polling interval | ✅ Fixed |
| Student unenroll: "Insufficient permissions" | Server allows self-unenroll | ✅ Fixed |
| Create course: "Season" label | Changed to "Semester" | ✅ Fixed |
| Course tiles: inconsistent sizing | Fixed card sizes | ✅ Fixed |
| No connection status feedback | ConnectionStatus component polls /health | ✅ Fixed |

---

## Legacy Compatibility Fixes

| Fix | Files Changed | Description |
|-----|---------------|-------------|
| Case-insensitive email lookup | auth.js, users.js, email.js | All email lookups use `emailRegex()` |
| Client auth interceptor | api/client.js | 401 from `/auth/*` not intercepted by refresh logic |
| Image model compatibility | Image.js | `key`, `type`, `size` made optional |
| Settings model compatibility | Settings.js | Legacy field names + `strict: false` + virtual getters |
| Upload plugin compatibility | upload.js | Checks both new and legacy field names |
| Response model `mark` field | Response.js | Added `mark: { type: Number }` for legacy grading |
| Password hashing modernization | password.js, User.js, auth.js, users.js, seed-db.js | Argon2id for new hashes, reset-required for legacy bcrypt |
| MS scoring method backfill | grading.js, sessions.js, grades.js | `ensureSessionMsScoringMethod()` auto-normalizes on access |
| Feedback field defaults | Grade.js | `feedbackUpdatedAt`/`feedbackSeenAt` default to null |
| Defensive array access | sessions.js, grades.js | `|| []` fallbacks on all array accesses from `.lean()` |
| Seed script alignment | seed-db.js, seed-db.sh, seed-db-docker.sh | `--reset` leaves DB empty; default seeds 3 users |

---

## UI Updates History

- Professor dashboard: active courses first, newest first
- Course tiles: fixed-width cards for consistent wrapping
- Professor course header: compact, starts with course identity
- Professor tabs: Interactive Sessions, Quizzes, Students, Instructors, Settings
- Session rows: stronger hover feedback, live sessions first
- Session editor: user-facing status labels (Draft/Upcoming/Live/Ended)
- Session editor: session date field for non-quiz sessions
- Legacy question rendering: canonical type mapping, HTML content, KaTeX formulas
- Auto-save: session settings and question editor auto-save on change
- New question dialog: blank Multiple Choice with two empty options
- Drag-and-drop images: resizable in TipTap canvas
- Session status changes: explicit confirmation required
- Dynamic question numbering in session editor
- MC/MS option labels: horizontally aligned with content
- Date display: standardized to DD-Mmm-YYYY
- App bar Dashboard button: larger, offset right

---

## Code Review Findings (2026-03-07) — Fixed Items

### Performance — Fixed

| Issue | Fix |
|-------|-----|
| N+1 query pattern in live sessions | Delta WebSocket events eliminate per-client re-fetch |
| Duplicate response queries | Single query with student response extracted from batch |
| Course page polling | WebSocket push for session status events |

### Security — Fixed

| Issue | Severity | Fix |
|-------|----------|-----|
| No rate limiting on auth endpoints | CRITICAL | `@fastify/rate-limit` with 10 req/15 min |
| No security headers | HIGH | `@fastify/helmet` added |
| ReDoS vulnerability in search | HIGH | `escapeForRegex()` utility |
| Weak password policy (6 char min) | MEDIUM | Increased to 8 characters |
| No failed login logging | MEDIUM | `request.log.warn()` with email/userId |
| No HTML sanitization | HIGH | `dompurify` + `richTextUtils.js` for all render paths |

### Accessibility — Fixed

| Item | Fix |
|------|-----|
| Rich text editor ARIA | `role="textbox"`, `aria-multiline`, labels |
| Live session counters | Polite live regions in prof/student views |
| App logo keyboard access | Semantic button |
| Table header semantics | `scope`, `th` added |
| Skip-to-content link | Added in app shell |
| Route-level page titles | Set in App.jsx |
| Focus on route transitions | Moved to main content |

---

## Code Review Findings (2026-03-12) — Fixed Items

### Security — Fixed

| Issue | Severity | Fix |
|-------|----------|-----|
| No CSRF protection | HIGH | Custom header pattern (`X-Requested-With`) with CORS enforcement |
| JWT access token in localStorage | HIGH | Moved to in-memory storage with httpOnly cookie refresh |
| SAML logout not validated | MEDIUM | node-saml `validatePostRequestAsync` attempted first; XML fallback retained |
| File upload no magic bytes check | MEDIUM | `file-type` library validates file content |
| Settings PATCH no field whitelist | HIGH | Explicit allowed-fields whitelist prevents injection |
