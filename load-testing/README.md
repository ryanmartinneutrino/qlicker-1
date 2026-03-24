# Qlicker Load Testing Suite

Automated load-test infrastructure that simulates a realistic interactive
classroom session with 250–500 concurrent students.

## Overview

The test exercises the full live-session flow:

| Step | Actor | What happens |
|------|-------|------|
| 1 | Seed script | Creates 500 students, 1 professor, 1 course, 1 session with 5 questions |
| 2 | Professor (1 VU) | Logs in → starts session → drives 5 questions through the show/answer/stats/correct cycle |
| 3 | Students (N VUs) | Log in → join session → connect WebSocket → answer each question as it appears |
| 4 | End | Professor ends session; all WebSocket connections close |

The five questions cover every response-collecting question type:

| # | Type | Label |
|---|------|-------|
| 1 | Multiple Choice | MC |
| 2 | Multiple Select | MS |
| 3 | True / False | TF (MC with 2 options) |
| 4 | Short Answer | SA |
| 5 | Numerical | NU |

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | ≥ 20 | <https://nodejs.org> |
| **k6** | ≥ 0.50 | <https://grafana.com/docs/k6/latest/set-up/install-k6/> |
| **MongoDB** | ≥ 7 | Running and accessible |
| **Qlicker server** | — | Running (with `MONGO_URL` pointing to the same DB) |

### Installing k6

```bash
# macOS
brew install k6

# Debian / Ubuntu
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Docker (no install needed)
docker run --rm -i grafana/k6 run - <scenarios/live-session.js
```

## Quick Start

```bash
cd load-testing

# 1. Install Node dependencies (for the seed script)
npm install

# 2. Seed the database  (default: 500 students)
MONGO_URL=mongodb://localhost:27017/qlicker node seed.mjs

# 3. Run the load test  (against a running Qlicker server)
k6 run --env BASE_URL=http://localhost:3001 scenarios/live-session.js

# 4. Clean up seed data when done
MONGO_URL=mongodb://localhost:27017/qlicker node seed.mjs --clean
```

## Configuration

### Seed Script Options

| Flag | Default | Description |
|------|---------|-------------|
| `--students N` | 500 | Number of student accounts to create |
| `--clean` | — | Remove all load-test data from the database |

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URL` | `mongodb://localhost:27017/qlicker` | MongoDB connection string |

### k6 Environment Variables

Pass via `--env KEY=VALUE` on the k6 command line:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3001` | Qlicker server base URL |
| `STATE_FILE` | `../state.json` | Path to the seed state file (relative to the scenario file) |
| `ANSWER_WINDOW_S` | `30` | Seconds students have to answer each question |
| `STATS_PAUSE_S` | `15` | Seconds to display stats before showing the correct answer |
| `CORRECT_PAUSE_S` | `15` | Seconds to display the correct answer before moving on |

### Adjusting Student Count

```bash
# Seed with 250 students
MONGO_URL=mongodb://localhost:27017/qlicker node seed.mjs --students 250

# Run with 250 VUs (k6 reads the student count from state.json)
k6 run --env BASE_URL=http://localhost:3001 scenarios/live-session.js
```

The k6 scenario automatically scales its VU count to match the number of
students in `state.json`.

## Running Against a Production-Like Setup

For realistic results, run the load test against the production Docker Compose
deployment (see `production_setup/README.md`):

```bash
# Build and start the production stack
cd production_setup
./setup.sh           # follow prompts
docker compose up -d

# Seed using the Docker MongoDB
MONGO_URL=mongodb://localhost:27017/qlicker node ../load-testing/seed.mjs

# Run k6 against the nginx frontend
k6 run --env BASE_URL=https://your-server.example.com \
  ../load-testing/scenarios/live-session.js
```

### Same Server vs. Remote

**Recommended: Run k6 from the same server** to eliminate network variability
and focus on server-side performance. k6 is very lightweight and will not
compete for significant CPU or memory.

If you want to test from a remote client (e.g., to include network latency),
ensure you have a fast, stable connection and note that the measured latencies
will include network round-trip time.

## Understanding the Results

k6 prints a summary at the end of each run. Key metrics to watch:

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

The scenario defines pass/fail thresholds:

```
login_success:    rate > 95 %
join_success:     rate > 95 %
respond_success:  rate > 90 %
login_duration:   p95 < 5 s
join_duration:    p95 < 3 s
respond_duration: p95 < 3 s
ws_event_latency: p95 < 5 s
```

If any threshold is breached, k6 exits with a non-zero code.

## Session Flow Timeline

Below is the timeline from the professor's perspective:

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
 │  │  │  Navigate to Q2 → show → open attempt        │         │
 │  │  │  …same timing…                               │         │
 │  │  └──────────────────────────────────────────────┘         │
 │  │                                                          │
 │  │  ┌── Question 3 (TF) ──┐                                 │
 │  │  │  …                   │                                 │
 │  │  └──────────────────────┘                                 │
 │  │                                                          │
 │  │  ┌── Question 4 (SA) ──┐                                 │
 │  │  │  …                   │                                 │
 │  │  └──────────────────────┘                                 │
 │  │                                                          │
 │  │  ┌── Question 5 (NU) ──┐                                 │
 │  │  │  …                   │                                 │
 │  │  └──────────────────────┘                                 │
 │  │                                                          │
 │  └── END SESSION                                            │
 └─────────────────────────────────────────────────────────────┘
```

Total session duration ≈ 5 s + 5 × (30 + 15 + 15) s = **5 min 5 s** (with defaults).

## Troubleshooting

### "Session not found" or "Not a member of course"

Ensure you seeded the database against the **same MongoDB instance** the server
is using. Verify `MONGO_URL` matches in both the seed script and the server's
`.env`.

### Login rate-limiting (429 errors)

The Qlicker server rate-limits login attempts. The load test uses the server's
`/auth/login` endpoint. If you see 429 errors:
- Ensure rate limiting is relaxed or disabled for the load test
  (e.g., set `RATE_LIMIT_DISABLED=true` in the server `.env`)
- Or increase the `startTime` delay in the k6 options to stagger logins

### WebSocket connection failures

- Check that the server's WebSocket endpoint (`/ws`) is accessible through any
  reverse proxy (nginx).
- Ensure `proxy_pass` includes WebSocket upgrade headers in the nginx config.
- For multi-replica setups, Redis must be configured (`REDIS_URL`) for
  cross-instance WebSocket broadcasting.

### Not enough file descriptors

Each student VU opens one WebSocket + HTTP connections. For 500 VUs:

```bash
ulimit -n 4096   # raise FD limit before running k6
```

## File Structure

```
load-testing/
├── README.md                          ← You are here
├── package.json                       ← Node deps for the seed script
├── seed.mjs                           ← Database seeding / cleanup
├── state.json                         ← Generated: credentials + IDs (git-ignored)
└── scenarios/
    └── live-session.js                ← k6 scenario: professor + students
```
