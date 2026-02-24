# Agent-05 — Question Editor Parity (MIG-023)

## Scope
- Complete question library/editor parity for all question types.
- Align option editing/correct-answer semantics and solution behavior.

## Primary files
- `packages/client/src/pages/QuestionsLibrary.tsx`
- `packages/client/src/components/modals/CreateQuestionModal.tsx`
- Related editor/render components.

## Must not edit
- Grading pages/components.

## Acceptance
- Create/edit/delete behavior is type-correct for MC/TF/SA/MS/NU.
- Option and solution fields remain backward-compatible with Meteor data.
