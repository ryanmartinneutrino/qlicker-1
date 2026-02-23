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
- Enrollment and auth compatibility work has been migrated to Express routes and React pages:
  - Student enrollment by code (including code normalization and profile course linkage)
  - Forgot/reset password API routes
  - Enroll course modal parity in student dashboard
- Grade read visibility for students now matches Meteor publications (`visibleToStudents` enforced for student grade reads).
- Editor hardening started:
  - Expanded toolbar capabilities
  - Safer link handling
  - Initial conversion/sanitization regression tests
- Remaining gaps are mainly deep UI parity (`QuestionDisplay`/grading behavior) and broad automated coverage.

### Parallel Agent Plan (recommended)
Use 5 agents in parallel with one focused lane each. Keep each PR small enough to rebase quickly.

#### Agent 1 — Question/Response UI parity
- Scope:
  - Port richer `QuestionDisplay` behavior from `imports/ui/QuestionDisplay.jsx`
  - Port `ResponseDisplay`/grading interaction parity from `imports/ui/ResponseDisplay.jsx`
  - Replace simplified inline question rendering in `Session.tsx`, `RunSession.tsx`, `ReplaySession.tsx`, `GradeSession.tsx` with shared components
- Acceptance:
  - MC/TF/SA/MS/NU interactions match Meteor behavior
  - Quiz/editable attempt behavior matches legacy flows
  - No regression in sanitized HTML rendering

#### Agent 2 — Session/quiz behavior parity
- Scope:
  - Validate/patch quiz attempt limits, closed attempts, extension windows, and submission semantics
  - Confirm server logic in `packages/server/src/routes/sessions.ts`, `responses.ts`, `grades.ts` mirrors legacy method behavior
- Acceptance:
  - End-to-end quiz flow for professor and student passes against seeded data
  - Grade updates and visibility toggles align with Meteor behavior

#### Agent 3 — Modals and specialized workflow parity
- Scope:
  - Port remaining specialized modals from `imports/ui/modals/` beyond core account/session/question creation and enroll flows
  - Ensure keyboard/cancel/submit UX parity for modal stack
- Acceptance:
  - Missing modal list in `imports/ui/modals/` has React equivalents or explicit deprecation notes
  - No dead modal routes/actions in React pages

#### Agent 4 — Realtime and performance hardening
- Scope:
  - Audit socket subscriptions and fan-out paths for high-concurrency safety
  - Add indexing/perf fixes where query hotspots appear (`courses`, `sessions`, `responses`, `grades`)
  - Verify no per-client Mongo Change Stream creation
- Acceptance:
  - Load-test sanity checks documented
  - Observable update latency remains acceptable under concurrent activity

#### Agent 5 — Coverage and migration regression suite
- Scope:
  - Expand `scripts/migration-smoke.mjs` for critical parity paths
  - Add client component tests (Vitest) for migrated pages/components
  - Add server route tests for auth/courses/sessions/responses/grades parity edge cases
- Acceptance:
  - Smoke suite covers login, enroll, course create/edit, question lifecycle, response submission, grading visibility, reset password
  - Tests run in CI/local Docker environment with reproducible commands

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
