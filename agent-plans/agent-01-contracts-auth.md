# Agent-01 — Contracts/Auth (MIG-010..014)

## Scope
- Normalize question type semantics to legacy enum.
- Standardize `QuestionOption` handling compatibility.
- Harden route-level authz for `questions` and related edge routes.
- Ensure index bootstrap is executed safely at server startup.

## Current Batch (2026-02-24)
- Enforce role-filtered `/api/questions` reads:
  - student `courseId` library access restricted to owned/created non-session questions.
  - student `sessionId` access sanitizes `options.correct`/`correctNumerical` unless revealed by session settings.
- Preserve instructor/admin full-fidelity question access for management and grading workflows.
- Extend smoke coverage for question visibility parity checks.

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
