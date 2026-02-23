# Agent 03 — Profile Image Upload + Storage Backend

## Scope
- Port `DragAndDropArea` behavior.
- Wire profile image upload end-to-end.
- Implement real storage adapters (local/S3/Azure), preserving existing settings keys.

## Acceptance criteria
- Profile upload/replace works with existing users collection fields.
- S3/Azure settings from `settings` collection are respected.

## Mandatory checks
- `npm run build --workspace=packages/server`
- `npm run build --workspace=packages/client`
- End-to-end test with seeded users.
