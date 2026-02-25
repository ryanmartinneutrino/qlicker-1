# Cutover Runbook

## Strategy
- Pilot-first cutover (selected courses), then full switch after parity + SLO gates.

## Preconditions
- all blocking security checks pass
- parity matrix shows no pilot-blocking open items
- seeded + backup-based parity checks pass
- realtime and load tests meet thresholds

## Pilot execution
1. Deploy new stack for pilot cohort only.
2. Monitor:
   - authz/security incidents
   - API error rate
   - realtime disconnect/resubscribe rates
   - key workflow completion rates (join, answer, submit, grade view)
3. Compare grade/export outputs against Meteor baseline for pilot sessions.

## Rollback criteria
- any cross-course data exposure
- sustained SLO breach
- parity-critical workflow failure (session answering, quiz submit, grade visibility, required exports)

## Rollback steps
1. Disable pilot routing to new stack.
2. Route pilot cohort back to Meteor app.
3. Preserve DB writes; run validation checks for any partial session states.
4. Open incident report with failing parity/security scenario and route/module owner.

## Full cutover criteria
- pilot stable across defined observation window
- no unresolved blocking defects
- migration summary PR and runbook signed off
