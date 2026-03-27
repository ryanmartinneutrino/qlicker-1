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

## Notes

- The runners use Docker even for native dev targets. Localhost-based URLs are
  rewritten to `host.docker.internal` so the containers can reach the host
  stack.
- Production Docker targets still support rate-limit disabling at both the
  Fastify and nginx layers.
- Results are written to `load-testing/results/`.
