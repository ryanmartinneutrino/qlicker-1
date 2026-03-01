# Qlicker Migration Plan: MeteorJS → Fastify/React

> **This is the master migration document.** All agents should consult this file to understand the overall plan, current status, and their role in the migration. Cross-check [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md) regularly to ensure alignment.

## Status: Phase 3 In Progress — Course Management

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

### MongoDB Collections

| Collection | Document Count (typical) | Key Fields |
|-----------|-------------------------|------------|
| `users` | 1000s | profile.roles, profile.courses, emails |
| `courses` | 100s | students[], instructors[], sessions[], enrollmentCode |
| `sessions` | 1000s | courseId, status, quiz, questions[], currentQuestion |
| `questions` | 10,000s | type (1-5), sessionId, courseId, options[], sessionOptions |
| `responses` | 100,000s | questionId, studentUserId, attempt, answer |
| `grades` | 10,000s | userId, sessionId, marks[], value, points |
| `images` | 100s | url, UID |
| `settings` | 1 | Singleton config |

### Question Types

| Code | Type | Auto-gradable |
|------|------|---------------|
| 1 | Short Answer (SA) | No |
| 2 | Multiple Choice (MC) | Yes |
| 3 | True/False (TF) | Yes |
| 4 | Multi-Select (MS) | Yes |
| 5 | Numerical (NU) | Yes |

### User Roles

| Role | Capabilities |
|------|-------------|
| `admin` | Full system access, user management, settings |
| `professor` | Create/manage courses, sessions, grading |
| `student` | Enroll in courses, answer questions, view grades |

Professors with `canPromote: true` can promote other users to professor.

### Real-Time Requirements (Critical)

1. **Live interactive sessions**: Professor cycles through questions → students see updates instantly. Professor sees response counts updating in real-time. Stats/correct toggles reflected immediately.
2. **Course pages**: Session status changes (started/ended) reflected immediately. Student enrollment list updates for professors.
3. **Quiz mode**: Not real-time, but responses must be auto-saved.

### Meteor Method → API Endpoint Mapping

> See the API Design table above. Each Meteor method maps to a REST endpoint. The real-time subscription behavior is replaced by WebSocket events for critical paths and polling/refetch for non-critical paths.

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
- [x] Password hashing (bcrypt, compatible with Meteor's bcrypt format)
- [x] Email verification flow
- [x] Password reset flow (Nodemailer)
- [x] User CRUD routes (admin)
- [x] Role management (admin changes roles, prof promotes)
- [x] Profile update routes
- [x] SAML SSO plugin (node-saml with encrypted logout handling)
- [x] SSO routes (login, callback, metadata, logout)
- [ ] Legacy user compatibility (Meteor password format)
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
- [ ] Session CRUD routes
- [ ] Question CRUD routes
- [ ] Session lifecycle (start, end, set current question)
- [ ] Quiz configuration (dates, extensions)
- [ ] Question ordering within sessions
- [ ] Question types (SA, MC, TF, MS, NU)
- [ ] Question sessionOptions (attempts, stats, correct, visibility)
- [ ] Question library (personal, public, course)
- [ ] Question tagging
- [ ] Copy questions/sessions
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
- [ ] Session editor page
- [ ] Run session page (professor)
- [ ] Present session page (student)
- [ ] Quiz page (student)
- [ ] Grading pages and components
- [ ] Session review pages
- [ ] Question components (display, edit, all types)
- [ ] Answer distribution charts
- [ ] Group management UI
- [ ] Video chat (Jitsi) integration
- [ ] Shared components (tables, forms, modals, lists)

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
- **Users collection**: Named `users` (standard Meteor). Passwords stored using Meteor's `bcrypt` format (`$2a$` prefix with specific structure in `services.password.bcrypt`). The new app must be able to verify these passwords.
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
| 3. Course management | 🟡 In progress | Phase 3 |
| 4. Session editor | ⬜ Not started | Phase 4 |
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
| Frontend | Professor Dashboard with course list and create dialog | ✅ Complete |
| Frontend | Student Dashboard with enrollment | ✅ Complete |
| Frontend | Professor Course Detail (students, instructors, settings tabs) | ✅ Complete |
| Frontend | Student Course Detail with unenroll | ✅ Complete |
| Frontend | App.jsx routes for course pages | ✅ Complete |
| Testing | Course routes unit tests (21 tests) | ✅ Complete |
| Testing | Course management E2E tests | ⬜ Not started |

### Agent Status

| Agent | Current Task | Status |
|-------|-------------|--------|
| 1 - Foundation | Port configuration cleanup, Docker improvements | ✅ Phase 3 done |
| 2 - Auth | SSO name-edit prevention, forgot password UI | ✅ Phase 3 done |
| 3 - Courses | Course CRUD routes, enrollment, student/TA management | ✅ Phase 3 done |
| 4 - Sessions | Session & Question Mongoose models complete | ✅ Phase 2 done |
| 5 - Responses | Response model + WebSocket infrastructure complete | ✅ Phase 2 done |
| 6 - Grading | Grade Mongoose model complete | ✅ Phase 2 done |
| 7 - Frontend | Professor/Student dashboards, course detail pages | ✅ Phase 3 done |
| 8 - Testing | Course routes tests (21 tests passing) | 🟡 In progress |

---

## How to Resume Work

1. Read this file (MIGRATION.md) to understand the overall plan and current status
2. Cross-check [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md) for alignment
3. Check the Agent Status table above to see what's in progress
4. Read the relevant agent file in [agents/](agents/) for detailed task instructions
5. Complete the next pending task, update the agent file, and update this file's status tables
6. Submit a PR with your changes

### Current Next Steps (Phase 3 → Phase 4)

Phase 3 core work is complete. The following should happen next:

1. **Phase 3 Remaining:** E2E tests for course management flow (Agent 8)
2. **Phase 4 Start:** Session and question CRUD routes (Agent 4), session editor UI (Agent 7)
3. **Phase 4 Start:** WebSocket events for live session status on course pages (Agent 5)
4. **Ongoing:** Role guard refinements, script updates (Agents 1, 2)

**Testable by human (Phase 3):** 
- Log in as professor → create a course → see enrollment code → go to course detail page
- Log in as student → enroll using enrollment code → see course in dashboard
- Professor: add/remove students, add/remove instructors, toggle active, regenerate code
- Professor: delete course
- Forgot password flow: click "Forgot Password?" on login → enter email → receive reset link

**Important:** Always cross-check REQUIREMENTS_FOR_MIGRATION_FASTIFY.md before starting new work to ensure alignment with the master requirements.
