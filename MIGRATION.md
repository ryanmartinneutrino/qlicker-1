# Qlicker Meteor-to-React/Express Migration Status

## Snapshot (2026-02-25)
- Baseline branch: `master`
- Baseline commit: `6347321a`
- Recent merged PRs in this tranche: `#53`, `#54`, `#55`
- Pilot gate remains: **full legacy parity + security + realtime/load verification**

## Verified Review Results

### Closed in current codebase
- Route-level authz hardening is substantially improved for `courses/sessions/questions/responses/grades` (outsider cross-course read/write paths now blocked in core routes).
- Socket session/passport bridge is wired so realtime channels can use authenticated user context.
- Realtime routing now handles change-stream delete events via `documentKey` and uses scoped routing keys.
- Collection index bootstrap is now called at server startup.
- Session create parity gap fixed: server defaults `status` to `hidden` when omitted.
- CSV parity improved with server-backed exports:
  - `GET /api/grades/course/:courseId/export`
  - `GET /api/grades/session/:sessionId/export`
  - `GET /api/responses/session/:sessionId/export`
  - `GET /api/courses/:courseId/groups/export`
  - client pages now prefer server CSV with local fallback
- Question-library parity/authz fix landed:
  - normalized detached-question filtering (`sessionId` missing/null)
  - avoid writing `undefined` fields on question create/copy paths
- Image API authz hardened:
  - non-admin image list is owner-scoped
  - image delete requires owner or admin
- Session-store collision fix landed:
  - auth middleware sessions now use Mongo collection `authSessions`
  - session APIs now ignore non-course docs lacking valid `courseId`
  - DB compat harness now reports explicit `sessions._collection` collision errors
- Realtime subscription resilience/security hardened:
  - standardized `subscription:error` contract across `subscribe:*` handlers
  - auto re-subscribe + refetch on socket reconnect in `useRealtimeCollection`
  - added realtime authz regression harness `npm run test:migration-realtime-authz`
- DB-readiness tooling milestone landed:
  - `npm run test:migration-db-compat` (read-only compatibility audit)
  - `npm run test:migration-db-parity` (baseline-vs-candidate DB diff harness)
  - `docs/migration/db-compat-testing.md` workflow for sanitized Meteor backup testing
- Integration gate orchestration milestone landed:
  - `npm run test:migration-gate` to run build/runtime checks
  - optional DB stages via `QCLICKER_GATE_INCLUDE_DB_COMPAT=true` and `QCLICKER_GATE_INCLUDE_DB_PARITY=true`

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
| L1 | AuthZ + API policy | 88% | PR `#42`, `#46`, `#54`, `#55`, authz harness green on isolated runtime | Close residual endpoint edge-case matrix and rerun authz/realtime authz suites on latest Docker baseline |
| L2 | Student/prof session-question parity | 65% | PR `#40`, PR `#43` | Finish edge transitions + verify interactive/quiz behavior against Meteor checklist |
| L3 | Course/groups parity | 60% | PR `#39`, PR `#44` (groups CSV) | Finalize group/category semantics and parity tests |
| L4 | Grades/results/export parity | 76% | PR `#36`, `#44`, `#53` | Complete remaining grade/review visibility edge semantics + CSV value-order parity checks against Meteor outputs |
| L5 | Realtime correctness + scale | 78% | PR `#37`, `#42`, `#47` | Run reconnect/churn/load verification and confirm no unauthorized channels |
| L6 | Media + video/chat parity | 35% | partial server/client support | Finish Jitsi/group room behavior and cleanup parity |
| L7 | DB compatibility + parity fixtures | 66% | PR `#49`, `#55` | Execute baseline-vs-candidate runs on sanitized Meteor backup staging and clear any `sessions._collection` collision findings |
| L8 | Integration/load/cutover ops | 72% | PR `#50`, `#54` + isolated runtime authz pass | Run full gate in Docker/CI and archive evidence for pilot decision |

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
- Current migration completion: **~80%** toward pilot-readiness.
- Remaining critical path: L6 + L7 + L8 validation closure.

## References
- Detailed matrix/backlog/evidence: `MIGRATION_DETAILS.md`
- Latest tranche summary: `docs/migration-work-summary-2026-02-25.md`
- Latest batch summary: `docs/migration-work-summary-2026-02-25-batch2.md`
- Latest batch summary: `docs/migration-work-summary-2026-02-25-batch3.md`
- Latest batch summary: `docs/migration-work-summary-2026-02-25-batch4.md`
- Parity matrix: `docs/migration/parity-matrix.md`
- API mapping: `docs/migration/api-parity-map.md`
- Security audit checklist: `docs/migration/security-audit.md`
- Realtime design notes: `docs/migration/realtime-design.md`
- DB compatibility testing guide: `docs/migration/db-compat-testing.md`
- Cutover runbook: `docs/migration/cutover-runbook.md`
