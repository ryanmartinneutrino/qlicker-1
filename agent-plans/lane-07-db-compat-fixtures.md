# Lane 07 - DB Compatibility + Fixtures

## Scope
- Maintain strict Meteor DB compatibility and parity validation datasets.

## Deliverables
- synthetic fixture baseline for CI parity checks.
- sanitized legacy DB backup validation path for staging.
- parity diff tooling for grades/session states/exports.

## Acceptance
- no schema-breaking writes and no incompatible field mutations.

## Mandatory checks
- fixture seed validation
- parity diff reports in CI/staging
