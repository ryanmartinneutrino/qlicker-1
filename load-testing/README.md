# Qlicker Load Testing Suite

Automated load-test infrastructure that simulates a realistic interactive
classroom session with up to 500+ concurrent students.  **Everything runs in
Docker** — no Node.js or k6 installation required on the host.

## Overview

| Step | Actor | What happens |
|------|-------|------|
| 1 | `setup.sh` | One-time configuration — discovers the production stack, creates `.env`, builds the seed image |
| 2 | `run.sh --prepare` | Disables server + nginx rate limits on the production stack |
| 3 | `run.sh` (or `run.sh --students N`) | Seeds N students into MongoDB, then runs the k6 scenario |
| 4 | k6 professor (1 VU) | Logs in → starts session → drives 5 questions through show / answer / stats / correct |
| 5 | k6 students (N VUs) | Log in → join session → open WebSocket → answer each question |
| 6 | `run.sh --restore` | Re-enables rate limits on the production stack |
| 7 | `run.sh --clean` | Removes all seed data from the database |

The five questions cover every response-collecting question type:

| # | Type | Label |
|---|------|-------|
| 1 | Multiple Choice | MC |
| 2 | Multiple Select | MS |
| 3 | True / False | TF (MC with 2 options) |
| 4 | Short Answer | SA |
| 5 | Numerical | NU |

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Docker** + **Docker Compose** | Only software needed on the host |
| **Running Qlicker production stack** | The `production_setup/` Docker Compose stack with a valid domain and TLS |

That's it.  The load-testing stack uses Docker to run both the Node.js seeder
and Grafana k6 — nothing else needs to be installed.

## Quick Start

```bash
cd load-testing

# 1. One-time setup (interactive)
./setup.sh

# 2. Prepare the production stack (disable rate limits)
./run.sh --prepare

# 3. Run the load test (seeds + tests, default: 500 students)
./run.sh

# 4. Restore rate limits when finished
./run.sh --restore

# 5. Clean up seed data from the database
./run.sh --clean
```

### Custom student count

```bash
# 250 students
./run.sh --students 250

# Or set a default in .env
#   NUM_STUDENTS=250
# then just: ./run.sh
```

## Setup Details

### `./setup.sh`

The setup script interactively discovers your production stack and creates a
`.env` file for the load-testing Docker Compose stack.

It will ask for:

| Prompt | Description |
|--------|-------------|
| **Production stack directory** | Absolute path to `production_setup/` (can be anywhere on the system) |
| **Docker network** | Auto-detected from the running production MongoDB container |
| **Base URL** | The HTTPS URL of the Qlicker instance (e.g. `https://qlicker.example.com`) |
| **Number of students** | Default number of simulated students (can be overridden per-run) |

If a `.env` already exists, its values are offered as defaults so you can
re-run setup without re-entering everything.

### Generated `.env`

```env
QLICKER_STACK_DIR=/opt/qlicker              # path to production_setup/
QLICKER_NETWORK=production_setup_default     # Docker network name
MONGO_URL=mongodb://mongo:27017/qlicker      # internal MongoDB URI
BASE_URL=https://qlicker.example.com         # target URL for k6
NUM_STUDENTS=500                             # default student count
```

## Run Commands

| Command | Description |
|---------|-------------|
| `./run.sh` | Full run: seed database + run k6 test |
| `./run.sh --students N` | Full run with custom student count |
| `./run.sh --seed-only` | Seed the database without running k6 |
| `./run.sh --test-only` | Run k6 without re-seeding (requires existing `state/state.json`) |
| `./run.sh --clean` | Remove all load-test data from the database |
| `./run.sh --prepare` | Disable rate limits on the production stack |
| `./run.sh --restore` | Re-enable rate limits on the production stack |

### Rate Limit Handling

Load testing from a single host triggers rate limits at two levels:

1. **Server-side** (`@fastify/rate-limit`): `--prepare` sets
   `DISABLE_RATE_LIMITS=true` in the production `.env` and recreates the server
   containers.

2. **Nginx-side** (`limit_req`): `--prepare` uses `sed` inside the running
   nginx container to comment out the `limit_req` directives, then reloads
   nginx.  This is a temporary change — `--restore` restarts nginx, which
   re-renders the original template.

Always run `--restore` after testing to re-enable both layers of rate limiting.

## Understanding the Results

k6 prints a summary at the end of each run.  The full output is also saved to
`results/k6-<timestamp>.log`.

### Key Metrics

| Metric | Type | What it means |
|--------|------|---------------|
| `login_duration` | Trend | Time for each student to authenticate (p95 target: < 5 s) |
| `join_duration` | Trend | Time for each student to join the session (p95 target: < 3 s) |
| `respond_duration` | Trend | Time to submit a response (p95 target: < 3 s) |
| `ws_event_latency` | Trend | Time for WebSocket events to arrive (p95 target: < 5 s) |
| `login_success` | Rate | Fraction of logins that succeeded (target: > 95 %) |
| `join_success` | Rate | Fraction of joins that succeeded (target: > 95 %) |
| `respond_success` | Rate | Fraction of responses accepted (target: > 90 %) |
| `ws_connections` | Counter | Total WebSocket connections established |
| `ws_errors` | Counter | Total WebSocket errors (target: 0) |
| `http_req_duration` | Trend | Overall HTTP latency (built-in k6 metric) |

### Thresholds

The scenario defines automatic pass/fail thresholds:

```
login_success:    rate > 95 %
join_success:     rate > 95 %
respond_success:  rate > 90 %
login_duration:   p95 < 5 s
join_duration:    p95 < 3 s
respond_duration: p95 < 3 s
ws_event_latency: p95 < 5 s
```

If any threshold is breached, k6 exits with a non-zero code and the run script
reports **FAILED**.

### Interpreting Results

- **All thresholds pass** — the stack handles the load within targets.
- **`login_duration` p95 is high** — the server is slow to hash/verify
  passwords.  Consider increasing server replicas.
- **`respond_success` is low** — responses are being rejected.  Check server
  logs for errors.  Likely cause: rate limiting still active, or MongoDB
  connection pool exhaustion.
- **`ws_errors` is high** — WebSocket connections are failing.  Check nginx
  WebSocket config, file descriptor limits, and Redis connectivity.
- **`ws_event_latency` is high** — real-time broadcasts are slow.  Redis
  pub/sub may be a bottleneck, or server replicas are overloaded.

## Session Flow Timeline

```
 ┌─────────────────────────────────────────────────────────────┐
 │  START SESSION                                              │
 │  ├── Wait 5 s for students to join                          │
 │  │                                                          │
 │  │  ┌── Question 1 (MC) ──────────────────────────┐         │
 │  │  │  Show question + open attempt                │         │
 │  │  │  Wait ANSWER_WINDOW_S (30 s)                 │         │
 │  │  │  Show stats                                  │         │
 │  │  │  Wait STATS_PAUSE_S  (15 s)                  │         │
 │  │  │  Show correct                                │         │
 │  │  │  Wait CORRECT_PAUSE_S (15 s)                 │         │
 │  │  └──────────────────────────────────────────────┘         │
 │  │                                                          │
 │  │  ┌── Question 2 (MS) ──────────────────────────┐         │
 │  │  │  …same timing…                               │         │
 │  │  └──────────────────────────────────────────────┘         │
 │  │                                                          │
 │  │  ┌── Questions 3–5 (TF, SA, NU) ──┐                      │
 │  │  │  …                               │                     │
 │  │  └──────────────────────────────────┘                     │
 │  │                                                          │
 │  └── END SESSION                                            │
 └─────────────────────────────────────────────────────────────┘
```

Total session duration ≈ 5 s + 5 × (30 + 15 + 15) s = **5 min 5 s** (defaults).

## Architecture

```
                                ┌──────────────────┐
                                │  Host machine     │
  ┌─────────────────────────────┤                  │
  │                             │                  │
  │  ┌───── Load Testing  ─────┐│                  │
  │  │  seed container ────────┼┼── Docker ───┐    │
  │  │       (Node.js)         ││  network    │    │
  │  │                         ││             ▼    │
  │  │  k6 container ──────────┼┼───────┐  MongoDB │
  │  │   (--network host)      ││       │         │
  │  └─────────────────────────┘│       │         │
  │                             │       │         │
  │  ┌── Production Stack ─────┐│       │         │
  │  │                         ││       │         │
  │  │  nginx :443  ◄──────────┼┼───────┘         │
  │  │    ↓                    ││                  │
  │  │  server ×N              ││                  │
  │  │    ↓                    ││                  │
  │  │  MongoDB + Redis        ││                  │
  │  └─────────────────────────┘│                  │
  └─────────────────────────────┘                  │
                                └──────────────────┘
```

- The **seed container** connects to the production Docker network to reach
  MongoDB directly.
- The **k6 container** uses `--network host` to reach the nginx front-end via
  the domain name, exactly as a real browser would.
- Results are written to `./results/` on the host via bind mount.

## Troubleshooting

### "Session not found" or "Not a member of course"

The seed container and the Qlicker server must use the **same MongoDB
instance**.  Verify that `MONGO_URL` in `.env` matches the production
stack's `MONGO_URI`.

### Login rate-limiting (429 errors)

Rate limits must be disabled at **both** the server and nginx levels.
Run `./run.sh --prepare` before testing.  If you still see 429s:

- Check that server replicas restarted:
  `docker compose -f /path/to/production_setup/docker-compose.yml ps`
- Check nginx config: `docker compose exec nginx cat /etc/nginx/conf.d/default.conf`
  — `limit_req` lines should be commented out.

### WebSocket connection failures

- Ensure `/ws` is proxied with WebSocket upgrade headers in the nginx config.
- For multi-replica setups, Redis must be configured (`REDIS_URL`) for
  cross-instance WebSocket broadcasting.
- Check that the domain resolves from the host machine.

### Not enough file descriptors

Each student VU opens one WebSocket + HTTP connections.  For 500+ VUs:

```bash
ulimit -n 4096   # raise before running k6 (inside the container this is usually fine)
```

### Seed container cannot reach MongoDB

- Ensure the production stack is running: `docker compose ps` in the
  production directory.
- Verify the network name: `docker network ls | grep default`
- Re-run `./setup.sh` to re-detect the network.

### k6 cannot reach the domain

- The k6 container uses `--network host`.  Verify the domain resolves from the
  host: `curl -I https://your-domain.com`
- For self-signed certificates, the run script passes
  `--insecure-skip-tls-verify` to k6.

## File Structure

```
load-testing/
├── README.md                   ← This file
├── Dockerfile.seed             ← Docker image for the Node.js seed script
├── docker-compose.yml          ← Load testing stack (seed + k6)
├── setup.sh                    ← Interactive one-time setup
├── run.sh                      ← Run / clean / prepare / restore
├── package.json                ← Node.js deps for the seed image
├── package-lock.json           ← Locked deps
├── seed.mjs                    ← Database seeding / cleanup script
├── scenarios/
│   └── live-session.js         ← k6 scenario: professor + students
├── state/                      ← Generated: state.json (git-ignored)
│   └── state.json
└── results/                    ← Generated: k6 output logs (git-ignored)
    └── k6-20240101-120000.log
```

## Configuration Reference

### Seed Script Options

| Flag | Default | Description |
|------|---------|-------------|
| `--students N` | 500 | Number of student accounts to create |
| `--clean` | — | Remove all load-test data from the database |

### k6 Environment Variables

These are set automatically by `run.sh` but can be overridden:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | from `.env` | Qlicker server base URL |
| `STATE_FILE` | `/state/state.json` | Path to the seed state file (inside container) |
| `ANSWER_WINDOW_S` | `30` | Seconds students have to answer each question |
| `STATS_PAUSE_S` | `15` | Seconds to display stats before showing the correct answer |
| `CORRECT_PAUSE_S` | `15` | Seconds to display the correct answer before moving on |
