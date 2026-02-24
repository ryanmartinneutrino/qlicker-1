# Agent-04 — Grading Parity (MIG-022)

## Scope
- Implement grading parity: manual marks, visibility toggles, per-question/per-student review.
- Align grading UI behavior with legacy flow.

## Current Batch (2026-02-24)
- Restored course-grade review parity in `CourseGrades.tsx`:
  - explicit multi-session selection,
  - show-all/clear controls,
  - per-student matrix plus aggregate totals across selected sessions.
- Added instructor roster mapping for readable student identity in aggregated views.
- Kept student-safe fallback behavior (visible grades only).

## Primary files
- `packages/client/src/pages/{GradeSession,CourseGrades}.tsx`
- Grading-related UI components and route tests.

## Must not edit
- Question editor pages/components.

## Acceptance
- Instructor grading workflow parity achieved.
- Student-visible grade behavior matches legacy visibility semantics.
