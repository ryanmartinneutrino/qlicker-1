# Agent 8: Testing, CI/CD & Documentation

> **Role:** Build and maintain the testing infrastructure, CI/CD pipeline, end-to-end flow tests, and project documentation.
>
> **Reference:** [MIGRATION.md](../MIGRATION.md) | [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](../REQUIREMENTS_FOR_MIGRATION_FASTIFY.md)

---

## Testing Strategy

### Unit Tests (Vitest)
- **Server**: Test each route module, service, and model
- **Client**: Test React components and hooks
- **Coverage target**: 80%+ for services and models, 60%+ for routes and components

### Integration Tests (Vitest + Supertest)
- Test API endpoints with a real MongoDB (in-memory or test instance)
- Test auth flows end-to-end through the API
- Test WebSocket connections and events

### End-to-End Tests (Playwright)
- Test complete user flows through the UI
- One test file per milestone/flow
- Run against a full stack (server + client + MongoDB)

### Legacy Compatibility Tests
- Load the production database dump and verify:
  - Users can be loaded and passwords verified
  - Courses, sessions, questions, grades load correctly
  - Data integrity checks
- **IMPORTANT**: Do not reference filenames from `legacydb/` in any committed code. Use environment variables for the path.

---

## Phase 1 Tasks (Milestone 1: Login Works)

### Task 8.1: Test Infrastructure Setup
**Status:** ⬜ Not started
**Priority:** CRITICAL

**Instructions:**
1. Server test setup (`server/`):
   - Install: `vitest`, `@vitest/coverage-v8`, `supertest`
   - Create `vitest.config.js`
   - Create `test/setup.js`:
     - Connect to test MongoDB (use `mongodb-memory-server` or a test DB)
     - Clean collections before each test
     - Create test Fastify app instance
   - Create `test/helpers.js`:
     - `createTestUser(overrides)` — creates user and returns JWT
     - `createTestCourse(instructorId)` — creates course
     - `createTestSession(courseId)` — creates session
     - `authenticatedRequest(jwt)` — returns supertest agent with auth header
   - Add scripts to `package.json`:
     ```json
     "test": "vitest run",
     "test:watch": "vitest",
     "test:coverage": "vitest run --coverage"
     ```

2. Client test setup (`client/`):
   - Vitest config for React (with `@testing-library/react`)
   - Install: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `msw` (Mock Service Worker)
   - Create `test/setup.js` with MSW handlers for API mocking
   - Add test scripts to `package.json`

3. Playwright setup (root level):
   - Install: `@playwright/test`
   - Create `playwright.config.js`:
     - Base URL from env
     - Run server and client before tests (or expect them running)
     - Screenshot on failure
     - Video recording option
   - Create `e2e/` directory for Playwright tests
   - Add script: `"test:e2e": "playwright test"`

**Acceptance criteria:**
- `cd server && npm test` runs and passes (with empty test suite)
- `cd client && npm test` runs and passes
- `npx playwright test` runs (even if no tests yet)
- Test helpers create realistic test data

### Task 8.2: Auth Route Unit Tests
**Status:** ⬜ Not started

**Instructions:**
1. Create `server/test/routes/auth.test.js`:
   - **POST /api/v1/auth/register**
     - ✅ Creates new user with valid data
     - ✅ First user becomes admin
     - ✅ Second user becomes student
     - ✅ Returns JWT token
     - ❌ Rejects duplicate email
     - ❌ Rejects invalid email format
     - ❌ Rejects weak password
     - ❌ Rejects restricted domain (if configured)
   - **POST /api/v1/auth/login**
     - ✅ Returns JWT with valid credentials
     - ❌ Rejects wrong password
     - ❌ Rejects non-existent email
   - **POST /api/v1/auth/forgot-password**
     - ✅ Sends reset email for existing user
     - ✅ Returns success even for non-existent email (security)
   - **POST /api/v1/auth/reset-password**
     - ✅ Resets password with valid token
     - ❌ Rejects expired token
     - ❌ Rejects invalid token
   - **POST /api/v1/auth/verify-email**
     - ✅ Verifies email with valid token
   - **POST /api/v1/auth/refresh**
     - ✅ Issues new access token
     - ❌ Rejects invalid refresh token

### Task 8.3: Login Flow E2E Test
**Status:** ⬜ Not started

**Instructions:**
1. Create `e2e/login-flow.spec.js`:
   ```javascript
   test('Complete login flow', async ({ page }) => {
     // 1. Navigate to app root
     await page.goto('/')
     // Should redirect to /login
     
     // 2. Register first user (becomes admin)
     // Click "Register" tab
     // Fill: email, password, first name, last name
     // Submit
     // Should redirect to /admin (or appropriate dashboard)
     
     // 3. Verify admin panel is accessible
     // Navigate to /admin
     // Should see admin dashboard tabs
     
     // 4. Logout
     // Click profile menu → Logout
     // Should redirect to /login
     
     // 5. Register second user (becomes student)
     // Fill registration form
     // Should redirect to /student
     
     // 6. Logout and login as admin
     // Login with first user credentials
     // Should see admin panel
     
     // 7. Change second user's role to professor
     // Navigate to Users tab
     // Search for second user
     // Change role to professor
     
     // 8. Logout and login as professor
     // Login with second user credentials
     // Should see professor dashboard
     
     // 9. Test password reset flow
     // Logout
     // Click "Forgot Password?"
     // Enter email
     // (Check that email was sent — may need test SMTP)
   })
   ```

**Acceptance criteria:**
- Test runs against a full stack
- Covers the complete login/registration/role-change flow
- Runs in CI

### Task 8.4: User Management Unit Tests
**Status:** ⬜ Not started

**Instructions:**
1. Create `server/test/routes/users.test.js`:
   - Admin CRUD operations
   - Profile updates
   - Role changes
   - Authorization checks (non-admin can't access admin routes)
   - Pagination works correctly for user listing

---

## Phase 2-3 Tasks

### Task 8.5: Profile Update Flow E2E Test
**Status:** ⬜ Not started

**Instructions:**
1. Create `e2e/profile-flow.spec.js`:
   - Login → navigate to profile
   - Update name, student number
   - Upload profile image
   - Change password
   - Login with new password
   - Change email

### Task 8.6: Course Management Flow E2E Test
**Status:** ⬜ Not started

**Instructions:**
1. Create `e2e/course-flow.spec.js`:
   - Prof creates course → verifies enrollment code
   - Student enrolls with code → sees course on dashboard
   - Prof adds TA → TA appears in course
   - Prof removes student → student no longer sees course
   - Prof archives course → course moves to inactive

### Task 8.7: Course Route Unit Tests
**Status:** ⬜ Not started

---

## Phase 4-5 Tasks

### Task 8.8: Session & Question Flow E2E Test
**Status:** ⬜ Not started

**Instructions:**
1. Create `e2e/session-flow.spec.js`:
   - Prof creates session → adds questions of each type
   - Edits question with rich content and image
   - Sets quiz dates, gives extension
   - Course page shows session with correct status

### Task 8.9: Live Session Flow E2E Test
**Status:** ⬜ Not started

**Instructions:**
1. Create `e2e/live-session-flow.spec.js`:
   - Prof starts session
   - Student opens session in another browser context
   - Student sees current question
   - Student answers → prof sees response count update
   - Prof shows stats → student sees distribution
   - Prof shows correct → student sees correct answer
   - Prof advances to next question → student sees new question
   - Prof ends session
   
   Use Playwright's multiple browser contexts for concurrent users.

### Task 8.10: Quiz Flow E2E Test
**Status:** ⬜ Not started

**Instructions:**
1. Create `e2e/quiz-flow.spec.js`:
   - Prof creates quiz with dates
   - Student accesses quiz within time window
   - Student answers questions (auto-saved)
   - Student submits quiz
   - Student cannot access quiz after submission
   - Another student outside time window cannot access

---

## Phase 6 Tasks

### Task 8.11: Grading Flow E2E Test
**Status:** ⬜ Not started

**Instructions:**
1. Create `e2e/grading-flow.spec.js`:
   - After a session is done with responses
   - Prof calculates grades
   - Auto-grade check for MC/TF questions
   - Manual grade for SA question
   - Add feedback
   - Download CSV
   - Show grades to students
   - Student views their results
   - Grade table shows correct values

---

## Phase 7-8 Tasks

### Task 8.12: Legacy Database Compatibility Tests
**Status:** ⬜ Not started

**Instructions:**
1. Create `server/test/legacy/compatibility.test.js`:
   - Load database from path specified in `LEGACY_DB_PATH` env var
   - Test that each model can load documents from the legacy DB
   - Verify user count
   - Verify sample user can be authenticated (for password-based users)
   - Verify courses, sessions, questions, grades load correctly
   - Verify data relationships are intact

**IMPORTANT:** Never hard-code paths or filenames from legacydb/. Use `process.env.LEGACY_DB_PATH`.

### Task 8.13: CI Pipeline
**Status:** ⬜ Not started

**Instructions:**
1. Create `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on: [push, pull_request]
   jobs:
     test-server:
       runs-on: ubuntu-latest
       services:
         mongo:
           image: mongo:7
           ports: ['27017:27017']
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: '20' }
         - run: cd server && npm ci && npm test
     
     test-client:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: '20' }
         - run: cd client && npm ci && npm test
     
     test-e2e:
       runs-on: ubuntu-latest
       needs: [test-server, test-client]
       services:
         mongo:
           image: mongo:7
           ports: ['27017:27017']
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: '20' }
         - run: npx playwright install --with-deps
         - run: cd server && npm ci && npm start &
         - run: cd client && npm ci && npm run build && npx serve -s dist -l 3000 &
         - run: npx playwright test
   ```

2. Require CI to pass before merging PRs.

### Task 8.14: Documentation
**Status:** ⬜ Not started

**Instructions:**
1. Keep README.md up to date with:
   - Setup instructions (native and Docker)
   - Script documentation
   - Development workflow
   - Testing instructions

2. Create `docs/` directory:
   - `docs/developer-guide.md`: Architecture, how to add features, code conventions
   - `docs/user-guide.md`: How to use Qlicker (for professors and students)
   - `docs/api-reference.md`: Auto-generated from Fastify schemas (using @fastify/swagger) — include instructions to access `/docs` endpoint

3. Keep MIGRATION.md up to date:
   - Update agent status after each task completion
   - Update milestone status
   - Document any deviations from the plan

### Task 8.15: Security Audit
**Status:** ⬜ Not started

**Instructions:**
1. Run `npm audit` on both server and client
2. Review OWASP top 10 against the application
3. Verify:
   - No sensitive data in client bundles
   - JWT tokens properly secured
   - CORS configured correctly
   - Input validation on all endpoints
   - File upload validation
   - Rate limiting on auth endpoints
   - WebSocket authentication required
   - No SQL injection (N/A for MongoDB, but check NoSQL injection)
   - XSS prevention (sanitize user content)

---

## Cross-Checking Responsibilities

Agent 8 is responsible for **regularly cross-checking** that all work aligns with REQUIREMENTS_FOR_MIGRATION_FASTIFY.md. Specifically:

1. After each phase is "complete," verify:
   - All features listed in the corresponding milestone are implemented
   - The UI flows described in the requirements work end-to-end
   - Documentation is up to date
   - Tests cover the milestone features

2. Verify cross-cutting concerns:
   - Image uploads work (S3, Azure, local)
   - SSO SAML works
   - Email sending works
   - Docker and native setups both work
   - Scripts are documented in README

3. Flag any drift from the plan and update MIGRATION.md accordingly.

---

## Notes for Agent 8

- **Test-driven development**: Create tests as features are built, not after.
- **E2E tests are milestone validators**: Each E2E test should verify the functionality described in a milestone.
- **Legacy compatibility tests** must not reference filenames from `legacydb/` — use env vars.
- **CI pipeline** should run on every PR. Keep it fast by running unit tests and E2E tests separately.
- Use **mongodb-memory-server** for unit tests to avoid needing a running MongoDB.
- **Playwright** supports multiple browser contexts — use this for testing concurrent users in live sessions.
- Use **MSW (Mock Service Worker)** for client-side component tests — mock API responses without a real server.
- Keep test data factories consistent across all test files (use the helpers defined in Task 8.1).
- Document all test commands in README.
