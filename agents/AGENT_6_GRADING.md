# Agent 6: Grading System

> **Role:** Implement grade calculation, manual/automatic grading, grade visibility, CSV export, session review, and participation tracking.
>
> **Reference:** [MIGRATION.md](../MIGRATION.md) | [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](../REQUIREMENTS_FOR_MIGRATION_FASTIFY.md)

---

## Phase 6 Tasks (Milestone 7: Grading Works)

### Task 6.1: Grade Mongoose Model
**Status:** ⬜ Not started
**Priority:** HIGH — define early

**Instructions:**
1. Create `server/src/models/Grade.js`:
   - Collection name: `grades`
   - Schema:
     ```javascript
     {
       _id: String,                    // Meteor-style random ID
       userId: { type: String, required: true },
       courseId: { type: String, required: true },
       sessionId: { type: String, required: true },
       name: String,                   // Session name (denormalized)
       marks: [{
         questionId: String,
         responseId: String,
         attempt: Number,
         points: { type: Number, default: 0 },
         outOf: { type: Number, default: 1 },
         automatic: { type: Boolean, default: true },
         needsGrading: { type: Boolean, default: false },
         feedback: String
       }],
       joined: { type: Boolean, default: false },
       participation: { type: Number, default: 0 },  // 0-100 percentage
       value: { type: Number, default: 0 },           // Overall grade 0-100
       automatic: { type: Boolean, default: true },
       points: { type: Number, default: 0 },
       outOf: { type: Number, default: 0 },
       numAnswered: { type: Number, default: 0 },
       numQuestions: { type: Number, default: 0 },
       numAnsweredTotal: { type: Number, default: 0 },
       numQuestionsTotal: { type: Number, default: 0 },
       visibleToStudents: { type: Boolean, default: false },
       needsGrading: { type: Boolean, default: false }
     }
     ```
   - Index: `{ sessionId: 1, userId: 1 }` (unique)
   - Index: `{ courseId: 1, userId: 1 }`

**Acceptance criteria:**
- Model loads existing grades from Meteor DB
- All denormalized fields preserved

### Task 6.2: Grade Calculation Service
**Status:** ⬜ Not started
**Priority:** CRITICAL — core business logic

**Instructions:**
1. Create `server/src/services/grading.js`:

   **`calculateSessionGrades(sessionId)`**
   - For each student who joined the session:
     - For each question in the session:
       - Find the student's response (latest attempt, or best attempt based on weights)
       - Calculate points based on question type:
         - MC/TF/MS/NU (auto-gradable): `correct ? points : 0`
         - SA: mark as `needsGrading: true`
       - Apply attempt weights if configured (`sessionOptions.attemptWeights`)
     - Create or update Grade document
     - Calculate totals: `points`, `outOf`, `value`, `participation`
     - Set `needsGrading: true` if any mark needs grading

   **`calculateResponsePoints(question, response)`**
   - Replicate the Meteor `calculateResponsePoints` helper:
     ```javascript
     function calculateResponsePoints(question, response) {
       const sessionOptions = question.sessionOptions
       if (!sessionOptions || !sessionOptions.points) return { points: 0, outOf: 0 }
       
       const maxPoints = sessionOptions.points
       const attempt = response.attempt
       const weight = sessionOptions.attemptWeights?.[attempt - 1] ?? 1
       
       let points = 0
       if (response.correct) {
         points = maxPoints * weight
       }
       
       return { points, outOf: maxPoints, automatic: true, needsGrading: false }
     }
     ```
   - For SA questions: `{ points: 0, outOf: maxPoints, automatic: false, needsGrading: true }`

   **`updateGradeTotals(grade)`**
   - Recalculate from marks:
     ```javascript
     grade.points = sum(marks.points)
     grade.outOf = sum(marks.outOf)
     grade.value = grade.outOf > 0 ? (grade.points / grade.outOf) * 100 : 0
     grade.numAnswered = marks.filter(m => m.outOf > 0 && m.responseId).length
     grade.numQuestions = marks.filter(m => m.outOf > 0).length
     grade.numAnsweredTotal = marks.filter(m => m.responseId).length
     grade.numQuestionsTotal = marks.length
     grade.participation = grade.numQuestions > 0 ? (grade.numAnswered / grade.numQuestions) * 100 : 0
     grade.needsGrading = marks.some(m => m.needsGrading)
     ```

**Acceptance criteria:**
- Auto-grades MC/TF/MS/NU correctly
- SA marked for manual grading
- Attempt weights applied correctly
- Grade totals calculated accurately
- Matches Meteor app's grading behavior

### Task 6.3: Grade Routes
**Status:** ⬜ Not started

**Instructions:**
1. Create `server/src/routes/grades.js`:

   **GET `/api/v1/sessions/:id/grades`** (course instructor/admin, or student sees own)
   - Instructor: return all grades for the session
   - Student: return only their own grade (if `visibleToStudents: true`)
   - Include mark details

   **GET `/api/v1/courses/:id/grades`** (course instructor/admin, or student sees own)
   - Return grades for all sessions in the course
   - Students: only their own, only visible ones
   - Support `fields` query param for sparse data (grade table needs only value, sessionId)

   **GET `/api/v1/grades/:id`** (owner or course instructor/admin)
   - Return single grade with full details

   **POST `/api/v1/sessions/:id/grades/calculate`** (course instructor/admin)
   - Trigger `calculateSessionGrades(sessionId)`
   - Return summary (number of grades created/updated)

   **PATCH `/api/v1/grades/:id`** (course instructor/admin)
   - Body: `{ value }` — manual override of grade value
   - Set `automatic: false`

   **PATCH `/api/v1/grades/:id/marks/:questionId`** (course instructor/admin)
   - Body: `{ points, feedback }` — manual mark override
   - Set mark's `automatic: false`
   - Recalculate grade totals

   **POST `/api/v1/grades/:id/marks/:questionId/auto`** (course instructor/admin)
   - Auto-grade a specific mark
   - Set mark's `automatic: true`
   - Recalculate grade totals

   **POST `/api/v1/grades/:id/auto`** (course instructor/admin)
   - Auto-grade all marks in this grade
   - Recalculate totals

   **PATCH `/api/v1/sessions/:id/grades/visibility`** (course instructor/admin)
   - Body: `{ visible: boolean }`
   - Set `visibleToStudents` for all grades in the session

### Task 6.4: CSV Export
**Status:** ⬜ Not started

**Instructions:**

   **GET `/api/v1/sessions/:id/grades/csv`** (course instructor/admin)
   - Generate CSV with columns:
     - Student Name, Student Email, Student Number
     - Per-question columns: Q1 points, Q1 outOf, Q1 feedback
     - Total Points, Total Out Of, Grade (%), Participation (%)
   - Set Content-Type to `text/csv`
   - Set Content-Disposition for download

   **GET `/api/v1/courses/:id/grades/csv`** (course instructor/admin)
   - Generate CSV with columns:
     - Student Name, Student Email, Student Number
     - Per-session columns: Session1 Grade, Session2 Grade, ...
     - Overall average

   **GET `/api/v1/sessions/:id/responses/csv`** (course instructor/admin)
   - Export raw response data:
     - Student, Question, Attempt, Answer, Correct, Timestamp

**Acceptance criteria:**
- CSV exports download correctly
- Data matches what's shown in the UI
- Handles special characters in CSV (quoting)

### Task 6.5: Session Review Data
**Status:** ⬜ Not started

**Instructions:**

   **GET `/api/v1/sessions/:id/review`** (course member, only if session.reviewable)
   - Instructor: return questions with response distributions and all student data
   - Student: return questions with their own responses and the correct answers
   - Include: questions, responses (filtered), grade data

   This endpoint combines data from questions, responses, and grades for the session review UI.

---

## Notes for Agent 6

- **Grade calculation is the most complex business logic.** Replicate the Meteor app's behavior exactly.
- **Denormalization**: The Grade model stores denormalized data (session name, calculated totals). This is intentional for performance — grade tables need to render quickly without joins.
- **Attempt weighting**: `sessionOptions.attemptWeights` is an array where index 0 is the weight for attempt 1, index 1 for attempt 2, etc. If not set, all attempts have weight 1. The student's best weighted score should be used.
- **Participation**: Percentage of graded questions (outOf > 0) that the student answered.
- **Auto-grade vs manual**: Marks can be auto-graded (MC/TF/MS/NU) or require manual grading (SA). An instructor can override any mark manually, setting `automatic: false`.
- **Grade visibility**: Grades are hidden from students by default. The instructor must explicitly show them.
- **CSV export**: Must handle edge cases — students with no responses, questions with no points, etc.
- **Performance**: Grade calculation for a large session (1000 students, 50 questions) must complete in reasonable time. Consider batch operations.
- Coordinate with Agent 4 for the `session.reviewable` toggle (which triggers grade calculation).
- Coordinate with Agent 5 for response data access.
- **Backward compatibility**: Grade documents must match the Meteor structure.
