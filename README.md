# Qlicker

Qlicker is an open-source classroom response system for higher education. It gives instructors a mobile-friendly alternative to hardware clickers for live participation, quizzes, grading, course management, and classroom discussion.

This repository contains the current **Fastify + React** version of Qlicker. Migration and legacy-reference documentation now lives under [`meteorjs_migration/`](meteorjs_migration/).

## What Qlicker includes

- interactive live sessions with real-time student responses
- timed quizzes and practice quizzes
- grading, review, and CSV export
- course enrollment, TA/professor management, and groups
- SAML SSO plus local email/password login where allowed
- image uploads, rich text, math rendering, and Jitsi video chat
- English/French UI, production deployment tooling, backups, and load testing

## Repository guide

- [`server/`](server/) - Fastify backend
- [`client/`](client/) - React frontend
- [`scripts/`](scripts/) - native/docker setup, seeding, legacy init, local service management
- [`production_setup/`](production_setup/) - production Docker deployment package
- [`docs/`](docs/) - user, developer, and API documentation
- [`load-testing/`](load-testing/) - k6-based load-testing suite
- [`meteorjs_migration/`](meteorjs_migration/) - migration status, completed archive, legacy DB notes, and original migration requirements
- [`CODING_STANDARDS.md`](CODING_STANDARDS.md) - future-work conventions

## Quick start

### Option 1: native development

```bash
cd /home/runner/work/qlicker-1/qlicker-1
./scripts/setup-native.sh
./scripts/qlicker.sh start
```

The setup script prepares local `.env` values, installs dependencies, and helps configure MongoDB and Redis. `qlicker.sh` manages the backend and frontend processes for local development.

### Option 2: Docker development

```bash
cd /home/runner/work/qlicker-1/qlicker-1
./scripts/setup-docker.sh
docker compose up -d
```

This starts MongoDB, Redis, the Fastify API, and the React client in containers.

## First run

On an empty database:

1. Open the app in your browser.
2. Create the first account.
3. That first account becomes **admin** automatically.
4. Use the admin UI to configure storage, SSO, backup policy, and other system settings.

## Common development commands

```bash
cd /home/runner/work/qlicker-1/qlicker-1/server && npm test
cd /home/runner/work/qlicker-1/qlicker-1/client && npm test
cd /home/runner/work/qlicker-1/qlicker-1/client && npm run build
```

Native helper commands:

```bash
./scripts/qlicker.sh start
./scripts/qlicker.sh stop
./scripts/qlicker.sh restart
./scripts/qlicker.sh status
./scripts/qlicker.sh e2e --install-browser
```

## Development user management

Seed test users if you want a ready-made local dataset:

```bash
./scripts/seed-db.sh
./scripts/seed-db-docker.sh
```

Reset a development user password directly:

```bash
./scripts/changeuserpwd.sh --email user@example.com
./scripts/changeuserpwd.sh --email user@example.com --newpasswd newPassword123
```

## Production user management

For a deployed Docker stack, use [`production_setup/manage-user.sh`](production_setup/manage-user.sh):

```bash
cd /home/runner/work/qlicker-1/qlicker-1/production_setup
./manage-user.sh list
./manage-user.sh create --email prof@example.com --firstname Jane --lastname Smith --role professor
./manage-user.sh promote --email prof@example.com --role admin
./manage-user.sh change-password --email user@example.com
./manage-user.sh set-email-login --email sso.user@example.com --disable-email-login
```

## Production deployment

The production-ready deployment package lives in [`production_setup/`](production_setup/). It includes:

- interactive `setup.sh`
- Docker Compose stack with Nginx, MongoDB, Redis, server replicas, and client
- TLS support
- backup and restore scripts
- legacy-database initialization tooling
- user-management tooling
- image build/update helpers

Start with:

```bash
cd /home/runner/work/qlicker-1/qlicker-1/production_setup
./setup.sh
docker compose up -d
```

For the full guide, see [`production_setup/README.md`](production_setup/README.md).

## Migrating from a legacy Meteor deployment

Qlicker is designed to run against the existing MongoDB data model used by the Meteor app.

### Development migration helpers

```bash
./scripts/init-from-legacy.sh
./scripts/init-from-legacy-docker.sh
```

### Production migration helper

```bash
cd /home/runner/work/qlicker-1/qlicker-1/production_setup
./init-from-legacy.sh
```

Use the sanitize flow only when you are ready to move legacy public S3 image references to Fastify's `/uploads/<key>` path. The remaining live migration item is the final production move to private S3 buckets.

See:

- [`meteorjs_migration/LEGACY_DB.md`](meteorjs_migration/LEGACY_DB.md)
- [`production_setup/README.md`](production_setup/README.md#initializing-from-legacy-database)
- [`production_setup/README.md`](production_setup/README.md#s3-private-bucket-migration)

## Backups and restore

Production backup tooling lives in [`production_setup/`](production_setup/):

```bash
cd /home/runner/work/qlicker-1/qlicker-1/production_setup
./backup.sh
./restore.sh
```

The deployment also supports scheduled backups via the backup manager and the Admin **Backup** tab. See [`production_setup/README.md`](production_setup/README.md#backups).

## Load testing

The load-testing suite exercises realistic live-session and chat traffic with k6:

```bash
cd /home/runner/work/qlicker-1/qlicker-1/load-testing
./setup.sh
./run.sh --prepare
./run.sh
./run.sh --restore
```

See [`load-testing/README.md`](load-testing/README.md) for the full workflow and tuning options.

## Documentation

- User and developer docs: [`docs/`](docs/)
- Production deployment guide: [`production_setup/README.md`](production_setup/README.md)
- Coding conventions for future work: [`CODING_STANDARDS.md`](CODING_STANDARDS.md)
- Migration archive and remaining items: [`meteorjs_migration/`](meteorjs_migration/)
