# Qlicker

Qlicker is a classroom response system (clicker) for higher education. It allows professors to create interactive sessions with questions (multiple choice, true/false, short answer, multi-select, numerical) that students can answer in real-time, as well as timed quizzes. It includes grading, group management, and video chat features.

This repository contains the **migration** from the original MeteorJS implementation to a modern **Fastify + React** stack.

## Repository Structure

```
├── REQUIREMENTS_FOR_MIGRATION_FASTIFY.md   # Master requirements (human-maintained)
├── MIGRATION.md                            # Migration plan, status, and progress
├── MIGRATION_COMPLETED.md                  # Completed work archive
├── CODING_STANDARDS.md                     # Coding conventions and API patterns
├── LEGACY_DB.md                            # Legacy MongoDB database schema
├── meteorjs_version/                       # Original MeteorJS app (reference)
├── server/                                 # Fastify backend
├── client/                                 # React frontend (Vite)
├── ssoserver/                              # Isolated local SimpleSAMLphp IdP for SSO smoke tests
├── load-testing/                           # k6 load testing scenario + seed script
├── production_setup/                       # Self-contained production deployment package
├── scripts/                                # Setup and utility scripts
├── docs/                                   # Developer and user documentation
├── docker-compose.yml                      # Docker orchestration (development)
└── .env.example                            # Environment variable template
```

## Quick Start

> **Note:** The Fastify/React app is currently under development. See [MIGRATION.md](MIGRATION.md) for current status.

### Prerequisites

- Node.js >= 20.x
- npm >= 10.x
- MongoDB >= 6.x (or Docker)
- Redis >= 7.x (optional — or Docker; enables multi-instance WebSocket pub/sub)

### Native Setup

```bash
# Run the native setup script
./scripts/setup-native.sh
```

The script will:
- Check and offer to install dependencies (Node.js, npm, MongoDB)
- Ask which ports to use (defaults: 3000 for app, 3001 for API, 27017 for MongoDB, 6379 for Redis)
- Ask for MongoDB data path (default: `data/db`)
- Ask for Redis URL (default: `redis://localhost:6379`)
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

Then start the stack (includes MongoDB, Redis, server, and client):

```bash
docker compose up -d
```

### Managing the Native App

```bash
./scripts/qlicker.sh start    # Start the app (backend + frontend)
./scripts/qlicker.sh stop     # Stop the app
./scripts/qlicker.sh restart  # Restart the app
./scripts/qlicker.sh status   # Check running status
./scripts/qlicker.sh e2e --install-browser  # Install Chromium once (if needed) and run Playwright E2E tests
```

### Database Seeding

Populate the database with sample users for testing:

```bash
# Seed with sample users (native)
./scripts/seed-db.sh

# Seed with sample users (Docker)
./scripts/seed-db-docker.sh

# Reset database to empty
./scripts/seed-db.sh --reset
./scripts/seed-db-docker.sh --reset
```

### Loading a Legacy Dump in Development

Use the explicit legacy-init wrappers when you want a dev database populated from the Meteor dump instead of sample users:

```bash
# Native MongoDB dev setup
./scripts/init-from-legacy.sh

# Docker Compose dev setup
./scripts/init-from-legacy-docker.sh
```

Both scripts restore the selected dump from `legacydb/` and then apply the question-type migration automatically.

If the legacy image data still points at public S3 URLs and you want to exercise the private-bucket cutover path too:

```bash
./scripts/init-from-legacy.sh --sanitize-s3
./scripts/init-from-legacy-docker.sh --sanitize-s3
```

`--sanitize-s3` rewrites image references in MongoDB to Fastify's `/uploads/...` proxy path. Run that only on a database copy you intend Fastify to use; the legacy Meteor app should be treated as cut over once those URLs are rewritten.

### Changing a User Password (Dev/Testing)

For development and testing, you can change any user's password directly in the database:

```bash
# Change password (defaults to '123456' if --newpasswd is omitted)
./scripts/changeuserpwd.sh --email user@example.com

# Change password to a specific value
./scripts/changeuserpwd.sh --email user@example.com --newpasswd mynewpassword

# Show usage
./scripts/changeuserpwd.sh --help
```

The script connects to MongoDB using the `MONGO_URI` from your `.env` file and updates the user's password hash (Argon2id). The minimum password length is 6 characters.

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

### Redis Setup (Optional — Enables Multi-Instance WebSocket Pub/Sub)

Qlicker uses Redis pub/sub to synchronize WebSocket events across multiple server instances. Without Redis, the app runs in single-instance mode (all WebSocket connections are handled in-process). When `REDIS_URL` is set, all broadcast functions automatically fan out across instances.

#### Docker Compose (recommended for dev)

The development `docker-compose.yml` already includes a Redis container. When you run `docker compose up -d`, Redis is started automatically and the server connects to it via `REDIS_URL=redis://redis:$REDIS_PORT` (default `6379`).

If you run the server **natively** but want Redis via Docker:

```bash
# Start only the Redis container
docker run -d --name qlicker-redis -p 6379:6379 redis:7-alpine

# Set REDIS_URL in your .env
REDIS_URL=redis://localhost:6379
```

To stop the standalone container:

```bash
docker stop qlicker-redis && docker rm qlicker-redis
```

#### Native Redis

Install Redis on your system and start it:

```bash
# macOS (Homebrew)
brew install redis
redis-server --port 6379 --daemonize yes

# Ubuntu/Debian
sudo apt-get install redis-server
redis-server --port 6379 --daemonize yes
```

Then set in your `.env`:

```env
REDIS_URL=redis://localhost:6379
```

#### Using `qlicker.sh` with Redis

The service manager script (`scripts/qlicker.sh`) automatically starts and stops Redis alongside MongoDB when `REDIS_URL` is set in `.env` and `redis-server` is available on the host. If `redis-server` is not found, the script prints a helpful message suggesting the Docker alternative.

#### Verifying Redis is Active

Check the health endpoint after starting the server:

```bash
curl http://localhost:3001/api/v1/health
# {"status":"ok","timestamp":"...","websocket":true,"redis":true}
```

When `redis` is `true`, the server is using Redis pub/sub. When `false`, it's running in single-instance mode.

### E2E Tests (Playwright)

The E2E suite lives in `client/e2e/` and starts its own temporary Fastify + Vite stack automatically. It does **not** require your local MongoDB instance because the server side of the suite uses `mongodb-memory-server`.

One-time browser setup:

```bash
cd client && npx playwright install chromium
```

Run the suite with either:

```bash
./scripts/qlicker.sh e2e

# or directly
cd client && npm run test:e2e
```

Port behavior:

- By default, Playwright uses client port `3000` and API port `3001`
- If the repository root `.env` file defines `APP_PORT` and/or `API_PORT`, the Playwright config will use those values automatically
- The E2E web servers still run locally on those ports; they do not reuse an already-running development stack

### Local SAML SSO Smoke Environment

The repository now includes an isolated `ssoserver/` workspace that runs a local SimpleSAMLphp IdP without changing the root Docker setup. It is intended to validate SSO login, encrypted assertions, and single logout against the new Fastify/React app before testing with the real Microsoft/Azure IdP.

Quick start:

```bash
cd ssoserver
cp .env.example .env
./scripts/generate-certs.sh
node ./scripts/render-config.mjs
docker compose up -d --build
```

For manual setup, the `ssoserver` helper scripts follow the repository root `.env` app/API URLs automatically unless you override the `QCLICKER_*` values in `ssoserver/.env` with non-default values.

Print the exact Qlicker SSO settings payload:

```bash
cd ssoserver
node ./scripts/print-qlicker-settings.mjs
```

The generated payload configures Qlicker with:

- `SSO_enabled=true`
- `SSO_entrypoint=http://127.0.0.1:4100/simplesaml/module.php/saml/idp/singleSignOnService`
- `SSO_logoutUrl=http://127.0.0.1:4100/simplesaml/module.php/saml/idp/singleLogout`
- `SSO_EntityId` derived from the repository root `.env` app URL (for example `http://localhost:3200/SSO/SAML2/metadata`)
- `SSO_identifierFormat=urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
- `SSO_institutionName=Local SimpleSAMLphp`
- `SSO_emailIdentifier=mail`
- `SSO_firstNameIdentifier=givenName`
- `SSO_lastNameIdentifier=sn`
- `SSO_roleIdentifier=role`
- `SSO_roleProfName=professor`
- `SSO_studentNumberIdentifier=studentNumber`
- `SSO_cert` from `ssoserver/certs/idp.crt`
- `SSO_privCert` and `SSO_privKey` from `ssoserver/certs/qlicker-sp.*`

For production cutover compatibility, the Fastify app also serves the legacy Meteor SAML surface alongside the newer `/api/v1/auth/sso/*` routes:

- `/SSO/SAML2`
- `/SSO/SAML2/logout`
- `/SSO/SAML2/metadata`
- `/SSO/SAML2/metadata.xml`

Run the dedicated SSO smoke test:

```bash
./ssoserver/scripts/run-smoke.sh
```

The standard `./scripts/qlicker.sh e2e` / `cd client && npm run test:e2e` commands still run the baseline non-SSO Playwright suite only. The SSO smoke uses `client/playwright.sso.config.js` so it can stay isolated from the default browser test stack.

That wrapper:

- creates `ssoserver/.env` from `.env.example` if needed
- generates local-only certs and rendered SimpleSAMLphp config
- starts the isolated IdP on `http://127.0.0.1:4100`
- ensures Playwright Chromium is installed
- runs `client/e2e-sso/sso.spec.js` via `client/playwright.sso.config.js` against a dedicated Qlicker E2E stack on `3300/3301`
- stops the IdP when the smoke run exits

`run-smoke.sh` intentionally uses the `QCLICKER_*` values from `ssoserver/.env` (default `3300/3301`) for that temporary stack, even if your main repo `.env` points at a different local app already running on `3200/3201`.

Default seeded IdP users:

- Professor: `sso-professor` / `Password123!`
- Student: `sso-student` / `Password123!`

For the full setup, helper scripts, troubleshooting, and metadata details, see [ssoserver/README.md](/home/rmartin/qlicker-1/ssoserver/README.md).

## Scripts Reference

| Script | Description |
|--------|-------------|
| `scripts/setup-native.sh` | Interactive wizard for native (non-Docker) installation |
| `scripts/setup-docker.sh` | Interactive wizard for Docker Compose setup |
| `scripts/qlicker.sh` | Service manager — `start`, `stop`, `restart`, `status`, `e2e [--install-browser]` |
| `scripts/seed-db.sh` | Seed the database with test data (native) |
| `scripts/seed-db-docker.sh` | Seed the database with test data (Docker) |
| `scripts/init-from-legacy.sh` | Restore the legacy dump into the native dev DB, then apply question-type migration |
| `scripts/init-from-legacy-docker.sh` | Restore the legacy dump into the Docker dev DB, then apply question-type migration |
| `scripts/seed-db.js` | Node.js seeding logic used by the shell wrappers |
| `scripts/changeuserpwd.sh` | Change a user's password from the CLI (dev/testing) |
| `scripts/changeuserpwd.js` | Node.js logic for password change |
| `scripts/build-images.sh` | Build and tag Docker images for production deployment |

## Load Testing

The load-test suite lives in [`load-testing/`](load-testing/README.md). It
seeds dedicated load-test users/courses/sessions and runs a k6 scenario that
simulates a professor + concurrent students through a full live session.

Typical flow:

```bash
cd load-testing
./setup.sh
./run.sh --prepare
./run.sh
./run.sh --restore
./run.sh --clean
```

`setup.sh` now supports `dev` or `prod` targets and both `docker` and `native`
runtime modes. It asks for the `.env` file for the running stack, derives the
MongoDB and API/WebSocket connection info, and builds the local seed runner.

For native targets, `./run.sh --prepare` updates the target `.env` with
`DISABLE_RATE_LIMITS=true`; restart the server after that change so the load
test runs without Fastify rate limits.

## Production Deployment

For production deployment, see the self-contained **[`production_setup/`](production_setup/)** directory. It includes:

- **Docker Compose** with Nginx TLS termination (ports 443/80), configurable server replicas, MongoDB, and Redis
- **Interactive setup script** (`setup.sh`) to generate `.env` with domain, TLS, scaling, and JWT configuration
- **Let's Encrypt integration** with automatic certificate renewal via Certbot
- **Legacy database initialization** (`init-from-legacy.sh`) with question-type migration
- **S3 privatization scripts** (`sanitize-s3.js`, `sanitize-s3.sh`) to rewrite legacy image URLs and migrate objects toward private-bucket mode
- **Automated live backups** (`backup.sh` + `backup-manager.sh`) with labeled daily/weekly/monthly archives retained from Admin -> Backup
- **Direct command-line backups** from the host (`cd production_setup && ./backup.sh [--label manual|daily|weekly|monthly]`)
- **Restore script** (`restore.sh`) for disaster recovery
- **User management** (`manage-user.sh`) — create users, change passwords, promote roles, and toggle per-user email-login exceptions
- **Update script** (`update.sh`) for rolling updates with pre-update backups
- **Detailed README** with architecture overview, scaling guidance, and troubleshooting

```bash
# Copy to production server and run setup
cp -r production_setup/ /opt/qlicker/
cd /opt/qlicker
./setup.sh
docker compose up -d
```

See [`production_setup/README.md`](production_setup/README.md) for the complete deployment guide.

### Maintenance helpers

- `node scripts/dedupe-grades.js --mongo-uri <mongodb-uri>` performs a dry run to report duplicate `{ userId, courseId, sessionId }` grade identities.
- Add `--apply` to remove older duplicates and keep the newest grade row per identity before relying on the backend duplicate-grade guard.
- Production operators can also use `production_setup/manage-user.sh set-email-login --email user@example.com --enable-email-login` to grant a local-email sign-in exception for SSO-managed accounts.

## Image / File Storage Configuration

Qlicker supports three storage backends for uploaded images (profile photos, question images): **local**, **Amazon S3**, and **Azure Blob Storage**.

The runtime storage backend is now selected from **Admin -> Storage** and saved in the database `Settings` document. New deployments always start on **local storage** by default. The application no longer requires storage environment variables at runtime, and once an admin saves storage settings in the UI those database values are authoritative.

For all backends, Fastify now serves uploaded images through stable app-relative URLs under `/uploads/<key>`. New S3/Azure uploads use that path automatically. Legacy Meteor data may still contain direct public S3 URLs; use the sanitization flow in [`production_setup/README.md`](production_setup/README.md) before you lock the bucket down.

### Local Storage (default)

No additional configuration is needed. Files are stored in the `server/uploads/` directory and served directly by Fastify.

### Amazon S3

To use Amazon S3 (or any S3-compatible service such as MinIO), open **Admin -> Storage**, choose **Amazon S3**, and enter:

1. **Create an S3 bucket** in your AWS account (or MinIO instance).
2. **If the legacy Meteor app still serves production traffic, leave current public reads in place until Fastify has been validated.** Do not remove public access from the live bucket before the DB/image cutover is complete.
3. **Create an IAM user** (or use an existing one) with programmatic access.
4. **Attach a policy** granting `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` on the bucket. Example policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
       "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
     }]
   }
   ```
5. **Copy the Access Key ID and Secret Access Key** from the IAM user credentials.
6. **Enter the provider settings in the admin panel:** bucket, region, access key ID, secret access key, and optionally a custom endpoint plus path-style support for S3-compatible services.
7. **If you are cutting over legacy public S3 data to Fastify, run the S3 sanitization step against the Fastify database copy before removing public access.** That rewrites MongoDB image URLs to `/uploads/...` so the app can proxy reads from a private bucket.
8. **After validation, lock the bucket down:** remove public bucket-policy access, enable S3 Block Public Access, and optionally set Object Ownership to `Bucket owner enforced`. If ACLs are disabled before the sanitizer runs, the script will still rewrite MongoDB URLs but the ACL pass will be skipped.

### Azure Blob Storage

To use Azure Blob Storage, open **Admin -> Storage**, choose **Azure Blob**, and enter:

1. **Create a Storage Account** in the Azure Portal (e.g., `qlickerstorage`).
2. **Create a Blob Container** inside the storage account (e.g., `images`).
3. **Copy an Access Key** from the storage account's "Access keys" blade in the Azure Portal.
4. **Enter the provider settings in the admin panel:** storage account, access key, and container name.

The container will be created automatically if it does not exist (provided the access key has sufficient permissions).

### Upload behavior

- Rich-text-editor images and profile uploads are resized on the client before upload to the admin-configured maximum width (`1920px` by default).
- Profile photo uploads open a crop/rotate dialog and store a separate square thumbnail for avatar circles.
- After any storage change, upload a test image from both the profile page and a rich-text editor to confirm the full image and thumbnail paths work as expected.
- When migrating from legacy public S3 URLs, verify both old images and new uploads after the sanitize step. The old Meteor app should be considered retired once those DB URLs are rewritten to `/uploads/...`.

### Testing Storage Backends

**S3 with MinIO:** [MinIO](https://min.io/) is an S3-compatible object storage server that can be run locally. It is well suited for integration testing and local development without an AWS account:

```bash
# Run MinIO via Docker
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

Then create a bucket (for example `qlicker-dev`) via the MinIO console at `http://localhost:9001`, and enter these values in **Admin -> Storage**:

- bucket: `qlicker-dev`
- region: `us-east-1`
- access key ID: `minioadmin`
- secret access key: `minioadmin`
- endpoint: `http://localhost:9000`
- force path style: enabled

**Azure with Azurite:** [Azurite](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite) is the official Azure Storage emulator. It provides a local emulation of Azure Blob Storage for development and testing:

```bash
# Run Azurite via Docker
docker run -p 10000:10000 -p 10001:10001 -p 10002:10002 \
  mcr.microsoft.com/azure-storage/azurite

# Or install and run via npm
npm install -g azurite
azurite --silent --location ./azurite-data
```

Then configure Qlicker in **Admin -> Storage** with Azurite's well-known credentials:

- storage account: `devstoreaccount1`
- access key: `Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==`
- container name: `images`

> **Note:** Azurite uses a different blob endpoint format (`http://127.0.0.1:10000/devstoreaccount1`). The upload plugin currently constructs Azure URLs using the standard `https://<account>.blob.core.windows.net` pattern. For production usage this is correct; for local Azurite testing, uploaded files can be accessed directly via the Azurite endpoint.

> **Maintenance script note:** [`production_setup/sanitize-s3.js`](production_setup/sanitize-s3.js) resolves S3 settings from the database `Settings` document first and accepts `AWS_*` variables as overrides when needed. Normal Fastify runtime storage selection still comes from the admin panel, not the process environment.

## Internationalization (i18n)

Qlicker supports multiple languages. Currently **English** (`en`) and **French** (`fr`) are included.

### How It Works

- **Client-side:** Uses [`react-i18next`](https://react.i18next.com/) with browser language detection (`i18next-browser-languagedetector`).
- **Translation files:** `client/src/i18n/locales/en.json` and `client/src/i18n/locales/fr.json` (879 keys each).
- **Language detection order:** `localStorage` (`qlicker_locale`) → browser language → fallback `en`.

### Admin Panel (App Default)

Administrators can set the **app-wide default language** and **date format** in the Admin Dashboard → Settings tab. These values are stored in the `Settings` collection (`locale`, `dateFormat`).

### User Override (Profile Page)

Each user can override the app default by selecting a language on their **Profile** page. Choices are:
- **Use app default** — follows the admin setting
- **English**
- **Français**

The per-user preference is stored in `User.locale` and also cached in `localStorage`.

### Adding a New Language

1. Copy `client/src/i18n/locales/en.json` to a new file (e.g., `es.json`)
2. Translate all 879 keys
3. Register the new locale in `client/src/i18n/index.js`:
   - Add to `resources` object
   - Add to `SUPPORTED_LOCALES` array
4. The admin and profile dropdowns will automatically include the new language

### Legacy Database Compatibility

- The `User.locale` field defaults to `''` (empty string). Legacy user documents without this field will seamlessly use the app default — no migration required.
- The `Settings.locale` and `Settings.dateFormat` fields have defaults (`'en'` and `'DD-MMM-YYYY'`). Legacy settings documents without these fields will use the defaults automatically.
- All `t()` translation calls use fallback keys, so missing translations gracefully fall back to English.

## Documentation

- [Production Deployment Guide](production_setup/README.md) — **Complete guide for deploying Qlicker in production**
- [Coding Standards](CODING_STANDARDS.md) — **Read before making any changes.** APIs, DB patterns, i18n, performance, security, and shared utilities
- [Requirements](REQUIREMENTS_FOR_MIGRATION_FASTIFY.md) — Master requirements for the migration
- [Migration Plan](MIGRATION.md) — Migration plan, status, and remaining work
- [Completed Work](MIGRATION_COMPLETED.md) — Archive of completed phases, bug fixes, and PR history
- [Legacy DB](LEGACY_DB.md) — Legacy MongoDB database schema and compatibility details

## License

See [LICENSE](meteorjs_version/LICENSE) for details.
