# Grading (User Manual)

This guide covers grading workflows for instructors and students.

## Instructor Workflow

1. Open a course and go to the `Grades` tab.
2. Select one or more sessions to display.
3. Use `Re-calculate` (per session or all visible sessions) to run autograding.
4. Click a grade cell to open grade details.
5. Edit marks and feedback per question as needed.
6. Export CSV using the currently visible columns/sessions.

## Session Review Workflow

1. Open `Review` for a session.
2. Switch to the `Grading` tab.
3. Recalculate and review conflicts/warnings.
4. Resolve manual-vs-auto conflicts by accepting auto marks per row or all at once.

## Reviewable and Student Visibility

- Making a session reviewable triggers grade backfill for missing students and makes grades visible.
- Making a session non-reviewable hides grades from students.
- If autograding cannot fully grade a session, warnings are shown (for example, short-answer marks still needing manual grading).

## Multiple-Select Scoring Methods

Configured in Session Editor:

- `Right minus wrong` (default)
- `All or nothing`
- `Correctness ratio`

Tooltip text in Session Editor explains each formula.

## Manual Overrides

- Manual mark edits are preserved during recalculation.
- If recalculation disagrees with existing manual marks, those marks are not overwritten automatically.
- A conflict dialog lists these differences and allows applying auto values explicitly.

## Student View

- Students only see their own grades.
- Students only see sessions that are reviewable and visible to students.
- A non-reviewable session does not appear in the student grade table.
