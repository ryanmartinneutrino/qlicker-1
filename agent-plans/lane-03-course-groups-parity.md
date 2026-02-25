# Lane 03 - Course Management + Groups Parity

## Scope
- Course management parity (student/TA add/remove, by-email actions, copy sessions, options).
- Group/category CRUD and student assignment parity.

## Deliverables
- API + UI for TA/student by-email and membership management.
- Group category/group operations and assignment/unassignment parity.
- Groups CSV export parity.

## Progress
- Done: roster parity APIs for by-email membership management:
  - `POST /api/courses/:courseId/students`
  - `POST /api/courses/:courseId/instructors`
  - `DELETE /api/courses/:courseId/instructors/:instructorId`
- Done: course roster UI now supports add-student/add-instructor by email and instructor removal controls.
- Done: authz integration script covers outsider denial + roster lifecycle flow checks.
- Pending: remaining group/category cleanup/renumber edge-case parity matrix closure.

## Acceptance
- Legacy manage-course and manage-course-groups workflows are fully reproducible.

## Mandatory checks
- client + server build
- group management integration tests
