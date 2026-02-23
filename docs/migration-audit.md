# Migration Audit (Current Branch)

## Build / TypeScript health
- `packages/shared`: builds successfully
- `packages/server`: builds successfully
- `packages/client`: builds successfully

## Conflict status
- `packages/client/src/pages/Profile.tsx`: reduced to a stable wrapper that delegates to `pages_impl/ProfilePage.tsx`
- `packages/client/src/pages/QuestionsLibrary.tsx`: reduced to a stable wrapper that delegates to `pages_impl/QuestionsLibraryPage.tsx`
- `MIGRATION.md`: high-churn audit details moved into this dedicated document to reduce merge contention

## Database compatibility checks
- Collection names are unchanged and map 1:1 with Meteor collections.
- New inserts in auth/courses/sessions/questions/responses/images/settings routes generate string `_id` values via `generateStringId`.
- Password hashes remain compatible via `services.password.bcrypt`.

## Remaining risk areas (pre-cutover)
- Advanced question/session components (`QuestionDisplay`, `QuestionEditItem`, rich text editor) still simplified relative to Meteor behavior.
- Image upload storage backends (S3/Azure) still stubbed.
- Video/Jitsi and quiz-extension behavior still require end-to-end parity validation.
- Full integration test pass against a live Mongo replica-set + seeded users required before cutover.
