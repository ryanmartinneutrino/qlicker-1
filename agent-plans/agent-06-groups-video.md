# Agent-06 — Groups/Video Parity (MIG-024)

## Scope
- Restore group category and video room workflow parity.
- Validate join/leave/toggle behavior and category-level semantics.

## Current Batch (2026-02-24)
- Add persisted group-management APIs in `courses.ts` for category/group CRUD and membership toggles.
- Add management snapshot endpoint for instructor roster + group state.
- Replace `ManageCourseGroups.tsx` local-only state with API-backed category/group/student workflows.
- Restore CSV export and group membership interaction patterns needed for migration parity.

## Primary files
- `packages/client/src/pages/ManageCourseGroups.tsx`
- `packages/client/src/components/VideoChat.tsx`
- `packages/server/src/routes/courses.ts` (group/video endpoints)

## Must not edit
- Session/grade core pages.

## Acceptance
- Group/video behaviors align with legacy Meteor flows.
- Role-based permissions remain correct.
