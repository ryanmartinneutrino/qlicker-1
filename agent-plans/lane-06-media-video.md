# Lane 06 - Media Upload + Video/Jitsi Parity

## Scope
- image/profile lifecycle parity
- video/chat (course/category/group) parity and edge behavior

## Completed
- video/Jitsi edge checks in migration smoke
- app shell parity integration with video routes (PR `#84`)

## Next checklist
- run backup-dataset UI pass for profile image lifecycle and room flows
- verify no shell/navigation regression on video entry/exit routes
- finalize any environment-specific Jitsi option parity notes

## Mandatory checks
- `npm run build`
- `API_BASE_URL=... npm run test:migration-smoke`
- media/video manual matrix evidence linked in PR
