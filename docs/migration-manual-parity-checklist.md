# Migration Manual Parity Checklist

Date: 2026-02-24  
Owner: Agent-08 QA/Parity  
Scope: Final manual parity verification against legacy Meteor behavior

## Usage
1. Run each scenario in Meteor reference and React+Express.
2. Compare user-visible behavior and data effects.
3. Mark `Pass`/`Fail` and add evidence links (screenshots/logs/command output).
4. If `Fail`, create a task ID in `MIGRATION_DETAILS.md` before cutover.

## Student Flows
| ID | Scenario | Expected Result | Status | Evidence |
|---|---|---|---|---|
| STU-01 | Login + CSRF token bootstrap | Login works, no JSON parse/CSRF errors | Pending | |
| STU-02 | View enrolled course sessions | Interactive/quiz sessions visible exactly per enrollment | Pending | |
| STU-03 | Join running session | Session `joined` tracking updates and persists | Pending | |
| STU-04 | Submit responses in interactive session | Attempt/window rules enforced; answer accepted/rejected as expected | Pending | |
| STU-05 | Quiz attempt + submit | Quiz window/extension enforced; submit locks first-attempt edits | Pending | |
| STU-06 | Response privacy when stats hidden | Student sees only own responses | Pending | |
| STU-07 | Response privacy when stats shown | Student sees distribution + anonymized peers only | Pending | |
| STU-08 | Question library: public copy | Student can copy public question to own library; remains unapproved/non-public | Pending | |
| STU-09 | Question library: student restrictions | Student cannot approve/publicize or edit protected fields | Pending | |
| STU-10 | Grade visibility | Student can only read visible grades | Pending | |

## Instructor Flows
| ID | Scenario | Expected Result | Status | Evidence |
|---|---|---|---|---|
| INS-01 | Course/session management | Create/edit/delete session works and syncs course/session references | Pending | |
| INS-02 | Manage session question list | Add from library, remove, reorder questions; order persists | Pending | |
| INS-03 | Run session controls | Status/current question/attempt controls align with legacy semantics | Pending | |
| INS-04 | Question visibility controls | hidden/stats/correct toggles behave as expected for students | Pending | |
| INS-05 | Questions library tabs | Library/public/student-queue views and filters match expected visibility | Pending | |
| INS-06 | Approve/unapprove/public actions | Instructor ownership/approval/public transitions work correctly | Pending | |
| INS-07 | Grade creation/recompute | Grade rows/marks created and recomputed without losing manual overrides | Pending | |
| INS-08 | Grade editing and bulk assignment | Per-student and filtered bulk updates persist correctly | Pending | |
| INS-09 | Grade visibility toggles | Instructor visibility toggles control student read access | Pending | |

## Admin Flows
| ID | Scenario | Expected Result | Status | Evidence |
|---|---|---|---|---|
| ADM-01 | User management listing | Admin can list users and inspect profiles | Pending | |
| ADM-02 | Global course visibility | Admin can read all courses and sessions | Pending | |
| ADM-03 | Auth reset/verification flows | Forgot/reset/verify operations return expected responses | Pending | |

## Groups + Video
| ID | Scenario | Expected Result | Status | Evidence |
|---|---|---|---|---|
| GRP-01 | Group category CRUD | Category/group create/edit/delete and student assignment persist | Pending | |
| GRP-02 | Student group-scoped visibility | Student only sees permitted group/category state | Pending | |
| VID-01 | Course video room | Join/leave tracking and config behavior match legacy expectations | Pending | |
| VID-02 | Group video room | Group room name/config/join tracking match expected behavior | Pending | |

## Data/Compatibility Checks
| ID | Scenario | Expected Result | Status | Evidence |
|---|---|---|---|---|
| DB-01 | Legacy string `_id` continuity | All key collections continue using string IDs | Pending | |
| DB-02 | Legacy documents round-trip | Existing Meteor records are readable/writable without destructive migration | Pending | |
| DB-03 | No destructive schema migrations | Only additive/index-safe updates are applied | Pending | |

## Sign-off
- Student parity sign-off: Pending
- Instructor parity sign-off: Pending
- Admin parity sign-off: Pending
- Final go/no-go recommendation: Pending
