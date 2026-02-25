# UI Parity Audit (Meteor -> React)

Date: 2026-02-25

## Scope
- Legacy source: `imports/startup/client/routes.jsx`, `imports/ui/pages/**`, `imports/ui/modals/**`, `imports/ui/*.jsx`
- New source: `packages/client/src/App.tsx`, `packages/client/src/pages/**`, `packages/client/src/components/**`

## Route parity

All legacy user-facing routes now have React route coverage, including legacy alias paths:
- `/logout`
- `/verify-email/:token`
- `/course/:courseId/videochat`
- `/course/:courseId/session/run/:sessionId/mobile`
- `/reset-password/:token` (compat alias alongside `/reset/:token`)

Notes:
- Legacy `/_id` route param naming was normalized to `:sessionId` on React routes where applicable.
- `/course/:courseId/video` remains as the canonical new path; `/videochat` is now an alias.

## Page-level migration status

Core student/professor/admin pages are present in React:
- auth: login/reset/logout/verify-email/profile
- dashboards: student/professor/admin
- course/session: course, groups, question library, manage session, run/replay/present, grading/results
- video/jitsi: course video chat and window routes

## Component-level migration status

Migration is feature-parity focused, not 1:1 file parity. Many legacy UI pieces were intentionally consolidated:
- legacy modal workflows like add-student/add-TA are now inline actions on the `Course` page
- several old `Clean*` wrappers/tables were replaced by page-local React rendering patterns
- route wrappers from Iron Router were replaced by React Router + `ProtectedRoute`

## Residual UI checks

UI is not a strict component-by-component port. Remaining checks are verification-focused:
- run backup-dataset UAT pass for edge visual workflows (groups, grading tables, exports)
- keep validating role-based visibility and affordances against legacy behavior matrix
