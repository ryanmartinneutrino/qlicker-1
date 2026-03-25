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
3. Use **Re-calculate** for one session or all visible sessions to run autograding.
4. Click a grade cell to open grade details.
5. Edit marks and feedback per question as needed.
6. Export CSV using the currently visible columns or sessions.

### Good instructor habits

- Recalculate after changing scoring rules.
- Finish manual grading for short-answer work before announcing that feedback is complete.
- Leave clear comments when you override an automatically generated score.
- Review grade visibility from the student point of view if a session is meant to be study material later.

## Session review workflow

1. Open **Review** for a session.
2. Switch to the **Grading** tab.
3. If needed, change the point value for a question and confirm the recalculation warning.
4. Recalculate and review any conflicts or warnings.
5. Resolve manual-vs-auto conflicts by accepting auto marks per row or in bulk when appropriate.
6. Return to the student summary view to confirm the grading state makes sense overall.

## Reviewability and student visibility

- Making a session reviewable triggers grade backfill for missing students and makes grades visible.
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
- Students receive notifications when new feedback is published, so concise and actionable comments are better than long notes.

## Student expectations

Students should expect the following:

- they only see their own grades
- they only see sessions that are reviewable and visible to students
- short-answer feedback may arrive later because manual grading takes time
- a session that disappears from the visible grade list is often no longer reviewable
