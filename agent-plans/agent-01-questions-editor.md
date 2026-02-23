# Agent 01 — Questions Editor + Display Parity

## Scope
- Port/complete:
  - `QuestionDisplay`
  - `QuestionEditItem`
  - `Editor` integration
  - `AnswerDistribution`, `Histogram`, `ShortAnswerList`

## Acceptance criteria
- Feature parity with Meteor flows for creating/editing/rendering MC/MS/TF/SA/NU.
- Rich text content behaves consistently with existing DB data.
- No regressions in `QuestionsLibrary`, `Session`, `RunSession`, `ReplaySession`.

## Mandatory checks
- `npm run build --workspace=packages/client`
- Add/extend client tests for editor/display state transitions.
- Screenshot each major UI state.
