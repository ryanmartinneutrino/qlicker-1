# Migration Work Summary (2026-02-25, Batch 2)

## Merged in this batch
- `#46` `migration/lane-01-image-authz-hardening`
  - image ownership support added (`images.owner`)
  - non-admin image listing is owner-scoped
  - image deletion now requires owner or admin
  - authz integration harness extended with image ownership checks
- `#47` `migration/lane-05-realtime-resubscribe-authz`
  - realtime `subscribe:*` handlers now emit standardized `subscription:error`
  - client realtime hook now re-subscribes and refetches after reconnect
  - added dedicated realtime authz verification harness (`npm run test:migration-realtime-authz`)

## Milestones reached
- L1 milestone: closed image-route authz gap and added regression coverage.
- L5 milestone: established a stable realtime subscription error contract and reconnect re-subscribe behavior.
- L8 milestone: added a realtime authz verification command usable in parity gate runs.

## Remaining highest-impact work
- L2/L3/L4/L6 feature parity edge matrices (run-session edge controls, grading review visibility, full group/video behavior).
- L7 backup-based DB compatibility diff run.
- L8 full Docker/CI parity gate run (`smoke + authz + realtime-authz + load + e2e`) on latest `master`.
