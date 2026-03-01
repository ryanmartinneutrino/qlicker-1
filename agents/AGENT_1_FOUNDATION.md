# Agent 1: Foundation & Infrastructure

> **Role:** Set up the project scaffolding, build system, Docker configuration, database connection, utility scripts, and file upload infrastructure.
>
> **Reference:** [MIGRATION.md](../MIGRATION.md) | [REQUIREMENTS_FOR_MIGRATION_FASTIFY.md](../REQUIREMENTS_FOR_MIGRATION_FASTIFY.md)

---

## Phase 1 Tasks (Milestone 1: Login Works)

### Task 1.1: Project Scaffolding
**Status:** ⬜ Not started
**Priority:** CRITICAL — blocks all other agents

**Instructions:**
1. Create `server/` directory with:
   - `package.json` (name: `qlicker-server`, dependencies: fastify, @fastify/cors, @fastify/jwt, @fastify/cookie, @fastify/websocket, @fastify/formbody, @fastify/multipart, mongoose, dotenv, nodemailer, bcryptjs)
   - `src/server.js` — entry point that loads config and starts the Fastify server
   - `src/app.js` — Fastify app factory (creates and configures the app instance, registers plugins)
   - `src/config/index.js` — reads from `.env` and exports config object
   - `src/models/` — empty directory for Mongoose models
   - `src/routes/` — empty directory for route modules
   - `src/plugins/` — empty directory for Fastify plugins
   - `src/services/` — empty directory for business logic
   - `src/middleware/` — empty directory for middleware
   - Run `npm install`

2. Create `client/` directory with:
   - Initialize with Vite: `npm create vite@latest . -- --template react`
   - Add dependencies: `@mui/material @mui/icons-material @emotion/react @emotion/styled react-router-dom axios recharts`
   - `vite.config.js` — proxy `/api` to backend, proxy `/ws` to backend WebSocket
   - Run `npm install`

3. Create `.env.example` at repository root:
   ```
   # Server
   PORT=3001
   MONGO_URI=mongodb://localhost:27017/qlicker
   JWT_SECRET=<generate-with-openssl>
   JWT_REFRESH_SECRET=<generate-with-openssl>
   ROOT_URL=http://localhost:3000
   MAIL_URL=smtp://user:pass@smtp.example.com:587
   
   # Client
   VITE_API_URL=http://localhost:3001
   VITE_WS_URL=ws://localhost:3001
   
   # Storage (optional)
   AWS_ACCESS_KEY_ID=
   AWS_SECRET_ACCESS_KEY=
   AWS_BUCKET=
   AWS_REGION=
   AZURE_ACCOUNT_NAME=
   AZURE_ACCOUNT_KEY=
   AZURE_CONTAINER_NAME=
   ```

**Acceptance criteria:**
- `cd server && npm start` starts Fastify and connects to MongoDB
- `cd client && npm run dev` starts Vite dev server
- API responds with 200 on `GET /api/v1/health`

### Task 1.2: Fastify App Factory & Plugins
**Status:** ⬜ Not started

**Instructions:**
1. `src/app.js`:
   - Create Fastify instance with logger enabled
   - Register `@fastify/cors` (allow client origin)
   - Register `@fastify/formbody` and `@fastify/multipart`
   - Register `@fastify/jwt` with secret from config
   - Register `@fastify/cookie`
   - Register `@fastify/websocket`
   - Register MongoDB connection (Mongoose) as a plugin
   - Register route modules under `/api/v1` prefix
   - Add a health check route: `GET /api/v1/health`
   - Export the app factory function (for testing)

2. `src/plugins/db.js`:
   - Connect to MongoDB using Mongoose
   - Log connection status
   - Handle connection errors gracefully
   - Decorate Fastify instance with `mongoose` reference

**Acceptance criteria:**
- App factory is testable (can create app without starting server)
- MongoDB connection established on startup
- Health check returns `{ status: "ok" }`

### Task 1.3: Docker Configuration
**Status:** ⬜ Not started

**Instructions:**
1. Create `server/Dockerfile`:
   - Multi-stage build (builder + production)
   - Node.js 20 Alpine base
   - Copy package.json, install deps, copy source
   - Expose port 3001
   - CMD: `node src/server.js`

2. Create `client/Dockerfile`:
   - Multi-stage build (builder + production)
   - Node.js 20 Alpine for build, Nginx Alpine for serve
   - Build with Vite, copy to Nginx html
   - Nginx config to proxy `/api` and `/ws` to backend

3. Create `docker-compose.yml` at repository root:
   ```yaml
   services:
     mongo:
       image: mongo:7
       ports: ["${MONGO_PORT:-27017}:27017"]
       volumes: [mongo-data:/data/db]
     server:
       build: ./server
       ports: ["${API_PORT:-3001}:3001"]
       env_file: .env
       depends_on: [mongo]
     client:
       build: ./client
       ports: ["${APP_PORT:-3000}:80"]
       depends_on: [server]
   volumes:
     mongo-data:
   ```

4. Create `docker-compose.prod.yml` (for later — load-balanced version with multiple server instances and Nginx upstream)

**Acceptance criteria:**
- `docker compose up -d` starts all services
- App accessible on port 3000
- API accessible on port 3001

### Task 1.4: Utility Scripts
**Status:** ⬜ Not started

**Instructions:**
1. `scripts/setup-native.sh`:
   - Check for Node.js >= 20, npm >= 10, MongoDB
   - Offer to install if missing (apt-get for Debian/Ubuntu/Mint)
   - Ask for ports (app, API, MongoDB) with defaults, confirm free
   - Generate `.env` file with `openssl rand -hex 32` for secrets
   - Run `npm install` in server/ and client/
   - Print summary of what was set up

2. `scripts/setup-docker.sh`:
   - Check for Docker and Docker Compose
   - Ask for ports with defaults, confirm free
   - Generate `.env` file
   - Optionally build images (`docker compose build`)
   - Print instructions

3. `scripts/qlicker.sh`:
   - start: Start server and client (background processes, write PIDs to `.qlicker.pids`)
   - stop: Kill processes from PID file
   - restart: stop then start
   - status: Check if running

4. `scripts/seed-db.sh`:
   - `--reset` flag: Drop database
   - Default: Create admin user (admin@qlicker.com / admin123), professor (prof@qlicker.com / prof123), student (student@qlicker.com / student123)
   - Use MongoDB shell or a Node.js script

5. `scripts/seed-db-docker.sh`:
   - Same as seed-db.sh but runs inside Docker container

All scripts must be `chmod +x` and documented in README.

**Acceptance criteria:**
- Scripts run without errors on Ubuntu/Debian
- Seed script creates expected users
- `qlicker.sh status` correctly reports running state

---

## Phase 2 Tasks (Milestone 2: Profile & Uploads)

### Task 1.5: File Upload Plugin
**Status:** ⬜ Not started

**Instructions:**
1. `src/plugins/upload.js`:
   - Support 3 storage backends: AWS S3, Azure Blob Storage, Local
   - AWS: Use `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` for signed upload URLs
   - Azure: Use `@azure/storage-blob` for SAS token generation
   - Local: Save to a `uploads/` directory, serve via Fastify static
   - Storage type determined by Settings collection (or env var fallback)

2. `src/routes/images.js`:
   - `POST /api/v1/images/upload-url` — generate signed URL for client-side upload
   - `POST /api/v1/images` — register uploaded image in DB
   - `DELETE /api/v1/images/:id` — delete image from storage and DB
   - `POST /api/v1/images/clean` — admin only, clean orphaned images

3. Image Mongoose model (`src/models/Image.js`):
   - `_id`: String (Meteor-style random ID for backward compat)
   - `url`: String
   - `UID`: String

**Acceptance criteria:**
- Can generate signed upload URLs for S3 and Azure
- Local upload saves file and returns URL
- Image metadata saved in DB
- Clean endpoint removes orphaned images

---

## Phase 7-8 Tasks (Later Phases)

### Task 1.6: Production Docker Compose
**Status:** ⬜ Not started (Phase 7)
- Multiple server instances
- Nginx as reverse proxy with upstream load balancing
- Shared session store (if needed)
- Health check endpoints

### Task 1.7: Backup Scripts
**Status:** ⬜ Not started (Phase 8)
- `scripts/backup-db.sh` — mongodump to timestamped directory
- `scripts/restore-db.sh` — mongorestore from backup
- Scheduled backup cron job documentation

---

## Notes for Agent 1

- The Fastify app must be designed as a factory function for testability
- Use Fastify's plugin system — each feature area should be a separate plugin
- Maintain backward compatibility with Meteor's `_id` format (random strings, not ObjectIds)
- The server should gracefully handle missing optional config (e.g., no S3 credentials = local upload only)
- CORS must allow the frontend origin in development and production
- All scripts should work on Debian/Ubuntu/Mint systems
