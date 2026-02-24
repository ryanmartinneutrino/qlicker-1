# Agent-01 — Contracts/Auth (MIG-010..014)

## Scope
- Normalize question type semantics to legacy enum.
- Standardize `QuestionOption` handling compatibility.
- Harden route-level authz for `questions` and related edge routes.
- Ensure index bootstrap is executed safely at server startup.

## Primary files
- `packages/shared/src/{types,validation,configs}.ts`
- `packages/server/src/routes/{questions,sessions,responses,grades,courses}.ts`
- `packages/server/src/collections/*`
- `packages/server/src/index.ts`

## Must not edit
- Student/instructor UX parity pages (`Session.tsx`, `RunSession.tsx`, `GradeSession.tsx`) except compile fixes required by contract changes.

## Acceptance
- Unauthorized cross-course reads/writes are blocked.
- Question type behavior is consistent in shared/client/server core paths.
- Index creation runs during startup without destructive migration logic.
