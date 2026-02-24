# Agent-06 — Groups/Video Parity (MIG-024)

## Scope
- Restore group category and video room workflow parity.
- Validate join/leave/toggle behavior and category-level semantics.

## Primary files
- `packages/client/src/pages/ManageCourseGroups.tsx`
- `packages/client/src/components/VideoChat.tsx`
- `packages/server/src/routes/courses.ts` (group/video endpoints)

## Must not edit
- Session/grade core pages.

## Acceptance
- Group/video behaviors align with legacy Meteor flows.
- Role-based permissions remain correct.
