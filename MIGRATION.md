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
using plain string queries. When inserting new documents, use `new ObjectId().toString()` or
let MongoDB auto-generate string IDs consistently.

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

## Feature Parity Checklist

### Authentication
- [x] Email/password login (bcrypt compatible with Meteor hashes)
- [x] SAML SSO login
- [x] Registration
- [ ] Email verification (TODO: migrate from Meteor Accounts)
- [ ] Password reset emails (TODO)

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
- [ ] Quiz extensions (TODO)

### Questions
- [x] Create/edit/delete questions
- [x] MC, TF, SA, MS, NU question types
- [x] Session options (hidden, stats, correct, points, attempts)
- [ ] Question library features (TODO)

### Responses
- [x] Submit responses
- [x] Privacy-aware response visibility (mirrors DDP publication logic)
- [x] Rate limiting

### Grades
- [x] Read grades (role-aware)
- [x] Update grades (instructor only)
- [x] Toggle visibility to students
- [ ] Auto-grade calculation (TODO)

### Real-time
- [x] Response change streams
- [x] Session change streams
- [x] Question change streams
- [x] Grade change streams

### File uploads
- [x] Multer integration (stub)
- [ ] S3 upload (TODO: wire up `@aws-sdk/client-s3`)
- [ ] Azure Blob upload (TODO: wire up `@azure/storage-blob`)

### Admin
- [x] User management (list, role change, delete)
- [x] Settings management
- [ ] SSO configuration UI (TODO)
