# Lane 01 - AuthZ Hardening + API Policy

## Scope
- Enforce course/session/question membership and instructor/admin controls consistently.
- Eliminate cross-course read/write leakage.

## Deliverables
- Centralized guards in auth middleware.
- Route-by-route authorization matrix and implementation sweep.
- Security regression tests (API + socket subscription checks).

## Acceptance
- outsider cannot read/mutate non-member resources.
- instructor-only paths reject students.
- admin overrides remain valid.

## Mandatory checks
- server build
- migration smoke
- authz regression suite
