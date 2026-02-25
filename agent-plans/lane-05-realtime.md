# Lane 05 - Realtime Correctness + Scale

## Scope
- Ensure socket authentication/authorization correctness and resilient event routing.

## Deliverables
- Session/passport socket bridge and channel authz checks.
- Delete/update routing correctness under subscription scopes.
- Reconnect/resubscribe reliability and instrumentation.

## Acceptance
- authorized users receive correct updates; unauthorized subscriptions are denied.
- no duplicate or missed updates in parity tests.

## Mandatory checks
- server build
- realtime integration tests
