# Agent 4: Sessions & Questions

> **Role:** Implement session lifecycle, question management, question types, session editor, quiz configuration, and question library.
>
> **Reference:** [MIGRATION.md](../MIGRATION.md) | [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](../REQUIREMENTS_FOR_MIGRATION_FASTIFY.md)

---

## Phase 4 Tasks (Milestone 4: Session Editor)

### Task 4.1: Session Mongoose Model
**Status:** ⬜ Not started
**Priority:** HIGH — define early for Agent 5 and 6

**Instructions:**
1. Create `server/src/models/Session.js`:
   - Collection name: `sessions`
   - Schema:
     ```javascript
     {
       _id: String,                    // Meteor-style random ID
       name: { type: String, required: true },
       description: String,
       courseId: { type: String, required: true },
       status: {
         type: String,
         enum: ['hidden', 'visible', 'running', 'done'],
         default: 'hidden'
       },
       quiz: { type: Boolean, default: false },
       practiceQuiz: { type: Boolean, default: false },
       date: Date,
       quizStart: Date,
       quizEnd: Date,
       quizExtensions: [{
         odid: String,     // User _id
         value: Number      // Extra minutes
       }],
       questions: [String],            // Ordered array of question _ids
       currentQuestion: String,        // Question _id currently active
       joined: [String],               // User _ids who joined the session
       submittedQuiz: [String],        // User _ids who submitted
       tags: [String],
       reviewable: { type: Boolean, default: false },
       createdAt: { type: Date, default: Date.now }
     }
     ```

**Acceptance criteria:**
- Model loads existing session documents from Meteor DB
- All fields preserved

### Task 4.2: Question Mongoose Model
**Status:** ⬜ Not started
**Priority:** HIGH

**Instructions:**
1. Create `server/src/models/Question.js`:
   - Collection name: `questions`
   - Schema:
     ```javascript
     {
       _id: String,
       plainText: String,
       content: String,               // Rich HTML content
       type: {
         type: Number,
         enum: [1, 2, 3, 4, 5],       // SA=1, MC=2, TF=3, MS=4, NU=5
         required: true
       },
       options: [{
         answer: String,              // Option identifier
         content: String,             // Rich HTML
         plainText: String,
         correct: Boolean,
         wysiwyg: Boolean
       }],
       toleranceNumerical: Number,
       correctNumerical: Number,
       creator: String,               // User _id
       owner: String,                 // User _id (current owner)
       originalQuestion: String,      // Source question _id if copied
       sessionId: String,             // null if library question
       courseId: String,
       public: { type: Boolean, default: false },
       solution: String,              // Rich HTML solution
       solution_plainText: String,
       createdAt: { type: Date, default: Date.now },
       approved: { type: Boolean, default: false },
       tags: [String],
       sessionOptions: {
         hidden: { type: Boolean, default: true },
         stats: { type: Boolean, default: false },
         correct: { type: Boolean, default: false },
         points: { type: Number, default: 1 },
         maxAttempts: { type: Number, default: 1 },
         attemptWeights: [Number],
         attempts: [{
           number: Number,
           closed: Boolean
         }]
       },
       imagePath: String,
       studentCopyOfPublic: { type: Boolean, default: false }
     }
     ```

   - Constants (exported):
     ```javascript
     const QUESTION_TYPE = {
       SA: 1,   // Short Answer
       MC: 2,   // Multiple Choice
       TF: 3,   // True/False
       MS: 4,   // Multi-Select
       NU: 5    // Numerical
     }
     ```

**Acceptance criteria:**
- Model loads existing questions from Meteor DB
- Question types map correctly

### Task 4.3: Session CRUD Routes
**Status:** ⬜ Not started

**Instructions:**
1. Add to `server/src/routes/sessions.js`:

   **POST `/api/v1/courses/:courseId/sessions`** (course instructor)
   - Body: `{ name, description, quiz, quizStart, quizEnd, date, tags }`
   - Create session linked to course
   - Add session _id to course's `sessions` array
   - Return created session

   **GET `/api/v1/sessions/:id`** (course member)
   - Return session details
   - Students: filter hidden sessions, filter question sessionOptions based on visibility flags

   **PATCH `/api/v1/sessions/:id`** (course instructor)
   - Update: name, description, date, quiz, quizStart, quizEnd, tags, practiceQuiz

   **DELETE `/api/v1/sessions/:id`** (course instructor)
   - Remove session from course's `sessions` array
   - Delete all questions with this sessionId
   - Delete all responses for those questions
   - Delete all grades for this session

   **POST `/api/v1/sessions/:id/copy`** (course instructor)
   - Body: `{ targetCourseId }`
   - Deep copy: session + all questions (reset sessionOptions, clear responses)
   - Add to target course's sessions array

   **GET `/api/v1/courses/:courseId/sessions`** (course member)
   - Return all sessions for the course
   - Students: only return visible/running/done sessions
   - Support `fields` query param for sparse responses

**Acceptance criteria:**
- Full session CRUD with proper authorization
- Session deletion cascades correctly
- Copy creates independent duplicates

### Task 4.4: Session Lifecycle Routes
**Status:** ⬜ Not started

**Instructions:**

   **POST `/api/v1/sessions/:id/start`** (course instructor)
   - Set status to `'running'`
   - Set `currentQuestion` to first question
   - Initialize first question's sessionOptions (unhide, start attempt 1)
   - Emit WebSocket event: `session:status-changed`

   **POST `/api/v1/sessions/:id/end`** (course instructor)
   - Set status to `'done'`
   - Emit WebSocket event: `session:status-changed`

   **PATCH `/api/v1/sessions/:id/current`** (course instructor)
   - Body: `{ questionId }`
   - Set `currentQuestion` to the specified question
   - Emit WebSocket event: `session:question-changed`

   **POST `/api/v1/sessions/:id/join`** (authenticated student)
   - Add user to `joined` array (if not already there)
   - Emit WebSocket event: `session:student-joined` (for prof's live count)

   **POST `/api/v1/sessions/:id/submit`** (authenticated student, quiz only)
   - Add user to `submittedQuiz` array
   - Mark all editable responses as uneditable
   - Emit WebSocket event (optional)

   **PATCH `/api/v1/sessions/:id/reviewable`** (course instructor)
   - Toggle `reviewable` flag
   - If setting to true: trigger grade calculation for the session
   - Emit WebSocket event

   **PATCH `/api/v1/sessions/:id/extensions`** (course instructor)
   - Body: `{ extensions: [{ odid, value }] }`
   - Set `quizExtensions` array

**Acceptance criteria:**
- Session can progress through lifecycle: hidden → visible → running → done
- WebSocket events emitted at each state change
- Quiz submission prevents further edits
- Reviewable toggle triggers grade calculation

### Task 4.5: Question CRUD Routes
**Status:** ⬜ Not started

**Instructions:**

   **POST `/api/v1/questions`** (professor or student if course allows)
   - Body: full question object
   - If student-created: set `approved: false`
   - If `sessionId` is set: verify user is instructor for that session's course

   **GET `/api/v1/questions/:id`** (course member)
   - Students: filter based on sessionOptions (hide correct answers if `correct: false`)
   - Students during quiz: return their own responses

   **PATCH `/api/v1/questions/:id`** (question owner/course instructor)
   - Update question content, options, type, etc.
   - If question is in a session, must be course instructor

   **DELETE `/api/v1/questions/:id`** (question owner/course instructor)
   - Remove from session's questions array if in a session
   - Delete associated responses

   **POST `/api/v1/questions/:id/copy`** (authenticated)
   - Copy to user's library (sessionId = null, owner = current user)

   **POST `/api/v1/questions/:id/copy-to-session`** (course instructor)
   - Body: `{ sessionId }`
   - Copy question and attach to session

   **POST `/api/v1/sessions/:id/questions`** (course instructor)
   - Body: `{ questionId }` — add existing question reference to session's questions array

   **DELETE `/api/v1/sessions/:id/questions/:questionId`** (course instructor)
   - Remove question from session's questions array

   **PATCH `/api/v1/sessions/:id/questions/order`** (course instructor)
   - Body: `{ questionIds: [...] }` — reorder questions in session

### Task 4.6: Question Session Controls
**Status:** ⬜ Not started

**Instructions:**
These routes control how a question behaves during a live session:

   **POST `/api/v1/questions/:id/attempt`** (course instructor)
   - Start a new attempt on the question
   - Update `sessionOptions.attempts` array
   - Emit WebSocket event: `session:question-updated`

   **PATCH `/api/v1/questions/:id/attempt-status`** (course instructor)
   - Body: `{ closed: boolean }`
   - Open or close the latest attempt
   - Emit WebSocket event

   **PATCH `/api/v1/questions/:id/visibility`** (course instructor)
   - Body: `{ hidden: boolean }`
   - Show or hide question in session
   - Emit WebSocket event

   **PATCH `/api/v1/questions/:id/stats`** (course instructor)
   - Body: `{ show: boolean }`
   - Show or hide answer distribution to students
   - Emit WebSocket event

   **PATCH `/api/v1/questions/:id/correct`** (course instructor)
   - Body: `{ show: boolean }`
   - Show or hide correct answer to students
   - Emit WebSocket event

### Task 4.7: Question Library Routes
**Status:** ⬜ Not started

**Instructions:**

   **GET `/api/v1/courses/:courseId/questions/library`** (course instructor)
   - Return questions where `courseId` matches and `sessionId` is null and `approved: true`
   - These are the instructor's reusable question bank

   **GET `/api/v1/courses/:courseId/questions/public`** (course member)
   - Return questions where `public: true` and `approved: true`

   **GET `/api/v1/courses/:courseId/questions/unapproved`** (course instructor)
   - Return student-submitted questions that are not yet approved

   **PATCH `/api/v1/questions/:id/approve`** (course instructor)
   - Set `approved: true`

   **PATCH `/api/v1/questions/:id/tags`** (course instructor)
   - Body: `{ add: "tag" }` or `{ remove: "tag" }`

   **GET `/api/v1/questions/tags`** (professor)
   - Body/query: `{ courseId }`
   - Return list of all tags used in questions for this course

   **GET `/api/v1/sessions/tags`** (professor)
   - Return list of all tags used in sessions

---

## Notes for Agent 4

- **Question types** (SA=1, MC=2, TF=3, MS=4, NU=5) must use the same numeric codes for backward compatibility.
- **sessionOptions** is a sub-document on the question that controls runtime behavior during a live session. It's not persisted globally — it changes as the professor interacts.
- **Question copying**: When copying a question to a session, the `originalQuestion` field should reference the source. The copy gets its own `_id` and has `sessionId` set.
- **Session lifecycle**: The status transitions are `hidden → visible → running → done`. Not all transitions are reversible in the current Meteor app.
- **Quiz extensions**: `quizExtensions` is an array of `{ odid: userId, value: extraMinutes }`. The frontend uses the current server time plus extension to determine if a student can still access the quiz.
- **WebSocket events** should be emitted for all state changes that affect the live session experience. Coordinate with Agent 5 on event format.
- **Backward compatibility**: All models must match the Meteor document structure exactly.
