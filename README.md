# Qlicker

Qlicker is a classroom response system (clicker) for higher education. It allows professors to create interactive sessions with questions (multiple choice, true/false, short answer, multi-select, numerical) that students can answer in real-time, as well as timed quizzes. It includes grading, group management, and video chat features.

This repository contains the **migration** from the original MeteorJS implementation to a modern **Fastify + React** stack.

## Repository Structure

```
├── REQUIREMENTS_FOR_MIGRATION_FASTIFY.md   # Master requirements (human-maintained)
├── MIGRATION.md                            # Migration plan, status, and progress
├── agents/                                 # Detailed agent task files
│   ├── AGENT_1_FOUNDATION.md
│   ├── AGENT_2_AUTH.md
│   ├── AGENT_3_COURSES.md
│   ├── AGENT_4_SESSIONS.md
│   ├── AGENT_5_RESPONSES.md
│   ├── AGENT_6_GRADING.md
│   ├── AGENT_7_FRONTEND.md
│   └── AGENT_8_TESTING.md
├── meteorjs_version/                       # Original MeteorJS app (reference)
├── server/                                 # Fastify backend (to be created)
├── client/                                 # React frontend (to be created)
├── scripts/                                # Setup and utility scripts
├── docker-compose.yml                      # Docker orchestration
└── Dockerfile.*                            # Container build files
```

## Quick Start

> **Note:** The Fastify/React app is currently under development. See [MIGRATION.md](MIGRATION.md) for current status.

### Prerequisites

- Node.js >= 20.x
- npm >= 10.x
- MongoDB >= 6.x (or Docker)

### Native Setup

```bash
# Run the native setup script
./scripts/setup-native.sh
```

The script will:
- Check and offer to install dependencies (Node.js, npm, MongoDB)
- Ask which ports to use (defaults: 3000 for app, 3001 for API, 27017 for MongoDB)
- Ask for MongoDB data path (default: `data/db`)
- Generate `.env` files with secure tokens (using OpenSSL)
- Run `npm install` for both server and client

### Docker Setup

```bash
# Run the Docker setup script
./scripts/setup-docker.sh
```

The script will:
- Ask which ports to use (confirming defaults are free)
- Generate a `.env` file for Docker Compose
- Optionally build Docker images

Then start the stack:

```bash
docker compose up -d
```

### Managing the Native App

```bash
./scripts/qlicker.sh start    # Start the app
./scripts/qlicker.sh stop     # Stop the app
./scripts/qlicker.sh restart  # Restart the app
./scripts/qlicker.sh status   # Check status
```

### Database Seeding

```bash
# Seed with sample users (native)
./scripts/seed-db.sh

# Seed with sample users (Docker)
./scripts/seed-db-docker.sh

# Reset database to empty
./scripts/seed-db.sh --reset
./scripts/seed-db-docker.sh --reset
```

### First Run

1. On an empty database, navigate to the login page
2. Create the first account — it will automatically be granted **admin** access
3. Log in and configure the app via the admin panel
4. Additional users who create accounts will be **students** by default
5. Admins can promote users to **professor** role

## Development

```bash
# Start backend in development mode
cd server && npm run dev

# Start frontend in development mode
cd client && npm run dev

# Run tests
cd server && npm test
cd client && npm test
```

## Documentation

- [Requirements](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md) — Master requirements for the migration
- [Migration Plan](MIGRATION.md) — Detailed migration plan, progress, and agent assignments
- [Agent Task Files](agents/) — Detailed sub-task plans for each parallel agent

## License

See [LICENSE](meteorjs_version/LICENSE) for details.
