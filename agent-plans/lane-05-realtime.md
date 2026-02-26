# Lane 05 - Realtime Correctness + Scale

## Scope
- realtime auth correctness, reconnect reliability, and fan-out consistency

## Completed
- socket auth bridge + subscription authz harness
- deterministic runtime preflight and runtime env normalization (PR `#81`)

## Next checklist
- publish refreshed churn/load artifacts from latest master
- confirm no unauthorized channel regressions under reconnect churn
- keep delete/update routing scoped under sampled high-traffic sessions

## Mandatory checks
- `npm run build`
- `API_BASE_URL=... npm run test:migration-realtime-authz`
- `API_BASE_URL=... npm run test:migration-realtime-churn`
- `API_BASE_URL=... npm run test:migration-load`
