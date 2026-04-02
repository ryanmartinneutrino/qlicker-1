# Qlicker Load Testing Suite

Automated load testing for Qlicker live sessions. The suite seeds dedicated
load-test users/courses/sessions and runs a k6 scenario that follows the real
interactive classroom flow:

- one professor launches and drives the session
- hundreds of students authenticate, join, keep WebSockets open, refresh live
  state from websocket deltas when possible, and submit responses
- a professor observer window and a slice of student chat viewers keep the chat
  panel in sync from websocket chat deltas, falling back to `/chat` refreshes
  only when the payload is insufficient
- quick-post requests, student discussion posts, upvotes, and professor replies
  are exercised during the session
- question changes, attempt changes, stats visibility, answer reveals, and
  short-answer / numerical stat refreshes are all exercised

The seed and k6 runners still run in Docker, but the target Qlicker stack can
now be:

- `prod` + `docker`
- `dev` + `docker`
- `dev` + `native`

## Quick Start

```bash
cd load-testing

# 1. One-time interactive setup
./setup.sh

# 2. Disable rate limits on the running stack
./run.sh --prepare

# 3. Run the load test
./run.sh

# 4. Restore rate limits when finished
./run.sh --restore

# 5. Remove load-test fixtures
./run.sh --clean
```

If the target stack is running natively, `--prepare` and `--restore` update the
target `.env` and tell you to restart the server so the change takes effect.

## What `setup.sh` Does

`./setup.sh` asks for:

- target environment: `dev` or `prod`
- runtime: `docker` or `native`
- path to the `.env` file for the stack that is currently running
- number of students to simulate

It then:

- derives the MongoDB connection string used by the seed/cleanup runner
- derives the target base URL used by k6
- detects the Docker network when the stack is containerized
- writes `load-testing/.env`
- builds the local seed image (`qlicker-load-testing-seed:local` by default)

### URL Resolution

- `prod`: prefers `ROOT_URL`, then falls back to `https://$DOMAIN`
- `dev`: prefers `VITE_API_URL`, then `API_PORT`, then `PORT`

For dev, the base URL normally points at the API/WebSocket server origin, not
an external domain.

## Run Modes

| Command | Description |
|---------|-------------|
| `./run.sh` | Seed + run the load test |
| `./run.sh --students N` | Override the configured student count |
| `./run.sh --session-chat on|off` | Run the same interactive session with chat enabled or disabled |
| `./run.sh --seed-only` | Seed without running k6 |
| `./run.sh --test-only` | Run k6 with the existing `state/state.json` |
| `./run.sh --clean` | Delete load-test fixtures and `state/state.json` |
| `./run.sh --prepare` | Disable rate limits on the running stack |
| `./run.sh --restore` | Re-enable rate limits on the running stack |

## Why the Seed Data Matters

The seed script now matches the current auth/session schema more closely than
before. In particular, load-test users are created with `allowEmailLogin=true`,
so they can authenticate even when institution-wide SSO is enabled and local
email login is normally blocked for non-admin accounts.

## Scenario Coverage

The k6 scenario is no longer just a rough login-and-post loop. It now tracks
the real live-session update path used by the browser:

1. Professor logs in and starts the session.
2. Students log in and fetch `/sessions/:id/live`.
3. Students join the running session.
4. Students open `/ws?token=...`.
5. On `session:*` deltas, students patch local live state when the payload is
   sufficient and re-fetch `/sessions/:id/live` only for the remaining cases.
6. Students submit responses only when the current attempt is open and visible.
7. The professor closes responses, shows stats, generates short-answer word
   clouds and numerical histograms, reveals correct answers, and advances to the
   next question.
8. Chat is enabled, student quick-post waves fire after selected questions,
   random student posts are created and upvoted, and the professor replies to a
   few of the visible posts.
9. The session ends and connected clients observe the final state transition.

## Scenario Knobs

These optional environment variables let you tune the realism profile without
editing the script. Export them before `./run.sh`, or prefix them on the
command line.

Timing and sync variables:

- `SESSION_CHAT_ENABLED`: set to `true`/`false` (or use
  `./run.sh --session-chat on|off`) to run the interactive session with session
  chat enabled or disabled.
- `ANSWER_WINDOW_S`: how long each question stays open for answers.
- `STATS_PAUSE_S`: how long stats stay visible before the correct-answer phase.
- `CORRECT_PAUSE_S`: how long the correct-answer phase remains visible.
- `JOIN_GRACE_S`: delay after the professor starts the session before the
  question loop begins, giving students time to join.
- `RESPONSE_ADDED_REFRESH_MS`: fallback debounce used before refreshing `/live`
  after a `session:response-added` websocket event when the delta does not
  carry enough state to patch locally.
- `STUDENT_LOGIN_SPREAD_S`: maximum login jitter applied across student VUs.
  `0` means everyone hits `/auth/login` immediately; higher values spread the
  startup wave and usually produce a more realistic class arrival pattern.

Chat-behavior variables:

- `CHAT_ACTIVITY_EVERY_N_QUESTIONS`: after every Nth question starting at
  question 2, the scenario schedules a chat activity wave.
- `CHAT_VIEWER_STUDENT_FRACTION`: fraction of students who keep the chat panel
  open and apply `session:chat-updated` deltas locally, falling back to
  `/chat` only when needed.
- `CHAT_QUICK_POST_STUDENT_FRACTION`: fraction of students in each chat wave
  who request more explanation for an earlier question.
- `CHAT_RANDOM_POST_STUDENT_FRACTION`: fraction of students in each chat wave
  who create a regular discussion post.
- `CHAT_RANDOM_UPVOTE_STUDENT_FRACTION`: fraction of students in each chat wave
  who upvote a visible regular discussion post.
- `CHAT_ACTION_JITTER_MS`: max delay before a scheduled student chat action
  fires, to avoid an unrealistic same-millisecond burst.
- `CHAT_REPLY_PROFESSOR_LIMIT`: maximum number of professor replies during a
  run.
- `PROFESSOR_REPLY_DELAY_MS`: delay before the professor reviews and replies to
  chat during a question wave.

Example:

```bash
STUDENT_LOGIN_SPREAD_S=20 \
CHAT_VIEWER_STUDENT_FRACTION=0.25 \
CHAT_QUICK_POST_STUDENT_FRACTION=0.18 \
./run.sh --students 300
```

To compare the same session with and without chat:

```bash
./run.sh --students 300 --session-chat on
./run.sh --test-only --session-chat off
```

## Metrics

The scenario tracks and thresholds these key signals:

- `login_success{role:student}`
- `login_success{role:professor}`
- `join_success`
- `respond_success`
- `live_refresh_success{role:student}`
- `live_refresh_success{role:professor}`
- `event_sync_success{role:student}`
- `event_sync_success{role:professor}`
- `ws_connect_success{role:student}`
- `ws_connect_success{role:professor}`
- `session_completion`
- `chat_action_success`
- `chat_refresh_success{role:student}`
- `chat_refresh_success{role:professor}`
- `chat_event_sync_success{role:student}`
- `chat_event_sync_success{role:professor}`
- `login_duration{role:student}`
- `login_duration{role:professor}`
- `join_duration`
- `respond_duration`
- `live_refresh_duration{role:student}`
- `live_refresh_duration{role:professor}`
- `event_sync_duration{role:student}`
- `event_sync_duration{role:professor}`
- `chat_refresh_duration{role:student}`
- `chat_refresh_duration{role:professor}`
- `chat_event_sync_duration{role:student}`
- `chat_event_sync_duration{role:professor}`

When `SESSION_CHAT_ENABLED=false`, the chat-specific thresholds are skipped so
the report focuses on core live-session responsiveness.

Additional counters include:

- `ws_connections`
- `ws_errors`
- `response_added_refreshes`
- `chat_quick_post_toggles`
- `chat_posts_created`
- `chat_votes_applied`
- `chat_replies_created`

## Interpreting Progress Output

While the run is active, k6 may show `0 complete` for several minutes. That is
expected for this scenario. Each VU runs one full-class iteration:

- one professor driver iteration lasts for the entire session
- one professor viewer iteration tracks websocket-driven UI freshness for the
  instructor side
- each student iteration lasts from login through session end

The default timing profile is roughly:

- `JOIN_GRACE_S=5`
- `ANSWER_WINDOW_S=30`
- `STATS_PAUSE_S=15`
- `CORRECT_PAUSE_S=15`
- 5 questions total

That adds up to a little over 5 minutes before iterations begin completing.

## Threshold Units and Targets

k6 reports custom `Trend` metrics in milliseconds.

- `p(95)<3000` means 95% of samples finished in under 3000 ms, or 3 seconds
- `p(99)<3000` means 99% of samples finished in under 3 seconds
- `p(95)<5000` would mean 95% finished in under 5 seconds
- `rate==1` means a `Rate` metric must be 100%
- `rate==0` means no failures at all
- `count==0` means the counter must stay at zero

Many thresholds are role-tagged, for example
`chat_refresh_duration{role:student}` or `login_success{role:professor}`. Those
sub-metrics let the report distinguish student-facing latency from
professor-facing latency without needing separate metric names.

The current acceptance bar is intentionally strict for classroom use:

- `http_req_failed` must stay at `0%`
- `ws_errors` must stay at `0`
- `login_success{role:student}`, `login_success{role:professor}`,
  `join_success`, `respond_success`,
  `live_refresh_success{role:student}`,
  `live_refresh_success{role:professor}`,
  `event_sync_success{role:student}`,
  `event_sync_success{role:professor}`,
  `ws_connect_success{role:student}`,
  `ws_connect_success{role:professor}`,
  `professor_action_success`, `chat_action_success`, and `session_completion`
  must all be `100%`
- `login_duration{role:student}`, `login_duration{role:professor}`,
  `join_duration`, and `respond_duration` must have
  `p(95)<3000`
- `live_refresh_duration{role:student}`,
  `live_refresh_duration{role:professor}`,
  `event_sync_duration{role:student}`,
  `event_sync_duration{role:professor}`,
  `chat_refresh_duration{role:student}`,
  `chat_refresh_duration{role:professor}`,
  `chat_event_sync_duration{role:student}`, and
  `chat_event_sync_duration{role:professor}` must have `p(99)<3000`

This means the pass/fail summary is checking both correctness and a classroom
freshness target of "essentially everyone stays under 3 seconds" for the
key live-sync paths.

## How To Read A Finished Run

Read the summary in this order:

1. `THRESHOLDS`
2. `CUSTOM`
3. `HTTP`
4. `WEBSOCKET`

What each section means:

- `THRESHOLDS` is the contract. If any line fails, the run should be treated as
  a failed acceptance test.
- `CUSTOM` shows the metrics that map most directly to classroom behavior.
- `HTTP` shows overall request timing across all endpoints, which is useful but
  less specific than the custom metrics.
- `WEBSOCKET` shows connection health and how long students stayed connected.

For live-session correctness, the most important lines are:

- `login_success{role:student}`
- `login_success{role:professor}`
- `join_success`
- `ws_connect_success{role:student}`
- `ws_connect_success{role:professor}`
- `professor_action_success`
- `chat_action_success`
- `session_completion`
- `live_refresh_success{role:student}`
- `live_refresh_success{role:professor}`
- `event_sync_success{role:student}`
- `event_sync_success{role:professor}`
- `http_req_failed`
- `ws_errors`

For "do student screens stay fresh enough?", focus on:

- `live_refresh_duration{role:student}`: time to fetch `/sessions/:id/live`
- `event_sync_duration{role:student}`: time from the server-emitted websocket
  event (`emittedAt`) to validating the patched local state or completing the
  fallback live refresh; if `emittedAt` is unavailable, it falls back to
  receive-to-sync time
- `chat_refresh_duration{role:student}`: time to fetch `/sessions/:id/chat`
- `chat_event_sync_duration{role:student}`: time from a
  `session:chat-updated` emit to the patched local chat state or fallback chat
  refresh completing

For "does the instructor side stay current too?", focus on:

- `live_refresh_duration{role:professor}`
- `event_sync_duration{role:professor}`
- `chat_refresh_duration{role:professor}`
- `chat_event_sync_duration{role:professor}`

If these stay under 3 seconds at `p(99)`, the load-test contract is saying the
tail of the class still stayed within the sync target.

## Browser Telemetry

The live student page, professor control page, and presentation window now send
batched browser-side telemetry to the app during real sessions:

- `live_fetch_request_ms`: `/sessions/:id/live` request time in the browser
- `live_fetch_apply_ms`: time from starting a live refresh to the updated UI
  being painted
- `ws_event_delivery_ms`: time from the server emitting a websocket event to the
  browser receiving it
- `ws_event_to_dom_ms`: time from the browser receiving a websocket event to the
  updated UI being painted
- `server_emit_to_dom_ms`: end-to-end time from server emit to painted UI

Instructors can inspect the aggregated summary at:

- `GET /api/v1/sessions/:id/live-telemetry`

That summary includes separate rollups for `student`, `professor`, and
`presentation` views, plus approximate `p50`, `p95`, and `p99` values. For the
real interface experience, `server_emit_to_dom_ms` is the most important line.
That is the closest measurement to "the professor changed something, and the
student screen visibly caught up."

## Interpreting Slow Runs

Different metrics point to different bottlenecks:

- Slow `login_duration{role:student}` with healthy in-session metrics usually
  means startup authentication load is the bottleneck, not the live session
  itself. If this is the only recurring failure, check whether
  `STUDENT_LOGIN_SPREAD_S` is too low for the class size you are simulating.
  This metric measures the `/auth/login` request itself, not the full browser
  boot sequence.
- Slow `live_refresh_duration{role:student}` or
  `event_sync_duration{role:student}` means students may see stale screens
  after professor actions.
- Slow `chat_refresh_duration{role:student}` or
  `chat_event_sync_duration{role:student}` means the chat panel is lagging
  behind the live conversation even if question-state refreshes still look
  healthy.
- A healthy `p(95)` with a much larger `max` means the system is usually fast
  enough but still has tail-latency spikes worth investigating.

## Notes

- The runners use Docker even for native dev targets. Localhost-based URLs are
  rewritten to `host.docker.internal` so the containers can reach the host
  stack.
- `run.sh` re-checks the target `.env` and Docker network at execution time, so
  `--clean` is less likely to use a stale Mongo hostname after the stack has
  moved or been restarted.
- The seed / cleanup runner retries MongoDB connections with a small pool, which
  helps after a heavy test when Mongo is still draining or briefly recovering.
- Production Docker targets still support rate-limit disabling at both the
  Fastify and nginx layers.
- Results are written to `load-testing/results/`.

## Troubleshooting

- If `--clean` reports `MongoNetworkError: connection ... closed` right after a
  large test, wait a few seconds and rerun it once. The runner now retries
  automatically, but the underlying issue is usually a stack that is still
  recovering from burst load.
- If the running app itself starts failing until Docker is restarted, the
  deployment is likely under-provisioned. On smaller Docker hosts, lower
  `MONGO_WIREDTIGER_CACHE_SIZE_GB` and keep `MONGO_MAX_POOL_SIZE` conservative
  so MongoDB is not pushed into an unhealthy state during live-session bursts.
