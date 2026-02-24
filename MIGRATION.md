# Qlicker Migration Guide

## Overview

This document explains the migration from Meteor.js to a modern Node.js/React 18 stack.
Both stacks share **the same MongoDB database** — no data migration required.

---

## Migration Strategy and Phases

### Phase 1 — Scaffold new stack (this PR)
- Set up monorepo with npm workspaces (`packages/shared`, `packages/server`, `packages/client`)
- Shared TypeScript types and Zod validation schemas (migrated from `imports/api/*.js` patterns)
- Express + Socket.IO backend scaffold with all API routes
- React 18 + Vite frontend scaffold with React Router v6
- Docker-compose for development with MongoDB replica set

### Phase 2 — Feature parity
- Migrate all React components from `imports/ui/` to `packages/client/src/components/`
- Replace `withTracker` with `useRealtimeCollection` hook
- Replace `Meteor.call` with `useApi` hook
- Connect all REST endpoints to real business logic (copying from `imports/api/`)

### Phase 3 — Cut-over
- Run both apps in parallel against the same database
- Validate feature parity
- Switch traffic to new stack
- Decommission Meteor app

---

## Running the Apps

### Old Meteor app (unchanged)
```bash
meteor --settings settings.json
```

### New stack
```bash
# Development (both server and client)
npm run dev

# Or individually
npm run dev:server    # Express on :3001
npm run dev:client    # Vite on :3000

# Production with Docker
docker-compose up
```

---

## Database Backwards Compatibility

Both stacks connect to the **same MongoDB database** using the same collection names:

| Collection | Meteor | New stack |
|------------|--------|-----------|
| `users` | `Meteor.users` | `getUsers()` |
| `courses` | `Courses` | `getCourses()` |
| `sessions` | `Sessions` | `getSessions()` |
| `questions` | `Questions` | `getQuestions()` |
| `responses` | `Responses` | `getResponses()` |
| `grades` | `Grades` | `getGrades()` |
| `images` | `Images` | `getImages()` |
| `settings` | `Settings` | `getSettings()` |

### Critical: `_id` format
Meteor uses string `_id` values (not MongoDB `ObjectId`). The new stack preserves this by
using plain string queries. New server inserts now generate string `_id` values explicitly (see `packages/server/src/utils/id.ts`) so new records remain Meteor-compatible and no `ObjectId` values are introduced by the migrated stack.

---

## Auth Compatibility

### Password hashes
Meteor stores bcrypt hashes in `user.services.password.bcrypt`.
The new `passport-local` strategy reads this same field:

```typescript
// packages/server/src/auth/setup.ts
const hash = user.services?.password?.bcrypt
const valid = await bcrypt.compare(password, hash)
```

Users can log in with the same password on both systems without any changes.

### SAML SSO
The new SAML strategy in `packages/server/src/auth/setup.ts` reads the same
settings from the `settings` MongoDB collection that `server/saml_server.js` uses.

### Session storage
New stack uses `connect-mongo` to store Express sessions in MongoDB,
which is separate from Meteor's session management.

---

## Reactivity: Change Streams vs DDP

| Meteor DDP | New stack |
|-----------|-----------|
| `Meteor.subscribe('responses.forQuestion', id)` | `socket.emit('subscribe:responses', { questionId: id })` |
| `withTracker(() => ({ session: Sessions.findOne(...) }))` | `useRealtimeCollection({ subscribeEvent: 'subscribe:session', ... })` |
| One subscription cursor per client | One shared Change Stream per collection, fanned out |

### Why shared Change Streams?
At thousands of concurrent users, opening one MongoDB Change Stream per client would
exhaust the oplog cursor budget. Instead, we open **one Change Stream per collection**
and route events to clients via Socket.IO EventEmitter routing keys.

---

## Environment Variables

Both stacks use the same environment variable names for compatibility:

| Variable | Description |
|----------|-------------|
| `ROOT_URL` | Public URL of the app |
| `MONGO_URL` | MongoDB connection string (must include `?replicaSet=rs0`) |
| `MAIL_URL` | SMTP URL for email |
| `SESSION_SECRET` | Secret for express-session (new stack only) |
| `PORT` | Port for Express server (default: 3001) |

See `packages/server/.env.example` for a complete template.

---

## MongoDB Replica Set Requirement

Change Streams require a MongoDB replica set.
The existing Docker deployment already uses a replica set (per README).

For local development without Docker:
```bash
# Initialize a single-node replica set
mongod --replSet rs0 --bind_ip_all
mongosh --eval "rs.initiate()"
```

---

## React Component Migration Status

### Pages (`packages/client/src/pages/`)

All pages have been ported from `imports/ui/pages/` to modern React 18 functional components with TypeScript and hooks.

| Page | Original (Meteor) | New (React 18) | Status |
|------|-------------------|----------------|--------|
| Login | `LoginBox.jsx` + `login.jsx` | `Login.tsx` | ✅ Login + signup, SSO, role-based redirect |
| Home | `home.jsx` | `Home.tsx` | ✅ Redirects to role-based dashboard |
| Profile | `profile.jsx` | `Profile.tsx` | ✅ Name/SN editing, email verification, password change |
| Student Dashboard | `student_dashboard.jsx` | `Student.tsx` | ✅ Enrollment form, active/inactive courses |
| Professor Dashboard | `professor_dashboard.jsx` | `Professor.tsx` | ✅ Create course, manage courses |
| Admin Dashboard | `admin_dashboard.jsx` | `Admin.tsx` | ✅ Tabbed: users (CRUD), main/image/SSO/video settings with save flows |
| Manage Courses | `manage_courses.jsx` | `ManageCourses.tsx` | ✅ Active/inactive toggle, delete, create |
| Course Detail | `course.jsx` + `manage_course.jsx` | `Course.tsx` | ✅ Role-based view (instructor vs student), sessions, quizzes |
| Session | `session.jsx` | `Session.tsx` | ✅ Question navigation, answer options display |
| Run Session | `run_session.jsx` | `RunSession.tsx` | ✅ Status controls, question navigation |
| Manage Session | `manage_session.jsx` | `ManageSession.tsx` | ✅ Edit name/description, quiz settings |
| Grade Session | `grade_session.jsx` | `GradeSession.tsx` | ✅ Grades table with points |
| Course Grades | `course_grades.jsx` | `CourseGrades.tsx` | ✅ Course-wide grades table |
| Questions Library | `questions_library.jsx` | `QuestionsLibrary.tsx` | ✅ Question list + create/edit/delete basics |
| Session Results | `results.jsx` | `SessionResults.tsx` | ✅ Per-question response statistics |
| Replay Session | `replay_session.jsx` | `ReplaySession.tsx` | ✅ Session replay with correct answers |
| Results Overview | `results_overview.jsx` | `ResultsOverview.tsx` | ✅ Course list with grade links |
| Course Groups | `manage_course_groups.jsx` | `ManageCourseGroups.tsx` | ✅ Group category management |
| Reset Password | `reset_password.jsx` | `ResetPassword.tsx` | ✅ Forgot password + token-based reset |

### Shared Components (`packages/client/src/components/`)

| Component | Original (Meteor) | New (React 18) | Status |
|-----------|-------------------|----------------|--------|
| CourseListItem | `CourseListItem.jsx` + `ListItem.jsx` | `CourseListItem.tsx` | ✅ Ported |
| SessionListItem | `SessionListItem.jsx` | `SessionListItem.tsx` | ✅ Ported (simplified) |
| CreateCourseModal | `modals/CreateCourseModal.jsx` | `CreateCourseModal.tsx` | ✅ Ported |

### Pattern Replacements

| Meteor Pattern | New Pattern | Status |
|----------------|-------------|--------|
| `withTracker` HOC | `useRealtimeCollection` hook | ✅ Hook ready, used where needed |
| `Meteor.call()` | `apiClient` / `useApi` hook | ✅ All page-level API calls migrated |
| `Meteor.loginWithPassword()` | `useAuth().login()` | ✅ |
| `Accounts.createUser()` | `useAuth().register()` | ✅ |
| `Meteor.loginWithSaml()` | Redirect to `/api/auth/saml` | ✅ |
| `Router.go()` | `useNavigate()` / `Link` | ✅ |
| Class components | Functional components + hooks | ✅ |
| JavaScript | TypeScript | ✅ |

### CSS / Styling

- [x] Comprehensive CSS ported from original SCSS to `packages/client/src/styles/index.css`
- [x] Original class names preserved (`.ql-card`, `.ql-header-bar`, `.ql-login-box`, etc.)
- [x] Responsive grid system (`.container`, `.row`, `.col-md-*`)
- [x] Session status colors (hidden/visible/running/done/submitted)
- [x] Modal overlay styles
- [x] Admin toolbar styles

---

## Feature Parity Checklist

### Authentication
- [x] Email/password login (bcrypt compatible with Meteor hashes)
- [x] SAML SSO login
- [x] Registration (with signup form in Login page)
- [x] Password reset (forgot password + token-based reset UI)
- [x] Email verification request + token verification endpoint (`POST /api/users/verify-email`, `GET /api/users/verify-email/:token`)
- [x] SMTP delivery attempt using `MAIL_URL` (falls back to logged verification URL if mail transport unavailable)

### Courses
- [x] Create/edit/delete courses
- [x] Student enrollment (via enrollment code)
- [x] Instructor management
- [x] Group categories and video chat

### Sessions
- [x] Create/edit/delete sessions
- [x] Session status management (hidden/visible/running/done)
- [x] Quiz mode
- [x] Quiz submission
- [x] Quiz extensions (session-level extension rows editable in `ManageSession`)

### Questions
- [x] Create/edit/delete questions
- [x] MC, TF, SA, MS, NU question types
- [x] Session options (hidden, stats, correct, points, attempts)
- [x] Question library UI
- [x] Rich text editor component for question/solution authoring
- [x] Content sanitization for rendered question/solution HTML in React pages

### Responses
- [x] Submit responses
- [x] Privacy-aware response visibility (mirrors DDP publication logic)
- [x] Rate limiting

### Grades
- [x] Read grades (role-aware)
- [x] Update grades (instructor only)
- [x] Toggle visibility to students
- [x] Auto-grade calculation (objective question types + persisted marks/aggregates)

### Real-time
- [x] Response change streams
- [x] Session change streams
- [x] Question change streams
- [x] Grade change streams

### File uploads
- [x] Multer integration
- [x] S3 upload adapter (`@aws-sdk/client-s3`)
- [x] Azure Blob upload adapter (`@azure/storage-blob`)
- [x] Profile image upload UI wired to `/api/images` and `users.profile.profileImage`

#### Agent 03 Lane Status (Profile Image Upload + Storage Backend)
- [x] Ported `DragAndDropArea` behavior into `packages/client` with image-type filtering, max-files handling, drag/drop, and click-to-select fallback.
- [x] Wired profile image replace flow on `Profile.tsx` to the new drop area and preserved updates to `users.profile.profileImage` and `users.profile.profileThumbnail`.
- [x] Confirmed storage adapters continue honoring existing `settings` keys for `storageType`, AWS, and Azure in `packages/server/src/utils/image-storage.ts`.
- [x] Expanded `scripts/migration-smoke.mjs` seeded-user end-to-end checks to validate multipart profile image upload (`/api/images`) and profile persistence (`/api/users/:id/profile`).
- [x] Required checks run:
  - `npm run build --workspace=packages/server`
  - `npm run build --workspace=packages/client`
  - Seeded end-to-end smoke: start server + `./seed-mock-db.sh` + `npm run test:migration-smoke` (passed, including new profile upload assertions)

### Admin
- [x] User management (list, role change, delete)
- [x] Settings management
- [x] SSO configuration UI
- [x] Image settings UI
- [x] Video chat settings UI

---


## Next Steps


### Coordination Notes
- Detailed migration audit snapshot: `docs/migration-audit.md`
- Multi-agent parallel execution plan: `agent-plans/README.md` and `launch-migration-agents.sh`

### Handoff Checklist (new machine)
Run this first before any parallel work:

```bash
git fetch --all --prune
git checkout master
git pull --ff-only origin master
```

Then verify the current parity baseline:

```bash
docker compose build
docker compose up -d
./seed-mock-db.sh
npm run test:migration-smoke
```

If smoke fails, fix baseline on `master` first before opening new agent branches. The smoke script now fails fast with a clear preflight error if the Express server is not reachable.

### Current Migration State (for resuming work)
- Parallel lane rollup has now landed on the integration branch and includes:
  - Question/response UI parity work (`QuestionDisplay`, `QuestionEditItem`, `QuestionDisplay` + `QuestionEditItem` tests, session/replay/run page integration)
  - Quiz/session lifecycle parity updates (`QuizExtensionsModal`, expanded session/response/grade route behavior, weighted-attempt grading logic)
  - Profile image parity updates (React drag/drop area, profile image replace flow, smoke coverage for multipart upload + profile persistence)
  - Video/Jitsi parity baseline (`VideoChat` + new `JitsiWindow` page, expanded course video-chat endpoints and group connection payloads)
  - Expanded migration harness (`seed-mock-db.sh` + `scripts/migration-smoke.mjs`) with broader professor/student/admin parity checks
- Validation run on the assembled rollup:
  - `npm run build --prefix packages/shared`
  - `npm run build --workspace=packages/server`
  - `npm run build --workspace=packages/client`
  - `npm run test --workspace=packages/client` (Vitest)
  - `./seed-mock-db.sh`
  - `QCLICKER_BASE_URL=http://localhost:3101 npm run test:migration-smoke` (with server running on `:3101`)
- Known remaining gaps before cutover:
  - Some legacy modal/interaction edge-cases in `imports/ui/modals/*` are still not explicitly parity-audited
  - Server route-level automated tests remain thinner than desired for new session/grade/video behavior
  - Realtime/performance validation under load is still pending
  - Final cutover runbook should include explicit rollback drill and side-by-side verification checklist

### Parallel Agent Plan (next wave)
Use 4 focused agents in parallel for final parity hardening. Keep each PR narrow and independently mergeable.

#### Agent 1 — Modal + UX Edge Parity
- Scope:
  - Audit remaining legacy modal flows from `imports/ui/modals/` and map to React equivalents
  - Close keyboard/cancel/submit behavior gaps and remove dead modal actions/routes
- Acceptance:
  - Modal parity matrix complete (ported/deprecated/merged list)
  - No broken modal entry points from current pages

#### Agent 2 — Realtime + Performance Validation
- Scope:
  - Validate socket subscription fan-out and change-stream behavior under concurrent usage
  - Add/verify indexes for the hottest response/session/grade/course queries
  - Document load test setup + observed update latency
- Acceptance:
  - No per-client change stream regressions
  - Performance report checked into `docs/`

#### Agent 3 — Route-Level Regression Tests
- Scope:
  - Add focused server tests for session lifecycle, quiz submission/join rules, grade visibility/calc, and video-chat connection endpoints
  - Capture current expected behavior for parity-sensitive edge cases
- Acceptance:
  - Repeatable server test command with deterministic pass/fail output
  - Core parity behaviors encoded as automated tests

#### Agent 4 — Cutover + Rollback Readiness
- Scope:
  - Write final production cutover checklist and rollback procedure
  - Add side-by-side verification script/checklist for Meteor vs Express stack parity signoff
- Acceptance:
  - Operator-ready runbook committed in `docs/`
  - Explicit go/no-go criteria with rollback trigger points

### Agent Execution Protocol
1. Run `./launch-migration-agents.sh`.
2. Assign one lane above per agent/worktree.
3. Each agent rebases onto latest `origin/master` before coding and before opening PR.
4. Each PR must include:
   - Updated `MIGRATION.md` status bullets for the lane
   - Commands used to validate changes
   - Explicit list of Meteor behaviors matched
5. Merge order:
   - Agent 5 test harness PR first if it only adds tests/helpers.
   - Then independent UI/server lanes.
   - Rebase dependent lanes after each merge to avoid conflict piles.

### Remaining Priorities
1. **Advanced components**: Finish rich `QuestionDisplay`/`ResponseDisplay` parity and wire all session/grade pages to shared components.
2. **Editor hardening**: Complete toolbar parity and broaden conversion/security regression tests.
3. **Full test coverage**: Add route + component tests for all migrated critical paths.
4. **Performance validation**: Prove reactive behavior under concurrent load with documented benchmark run.


## Mock Data Seeding for Migration Testing

A helper script is available at the repository root to initialize a compatible mock dataset in MongoDB:

```bash
./seed-mock-db.sh
```

By default it connects to `mongodb://localhost:27017/qlicker?replicaSet=rs0` and upserts:

- `prof@gmail.com` (role: professor)
- `student1@gmail.com` (role: student)
- `student2@gmail.com` (role: student)
- `admin@gmail.com` (role: admin)

All accounts are created with password `12345678` using Meteor-compatible bcrypt storage in `services.password.bcrypt`, and all users are linked to a single professor-owned course (`Migration Test Course`).

The seeding script now also creates:
- interactive and quiz sessions (including `quizExtensions`)
- multiple questions across MC/TF/SA
- responses and grades
- baseline admin settings for image storage and Jitsi

For parity smoke checks against the migrated Express API:

```bash
npm run test:migration-smoke
```
