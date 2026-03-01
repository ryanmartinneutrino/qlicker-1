# Agent 2: Authentication & Users

> **Role:** Implement user authentication (local + SSO), user management, role system, email verification, and password reset.
>
> **Reference:** [MIGRATION.md](../MIGRATION.md) | [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](../REQUIREMENTS_FOR_MIGRATION_FASTIFY.md)

---

## Phase 1 Tasks (Milestone 1: Login Works)

### Task 2.1: User Mongoose Model
**Status:** ⬜ Not started
**Priority:** CRITICAL — blocks auth routes and frontend

**Instructions:**
1. Create `server/src/models/User.js`:
   - Must be **backward compatible** with Meteor's `users` collection
   - Collection name: `users`
   - Schema:
     ```javascript
     {
       _id: String,             // Meteor uses 17-char random strings
       emails: [{
         address: String,       // lowercase
         verified: { type: Boolean, default: false }
       }],
       services: {
         password: {
           bcrypt: String       // Meteor bcrypt format: $2a$10$...
         },
         resume: {
           loginTokens: [{ when: Date, hashedToken: String }]
         },
         email: {
           verificationTokens: [{ token: String, address: String, when: Date }]
         }
       },
       profile: {
         firstname: String,
         lastname: String,
         roles: [String],       // ["student"], ["professor"], or ["admin"]
         courses: [String],     // Array of course _id strings
         studentNumber: String,
         profileImage: String,  // URL
         profileThumbnail: String,
         canPromote: { type: Boolean, default: false }
       },
       createdAt: Date
     }
     ```
   - Add virtual `email` getter that returns first email address
   - Add method `verifyPassword(password)` that handles both Meteor bcrypt format and standard bcrypt
   - Generate Meteor-style `_id` on creation (17-char alphanumeric)

**Important - Meteor password compatibility:**
- Meteor stores passwords as `services.password.bcrypt` using bcrypt with `$2a$` prefix
- When a user logs in, hash the provided password with bcrypt and compare
- The new app should also store passwords in the same format for backward compatibility
- Use `bcryptjs` library which handles both `$2a$` and `$2b$` prefixes

**Acceptance criteria:**
- Model loads existing Meteor users from the database
- `verifyPassword` works with Meteor's bcrypt hashes
- New users created with compatible format

### Task 2.2: Auth Routes
**Status:** ⬜ Not started
**Priority:** CRITICAL

**Instructions:**
1. Create `server/src/routes/auth.js`:

   **POST `/api/v1/auth/register`**
   - Body: `{ email, password, firstname, lastname }`
   - Validate email format and domain restrictions (check Settings collection)
   - Check if user count is 0 → first user becomes admin
   - Hash password with bcrypt (store in `services.password.bcrypt`)
   - Create user with role `["student"]` (or `["admin"]` if first)
   - Return JWT access token + set refresh token in httpOnly cookie
   - Send verification email

   **POST `/api/v1/auth/login`**
   - Body: `{ email, password }`
   - Find user by email (case-insensitive)
   - Verify password using bcrypt
   - Return JWT access token + set refresh token in httpOnly cookie
   - Include user profile in response (exclude services)

   **POST `/api/v1/auth/logout`**
   - Clear refresh token cookie
   - Invalidate refresh token in DB (optional: token blacklist)

   **POST `/api/v1/auth/refresh`**
   - Read refresh token from cookie
   - Verify and issue new access token
   - Rotate refresh token

   **POST `/api/v1/auth/forgot-password`**
   - Body: `{ email }`
   - Generate reset token, store in DB with expiry
   - Send email with reset link (`{ROOT_URL}/reset/{token}`)
   - Always return success (don't reveal if email exists)

   **POST `/api/v1/auth/reset-password`**
   - Body: `{ token, newPassword }`
   - Validate token and expiry
   - Update password
   - Clear all login tokens

   **POST `/api/v1/auth/verify-email`**
   - Body: `{ token }`
   - Find user with matching verification token
   - Set `emails[].verified = true`
   - Remove used token

2. JWT tokens:
   - Access token: 15 min expiry, contains `{ userId, roles }`
   - Refresh token: 7 day expiry, stored in httpOnly cookie
   - Use `@fastify/jwt` for signing/verification

3. Email service (`src/services/email.js`):
   - Use Nodemailer with SMTP config from `MAIL_URL` env var
   - Templates for: verification email, password reset email
   - Extract SMTP config from URL format: `smtp://user:pass@host:port`

**Acceptance criteria:**
- Can register a new user and receive JWT
- Can login with email/password and receive JWT
- Password reset flow works end-to-end
- Email verification flow works
- First user is automatically admin
- Works with existing Meteor users (legacy DB)

### Task 2.3: Auth Middleware
**Status:** ⬜ Not started

**Instructions:**
1. Create `server/src/middleware/auth.js`:
   - `authenticate` — verify JWT from Authorization header, attach user to request
   - `requireRole(roles)` — factory that returns middleware checking `user.profile.roles`
   - `requireAdmin` — shorthand for `requireRole(['admin'])`
   - `requireProfessor` — shorthand for `requireRole(['professor', 'admin'])`
   - `requireCourseInstructor(courseId)` — check user is instructor/admin for the course
   - `requireCourseAccess(courseId)` — check user is student, instructor, or admin for the course

2. Register as Fastify decorators:
   ```javascript
   fastify.decorate('authenticate', async (request, reply) => { ... })
   ```

**Acceptance criteria:**
- Protected routes return 401 without valid JWT
- Role-based routes return 403 for insufficient permissions
- Course-level access checks work correctly

### Task 2.4: User Management Routes (Admin)
**Status:** ⬜ Not started

**Instructions:**
1. Create `server/src/routes/users.js`:

   **GET `/api/v1/users/me`** (authenticated)
   - Return current user profile (exclude `services`)

   **PATCH `/api/v1/users/me`** (authenticated)
   - Update: firstname, lastname, studentNumber
   - Validate input

   **PATCH `/api/v1/users/me/password`** (authenticated)
   - Body: `{ currentPassword, newPassword }`
   - Verify current password, then update

   **PATCH `/api/v1/users/me/image`** (authenticated)
   - Body: `{ profileImage, profileThumbnail }`
   - Update profile image URLs

   **PATCH `/api/v1/users/me/email`** (authenticated)
   - Body: `{ newEmail }`
   - Check domain restrictions
   - Update email, set verified = false
   - Send verification email

   **GET `/api/v1/users`** (admin only)
   - Query params: `search`, `role`, `page`, `limit`
   - Paginated user list (do NOT load all at once — fix for admin slowness)
   - Return user profiles (exclude services)

   **GET `/api/v1/users/:id`** (admin only)
   - Return user profile

   **POST `/api/v1/users`** (admin only)
   - Body: `{ email, password, firstname, lastname, role }`
   - Create user with specified role

   **PATCH `/api/v1/users/:id/role`** (admin or canPromote professor)
   - Body: `{ role }`
   - Admin can set any role
   - Professor with `canPromote` can only promote to professor

   **PATCH `/api/v1/users/:id/canPromote`** (admin only)
   - Toggle `canPromote` flag

   **POST `/api/v1/users/:id/verify-email`** (admin only)
   - Admin-verify a user's email

   **DELETE `/api/v1/users/:id`** (admin only)
   - Delete user and clean up references

   **GET `/api/v1/users/count`** (admin only)
   - Return total user count

   **GET `/api/v1/users/course/:courseId`** (course instructor/admin)
   - Return students in course (paginated)

   **GET `/api/v1/users/course/:courseId/instructors`** (course instructor/admin)
   - Return instructors in course

**Acceptance criteria:**
- Admin can list, search, create, and manage users
- User list is paginated (not loading all users at once)
- Profile updates work
- Role changes work with proper authorization

---

## Phase 2 Tasks (Milestone 2: Profile & Uploads)

### Task 2.5: SAML SSO Plugin
**Status:** ⬜ Not started

**Instructions:**
1. Create `server/src/plugins/saml.js`:
   - Use `@node-saml/passport-saml` (successor to passport-saml)
   - Read SSO config from Settings collection (same fields as Meteor version):
     - `SSO_entrypoint`, `SSO_cert`, `SSO_privKey`, `SSO_identifierFormat`, `SSO_EntityId`
     - `SSO_emailIdentifier`, `SSO_firstNameIdentifier`, `SSO_lastNameIdentifier`
     - `SSO_roleIdentifier`, `SSO_roleProfName`
     - `SSO_logoutUrl`, `SSO_logoutCallbackUrl`
   - Configure SAML strategy

2. Create SSO routes in `server/src/routes/auth.js`:

   **GET `/api/v1/auth/sso/login`**
   - Redirect to IdP with SAML AuthnRequest

   **POST `/api/v1/auth/sso/callback`**
   - Parse SAML assertion
   - Extract user attributes (email, name, role, student number)
   - Find or create user by email
   - If new user: set profile from SAML attributes, auto-assign role if roleIdentifier matches
   - Issue JWT tokens
   - Redirect to frontend with token

   **GET `/api/v1/auth/sso/metadata`**
   - Return SP metadata XML

   **GET `/api/v1/auth/sso/logout`**
   - Initiate SAML logout

   **POST `/api/v1/auth/sso/logout/callback`**
   - Handle logout response

**Acceptance criteria:**
- SAML authentication flow works end-to-end
- New users created from SAML with correct attributes
- Existing users matched by email
- Role mapping works (professor assignment via SAML attribute)
- SP metadata endpoint serves valid XML
- Works with existing SSO settings in legacy database

### Task 2.6: Legacy User Compatibility
**Status:** ⬜ Not started

**Instructions:**
1. Ensure the User model correctly loads users from the Meteor database:
   - Password verification works with Meteor's bcrypt format
   - Profile structure is preserved
   - SSO users (those with `services.sso` or similar) can still log in via SAML
   - Users without passwords (SAML-only) cannot use password login

2. Test with the legacy database dump:
   - Load the `legacydb/` mongodump into a test MongoDB instance
   - Verify user count matches
   - Verify a sample of users can be loaded and their profiles render correctly
   - Verify password verification works for password-based users
   - **IMPORTANT:** Do not reference any filenames from `legacydb/` in code that gets committed

**Acceptance criteria:**
- Existing users from Meteor DB can log in
- Profile data is preserved
- No data migration needed for the users collection

---

## Phase 7 Tasks

### Task 2.7: Microsoft AD / Additional Auth
**Status:** ⬜ Not started (exploration)
- Research Microsoft Active Directory / Azure AD integration
- Evaluate OIDC as alternative/supplement to SAML
- Document findings and implementation plan

---

## Notes for Agent 2

- **Backward compatibility is critical.** The User model must work with existing Meteor data without migration.
- Meteor's `_id` fields are random strings (not ObjectIds). Use `_id: { type: String, default: () => generateMeteorId() }`.
- Meteor stores emails as `emails: [{ address, verified }]` array. The primary email is `emails[0].address`.
- Passwords are in `services.password.bcrypt`. The new system should read/write the same field.
- When creating new users, maintain the same document structure so the legacy Meteor app could theoretically still read them.
- The Settings collection stores SSO configuration. Load it on app startup and watch for changes.
- Rate limit auth endpoints (login, register, forgot-password) to prevent abuse.
- Never return `services` field in API responses (it contains password hashes and tokens).
