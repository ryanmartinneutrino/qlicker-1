# Grading (Developer Notes)

## Scope

Core grading is implemented in:

- `server/src/services/grading.js`
- `server/src/routes/grades.js`
- `client/src/components/grades/CourseGradesPanel.jsx`

Session reviewable integration is in:

- `server/src/routes/sessions.js`

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

## Route Summary

- `POST /api/v1/sessions/:id/grades/recalculate`
- `GET /api/v1/sessions/:id/grades`
- `PATCH /api/v1/sessions/:id/grades/visibility`
- `PATCH /api/v1/grades/:gradeId/marks/:questionId`
- `POST /api/v1/grades/:gradeId/marks/:questionId/set-automatic`
- `PATCH /api/v1/grades/:gradeId/value`
- `POST /api/v1/grades/:gradeId/value/set-automatic`
- `GET /api/v1/courses/:courseId/grades`

## Testing

Server grading coverage:

- `server/test/routes/grades.test.js`
- `server/test/services/grading.test.js`

Run tests:

```bash
npm test --prefix server
```

Frontend validation:

```bash
npm run build --prefix client
npm test --prefix client -- --passWithNoTests
```
