# Qlicker Meteor-to-React/Express Migration Status

## Snapshot (2026-02-25)
- Baseline branch: `master`
- Baseline commit: `06236420`
- Recent merged PRs in this tranche: `#46`, `#47`
- Pilot gate remains: **full legacy parity + security + realtime/load verification**

## Verified Review Results

### Closed in current codebase
- Route-level authz hardening is substantially improved for `courses/sessions/questions/responses/grades` (outsider cross-course read/write paths now blocked in core routes).
- Socket session/passport bridge is wired so realtime channels can use authenticated user context.
- Realtime routing now handles change-stream delete events via `documentKey` and uses scoped routing keys.
- Collection index bootstrap is now called at server startup.
- Session create parity gap fixed: server defaults `status` to `hidden` when omitted.
- CSV parity improved on the React side:
  - course grades CSV export
  - session responses CSV export
  - groups CSV export refactored to shared utility
- Image API authz hardened:
  - non-admin image list is owner-scoped
  - image delete requires owner or admin
- Realtime subscription resilience/security hardened:
  - standardized `subscription:error` contract across `subscribe:*` handlers
  - auto re-subscribe + refetch on socket reconnect in `useRealtimeCollection`
  - added realtime authz regression harness `npm run test:migration-realtime-authz`

### Still open (blocking for pilot)
- Full Meteor parity validation is incomplete for:
  - instructor run-session edge workflows
  - grading edge cases and visibility/review toggles
  - full groups/video/Jitsi behavior parity
- End-to-end parity verification is incomplete:
  - no latest full Docker smoke/integration/e2e run evidence on current `master`
  - sanitized Meteor backup parity track not yet executed
- Load/perf gate is not yet signed off on current head commit.

## 8-Lane Progress Matrix

| Lane | Scope | Status | Evidence | Next gate |
|---|---|---|---|---|
| L1 | AuthZ + API policy | 80% | PR `#42`, `#46`, authz harness present | Close residual endpoint edge-case matrix and rerun authz integration on latest `master` |
| L2 | Student/prof session-question parity | 65% | PR `#40`, PR `#43` | Finish edge transitions + verify interactive/quiz behavior against Meteor checklist |
| L3 | Course/groups parity | 60% | PR `#39`, PR `#44` (groups CSV) | Finalize group/category semantics and parity tests |
| L4 | Grades/results/export parity | 60% | PR `#36`, PR `#44` | Complete remaining grade/review visibility parity + CSV value-order matching checks |
| L5 | Realtime correctness + scale | 78% | PR `#37`, `#42`, `#47` | Run reconnect/churn/load verification and confirm no unauthorized channels |
| L6 | Media + video/chat parity | 35% | partial server/client support | Finish Jitsi/group room behavior and cleanup parity |
| L7 | DB compatibility + parity fixtures | 30% | schema/index safety work landed | Add synthetic-vs-backup diff harness and run staging comparison |
| L8 | Integration/load/cutover ops | 52% | smoke/authz/load/realtime-authz scripts + docs in repo | Execute full gate runs in Docker/CI and complete pilot runbook sign-off |

## Parallel Execution Plan (Decision-Complete)

### Phase 1: Security + Realtime lock (immediate)
- L1 closes remaining authz matrix and updates `docs/migration/security-audit.md` with latest evidence.
- L5 runs churn/reconnect/load path checks and publishes thresholds/results.

### Phase 2: Feature parity closure (parallel)
- L2/L3/L4/L6 each close their lane parity matrix and attach evidence references.
- All feature deltas merged behind safe defaults/flags where needed.

### Phase 3: Compatibility + pilot gate
- L7 runs synthetic fixture diff in CI, then backup-based parity on sanitized Meteor data.
- L8 executes full smoke/integration/e2e/load suites and applies go/no-go gate checklist.

## Merge Model
- Continue one lane branch per lane (`migration/lane-01-*` … `migration/lane-08-*`).
- Merge lane PRs continuously when build + lane tests + relevant parity checks pass.
- Maintain one unmerged rolling summary PR for operator review before each pilot-gate decision.

## Completion Estimate
- Current migration completion: **~68%** toward pilot-readiness.
- Remaining critical path: L6 + L7 + L8 validation closure.

## References
- Detailed matrix/backlog/evidence: `MIGRATION_DETAILS.md`
- Latest tranche summary: `docs/migration-work-summary-2026-02-25.md`
- Latest batch summary: `docs/migration-work-summary-2026-02-25-batch2.md`
- Parity matrix: `docs/migration/parity-matrix.md`
- API mapping: `docs/migration/api-parity-map.md`
- Security audit checklist: `docs/migration/security-audit.md`
- Realtime design notes: `docs/migration/realtime-design.md`
- Cutover runbook: `docs/migration/cutover-runbook.md`
