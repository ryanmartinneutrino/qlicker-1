# Grading (Developer Notes)

## Scope

Core grading is implemented in:

- `server/src/services/grading.js`
- `server/src/routes/grades.js`
- `client/src/components/grades/CourseGradesPanel.jsx`
- `client/src/components/grades/SessionQuestionGradingPanel.jsx`
- `client/src/components/grades/SpeedGradingModal.jsx`
- `client/src/utils/responses.js`

Session reviewable integration is in:

- `server/src/routes/sessions.js`

## Grading Lifecycle

- Grade rows are seeded when a session reaches `status: 'done'`, even if `reviewable` is still `false`.
- Manual mark edits and recalculation are rejected until the session is ended.
- `reviewable` controls student visibility, not whether instructor-side grade items exist.

## Latest Attempt and Legacy Data

- Per-student grading always uses that student's latest attempt for the question.
- "Latest" means highest `attempt`, with `updatedAt || createdAt` as the tie-breaker.
- The same latest-attempt rule is shared on the client through `client/src/utils/responses.js`; do not duplicate that logic in grading dialogs or review pages.
- Legacy databases may contain duplicate `Grade` rows for the same `{ userId, courseId, sessionId }`. Recalculation and manual mark updates must synchronize all rows for that identity, not just one `_id`.

## Grade Calculation Rules

- SA defaults to `0` points unless explicitly configured in `question.sessionOptions.points`.
- Other question types default to `1` point if unset.
- Supported autogradeable types: MC, TF, MS, NU.
- Attempt weighting uses `question.sessionOptions.maxAttempts` and `attemptWeights`.
- Low-response exclusion: for single-attempt questions only, if unique responders are fewer than 10% of joined students, that question is graded as `outOf=0`.

## Multiple-Select Scoring

- `right-minus-wrong` (default): `max(0, min(1, (2C - S) / K))`
- `all-or-nothing`: exact set match required
- `correctness-ratio`: correctly labeled options / total options

Where:

- `C`: number of selected options that are correct
- `S`: total number of selected options
- `K`: total number of correct options

## Manual Override Semantics

- Mark-level manual override: `mark.automatic = false`.
- Grade-level manual override: `grade.automatic = false`.
- Recalculation preserves manual values and emits conflict records in `summary.manualMarkConflicts`.
- `POST /grades/:gradeId/marks/:questionId/set-automatic` restores mark autograding for one mark.
- `POST /grades/:gradeId/value/set-automatic` restores automatic overall grade value.
- Feedback edits keep `feedbackUpdatedAt` in sync so students receive targeted update notifications.

## Route Summary

- `POST /api/v1/sessions/:id/grades/recalculate` (`status: 'done'` only)
- `GET /api/v1/sessions/:id/grades`
- `PATCH /api/v1/sessions/:id/grades/visibility`
- `PATCH /api/v1/grades/:gradeId/marks/:questionId` (`status: 'done'` only)
- `POST /api/v1/grades/:gradeId/marks/:questionId/set-automatic` (`status: 'done'` only)
- `PATCH /api/v1/grades/:gradeId/value` (`status: 'done'` only)
- `POST /api/v1/grades/:gradeId/value/set-automatic` (`status: 'done'` only)
- `GET /api/v1/courses/:courseId/grades`

Related session lifecycle routes:

- `POST /api/v1/sessions/:id/end`
- `PATCH /api/v1/sessions/:id`

## Testing

Server grading coverage:

- `server/test/routes/grades.test.js`
- `server/test/services/grading.test.js`

Client grading coverage:

- `client/src/components/grades/CourseGradesPanel.test.jsx`
- `client/src/components/grades/SessionQuestionGradingPanel.test.jsx`

Run tests:

```bash
npm test --prefix server
```

Frontend validation:

```bash
npm run build --prefix client
npm test --prefix client -- --passWithNoTests
```
