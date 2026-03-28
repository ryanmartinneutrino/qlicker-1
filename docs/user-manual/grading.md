# Grading Guide

This guide supplements the role manuals and focuses on the parts of Qlicker where reviewability, recalculation, manual grading, and student visibility matter most.

Related manuals:

- [Professor user manual](professor.md)
- [Student user manual](student.md)
- [Admin user manual](admin.md)

## Table of contents

1. [Instructor workflow](#instructor-workflow)
2. [Session review workflow](#session-review-workflow)
3. [Reviewability and student visibility](#reviewability-and-student-visibility)
4. [Multiple-select scoring methods](#multiple-select-scoring-methods)
5. [Manual overrides and feedback](#manual-overrides-and-feedback)
6. [Student expectations](#student-expectations)

## Instructor workflow

1. Open a course and go to the **Grades** tab.
2. Select one or more sessions to display.
3. Make sure the session is **Ended** before you recalculate or edit grades.
4. Use **Re-calculate** for one session or all visible sessions to run autograding.
5. Click a grade cell to open grade details.
6. Edit marks and feedback per question as needed.
7. Export CSV using the currently visible columns or sessions.

### Good instructor habits

- Recalculate after changing scoring rules.
- Finish manual grading for short-answer work before announcing that feedback is complete.
- Leave clear comments when you override an automatically generated score.
- Review grade visibility from the student point of view if a session is meant to be study material later.

## Session review workflow

1. Open **Review** for a session.
2. Switch to the **Grading** tab.
3. If the session is still live and interactive, you can still open review to watch results, but the grading tab stays locked until the session reaches **Ended**.
4. If needed, change the point value for a question and confirm the recalculation warning.
5. Recalculate and review any conflicts or warnings.
6. Resolve manual-vs-auto conflicts by accepting auto marks per row or in bulk when appropriate.
7. Return to the student summary view to confirm the grading state makes sense overall.

Useful cues in the current review UI:

- the Results tab shows the student's actual session grade before participation
- clicking a student avatar in the Students tab opens the larger profile photo
- question rows opened from the course grade table now show the question number plus type, such as `Q4(SA)`, with red/green cues for whether manual grading is still required

## Reviewability and student visibility

- Ending a session creates the instructor-facing grade rows, even if the session is not reviewable yet.
- Making a session reviewable makes those grades visible to students.
- Making a session non-reviewable hides grades from students.
- If autograding cannot fully grade a session, warnings appear so you know more manual work is required.
- A non-reviewable session does not appear in the student grade table, even if the activity has already finished.

## Multiple-select scoring methods

Configured in the Session Editor:

| Method | What it means |
| --- | --- |
| `Right minus wrong` | rewards correct choices and subtracts for incorrect ones |
| `All or nothing` | awards points only when the full answer is correct |
| `Correctness ratio` | awards a proportional score based on correctness |

Tooltip text in the Session Editor explains each formula in the app.

## Manual overrides and feedback

- Manual mark edits are preserved during recalculation.
- Changing a question's point value from the session-review grading panel also triggers recalculation, and those manual marks remain preserved.
- If recalculation disagrees with an existing manual mark, the manual mark is not overwritten automatically.
- A conflict dialog lists these differences and allows you to apply automatic values explicitly.
- When a student has multiple attempts on a question, grading uses that student's latest attempt for that question.
- Zero-point questions should not be treated as needing grading even if an older mark record still has a stale `needsGrading` flag.
- A submitted short-answer response that is blank still counts for participation, but it is automatically scored `0` and does not remain flagged for manual grading.
- Duplicate `{ userId, courseId, sessionId }` grade identities are now blocked in the backend. If you are cleaning up older data, run the documented `scripts/dedupe-grades.js` maintenance script first.
- Students receive notifications when new feedback is published, so concise and actionable comments are better than long notes.

## Student expectations

Students should expect the following:

- they only see their own grades
- they only see sessions that are reviewable and visible to students
- short-answer feedback may arrive later because manual grading takes time, but blank submitted answers do not wait for grading
- a session that disappears from the visible grade list is often no longer reviewable
