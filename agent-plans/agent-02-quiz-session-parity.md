# Agent 02 — Quiz/Session Lifecycle Parity

## Scope
- Port/complete:
  - quiz extensions (`QuizExtensionsModal`)
  - run/manage/replay edge behavior parity
  - session grading flow details

## Acceptance criteria
- Quiz timing, attempts, extension rules match Meteor behavior.
- Instructor/student status transitions match old app.

## Mandatory checks
- `npm run build --workspace=packages/client`
- `npm run build --workspace=packages/server`
- Integration smoke with seeded DB.
