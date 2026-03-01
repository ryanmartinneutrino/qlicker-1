# Agent 7: Frontend Shell & Shared Components

> **Role:** Build the React frontend application including layout, routing, theming, authentication UI, and all page components.
>
> **Reference:** [MIGRATION.md](../MIGRATION.md) | [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](../REQUIREMENTS_FOR_MIGRATION_FASTIFY.md)

---

## Design Guidelines

- **Framework:** React 18+ with hooks (no class components)
- **Build tool:** Vite
- **UI library:** Material UI (MUI) v5+
- **Routing:** React Router v6
- **State/data:** React Query (TanStack Query) for server state, React Context for auth/WS
- **Charts:** Recharts
- **Math:** KaTeX (lighter than MathJax) or MathJax 3
- **Rich text:** TipTap (modern, extensible) or CKEditor 5
- **Color scheme:** Match existing Qlicker blue (#2196F3 primary), clean Material Design
- **Responsive:** Mobile-friendly, especially student quiz views

### Theme Configuration
```javascript
// theme.js
const theme = createTheme({
  palette: {
    primary: { main: '#2196F3' },      // Qlicker blue
    secondary: { main: '#FF9800' },     // Orange accent
    success: { main: '#4CAF50' },
    error: { main: '#F44336' },
    background: { default: '#FAFAFA' }
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif'
  }
})
```

All components should use the MUI `ThemeProvider` so that style changes propagate globally.

---

## Phase 1 Tasks (Milestone 1: Login Works)

### Task 7.1: React App Scaffold
**Status:** ⬜ Not started
**Priority:** CRITICAL

**Instructions:**
1. Set up Vite + React 18 project in `client/`:
   - Entry point: `src/main.jsx`
   - MUI ThemeProvider wrapper
   - React Router with route definitions
   - Basic layout component (AppBar, main content area)

2. Set up API client (`src/api/client.js`):
   - Fetch/Axios wrapper with base URL from env
   - Auto-attach JWT from localStorage
   - Intercept 401 → attempt refresh → redirect to login
   - Error handling

3. Set up Auth context (`src/contexts/AuthContext.jsx`):
   - Store JWT in localStorage
   - Store user profile in state
   - Login, logout, register functions
   - Auto-refresh on app load
   - `useAuth()` hook

4. Configure Vite proxy:
   ```javascript
   // vite.config.js
   export default defineConfig({
     server: {
       proxy: {
         '/api': 'http://localhost:3001',
         '/ws': { target: 'ws://localhost:3001', ws: true }
       }
     }
   })
   ```

**Acceptance criteria:**
- `npm run dev` starts the React app
- Routes render placeholder components
- API client makes authenticated requests

### Task 7.2: Login & Registration Page
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/pages/Login.jsx`:
   - MUI Card with tabs: "Login" and "Register"
   - Login form: email, password, submit button
   - Register form: email, password, first name, last name, submit
   - SSO login button (if SSO enabled — check `/api/v1/settings/public`)
   - "Forgot password?" link → opens modal/dialog
   - Error display (invalid credentials, domain not allowed, etc.)
   - On success: redirect to appropriate dashboard based on role

2. Create `src/pages/ResetPassword.jsx`:
   - For route `/reset/:token`
   - New password + confirm password form
   - Submit calls `/api/v1/auth/reset-password`

3. Create `src/pages/Home.jsx`:
   - Public landing page
   - Brief description of Qlicker
   - Link to login
   - Match existing homepage style but modernized

**Acceptance criteria:**
- User can register, log in, and be redirected based on role
- SSO button appears when enabled
- Password reset flow works
- Clean, Material Design look

### Task 7.3: App Layout & Navigation
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/components/layout/AppLayout.jsx`:
   - MUI AppBar with:
     - Qlicker logo/name
     - Course selector dropdown (for logged-in users with courses)
     - Profile avatar/menu (name, logout, profile link)
   - Drawer or sidebar for navigation (optional, per role)
   - Content area with Outlet (React Router)
   - Responsive: collapses to hamburger menu on mobile

2. Create route structure:
   ```jsx
   <Routes>
     <Route path="/" element={<Home />} />
     <Route path="/login" element={<Login />} />
     <Route path="/login/email" element={<Login allowEmail />} />
     <Route path="/reset/:token" element={<ResetPassword />} />
     <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
       <Route path="/profile" element={<Profile />} />
       <Route path="/admin" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
       <Route path="/manage" element={<RequireRole role="professor"><ProfDashboard /></RequireRole>} />
       <Route path="/student" element={<StudentDashboard />} />
       <Route path="/courses" element={<ManageCourses />} />
       <Route path="/course/:courseId" element={<CoursePage />} />
       <Route path="/course/:courseId/questions" element={<QuestionsLibrary />} />
       <Route path="/course/:courseId/groups" element={<ManageGroups />} />
       <Route path="/course/:courseId/grades" element={<CourseGrades />} />
       <Route path="/course/:courseId/session/edit/:sessionId" element={<EditSession />} />
       <Route path="/course/:courseId/session/run/:sessionId" element={<RunSession />} />
       <Route path="/course/:courseId/session/present/:sessionId" element={<PresentSession />} />
       <Route path="/course/:courseId/session/:sessionId/grade" element={<GradeSession />} />
       <Route path="/course/:courseId/session/:sessionId/results" element={<SessionResults />} />
       <Route path="/courses/results" element={<ResultsOverview />} />
     </Route>
   </Routes>
   ```

3. Create `src/components/common/RequireAuth.jsx` — redirects to login if not authenticated
4. Create `src/components/common/RequireRole.jsx` — shows 403 if role doesn't match

**Acceptance criteria:**
- Navigation works for all roles
- Protected routes redirect to login
- Role-based routes show 403 for unauthorized users
- Responsive layout

### Task 7.4: Admin Panel
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/pages/admin/AdminDashboard.jsx`:
   - Tabbed interface with MUI Tabs:
     - **Main Settings**: App settings form (restrictDomain, allowedDomains, requireVerified, admin email)
     - **Users**: User management table with search, pagination, role filter, create user dialog
     - **Images**: Image storage configuration (S3/Azure/Local settings)
     - **SSO**: SAML SSO configuration form
     - **Video Chat**: Jitsi configuration

2. User management improvements (vs Meteor version):
   - **Paginated table** (NOT loading all users at once) — use server-side pagination
   - Search by name or email
   - Filter by role
   - Inline role change dropdown
   - Create user dialog
   - Delete user confirmation

**Acceptance criteria:**
- Admin can manage all settings
- User table loads fast (paginated)
- Settings changes save correctly

---

## Phase 2 Tasks (Milestone 2: Profile & Uploads)

### Task 7.5: Profile Page
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/pages/Profile.jsx`:
   - Display: name, email, role, student number
   - Edit: first name, last name, student number
   - Change email (with domain validation)
   - Change password (current + new + confirm)
   - Profile image upload:
     - Get signed URL from API
     - Upload directly to S3/Azure from browser
     - Or upload to server for local storage
     - Show preview, support image rotation
   - Send verification email button (if not verified)

**Acceptance criteria:**
- Profile editing works
- Image upload works with configured storage
- Password change works
- Email verification request works

---

## Phase 3 Tasks (Milestone 3: Courses)

### Task 7.6: Professor Dashboard
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/pages/professor/ProfDashboard.jsx`:
   - Grid of course cards for instructor's active courses
   - "Create Course" button → CreateCourseDialog
   - "Manage All Courses" button → navigate to /courses
   - Course cards show: name, code, semester, student count

2. Create `src/components/common/CourseCard.jsx`:
   - MUI Card with course info
   - Click navigates to course page

3. Create `src/pages/professor/ManageCourses.jsx`:
   - List of all courses (active and inactive)
   - Archive/unarchive, delete actions

4. Create dialogs:
   - `CreateCourseDialog.jsx`: name, dept code, number, section, semester, options
   - `CourseOptionsDialog.jsx`: edit course settings

### Task 7.7: Student Dashboard
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/pages/student/StudentDashboard.jsx`:
   - Grid of enrolled courses
   - "Enroll in Course" button → EnrollDialog
   - Show active and inactive courses (separated)

2. Create `EnrollDialog.jsx`:
   - Enter enrollment code
   - Submit to `/api/v1/courses/enroll`

### Task 7.8: Course Page (Professor & Student Views)
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/pages/CoursePage.jsx`:
   - Detect user role in course (instructor vs student)
   - Render different views:

   **Professor view:**
   - Course info header (name, enrollment code, semester)
   - Tabs: Sessions, Students, TAs, Settings
   - Sessions tab: list of sessions with status badges, create/edit/delete/start/end actions
   - Students tab: student list, add/remove students
   - TAs tab: TA list, add/remove TAs
   - Settings tab: course options

   **Student view:**
   - Course info header
   - List of sessions (only visible/running/done)
   - Active sessions highlighted
   - Click session → navigate to present session or review

2. Session list items should show:
   - Name, status badge (hidden/visible/running/done)
   - Quiz dates (if applicable)
   - Actions (context-dependent)

3. Use WebSocket for real-time updates:
   - Join `course:{courseId}` room
   - Listen for `course:session-updated` and `course:students-updated`
   - Auto-refresh affected data

**Acceptance criteria:**
- Both professor and student views work
- Real-time updates on course page

---

## Phase 4-5 Tasks (Milestones 4-6: Sessions, Questions, Live)

### Task 7.9: Session Editor Page
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/pages/professor/EditSession.jsx`:
   - Session details form (name, description, dates)
   - Quiz configuration (quiz mode toggle, start/end dates, practice quiz)
   - Question list with drag-and-drop reordering
   - "Add Question" button → question creation or library picker
   - Each question: preview, edit, delete, move up/down
   - Quiz extensions panel (per-student time extensions)

2. Question editor dialog:
   - Question type selector (SA, MC, TF, MS, NU)
   - Rich text editor (TipTap/CKEditor) with image upload and MathJax
   - Option editor (add/remove options, mark correct)
   - For numerical: correct value and tolerance
   - Tags input
   - Points and max attempts configuration

### Task 7.10: Question Display Component
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/components/questions/QuestionDisplay.jsx`:
   - Render question content (HTML with MathJax)
   - Based on type, render appropriate input:
     - SA: text area / rich text editor
     - MC: radio buttons
     - TF: true/false radio buttons
     - MS: checkboxes
     - NU: number input
   - Show/hide correct answer based on props
   - Show/hide stats based on props
   - Submit answer button
   - Read-only mode for review

### Task 7.11: Run Session Page (Professor)
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/pages/professor/RunSession.jsx`:
   - WebSocket connection to `session:{sessionId}`
   - Question navigation sidebar/panel
   - Current question display (large view)
   - Controls: next question, previous question, start attempt, close attempt
   - Toggle buttons: show stats, show correct, hide question
   - Live response count
   - Answer distribution chart (Recharts)
   - Student joined count
   - End session button

### Task 7.12: Present Session Page (Student)
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/pages/student/PresentSession.jsx`:
   - WebSocket connection to `session:{sessionId}`
   - Show current question (updates in real-time)
   - Answer input based on question type
   - Submit response
   - Show stats when professor enables (answer distribution)
   - Show correct answer when professor enables
   - Multiple attempts support
   - Waiting screen when no question is active

2. Create `src/pages/student/QuizSession.jsx`:
   - Show all questions at once (quiz mode)
   - Question navigation panel on side
   - Auto-save responses (debounced)
   - Submit quiz button (with confirmation)
   - Timer display (based on server time)
   - Mark unanswered questions visually

### Task 7.13: Answer Distribution Charts
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/components/questions/AnswerDistribution.jsx`:
   - Bar chart (Recharts) showing response counts per option
   - Support multiple attempts (stacked or side-by-side)
   - For numerical: histogram
   - Color coding: correct answer highlighted

---

## Phase 6 Tasks (Milestone 7: Grading)

### Task 7.14: Grade Session Page
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/pages/professor/GradeSession.jsx`:
   - Question-by-question grading interface
   - For each question: show student responses, auto-grade results, manual override
   - Feedback text field per response
   - Points input per response
   - Auto-grade button (individual and batch)
   - Search/filter by student name
   - Navigation between questions and students
   - "Calculate Grades" button
   - "Show/Hide Grades to Students" toggle

### Task 7.15: Grade Table & Course Grades
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/pages/CourseGrades.jsx`:
   - Table: rows = students, columns = sessions
   - Cell values: grade percentage
   - Color coding: green (high), yellow (mid), red (low)
   - Sortable columns
   - Download CSV button
   - Click cell → navigate to student's grade detail

2. Create `src/components/grades/GradeTable.jsx`:
   - Reusable MUI DataGrid or custom table
   - Virtual scrolling for performance with many students

### Task 7.16: Student Results View
**Status:** ⬜ Not started

**Instructions:**
1. Create `src/pages/student/SessionResults.jsx`:
   - Show each question with student's answer
   - Show correct answer (if reviewable)
   - Show grade/points per question
   - Show feedback
   - Overall session grade

---

## Phase 7 Tasks (Milestone 8: Groups & Video)

### Task 7.17: Group Management UI
**Status:** ⬜ Not started

### Task 7.18: Video Chat UI (Jitsi)
**Status:** ⬜ Not started

---

## Notes for Agent 7

- **Use React 18+ patterns**: hooks, functional components, Suspense/lazy loading for code splitting.
- **TanStack Query (React Query)** for all server data: handles caching, refetching, loading states.
- **WebSocket context** should provide hooks like `useSessionEvents(sessionId)` that auto-join/leave rooms.
- **MUI components** for everything — avoid custom CSS except for the theme. Use `sx` prop and `styled()`.
- **Responsive design** is critical for student quiz views (students often use phones).
- **MathJax/KaTeX** rendering must work in both question display and question editor preview.
- **Rich text editor** must support image insertion (via the upload API) and LaTeX equations.
- **Question editor** should auto-save (debounced) to prevent data loss — matches Meteor behavior.
- **Admin user table** must be paginated server-side. This is an explicit improvement over the Meteor version.
- Coordinate with backend agents (2, 3, 4, 5, 6) on API contracts and data formats.
- The frontend should degrade gracefully if WebSocket is unavailable (fall back to polling).
