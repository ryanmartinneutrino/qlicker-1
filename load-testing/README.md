# Qlicker Load Testing Suite

Automated load testing for Qlicker live sessions. The suite seeds dedicated
load-test users/courses/sessions and runs a k6 scenario that follows the real
interactive classroom flow:

- one professor launches and drives the session
- hundreds of students authenticate, join, keep WebSockets open, refresh live
  state on deltas, and submit responses
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
5. On `session:*` deltas, students re-fetch `/sessions/:id/live` the same way
   the app does to stay current.
6. Students submit responses only when the current attempt is open and visible.
7. The professor closes responses, shows stats, generates short-answer word
   clouds and numerical histograms, reveals correct answers, and advances to the
   next question.
8. The session ends and connected clients observe the final state transition.

## Metrics

The scenario tracks and thresholds these key signals:

- `login_success`
- `join_success`
- `respond_success`
- `live_refresh_success`
- `event_sync_success`
- `ws_connect_success`
- `session_completion`
- `login_duration`
- `join_duration`
- `respond_duration`
- `live_refresh_duration`
- `event_sync_duration`

Additional counters include:

- `ws_connections`
- `ws_errors`
- `response_added_refreshes`

## Interpreting Progress Output

While the run is active, k6 may show `0 complete` for several minutes. That is
expected for this scenario. Each VU runs one full-class iteration:

- one professor iteration lasts for the entire session
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
- `p(95)<5000` would mean 95% finished in under 5 seconds
- `rate==1` means a `Rate` metric must be 100%
- `rate==0` means no failures at all
- `count==0` means the counter must stay at zero

The current acceptance bar is intentionally strict for classroom use:

- `http_req_failed` must stay at `0%`
- `ws_errors` must stay at `0`
- `login_success`, `join_success`, `respond_success`, `live_refresh_success`,
  `event_sync_success`, `ws_connect_success`, `professor_action_success`, and
  `session_completion` must all be `100%`
- `login_duration`, `join_duration`, `respond_duration`,
  `live_refresh_duration`, and `event_sync_duration` must all have
  `p(95)<3000`

This means the pass/fail summary is checking both correctness and a classroom
freshness target of "normally under 3 seconds" for the key interactive paths.

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

- `login_success`
- `join_success`
- `ws_connect_success`
- `professor_action_success`
- `session_completion`
- `live_refresh_success`
- `event_sync_success`
- `http_req_failed`
- `ws_errors`

For "do student screens stay fresh enough?", focus on:

- `live_refresh_duration`: time to fetch `/sessions/:id/live`
- `event_sync_duration`: time from receiving a relevant websocket event to
  completing the follow-up live refresh and validating the new state

If these stay under 3 seconds at `p(95)`, most students should see updates
within the target window. If you need a stricter "essentially everyone stays
under 3 seconds" guarantee, add a `p(99)` threshold and consider instrumenting
client-side "event received -> DOM updated" timing as a separate metric.

## Interpreting Slow Runs

Different metrics point to different bottlenecks:

- Slow `login_duration` with healthy in-session metrics usually means startup
  authentication load is the bottleneck, not the live session itself.
- Slow `live_refresh_duration` or `event_sync_duration` means students may see
  stale screens after professor actions.
- A healthy `p(95)` with a much larger `max` means the system is usually fast
  enough but still has tail-latency spikes worth investigating.

## Notes

- The runners use Docker even for native dev targets. Localhost-based URLs are
  rewritten to `host.docker.internal` so the containers can reach the host
  stack.
- Production Docker targets still support rate-limit disabling at both the
  Fastify and nginx layers.
- Results are written to `load-testing/results/`.
