# Lane 01 - AuthZ Hardening + API Policy

## Scope
- enforce course/session/question/response/grade authorization policy consistently
- keep outsider access blocked and admin override behavior explicit

## Completed
- deterministic runtime preflight + API fingerprint checks (PR `#81`)
- promote/canPromote authorization policy restored (PR `#82`)
- expanded authz integration regression coverage

## Next checklist
- finish endpoint-by-endpoint policy table (`403` vs `404` concealment rules)
- add final negative cases for any uncovered read/list endpoints
- publish one staging authz artifact run from latest `master`

## Mandatory checks
- `npm run build`
- `API_BASE_URL=... npm run test:migration-authz`
- `API_BASE_URL=... npm run test:migration-runtime-preflight`
