# Agent 3: Course Management

> **Role:** Implement course CRUD, enrollment, student/TA management, group management, and video chat integration.
>
> **Reference:** [MIGRATION.md](../MIGRATION.md) | [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](../REQUIREMENTS_FOR_MIGRATION_FASTIFY.md)

---

## Phase 3 Tasks (Milestone 3: Course Management)

### Task 3.1: Course Mongoose Model
**Status:** ⬜ Not started
**Priority:** HIGH — define early so other agents can reference

**Instructions:**
1. Create `server/src/models/Course.js`:
   - Collection name: `courses`
   - Schema:
     ```javascript
     {
       _id: String,                    // Meteor-style random ID
       name: { type: String, required: true },
       deptCode: String,               // e.g. "PHYS"
       courseNumber: String,            // e.g. "101"
       section: String,                // e.g. "001"
       owner: String,                  // User _id of creator
       enrollmentCode: String,         // 6-char random code
       semester: String,               // e.g. "F24", "W25"
       students: [String],             // Array of user _ids
       instructors: [String],          // Array of user _ids (includes TAs)
       sessions: [String],             // Array of session _ids
       inactive: { type: Boolean, default: false },
       requireVerified: { type: Boolean, default: true },
       allowStudentQuestions: { type: Boolean, default: false },
       createdAt: { type: Date, default: Date.now },
       // Group categories
       groupCategories: [{
         categoryNumber: Number,
         categoryName: String,
         groups: [{
           groupNumber: Number,
           groupName: String,
           members: [String]           // User _ids
         }]
       }],
       // Video chat
       videoChatOptions: {
         urlId: String,
         joined: [String],
         apiOptions: Object
       }
     }
     ```
   - Helper method: `generateEnrollmentCode()` — returns 6-char alphanumeric code
   - Helper method: `isInstructor(userId)` — checks if user is in instructors array
   - Helper method: `isStudent(userId)` — checks if user is in students array

**Acceptance criteria:**
- Model is backward compatible with existing course documents in Meteor DB
- Helper methods work correctly

### Task 3.2: Course CRUD Routes
**Status:** ⬜ Not started

**Instructions:**
1. Create `server/src/routes/courses.js`:

   **GET `/api/v1/courses`** (authenticated)
   - Professor: return courses where user is in `instructors`
   - Student: return courses where user is in `students`
   - Admin: return all courses
   - Filter by `active` query param (default: active only)
   - Do NOT return enrollment codes to students

   **POST `/api/v1/courses`** (professor/admin)
   - Body: `{ name, deptCode, courseNumber, section, semester, requireVerified, allowStudentQuestions }`
   - Generate enrollment code
   - Add creator to `instructors` and `owner`
   - Add course to creator's `profile.courses`
   - Return created course

   **GET `/api/v1/courses/:id`** (course member or admin)
   - Return course details
   - Students: filter out enrollment code, filter group data to only show their groups
   - Instructors: full details

   **PATCH `/api/v1/courses/:id`** (course instructor/admin)
   - Update: name, deptCode, courseNumber, section, semester, requireVerified, allowStudentQuestions
   - Validate changes

   **DELETE `/api/v1/courses/:id`** (course owner/admin)
   - Remove course
   - Remove course from all users' `profile.courses`
   - Delete associated sessions, questions, responses, grades
   - Guard: cannot delete if it's a professor's only course? (match Meteor behavior)

   **PATCH `/api/v1/courses/:id/active`** (course instructor/admin)
   - Body: `{ active: boolean }`
   - Toggle `inactive` field

   **POST `/api/v1/courses/:id/regenerate-code`** (course instructor/admin)
   - Generate new enrollment code
   - Return new code

**Acceptance criteria:**
- Full CRUD works with role-based access
- Students cannot see enrollment codes
- Course deletion cleans up all references

### Task 3.3: Enrollment Routes
**Status:** ⬜ Not started

**Instructions:**

   **POST `/api/v1/courses/enroll`** (authenticated student)
   - Body: `{ enrollmentCode }`
   - Find course by code
   - Check if user is already enrolled
   - If course requires verified email, check user's email verification status
   - Add user to course's `students` array
   - Add course to user's `profile.courses`
   - Return course info

   **POST `/api/v1/courses/:id/students`** (course instructor/admin)
   - Body: `{ email }` or `{ userId }`
   - Find user by email or ID
   - Add to students array and user's profile.courses
   - Error if user not found

   **DELETE `/api/v1/courses/:id/students/:studentId`** (course instructor, admin, or the student themselves)
   - Remove student from course's `students` array
   - Remove course from student's `profile.courses`
   - Student can unenroll themselves

   **POST `/api/v1/courses/:id/tas`** (course instructor/admin)
   - Body: `{ email }`
   - Find user by email
   - Move from students to instructors (or add directly)
   - User must be professor role (or promote them)

   **DELETE `/api/v1/courses/:id/tas/:taId`** (course instructor/admin)
   - Remove TA from instructors
   - Guard: cannot remove if last instructor

**Acceptance criteria:**
- Students can enroll by code
- Instructors can add/remove students
- TA management works
- Cannot leave course without instructors

### Task 3.4: Course Tags and Utility Routes
**Status:** ⬜ Not started

**Instructions:**

   **GET `/api/v1/courses/:id/code`** (course instructor/admin)
   - Return enrollment code (plain and formatted)

   **GET `/api/v1/courses/tags`** (professor)
   - Return list of course tags (courseCode formatted) for instructor's courses

   **POST `/api/v1/courses/:id/copy-sessions`** (course instructor/admin)
   - Body: `{ targetCourseId }`
   - Copy all sessions from source to target course
   - Deep copy: sessions → questions (reset responses)
   - Used when re-running a course in a new semester

   **PATCH `/api/v1/courses/:id/verification`** (course instructor/admin)
   - Body: `{ requireVerified: boolean }`

   **PATCH `/api/v1/courses/:id/student-questions`** (course instructor/admin)
   - Toggle `allowStudentQuestions`

---

## Phase 7 Tasks (Milestone 8: Groups & Video)

### Task 3.5: Group Management Routes
**Status:** ⬜ Not started

**Instructions:**

   **GET `/api/v1/courses/:id/groups`** (course member)
   - Return group categories and groups
   - Students: only see groups they're in

   **POST `/api/v1/courses/:id/groups`** (course instructor/admin)
   - Body: `{ categoryName }`
   - Create new group category

   **DELETE `/api/v1/courses/:id/groups/:catId`** (course instructor/admin)
   - Delete group category and all its groups

   **POST `/api/v1/courses/:id/groups/:catId/groups`** (course instructor/admin)
   - Body: `{ groupName }`
   - Add group to category

   **DELETE `/api/v1/courses/:id/groups/:catId/groups/:gId`** (course instructor/admin)
   - Delete specific group

   **PATCH `/api/v1/courses/:id/groups/:catId/groups/:gId`** (course instructor/admin)
   - Body: `{ groupName }` or `{ addMember: userId }` or `{ removeMember: userId }`
   - Update group name or membership

### Task 3.6: Video Chat Integration
**Status:** ⬜ Not started

**Instructions:**
- Jitsi Meet integration for course-level and group-level video chat
- Routes to join/leave video chat rooms
- Store video chat state in course document
- Match existing Meteor functionality:
  - `courses.toggleVideoChat`
  - `courses.joinVideoChat` / `courses.leaveVideoChat`
  - Category-level video chat rooms
  - Jitsi API options configuration

---

## Notes for Agent 3

- **Enrollment codes** are 6-character random alphanumeric strings. Use the same generation method as the Meteor app.
- **Student filtering**: When returning course data to students, always filter out the enrollment code and limit group data to groups they belong to.
- The `profile.courses` array on the User model is a denormalized list. Keep it in sync when adding/removing students from courses.
- The `owner` field represents the original creator. The `instructors` array includes the owner and any TAs.
- Course deletion is a cascading operation — it must clean up sessions, questions, responses, and grades.
- Group categories have a nested structure: `groupCategories[].groups[]`. Each group has `members[]` which are user IDs.
- **Backward compatibility:** The Course model must match the Meteor document structure exactly.
