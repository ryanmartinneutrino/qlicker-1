# UI Parity Audit (Meteor -> React)

Date: 2026-02-26

## Scope
- Legacy source: `imports/startup/client/routes.jsx`, `imports/ui/pages/**`, `imports/ui/modals/**`, `imports/ui/*.jsx`
- New source: `packages/client/src/App.tsx`, `packages/client/src/pages/**`, `packages/client/src/components/**`

## Route parity

All legacy user-facing routes have React route coverage, including compatibility aliases:
- `/logout`
- `/verify-email/:token`
- `/course/:courseId/videochat`
- `/course/:courseId/session/run/:sessionId/mobile`
- `/reset-password/:token`

Notes:
- Legacy `/_id` route param naming is normalized to `:sessionId`.
- `/course/:courseId/video` remains canonical; `/videochat` is an alias.

## Global shell parity

Implemented in PR `#84`:
- authenticated app shell wrapper for protected routes
- course switcher dropdown
- profile dropdown with user profile + user guide + logout surfaces
- promote-account modal entry for capable users (`canPromote`/admin)
- fullscreen/no-shell preserved for legacy-like standalone routes:
  - run-session mobile
  - videochat window routes

## Page-level migration status

Core student/professor/admin pages are present in React:
- auth: login/reset/logout/verify-email/profile
- dashboards: student/professor/admin
- course/session: course, groups, question library, manage session, run/replay/present, grading/results
- video/jitsi: course video chat and window routes

## Component-level migration status

Migration remains feature-parity oriented rather than 1:1 file parity.
Recent cleanup:
- removed dead duplicate `pages_impl` routes/components not used by the active router

## Strict parity checklist (remaining)

### Student workflows
- live session: attempt open/close, answer editability, transitions
- quiz sessions: start/end/extension windows, submit lock, post-submit messaging
- session review visibility behavior after instructor toggles

### Professor workflows
- course management + roster flows on backup dataset
- session management controls + attach/reorder/remove/copy flows
- grading/results screens + export entry points

### Admin workflows
- users/settings pages with promote/canPromote actions and role transitions

### Evidence requirement
- close route/workflow matrix with backup-dataset test evidence and no unresolved P0/P1 UI mismatches.
