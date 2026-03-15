# Qlicker Coding Standards & Conventions

> **Purpose:** This document is the authoritative reference for all development on the Qlicker codebase. It documents APIs, database patterns, internationalization, standard packages, and performance techniques. **Consult this before writing any new code** to avoid non-conforming, slow, or duplicated implementations.

---

## Table of Contents

1. [Project Architecture](#1-project-architecture)
2. [Standard Packages](#2-standard-packages)
3. [API Conventions](#3-api-conventions)
4. [Database Conventions](#4-database-conventions)
5. [Performance Techniques](#5-performance-techniques)
6. [Internationalization (i18n)](#6-internationalization-i18n)
7. [Security Conventions](#7-security-conventions)
8. [UI/UX Conventions](#8-uiux-conventions)
9. [Shared Utilities Reference](#9-shared-utilities-reference)
10. [Testing Conventions](#10-testing-conventions)
11. [Code Style](#11-code-style)

---

## 1. Project Architecture

```
qlicker-1/
├── server/                 # Fastify backend (Node.js, ES modules)
│   ├── src/
│   │   ├── app.js          # Fastify app factory (plugins, routes, decorators)
│   │   ├── server.js       # Entry point — starts listening
│   │   ├── config/         # Environment config (dotenv → export)
│   │   ├── middleware/      # Auth middleware (authenticate, requireRole)
│   │   ├── models/         # Mongoose schemas (7 models)
│   │   ├── plugins/        # Fastify plugins (db, upload, saml, websocket)
│   │   ├── routes/         # Route modules (auth, users, settings, courses, sessions, questions, grades, images)
│   │   ├── services/       # Business logic (grading, email)
│   │   └── utils/          # Small pure helpers (meteorId, password, email, regex)
│   └── test/               # Vitest tests (9 files, 173+ tests)
├── client/                 # React SPA (Vite + MUI)
│   ├── src/
│   │   ├── api/            # Axios client with JWT interceptors
│   │   ├── components/     # Reusable UI components
│   │   ├── contexts/       # React context providers (AuthContext)
│   │   ├── i18n/           # i18next config + locale JSON files
│   │   ├── pages/          # Route-level page components
│   │   ├── theme/          # MUI theme customization
│   │   └── utils/          # Client utilities (date, histogram, courseSemester)
│   └── test/               # Client tests
├── scripts/                # Setup, seed, and admin scripts
└── docs/                   # Documentation
```

### Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Fastify** (not Express) | Native async/await, JSON schema validation, plugin system, excellent performance |
| **Mongoose** (not raw MongoDB driver) | Schema validation, virtuals, middleware hooks, legacy Meteor DB compatibility |
| **React 18 + Vite** | Fast HMR, ES module-native, future-ready for React Server Components |
| **MUI 6** (Material UI) | Comprehensive component library, consistent design system, accessible by default |
| **Axios** (not fetch) | Interceptors for JWT refresh, request/response transformation, better error handling |
| **ES modules** throughout | `"type": "module"` in both package.json files — use `import`/`export`, not `require` |

---

## 2. Standard Packages

### Server (`server/package.json`)

| Package | Purpose | Notes |
|---------|---------|-------|
| `fastify` | HTTP framework | v5.x — use async route handlers |
| `@fastify/cors` | CORS | Origin restricted to `config.rootUrl` |
| `@fastify/jwt` | JWT authentication | Short-lived access + refresh tokens |
| `@fastify/cookie` | Cookie parsing | Used for refresh tokens (httpOnly) |
| `@fastify/helmet` | Security headers | CSP disabled (managed by nginx/proxy) |
| `@fastify/rate-limit` | Rate limiting | `global: false` — opt-in per route |
| `@fastify/websocket` | WebSocket | Real-time session events |
| `@fastify/formbody` | Form body parsing | URL-encoded form support |
| `@fastify/multipart` | File uploads | Image upload handling |
| `@fastify/swagger` | API documentation | Swagger/OpenAPI spec generation |
| `mongoose` | MongoDB ODM | v8.x — schemas must match legacy Meteor DB |
| `@node-rs/argon2` | Password hashing | Argon2id with OWASP-tuned parameters |
| `@node-saml/node-saml` | SAML SSO | Institutional single sign-on |
| `jsonwebtoken` | JWT signing | For refresh tokens (separate from Fastify JWT) |
| `nodemailer` | Email | Verification and password reset emails |
| `@aws-sdk/client-s3` | S3 storage | Image uploads to AWS S3 |
| `@azure/storage-blob` | Azure storage | Image uploads to Azure Blob Storage |
| `dotenv` | Environment config | Loads `.env` from project root |

### Client (`client/package.json`)

| Package | Purpose | Notes |
|---------|---------|-------|
| `react` / `react-dom` | UI framework | v18 — use hooks, no class components |
| `react-router-dom` | Routing | v6 — `<Routes>`, `<Outlet>`, `useNavigate` |
| `@mui/material` | Component library | v6 — **all UI components must use MUI** |
| `@mui/icons-material` | Icons | Material Design icons |
| `@emotion/react` / `@emotion/styled` | CSS-in-JS | Required by MUI — use `sx` prop, not custom CSS |
| `axios` | HTTP client | Wrapped in `src/api/client.js` with interceptors |
| `react-i18next` / `i18next` | Internationalization | All user-facing strings go through `t()` |
| `i18next-browser-languagedetector` | Locale detection | `localStorage` → browser language → fallback `en` |
| `@tiptap/*` | Rich text editor | TipTap v3 for question/answer editing |
| `katex` | Math rendering | LaTeX rendering in questions |
| `dompurify` | HTML sanitization | **Required** for all `dangerouslySetInnerHTML` usage |

### Do NOT Add

- **lodash / underscore** — use native JS methods (`Array.map`, `Object.keys`, etc.)
- **moment.js / date-fns** — use `client/src/utils/date.js` or `Intl.DateTimeFormat`
- **styled-components** — use MUI `sx` prop instead
- **Express / Hapi** — this is a Fastify project
- **bcrypt** — we use argon2id (`@node-rs/argon2`) for all new password hashes

---

## 3. API Conventions

### Route Structure

All API routes are prefixed with `/api/v1`. WebSocket endpoint is at `/ws`.

Routes are registered as Fastify plugins in `server/src/app.js`:

```javascript
await app.register(authRoutes, { prefix: '/api/v1/auth' });
await app.register(userRoutes, { prefix: '/api/v1/users' });
await app.register(settingsRoutes, { prefix: '/api/v1/settings' });
await app.register(courseRoutes, { prefix: '/api/v1/courses' });
await app.register(sessionRoutes, { prefix: '/api/v1/sessions' });
await app.register(questionRoutes, { prefix: '/api/v1/questions' });
await app.register(gradeRoutes, { prefix: '/api/v1/grades' });
await app.register(imageRoutes, { prefix: '/api/v1/images' });
```

### Route Handler Pattern

Every route module exports an async function that receives the Fastify `app` instance:

```javascript
export default async function myRoutes(app) {
  const { authenticate, requireRole } = app;

  // Authenticated route — any logged-in user
  app.get('/my-endpoint', { preHandler: authenticate }, async (request, reply) => {
    // request.user has { userId, roles }
    return { data: 'result' };
  });

  // Role-restricted route — admin only
  app.post('/admin-action', { preHandler: requireRole(['admin']) }, async (request, reply) => {
    // ...
  });

  // Professor or admin
  app.patch('/prof-action', { preHandler: requireRole(['professor', 'admin']) }, async (request, reply) => {
    // ...
  });
}
```

### Authentication & Authorization

| Decorator | Usage | Effect |
|-----------|-------|--------|
| `authenticate` | `preHandler: authenticate` | Verifies JWT, sets `request.user = { userId, roles }`. Returns 401 if invalid. |
| `requireRole(roles)` | `preHandler: requireRole(['admin'])` | Calls `authenticate` first, then checks roles. Returns 403 if insufficient. |

**JWT Payload:** `{ userId: string, roles: string[] }` — signed with configurable expiry (default 120 min, adjustable in admin panel).

**Refresh Tokens:** Stored in httpOnly cookies. Client auto-refreshes via Axios interceptor on 401 responses.

### Error Response Format

All error responses use this consistent structure:

```json
{
  "error": "Bad Request",       // HTTP status text
  "message": "Descriptive message for the developer"
}
```

Standard status codes:
- `400` — Validation error / bad input
- `401` — Missing or invalid authentication
- `403` — Insufficient permissions
- `404` — Resource not found
- `409` — Conflict (e.g., duplicate email)
- `500` — Internal server error (let Fastify handle)

```javascript
// ✅ Correct pattern
return reply.code(400).send({ error: 'Bad Request', message: 'Session name is required' });
return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });

// ❌ Wrong — don't use custom structures
return reply.code(400).send({ success: false, reason: 'bad input' });
```

### Request Validation

Use Fastify JSON Schema for input validation:

```javascript
app.post('/register', {
  schema: {
    body: {
      type: 'object',
      required: ['email', 'password', 'firstname', 'lastname'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 8 },
        firstname: { type: 'string', minLength: 1 },
        lastname: { type: 'string', minLength: 1 },
      },
    },
  },
}, async (request, reply) => { /* ... */ });
```

### Rate Limiting

Rate limiting is opt-in per route via `@fastify/rate-limit` (registered with `global: false`):

```javascript
// Apply to sensitive endpoints only
const authRateLimit = {
  config: {
    rateLimit: { max: 10, timeWindow: '15 minutes' },
  },
};

app.post('/login', { ...authRateLimit }, async (request, reply) => { /* ... */ });
app.post('/register', { schema: registerSchema, ...authRateLimit }, async (request, reply) => { /* ... */ });
```

**Currently rate-limited:** `/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`.

### API Reference Summary

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| **Auth** | | | |
| POST | `/auth/login` | None | Email/password login |
| POST | `/auth/register` | None | Create account |
| POST | `/auth/logout` | Token | Logout |
| POST | `/auth/refresh` | Cookie | Refresh JWT |
| POST | `/auth/forgot-password` | None | Request password reset |
| POST | `/auth/reset-password` | None | Reset with token |
| POST | `/auth/verify-email` | None | Verify email with token |
| GET | `/auth/sso/login` | None | Initiate SAML SSO |
| POST | `/auth/sso/callback` | None | SAML assertion consumer |
| **Users** | | | |
| GET | `/users/me` | Token | Current user profile |
| PATCH | `/users/me` | Token | Update profile (name, studentNumber, locale) |
| PATCH | `/users/me/password` | Token | Change password |
| PATCH | `/users/me/image` | Token | Update profile image |
| GET | `/users` | Admin | Paginated user list |
| GET | `/users/:id` | Admin | Get single user |
| POST | `/users` | Admin | Create user |
| DELETE | `/users/:id` | Admin | Delete user |
| PATCH | `/users/:id/role` | Admin | Change user role |
| PATCH | `/users/:id/verify-email` | Admin | Admin-verify email |
| **Settings** | | | |
| GET | `/settings` | Admin | Get all settings |
| PATCH | `/settings` | Admin | Update settings |
| GET | `/settings/public` | None | Public settings (SSO status) |
| **Courses** | | | |
| POST | `/courses` | Prof+ | Create course |
| GET | `/courses` | Token | List user's courses |
| GET | `/courses/:id` | Token | Course detail |
| PATCH | `/courses/:id` | Prof+ | Update course |
| DELETE | `/courses/:id` | Prof+ | Delete course |
| POST | `/courses/:id/enroll` | Token | Enroll in course |
| DELETE | `/courses/:id/unenroll` | Token | Unenroll |
| **Sessions** | | | |
| POST | `/courses/:courseId/sessions` | Prof+ | Create session |
| GET | `/courses/:courseId/sessions` | Token | List course sessions |
| GET | `/sessions/:id` | Token | Session detail |
| PATCH | `/sessions/:id` | Prof+ | Update session |
| DELETE | `/sessions/:id` | Prof+ | Delete session |
| POST | `/sessions/:id/start` | Prof+ | Start session |
| POST | `/sessions/:id/end` | Prof+ | End session |
| POST | `/sessions/:id/join` | Student | Join session |
| GET | `/sessions/:id/live` | Token | Live session data |
| GET | `/sessions/:id/review` | Token | Review data |
| POST | `/sessions/:id/respond` | Student | Submit response |
| PATCH | `/sessions/:id/current` | Prof+ | Set current question |
| POST | `/sessions/:id/copy` | Prof+ | Copy session |
| **Grades** | | | |
| POST | `/sessions/:id/grades/recalculate` | Prof+ | Recalculate grades |
| GET | `/sessions/:id/grades` | Token | Get grades |
| PATCH | `/sessions/:id/grades/visibility` | Prof+ | Toggle grade visibility |

### WebSocket Events

WebSocket endpoint: `/ws?token=<JWT>`

| Event | Direction | Audience | Payload | Purpose |
|-------|-----------|----------|---------|---------|
| `session:updated` | Server→Client | All members or a single affected user | `{ sessionId }` | Generic fallback for non-live mutations or targeted refetches when no finer delta exists |
| `session:question-changed` | Server→Client | All members | `{ sessionId, questionId, questionIndex, questionNumber, questionCount }` | Professor navigated to a new question |
| `session:question-updated` | Server→Client | All members | `{ sessionId, questionId, question? }` | Current question content edited; include only the minimal per-audience question delta clients need |
| `session:response-added` | Server→Client | Instructors always; joined students when stats are visible | `{ sessionId, questionId, attempt, responseCount, joinedCount }` | New response submitted; clients that show live stats should throttle-refetch |
| `session:attempt-changed` | Server→Client | All members | `{ sessionId, questionId, currentAttempt, stats, correct, resetResponses }` | Current attempt opened/closed/reset for the live question |
| `session:participant-joined` | Server→Instructors | Instructors only | `{ sessionId, joinedCount, joinedStudent }` | A student joined the live session; update instructor roster/count locally |
| `session:join-code-changed` | Server→Client | All members | `{ sessionId, joinCodeEnabled, joinCodeActive, ... }` | Passcode requirement/join period changed; omit the actual code from student payloads |
| `session:visibility-changed` | Server→Client | All members | `{ sessionId, questionId, hidden, stats, correct }` | Question visibility/stats/correct toggled |
| `session:status-changed` | Server→Client | All members | `{ sessionId, status }` | Session started/ended |

---

## 4. Database Conventions

### Collection Names & IDs

The database is shared with the legacy Meteor application. All collections use Meteor conventions:

| Collection | Mongoose Model | ID Type |
|-----------|---------------|---------|
| `users` | `User` | String (17-char random via `generateMeteorId()`) |
| `courses` | `Course` | String (17-char random) |
| `sessions` | `Session` | String (17-char random) |
| `questions` | `Question` | String (17-char random) |
| `responses` | `Response` | String (17-char random) |
| `grades` | `Grade` | String (17-char random) |
| `images` | `Image` | String (17-char random) |
| `settings` | `Settings` | String (literal `"settings"` — singleton doc) |

**Critical: Always use `generateMeteorId()` for `_id` fields.** Never use MongoDB ObjectId.

```javascript
import { generateMeteorId } from '../utils/meteorId.js';

const MySchema = new mongoose.Schema({
  _id: { type: String, default: () => generateMeteorId() },
  // ...
});
```

### Model Structure Pattern

Every model follows this pattern:

```javascript
import mongoose from 'mongoose';
import { generateMeteorId } from '../utils/meteorId.js';

// Sub-schemas use { _id: false }
const SubSchema = new mongoose.Schema({ /* ... */ }, { _id: false });

const MainSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => generateMeteorId() },
    // fields...
  },
  {
    collection: 'collectionName',  // explicit collection name
    timestamps: false,              // Meteor doesn't use Mongoose timestamps
  }
);

// Add indexes for query performance
MainSchema.index({ fieldName: 1 });

const Model = mongoose.model('Model', MainSchema);
export default Model;
```

### Legacy Database Compatibility

The Meteor application may have stored documents with missing or differently-shaped fields. **Always handle legacy data defensively:**

#### Array Fallbacks (`|| []`)

When loading documents via `.lean()`, arrays that were never set may be `undefined`. Always use `|| []`:

```javascript
// ✅ Correct — safe for legacy docs
const students = course.students || [];
const questions = session.questions || [];
const instructors = course.instructors || [];
const joined = session.joined || [];

// ❌ Wrong — will crash on legacy docs
course.students.forEach(/* ... */);  // TypeError if undefined
```

#### Session Question Sequence

Sessions use the ordered `questions` array as the single source of truth, matching the legacy Meteor database. Slides are ordinary question documents with `type: 6`, so a session can mix graded questions and non-response slides without a second session-level sequence.

```javascript
// ✅ Use the ordered questions array for navigation
const orderedIds = session.questions || [];
const currentIndex = orderedIds.indexOf(session.currentQuestion);

// ✅ Treat slides as a question type, not a separate session item model
const question = questionsMap.get(session.currentQuestion);
const isSlide = Number(question?.type) === 6;

// ✅ When modifying session items, update the questions array only
await Session.findByIdAndUpdate(sessionId, {
  $push: { questions: qId },
});
```

#### Password Hash Compatibility

Legacy Meteor users have `services.password.bcrypt` (bcrypt `$2a$`/`$2b$`). New users get `services.password.hash` (argon2id). The User model handles both:

```javascript
// Auto-detected in User.verifyPassword()
// Legacy bcrypt users are prompted to reset their password
user.passwordResetRequired()  // true if only bcrypt hash exists
```

#### Settings Virtual Getters

Settings has virtual getters that resolve new or legacy field names:

```javascript
settings.resolvedAdminEmail     // returns adminEmail || email
settings.resolvedAWSAccessKeyId // returns AWS_accessKeyId || AWS_accessKey
```

### Indexes

Every model defines Mongoose indexes matching legacy database indexes. Add indexes for any new query pattern:

```javascript
// Match query patterns in routes
ResponseSchema.index({ questionId: 1, studentUserId: 1, attempt: 1 });
ResponseSchema.index({ questionId: 1, attempt: 1 });
GradeSchema.index({ userId: 1, sessionId: 1 });
```

### Sanitizing User Data

**Never return `services` field to the client.** It contains password hashes and tokens:

```javascript
function sanitizeUser(user) {
  const obj = user.toObject();
  delete obj.services;
  return obj;
}
```

---

## 5. Performance Techniques

### Use `.lean()` for Read-Only Queries

`.lean()` returns plain JavaScript objects instead of Mongoose documents. This is **significantly faster** and uses less memory. Use it for all read-only queries:

```javascript
// ✅ Correct — .lean() for read-only data
const session = await Session.findById(id).lean();
const courses = await Course.find({ students: userId }).lean();

// ❌ Wrong — full Mongoose documents when not needed for .save()
const session = await Session.findById(id);  // Only do this if you need .save()
```

**Exception:** Don't use `.lean()` when you need to call Mongoose instance methods or `.save()`.

### Delta WebSocket Events (Not Generic Broadcasts)

**Critical:** Never use generic `session:updated` for live-session mutations. Use granular delta events:

```javascript
// ✅ Correct — delta event with minimal payload
broadcastToSessionMembers(app, course, 'session:visibility-changed', {
  sessionId: session._id,
  questionId: questionId,
  hidden: false,
  stats: true,
  correct: false,
});

// ❌ Wrong — causes N+1 re-fetches from every client
broadcastToSessionMembers(app, course, 'session:updated', { sessionId: session._id });
```

**Why:** With 30 students, a generic `session:updated` triggers 31 clients × 6 DB queries = 186 queries per event. Delta events let clients update local state without re-fetching.

### Single-Serialize Broadcasts (`wsSendToUsers`)

When sending the same event to multiple users, use `wsSendToUsers()` to serialize JSON once:

```javascript
// ✅ Correct — serializes JSON payload ONCE, sends to all
const memberIds = [...(course.instructors || []), ...(course.students || [])];
app.wsSendToUsers(memberIds, 'session:question-changed', payload);

// ❌ Wrong — serializes JSON for EVERY user
memberIds.forEach((id) => app.wsSendToUser(id, 'session:question-changed', payload));
```

### Audience-Scoped Events

Send deltas only to the audience that can act on them. Live response counts are the main exception: students need them for visible histograms, but only while they are joined and stats are on.

```javascript
// Instructors always get response deltas; joined students only when stats are visible
sendToInstructors(app, course, 'session:response-added', {
  sessionId, questionId, attempt, responseCount, joinedCount,
});
sendToUsersById(app, session.joined || [], 'session:response-added', {
  sessionId, questionId, attempt, responseCount, joinedCount,
});
```

### Throttled Re-fetches

When delta events don't carry full data, use throttled re-fetches instead of immediate ones:

```javascript
// Client-side: Professor throttles response re-fetch to every 2 seconds
const scheduleFetchLive = useCallback(() => {
  if (fetchTimer.current) return; // already scheduled
  fetchTimer.current = setTimeout(() => {
    fetchTimer.current = null;
    fetchLiveData();
  }, 2000);
}, [fetchLiveData]);
```

### Caching Expensive Lookups

Cache frequently-accessed settings with TTL to avoid DB queries on every request:

```javascript
// Token expiry cached for 60 seconds
let _cachedTokenExpiryMinutes = null;
let _cacheExpiry = 0;

async function getTokenExpiryMinutes() {
  if (_cachedTokenExpiryMinutes !== null && Date.now() < _cacheExpiry) {
    return _cachedTokenExpiryMinutes;
  }
  const settings = await Settings.findOne();
  _cachedTokenExpiryMinutes = settings?.tokenExpiryMinutes || 120;
  _cacheExpiry = Date.now() + 60_000;
  return _cachedTokenExpiryMinutes;
}
```

### Avoid Duplicate Queries

When stats are enabled and individual student response is also needed, extract from the same query result:

```javascript
// ✅ Correct — single query, extract individual from batch
const allResponses = await Response.find({ questionId, attempt }).lean();
const studentResponse = allResponses.find((r) => r.studentUserId === userId);
const responseCount = allResponses.length;

// ❌ Wrong — two separate queries for overlapping data
const count = await Response.countDocuments({ questionId, attempt });
const studentResponse = await Response.findOne({ questionId, attempt, studentUserId: userId });
```

---

## 6. Internationalization (i18n)

### Architecture

Qlicker uses `react-i18next` with `i18next-browser-languagedetector`. The framework is fully wired — all 30+ React components use `useTranslation()`.

| Component | File |
|-----------|------|
| i18n config | `client/src/i18n/index.js` |
| English translations | `client/src/i18n/locales/en.json` |
| French translations | `client/src/i18n/locales/fr.json` |
| Supported locales | `SUPPORTED_LOCALES` in `client/src/i18n/index.js` |
| Date format presets | `DATE_FORMATS` in `client/src/i18n/index.js` |

### Language Detection Order

1. `localStorage` key `qlicker_locale` (set by user Profile page)
2. Browser language preference
3. Fallback to `en`

### Admin vs. User Locale

- **Admin panel** (`Settings` tab): Sets app-wide default locale and date format → stored in `Settings.locale` / `Settings.dateFormat`
- **Profile page**: Users can override with per-user locale → stored in `User.locale` (empty = use app default)

### Using Translations in Components

```jsx
import { useTranslation } from 'react-i18next';

export default function MyComponent() {
  const { t } = useTranslation();

  return (
    <Box>
      <Typography>{t('mySection.title')}</Typography>
      <Button>{t('common.save')}</Button>
      {/* With interpolation */}
      <Typography>{t('grading.pointsDisplay', { points: 5, outOf: 10 })}</Typography>
    </Box>
  );
}
```

### Translation Key Naming Convention

Keys are organized hierarchically by page/component, using dot notation:

```json
{
  "common": { "save": "Save", "cancel": "Cancel" },
  "login": { "title": "Sign In", "emailLabel": "Email" },
  "profDashboard": { "title": "Professor Dashboard", "createCourse": "Create Course" },
  "sessionEditor": { "title": "Session Editor", "addQuestion": "Add Question" }
}
```

**Naming rules:**
- Top-level key = page or component name (camelCase)
- Nested keys = descriptive label (camelCase)
- Common strings go under `"common"` namespace
- Shared status strings go under `"sessionStatus"`, `"autoSave"`, etc.

### Adding a New Translation Key

1. Add the English text to `client/src/i18n/locales/en.json`
2. Add the French translation to `client/src/i18n/locales/fr.json`
3. Use `t('namespace.key')` in the component
4. **Both files must have identical key structures** — missing keys fall back to English

### Adding a New Language

1. Create `client/src/i18n/locales/<code>.json` (copy `en.json` and translate)
2. Import in `client/src/i18n/index.js`:
   ```javascript
   import es from './locales/es.json';
   // Add to resources:
   resources: { en: { translation: en }, fr: { translation: fr }, es: { translation: es } }
   ```
3. Add to `SUPPORTED_LOCALES`:
   ```javascript
   export const SUPPORTED_LOCALES = [
     { code: 'en', label: 'English' },
     { code: 'fr', label: 'Français' },
     { code: 'es', label: 'Español' },
   ];
   ```

### Rules for User-Facing Strings

- **All user-visible text must go through `t()`** — no hardcoded English in JSX
- **Server error messages remain in English** — they are technical/developer-facing
- **Use interpolation** for dynamic values: `t('key', { count: 5 })` not `` `${t('key')} 5` ``
- **Plurals:** Use i18next plural features when needed: `t('items', { count })` with `"items_one": "{{count}} item"`, `"items_other": "{{count}} items"`

---

## 7. Security Conventions

### Password Policy

- **Minimum 8 characters** — enforced in all four creation/update paths:
  - `auth.js` — register, reset-password
  - `users.js` — change-password (`PATCH /me/password`), admin-create-user (`POST /`)
- **Argon2id** hashing (OWASP baseline: `memoryCost: 19456, timeCost: 2, parallelism: 1`)
- Legacy bcrypt hashes trigger forced password reset on next login

### Input Sanitization

#### Regex — Prevent ReDoS

**Always escape user input** before using in `new RegExp()`:

```javascript
import { escapeForRegex } from '../utils/regex.js';

// ✅ Correct
const regex = new RegExp(escapeForRegex(userInput), 'i');

// ❌ Dangerous — user input can cause ReDoS
const regex = new RegExp(userInput, 'i');
```

#### Email Lookup — Case-Insensitive

```javascript
import { emailRegex } from '../utils/email.js';

// ✅ Correct — handles legacy mixed-case emails
const user = await User.findOne({ 'emails.address': emailRegex(normalizedEmail) });

// ❌ Wrong — misses legacy uppercase emails
const user = await User.findOne({ 'emails.address': email });
```

#### HTML Sanitization — DOMPurify

**All `dangerouslySetInnerHTML` must use DOMPurify** via `richTextUtils.js`:

```javascript
import { prepareRichTextInput, sanitizeRichHtml } from '../components/questions/richTextUtils';

// ✅ Correct — sanitized through DOMPurify
const safeHtml = prepareRichTextInput(rawHtml);
<div dangerouslySetInnerHTML={{ __html: safeHtml }} />

// ❌ Dangerous — XSS vulnerability
<div dangerouslySetInnerHTML={{ __html: rawHtml }} />
```

### Authentication Token Handling

- **Access tokens stored in memory only** (not localStorage) — use `setAccessToken()` / `getAccessToken()` / `clearAccessToken()` from `client/src/api/client.js`
- On page reload, access token is lost; the first 401 triggers a refresh from the httpOnly cookie
- Refresh tokens stored in httpOnly cookies with `SameSite: strict` (not accessible to JS)
- Client Axios interceptor auto-refreshes on 401
- Cross-tab auth sync uses a transient `localStorage` signal key (`qlicker_auth_event`), **not** the token itself

### CSRF Protection

All state-changing requests (POST, PATCH, PUT, DELETE) must include the `X-Requested-With: XMLHttpRequest` header. The server rejects requests without this header (403). CORS blocks cross-origin sites from sending custom headers, preventing CSRF.

- The shared `apiClient` in `client/src/api/client.js` includes this header automatically
- SAML callback/logout endpoints are exempt (they receive form posts from external IdPs)

### Security Headers

`@fastify/helmet` provides: `X-Content-Type-Options`, `X-Frame-Options`, `X-DNS-Prefetch-Control`, `Strict-Transport-Security`, etc.

### Failed Login Logging

Failed login attempts are logged with `request.log.warn()` including email and userId for audit trails.

### File Upload Validation

File uploads are validated in two layers:
1. **MIME type whitelist:** Only `image/jpeg`, `image/png`, `image/gif`, `image/webp` accepted
2. **Magic bytes validation:** `file-type` library verifies the actual file content matches the claimed MIME type

---

## 8. UI/UX Conventions

### Visual Design

- **Primary color:** Qlicker blue (#2196F3 family)
- **Font:** Helvetica Neue, Helvetica, Arial sans-serif stack (configured in `client/src/theme/index.js`)
- **Design system:** Material Design via MUI
- **Spacing:** 8px grid system (MUI default)
- **Responsive:** Mobile-friendly, especially for student quiz views
- **Theme:** Plan for dark/light theme switching in the future
- **Component inheritance:** Use MUI's `ThemeProvider` and `styled` components for consistent styling

### Component Library

**All UI components must use MUI (Material UI).** Do not introduce custom CSS or alternative component libraries.

```jsx
// ✅ Correct — MUI components with sx prop
import { Box, Typography, Button, TextField, Alert } from '@mui/material';

<Box sx={{ p: 3, display: 'flex', gap: 2 }}>
  <Typography variant="h4">Title</Typography>
  <TextField label={t('common.name')} value={name} onChange={handleChange} fullWidth />
  <Button variant="contained" onClick={handleSave}>{t('common.save')}</Button>
</Box>

// ❌ Wrong — raw HTML/CSS
<div style={{ padding: 24 }}>
  <h1>Title</h1>
  <input type="text" value={name} />
</div>
```

### Autosave Pattern

Forms should autosave by default. Use the `AutoSaveStatus` component and this state machine:

| State | Display | Trigger |
|-------|---------|---------|
| `idle` | Nothing shown | Initial state |
| `saving` | "Saving changes..." | Set when save starts |
| `success` | "Changes saved" (auto-dismiss 1.2s) | Set on successful save |
| `error` | Error message (manual dismiss) | Set on failed save |

```jsx
import AutoSaveStatus from '../components/common/AutoSaveStatus';

function MyForm() {
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    // Debounced autosave
    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await apiClient.patch('/endpoint', data);
        setSaveStatus('success');
      } catch (err) {
        setSaveStatus('error');
        setSaveError(err.response?.data?.message || 'Failed to save.');
      }
    }, AUTO_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [data]);

  return (
    <>
      <AutoSaveStatus status={saveStatus} errorText={saveError} />
      {/* form fields */}
    </>
  );
}
```

**Queued Save Pattern:** For autosaves where a second change can arrive while the first is still in-flight, use the `saveInFlightRef` + `queuedSaveRef` pattern (see `QuestionEditor.jsx` and `Profile.jsx` for reference implementations).

### API Client Usage

Always use the shared Axios instance:

```javascript
import apiClient from '../api/client';

// ✅ Correct — uses interceptors for auth and error handling
const { data } = await apiClient.get('/courses');
await apiClient.patch('/users/me', { firstname: 'New' });

// ❌ Wrong — bypasses auth interceptors
const res = await fetch('/api/v1/courses');
```

### Routing & Auth Guards

```jsx
// RequireAuth — redirects to /login if not authenticated
<Route element={<RequireAuth />}>
  <Route element={<AppLayout />}>
    {/* protected routes */}
  </Route>
</Route>

// RequireRole — shows "Access Denied" if role doesn't match
<Route path="/manage/*" element={
  <RequireRole role="professor">
    {/* professor routes */}
  </RequireRole>
}>
```

### WebSocket Connection (Client)

Use the `buildWebsocketUrl` helper and handle reconnection:

```javascript
function buildWebsocketUrl(token) {
  const wsBase = import.meta.env.VITE_WS_URL || `ws://${window.location.host}`;
  return `${wsBase}/ws?token=${encodeURIComponent(token)}`;
}
```

Client WebSocket message handling:
```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  const { event: evt, data: d } = message;
  if (String(d?.sessionId) !== String(expectedSessionId)) return;

  switch (evt) {
    case 'session:question-changed':
      // Re-fetch only when navigation changes require a new live payload
      fetchLive();
      break;
    case 'session:question-updated':
    case 'session:visibility-changed':
      // Patch local state directly when the event already carries the needed delta
      setLiveData((prev) => applyDelta(prev, d));
      break;
    case 'session:response-added':
      // Throttled re-fetch
      scheduleFetchLive();
      break;
    // ... handle other events
  }
};
```

---

## 9. Shared Utilities Reference

**Do not duplicate these utilities.** Import from their canonical locations.

### Server Utilities

| Utility | Location | Purpose |
|---------|----------|---------|
| `generateMeteorId()` | `server/src/utils/meteorId.js` | Generate 17-char random string IDs matching Meteor format |
| `getTimestampMs(value)` | `server/src/services/grading.js` | Parse any date-like value to millisecond timestamp. **Do not duplicate.** |
| `hasNonEmptyFeedback(value)` | `server/src/services/grading.js` | Check if a feedback string is non-empty |
| `escapeForRegex(str)` | `server/src/utils/regex.js` | Escape special regex characters (ReDoS prevention) |
| `emailRegex(email)` | `server/src/utils/email.js` | Build case-insensitive regex for email lookup |
| `hashPasswordArgon2id(pw)` | `server/src/utils/password.js` | Hash password with argon2id |
| `verifyPasswordArgon2id(pw, hash)` | `server/src/utils/password.js` | Verify password against argon2id hash |
| `isLegacyBcryptHash(value)` | `server/src/utils/password.js` | Check if hash is legacy bcrypt format |
| `sanitizeUser(user)` | Local function in `auth.js` and `users.js` | Remove `services` field from user object before responding |
| `sendVerificationEmail(...)` | `server/src/services/email.js` | Send email verification link |
| `sendPasswordResetEmail(...)` | `server/src/services/email.js` | Send password reset link |

### Client Utilities

| Utility | Location | Purpose |
|---------|----------|---------|
| `apiClient` | `client/src/api/client.js` | Axios instance with JWT interceptors. **Always use this for API calls.** |
| `useAuth()` | `client/src/contexts/AuthContext.jsx` | Auth context hook: `{ user, login, logout, register, loadUser, loading }` |
| `formatDisplayDate(value)` | `client/src/utils/date.js` | Format date as `DD-MMM-YYYY` (e.g., `11-Jan-2026`) |
| `buildHistogramData(values, maxBins)` | `client/src/utils/histogram.js` | Bin numeric values for Recharts histograms |
| `SEMESTER_OPTIONS`, `parseSemester()`, `formatSemester()` | `client/src/utils/courseSemester.js` | Semester/year parsing and formatting |
| `prepareRichTextInput(value, fallback)` | `client/src/components/questions/richTextUtils.js` | Sanitize and normalize HTML for display |
| `sanitizeRichHtml(html)` | `client/src/components/questions/richTextUtils.js` | DOMPurify sanitization |
| `renderKatexInElement(container)` | `client/src/components/questions/richTextUtils.js` | Render LaTeX math in DOM element |
| `extractPlainTextFromHtml(html)` | `client/src/components/questions/richTextUtils.js` | Strip HTML tags to plain text |
| `SUPPORTED_LOCALES`, `DATE_FORMATS` | `client/src/i18n/index.js` | Available locales and date format options |
| `AutoSaveStatus` | `client/src/components/common/AutoSaveStatus.jsx` | Autosave notification component |

---

## 10. Testing Conventions

### Test Infrastructure

| Aspect | Server | Client |
|--------|--------|--------|
| Framework | Vitest | Vitest |
| Database | `mongodb-memory-server` (in-memory) | N/A (mock API) |
| Test runner | `cd server && npx vitest run` | `cd client && npx vitest run` |
| Config | `server/vitest.config.js` | `client/vite.config.js` (test section) |
| Setup | `server/test/setup.js` | `client/test/setup.js` |
| Helpers | `server/test/helpers.js` | `@testing-library/react` |

### Server Test Pattern

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { createApp, createTestUser, getAuthToken, authenticatedRequest } from '../helpers.js';

let app;

beforeEach(async (ctx) => {
  if (mongoose.connection.readyState !== 1) {
    ctx.skip();  // Skip if no DB (e.g., CI without MongoDB)
    return;
  }
  app = await createApp();
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

describe('POST /api/v1/my-endpoint', () => {
  it('succeeds with valid data', async (ctx) => {
    if (mongoose.connection.readyState !== 1) ctx.skip();

    const user = await createTestUser({ email: 'test@example.com', roles: ['professor'] });
    const token = await getAuthToken(app, user);

    const res = await authenticatedRequest(app, 'POST', '/api/v1/my-endpoint', {
      token,
      payload: { name: 'Test' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Test');
  });
});
```

### Test Helpers

| Helper | Purpose |
|--------|---------|
| `createApp()` | Creates Fastify app with test config (no logging, in-memory DB) |
| `createTestUser(overrides)` | Creates a user with hashed password; override `email`, `roles`, `firstname`, `lastname` |
| `getAuthToken(app, user)` | Signs a JWT for the given user |
| `authenticatedRequest(app, method, url, opts)` | Makes an `app.inject()` request with JWT and optional payload |

### Test Naming Convention

- File: `test/routes/<module>.test.js` or `test/services/<module>.test.js`
- Describe block: HTTP method + route path
- It block: Describes the specific scenario

```javascript
describe('POST /api/v1/courses/:courseId/sessions', () => {
  it('professor can create a session', async (ctx) => { /* ... */ });
  it('student cannot create a session (403)', async (ctx) => { /* ... */ });
});
```

### What to Test

- **Happy path** — correct input returns expected output
- **Auth/authz** — unauthenticated returns 401, wrong role returns 403
- **Validation** — missing required fields return 400
- **Edge cases** — legacy data shapes, empty arrays, missing fields
- **Business logic** — grading calculations, scoring methods

---

## 11. Code Style

### General Rules

- **ES modules** — `import`/`export` everywhere (no `require`)
- **Async/await** — no raw Promises or callbacks
- **Functional components** — React hooks only (no class components)
- **No `var`** — use `const` by default, `let` only when reassignment is needed
- **Template literals** for string interpolation — no `+` concatenation

### File Organization

```javascript
// 1. External imports
import { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';

// 2. Internal imports
import apiClient from '../api/client';
import { useAuth } from '../contexts/AuthContext';

// 3. Constants
const AUTO_SAVE_DELAY_MS = 500;

// 4. Helper functions (not exported)
function formatValue(v) { /* ... */ }

// 5. Component / Route export
export default function MyComponent() { /* ... */ }
```

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files (components) | PascalCase `.jsx` | `SessionEditor.jsx` |
| Files (utilities) | camelCase `.js` | `courseSemester.js` |
| Files (models) | PascalCase `.js` | `Session.js` |
| Files (routes) | camelCase `.js` | `sessions.js` |
| React components | PascalCase | `function LiveSession()` |
| Hooks | `use` prefix | `useAuth()`, `useState()` |
| Constants | UPPER_SNAKE_CASE | `AUTO_SAVE_DELAY_MS` |
| Event handlers | `handle` prefix | `handleSubmit`, `handleClose` |
| Boolean state | `is`/`has` prefix | `isLoading`, `hasError` |
| API payloads | camelCase | `{ firstName, lastName }` |
| DB fields | camelCase (matching Meteor) | `studentUserId`, `courseId` |

### Import Order

1. External packages (react, MUI, axios)
2. Internal modules (api, contexts, components)
3. Utilities and constants
4. Types (if using TypeScript in future)

---

## Quick Reference Checklist

Before submitting any PR, verify:

- [ ] All user-facing strings use `t()` with keys in both `en.json` and `fr.json`
- [ ] Read-only queries use `.lean()`
- [ ] Array access from `.lean()` queries uses `|| []` fallback
- [ ] User input in regex is escaped with `escapeForRegex()`
- [ ] HTML rendered with `dangerouslySetInnerHTML` is sanitized through `richTextUtils.js`
- [ ] New `_id` fields use `generateMeteorId()`, not ObjectId
- [ ] WebSocket events for live sessions use delta payloads, not generic `session:updated`
- [ ] Multi-user WebSocket broadcasts use `wsSendToUsers()` (single-serialize)
- [ ] Passwords require minimum 8 characters
- [ ] `services` field is never returned to client
- [ ] New routes use consistent error response format (`{ error, message }`)
- [ ] Shared utilities are imported, not duplicated
- [ ] Tests follow the existing Vitest pattern with proper `beforeEach`/`afterEach`
- [ ] MUI components are used (no raw HTML/CSS)
- [ ] Autosave uses `AutoSaveStatus` component
