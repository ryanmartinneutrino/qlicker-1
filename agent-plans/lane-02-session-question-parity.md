# Lane 02 - Student/Professor Session + Question Parity

## Scope
- close strict session/quiz UI workflow parity vs Meteor
- verify run/manage/present/review flows end-to-end on backup dataset

## Completed
- route parity closure and aliases
- global app shell parity added for authenticated workflows (PR `#84`)
- legacy fullscreen/no-shell routes preserved for mobile run + Jitsi windows

## Next checklist
- execute route/workflow matrix for:
  - student live attempts + editability
  - quiz timing/extensions/submit lock
  - instructor manage-session edge transitions
- fix any P0/P1 mismatches from matrix runs
- attach evidence from backup-dataset walkthrough

## Mandatory checks
- `npm run build`
- `API_BASE_URL=... npm run test:migration-smoke`
- targeted manual UI matrix evidence linked in PR
