# Agent 5: Responses & Real-Time

> **Role:** Implement response submission, real-time WebSocket infrastructure, live session events, response statistics, and quiz auto-save.
>
> **Reference:** [MIGRATION.md](../MIGRATION.md) | [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](../REQUIREMENTS_FOR_MIGRATION_FASTIFY.md)

---

## Phase 5 Tasks (Milestone 6: Interactive Sessions Work)

### Task 5.1: Response Mongoose Model
**Status:** ⬜ Not started
**Priority:** HIGH — define early for Agent 6

**Instructions:**
1. Create `server/src/models/Response.js`:
   - Collection name: `responses`
   - Schema:
     ```javascript
     {
       _id: String,                    // Meteor-style random ID
       attempt: { type: Number, required: true },
       questionId: { type: String, required: true },
       studentUserId: { type: String, required: true },
       answer: Schema.Types.Mixed,     // String for SA/NU, String for MC/TF, [String] for MS
       answerWysiwyg: String,          // Rich text answer (SA)
       correct: Boolean,               // Auto-graded result
       createdAt: { type: Date, default: Date.now },
       updatedAt: Date,
       editable: { type: Boolean, default: false }
     }
     ```
   - Index: `{ questionId: 1, studentUserId: 1, attempt: 1 }`
   - Index: `{ questionId: 1 }`

**Acceptance criteria:**
- Model loads existing responses from Meteor DB
- Indexes are created for query performance

### Task 5.2: Response Routes
**Status:** ⬜ Not started

**Instructions:**
1. Create `server/src/routes/responses.js`:

   **POST `/api/v1/responses`** (authenticated student)
   - Body: `{ questionId, attempt, answer, answerWysiwyg }`
   - Validate: question exists, student is in the course, attempt is open
   - For quiz questions: set `editable: true`
   - Auto-grade for MC/TF/MS/NU types:
     - MC: compare selected option to correct option
     - TF: compare answer to correct option
     - MS: compare selected set to correct set (exact match)
     - NU: check if answer is within tolerance of correct value
   - Set `correct` field based on auto-grading
   - Emit WebSocket event: `session:response-added` (for live stats)
   - Return created response

   **PATCH `/api/v1/responses/:id`** (response owner)
   - Body: `{ answer, answerWysiwyg }`
   - Only if `editable: true` (quiz mode)
   - Re-calculate `correct` field
   - Update `updatedAt` timestamp
   - Return updated response

   **GET `/api/v1/questions/:id/responses`** (course instructor or own responses)
   - Instructor: return all responses for the question
   - Student: return only their own responses
   - Query params: `attempt` filter

   **GET `/api/v1/sessions/:id/responses`** (course member)
   - Instructor: return all responses for all questions in session
   - Student: return only their own responses
   - Filter based on question visibility and stats settings

   **GET `/api/v1/courses/:id/responses`** (course member)
   - Instructor: return all responses for all sessions in course
   - Student: return only their own responses

**Auto-grading logic:**
```javascript
function autoGrade(question, answer) {
  switch (question.type) {
    case QUESTION_TYPE.MC: // 2
    case QUESTION_TYPE.TF: // 3
      const correctOption = question.options.find(o => o.correct)
      return answer === correctOption.answer
    case QUESTION_TYPE.MS: // 4
      const correctSet = question.options.filter(o => o.correct).map(o => o.answer).sort()
      const answerSet = [...answer].sort()
      return JSON.stringify(correctSet) === JSON.stringify(answerSet)
    case QUESTION_TYPE.NU: // 5
      const numAnswer = parseFloat(answer)
      return Math.abs(numAnswer - question.correctNumerical) <= question.toleranceNumerical
    case QUESTION_TYPE.SA: // 1
      return null // Cannot auto-grade
  }
}
```

**Acceptance criteria:**
- Students can submit responses
- Auto-grading works for MC, TF, MS, NU
- Quiz responses are editable until submission
- Proper access control (students see only their responses)

### Task 5.3: WebSocket Infrastructure
**Status:** ⬜ Not started
**Priority:** CRITICAL for real-time features

**Instructions:**
1. Create `server/src/plugins/websocket.js`:
   - Register `@fastify/websocket`
   - Create WebSocket connection manager:
     ```javascript
     class WSManager {
       // Map of roomId -> Set of WebSocket connections
       rooms = new Map()
       
       // Map of userId -> Set of WebSocket connections (user may have multiple tabs)
       userConnections = new Map()
       
       join(ws, roomId)
       leave(ws, roomId)
       broadcast(roomId, event, data)      // Send to all in room
       sendToUser(userId, event, data)     // Send to specific user
       
       // Room naming convention:
       // session:{sessionId}      — live session room
       // course:{courseId}        — course updates room
     }
     ```

2. Create WebSocket route handler:
   ```javascript
   fastify.get('/ws', { websocket: true }, (socket, req) => {
     // Authenticate: require JWT token as query param or in first message
     // Parse incoming messages: { type, payload }
     // Route to appropriate handler
   })
   ```

3. Authentication:
   - Client sends JWT token as query parameter: `/ws?token=...`
   - Verify token on connection
   - Attach user info to connection
   - Reject unauthenticated connections

4. Message format (JSON):
   ```javascript
   // Client → Server
   { type: 'join', room: 'session:abc123' }
   { type: 'leave', room: 'session:abc123' }
   
   // Server → Client
   { type: 'session:question-changed', payload: { questionId, sessionId } }
   { type: 'session:response-added', payload: { questionId, count, stats } }
   { type: 'session:status-changed', payload: { sessionId, status } }
   { type: 'session:question-updated', payload: { questionId, sessionOptions } }
   { type: 'session:student-joined', payload: { sessionId, count } }
   { type: 'course:session-updated', payload: { courseId, sessionId, status } }
   { type: 'course:students-updated', payload: { courseId } }
   ```

**Acceptance criteria:**
- WebSocket connections authenticated via JWT
- Clients can join/leave rooms
- Broadcasting works to all clients in a room
- Unauthenticated connections are rejected
- Multiple tabs from same user handled correctly

### Task 5.4: Live Session WebSocket Events
**Status:** ⬜ Not started

**Instructions:**
1. Create `server/src/websocket/session-live.js`:
   - When a professor starts/ends a session → broadcast `session:status-changed`
   - When a professor changes current question → broadcast `session:question-changed`
   - When a student submits a response → broadcast `session:response-added` to session room
     - Include updated response statistics (count per option for MC/TF/MS, histogram data for NU)
     - For professors: send full stats
     - For students: only send if question's `sessionOptions.stats` is true
   - When professor toggles stats/correct/hidden → broadcast `session:question-updated`
   - When student joins → broadcast `session:student-joined` with updated count

2. Response statistics calculation:
   ```javascript
   function calculateResponseStats(questionId, attempt) {
     // For MC/TF/MS: count responses per option
     // For NU: collect numerical values for histogram
     // For SA: count total responses
     // Return: { total, optionCounts: { A: 5, B: 3, ... }, values: [...] }
   }
   ```

3. Create `server/src/websocket/course-updates.js`:
   - When a session status changes → broadcast `course:session-updated` to course room
   - When students enroll/unenroll → broadcast `course:students-updated` to course room

**Acceptance criteria:**
- Professor sees live response counts during interactive session
- Students see question changes instantly
- Stats display toggles take effect immediately for students
- Course page shows session status changes without refresh

### Task 5.5: Quiz Auto-Save
**Status:** ⬜ Not started

**Instructions:**
1. Quiz responses should be auto-saved:
   - When a student first answers a quiz question → create response with `editable: true`
   - When student changes answer → update existing response (PATCH)
   - When student submits quiz → all responses become `editable: false`
   - The frontend should debounce auto-save (every 3-5 seconds of inactivity)

2. Quiz access control:
   - Check server time (not client time) for quiz availability
   - Check `quizStart`, `quizEnd`, and `quizExtensions` for the student
   - If quiz expired: reject new responses and updates
   - If student already submitted (`submittedQuiz` array): reject all changes

**Acceptance criteria:**
- Quiz answers persist even without explicit save
- Server-side time check prevents late submissions
- Submitted quizzes cannot be modified

### Task 5.6: Rate Limiting & Security
**Status:** ⬜ Not started

**Instructions:**
1. Rate limit WebSocket messages:
   - Max 10 messages per second per connection
   - Disconnect clients that exceed limit

2. Rate limit response submission:
   - Max 1 response per question per attempt per student (upsert pattern)
   - Prevent spam submissions

3. Validate all WebSocket messages:
   - Check room access (student must be enrolled in course to join session room)
   - Validate message format

**Acceptance criteria:**
- Rate limiting prevents abuse
- Room access checks prevent unauthorized data access

---

## Notes for Agent 5

- **The WebSocket infrastructure is the most critical real-time component.** It replaces Meteor's reactive subscriptions for live sessions.
- **Room-based broadcasting** is essential for scalability. Each session and course has its own room.
- **Response statistics** must be calculated efficiently. Consider caching stats and updating incrementally when new responses arrive.
- For **load balancing** (multiple server instances), the WebSocket manager will eventually need a shared pub/sub backend (e.g., Redis). For now, single-instance is fine, but design the `WSManager` interface to be replaceable.
- **Auto-grading** must match the Meteor app's behavior exactly. The `correct` field on responses is set at submission time.
- **Quiz timing**: Always use server time. The endpoint should return the server's current time so the frontend can display an accurate countdown.
- **Editable responses**: In quiz mode, responses start as `editable: true`. When the student submits the quiz or the quiz timer expires, they become `editable: false`.
- Coordinate with Agent 4 on WebSocket event emission from session lifecycle routes.
- Coordinate with Agent 7 on WebSocket client implementation and event handling.
