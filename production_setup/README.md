# Qlicker Production Deployment Guide

This directory contains everything needed to deploy Qlicker in production using Docker Compose behind an Nginx reverse proxy with TLS termination on ports 443 (HTTPS) and 80 (HTTP redirect).

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Setup Script](#setup-script)
5. [TLS Certificates](#tls-certificates)
6. [Server Scaling](#server-scaling)
7. [Initializing from Legacy Database](#initializing-from-legacy-database)
8. [S3 Private-Bucket Migration](#s3-private-bucket-migration)
9. [User Management](#user-management)
10. [Backups](#backups)
11. [Updating](#updating)
12. [File Structure](#file-structure)
13. [Environment Variables](#environment-variables)
14. [Monitoring & Logs](#monitoring--logs)
15. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
                    Internet
                       │
                ┌──────┴──────┐
                │  Nginx :443 │  ← TLS termination, HTTP→HTTPS redirect
                │       :80   │  ← Let's Encrypt ACME challenge
                └──────┬──────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
     ┌────┴────┐  ┌───┴────┐  ┌───┴────┐
     │ Server  │  │ Server │  │ Server │  ← Fastify API (configurable replicas)
     │ :3001   │  │ :3001  │  │ :3001  │
     └────┬────┘  └───┬────┘  └───┬────┘
          │            │            │
          └────────────┼────────────┘
                       │
              ┌────────┴────────┐
              │                 │
         ┌────┴────┐      ┌────┴────┐
         │ MongoDB │      │  Redis  │
         │  :27017 │      │  :6379  │
         └─────────┘      └─────────┘
```

**Key components:**

| Service | Purpose | Exposed Ports |
|---------|---------|---------------|
| **Nginx** | TLS termination, reverse proxy, load balancing | 80, 443 |
| **Server** (Fastify) | REST API + WebSocket server | Internal only |
| **Client** (React SPA) | Static frontend served by internal Nginx | Internal only |
| **MongoDB** | Database | Internal only |
| **Redis** | WebSocket pub/sub for multi-instance sync | Internal only |
| **Certbot** (optional) | Automatic Let's Encrypt certificate renewal | None |

Only ports **80** and **443** are exposed to the host.

---

## Prerequisites

- **Docker** ≥ 24.x with Docker Compose plugin (`docker compose`)
- **Domain name** pointing to the server's IP address
- **TLS certificate** (Let's Encrypt recommended, or bring your own)
- **SMTP server** for email features (password reset, email verification)
- At least **2 GB RAM** and **2 CPU cores** for a basic deployment

---

## Quick Start

```bash
# 1. Copy the production_setup directory to your server
scp -r production_setup/ user@server:/opt/qlicker/

# 2. SSH into the server
ssh user@server
cd /opt/qlicker

# 3. Run the interactive setup
chmod +x *.sh
./setup.sh

# 4. (Optional) Obtain Let's Encrypt certificate
./setup.sh --init-certs

# 5. Start the application
docker compose up -d

# 6. Check status
docker compose ps

# 7. View logs
docker compose logs -f
```

The first user to create an account via the web UI is automatically promoted to **admin**.

---

## Setup Script

The interactive `setup.sh` script generates the `.env` file with all required configuration:

```bash
./setup.sh
```

It will prompt for:

| Setting | Description | Default |
|---------|-------------|---------|
| Domain | Your server's FQDN | `qlicker.example.com` |
| TLS certificate path | Path to fullchain.pem | `./certs/fullchain.pem` |
| TLS key path | Path to privkey.pem | `./certs/privkey.pem` |
| Server replicas | Number of API server instances | `2` |
| JWT secrets | Auto-generated cryptographic secrets | (generated) |
| MAIL_URL | SMTP connection string | (none) |
| MONGO_URI | MongoDB connection URI | `mongodb://mongo:27017/qlicker` |
| REDIS_URL | Redis connection URL | `redis://redis:6379` |
| Storage type | `local`, `s3`, or `azure` | `local` |
| Backup retention | Days to keep backups | `30` |

### Configuration Inheritance

The setup script loads defaults from existing configuration files in priority order:

| Priority | Source | When used |
|----------|--------|-----------|
| 1 (highest) | `production_setup/.env` | Re-running setup — all current production values are proposed as defaults |
| 2 | Root-level `.env` (dev config in `../`) | First-time production setup — inherits JWT secrets, MAIL_URL, storage, and other settings from dev |
| 3 (lowest) | `.env.example` | Fresh install — uses documented static defaults |

When an existing config is found, the script prints a summary of imported values. At each prompt the loaded default is shown in square brackets — press **Enter** to keep it, or type a new value to override.

### Re-running Setup

Running `./setup.sh` again will detect the existing `.env` and offer to keep current values as defaults.

---

## TLS Certificates

### Option 1: Let's Encrypt (Recommended)

```bash
# First run: generate .env with your domain
./setup.sh

# Obtain initial certificate
./setup.sh --init-certs
```

This will:
1. Create a temporary self-signed certificate
2. Start Nginx to handle the ACME challenge
3. Run Certbot to obtain the real certificate
4. Update `.env` with the certificate paths
5. The `certbot` service in Docker Compose auto-renews every 12 hours

### Option 2: Bring Your Own Certificate

Place your certificate files and update `.env`:

```bash
# Copy certificates
mkdir -p certs
cp /path/to/fullchain.pem certs/fullchain.pem
cp /path/to/privkey.pem certs/privkey.pem

# Or point to existing Let's Encrypt certs in .env:
TLS_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
TLS_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### Option 3: Self-Signed (Testing Only)

During setup, if no certificate is found, the script offers to generate a self-signed certificate. **Do not use in production.**

---

## Server Scaling

The number of API server replicas is controlled by `SERVER_REPLICAS` in `.env`:

```env
SERVER_REPLICAS=2
```

### Recommendations

| Concurrent Users | Recommended Replicas | Notes |
|-----------------|---------------------|-------|
| < 500 | 2 | Minimum for high availability |
| 500 – 1,000 | 3 | Good balance for most deployments |
| 1,000 – 2,000 | 4 | Each replica handles ~500 WebSocket connections |
| 2,000+ | 4+ | Scale horizontally; consider dedicated hardware |

**Note:** All replicas share the same MongoDB and Redis instances. Redis is required for multi-instance WebSocket synchronization — it ensures that live session events are broadcast to all connected clients regardless of which server replica they're connected to.

### MongoDB

A single MongoDB instance is sufficient for most Qlicker deployments (thousands of concurrent users). MongoDB 7's WiredTiger engine handles concurrent reads efficiently. The Docker Compose sets `--wiredTigerCacheSizeGB=1` by default; increase this if your server has more RAM:

```yaml
# In docker-compose.yml, under mongo service:
command: ["mongod", "--wiredTigerCacheSizeGB", "2"]
```

**When to add MongoDB replicas:** Only if you need high availability (automatic failover). For read scaling, a single MongoDB instance is typically sufficient because the application uses Redis for the most performance-critical real-time data path.

### Changing Replicas After Setup

```bash
# Edit .env
SERVER_REPLICAS=4

# Apply
docker compose up -d --scale server=4
```

---

## Initializing from Legacy Database

To migrate from the legacy MeteorJS Qlicker instance:

### 1. Create a Dump of the Legacy Database

On the old server:
```bash
mongodump --uri='mongodb://host:port/qlicker' --out=/tmp/qlicker-dump
```

### 2. Transfer the Dump

```bash
# Copy to the production server
scp -r /tmp/qlicker-dump/qlicker user@server:/opt/qlicker/legacydb/qlicker
```

### 3. Run the Initialization Script

```bash
# Ensure services are running
docker compose up -d

# Run the initialization
./init-from-legacy.sh
```

The script will:
1. Detect the dump directory in `./legacydb/`
2. Back up any existing data
3. Restore the legacy dump using `mongorestore --drop`
4. Run the question-type migration (converts legacy question types to new format)
5. Optionally sanitize S3 ACLs (see below)

### With S3 Sanitization

If migrating storage from public to private S3 buckets:

```bash
./init-from-legacy.sh --sanitize-s3
```

---

## S3 Private-Bucket Migration

The legacy app used `ACL: public-read` for S3 uploads. To switch to private buckets:

### Step 1: Dry Run

```bash
# See what would change (no modifications made)
docker exec $(docker compose ps -q server | head -1) node /app/sanitize-s3.js
```

### Step 2: Apply

```bash
# Switch all S3 objects to private ACL
docker exec $(docker compose ps -q server | head -1) node /app/sanitize-s3.js --apply --verbose
```

### What It Does

1. Scans `users` collection for profile image URLs
2. Scans `questions` collection for image URLs in content HTML
3. For each S3 object, sets the ACL from `public-read` to `private`

**Note:** After making S3 objects private, the application serves them through signed URLs or backend proxy. Ensure the server has proper S3 credentials configured in `.env`.

---

## User Management

The `manage-user.sh` script provides CLI access to common user operations:

### Change Password

```bash
./manage-user.sh change-password --email user@example.com --password newSecure123

# Auto-generate a password
./manage-user.sh change-password --email user@example.com
```

### Create User

```bash
./manage-user.sh create \
  --email prof@university.edu \
  --firstname Jane \
  --lastname Smith \
  --role professor \
  --password securePass123

# Roles: student (default), professor, admin
```

### Promote User

```bash
./manage-user.sh promote --email user@example.com --role admin
```

### List Users

```bash
./manage-user.sh list
```

---

## Backups

### Manual Backup

```bash
./backup.sh
```

Creates a timestamped, compressed backup in `./backups/`:
```
backups/qlicker_backup_20260321_020000.tar.gz
```

### Automatic Backups (Cron)

Add to your server's crontab:

```bash
# Daily at 2 AM
0 2 * * * /opt/qlicker/backup.sh --cron >> /var/log/qlicker-backup.log 2>&1
```

### Backup Retention

Old backups are automatically pruned based on `BACKUP_RETENTION_DAYS` in `.env` (default: 30 days).

### Restore from Backup

```bash
# Interactive — pick from available backups
./restore.sh

# Specific backup file
./restore.sh backups/qlicker_backup_20260321_020000.tar.gz
```

⚠️ **Warning:** Restore will drop the current database. The script requires you to type `yes` to confirm.

---

## Updating

### Standard Update

```bash
./update.sh
```

This will:
1. Create a pre-update backup
2. Pull latest images (or rebuild if using local builds)
3. Restart services with zero downtime (rolling restart)
4. Run a health check

### Force Rebuild from Source

```bash
./update.sh --build
```

### Skip Pre-Update Backup

```bash
./update.sh --no-backup
```

### Building Docker Images

From the repository root (where you have the source code):

```bash
# Build and tag
./scripts/build-images.sh --tag v2.0.0

# Build, tag, and push to a registry
./scripts/build-images.sh --tag v2.0.0 --registry ghcr.io/yourorg --push
```

To use pre-built images in production, edit `docker-compose.yml` and replace `build:` with `image:`:

```yaml
server:
  image: ghcr.io/yourorg/qlicker-server:v2.0.0
  # build:           # comment out or remove
  #   context: ../server

client:
  image: ghcr.io/yourorg/qlicker-client:v2.0.0
```

---

## File Structure

```
production_setup/
├── docker-compose.yml      # Production Docker Compose orchestration
├── .env.example            # Environment variable template
├── .env                    # Your configuration (generated by setup.sh)
├── setup.sh                # Interactive setup wizard
├── init-from-legacy.sh     # Initialize from legacy MongoDB dump
├── sanitize-s3.js          # S3 ACL migration script
├── update.sh               # Pull/rebuild and restart
├── backup.sh               # Create MongoDB backup
├── restore.sh              # Restore from backup
├── manage-user.sh          # User management CLI
├── README.md               # This file
├── nginx/
│   └── nginx.conf          # Nginx TLS + reverse proxy configuration
├── certs/                  # TLS certificates (created during setup)
│   ├── fullchain.pem
│   └── privkey.pem
├── backups/                # MongoDB backups (created by backup.sh)
│   └── qlicker_backup_*.tar.gz
└── legacydb/               # Legacy database dumps (for init-from-legacy.sh)
    └── qlicker/            # mongodump output
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DOMAIN` | Yes | `qlicker.example.com` | Server domain name |
| `TLS_CERT_PATH` | Yes | `./certs/fullchain.pem` | TLS certificate path |
| `TLS_KEY_PATH` | Yes | `./certs/privkey.pem` | TLS private key path |
| `SERVER_REPLICAS` | No | `2` | Number of API server replicas |
| `JWT_SECRET` | Yes | — | JWT signing secret (32-byte hex) |
| `JWT_REFRESH_SECRET` | Yes | — | JWT refresh token secret (32-byte hex) |
| `MONGO_URI` | No | `mongodb://mongo:27017/qlicker` | MongoDB connection URI |
| `MAIL_URL` | Recommended | — | SMTP connection string |
| `STORAGE_TYPE` | No | `local` | File storage: `local`, `s3`, `azure` |
| `REDIS_URL` | No | `redis://redis:6379` | Redis connection URL |
| `API_PORT` | No | `3001` | Internal API port |
| `BACKUP_RETENTION_DAYS` | No | `30` | Days to keep backups |
| `AWS_*` | If S3 | — | S3 credentials and bucket config |
| `AZURE_*` | If Azure | — | Azure Blob Storage config |

---

## Monitoring & Logs

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f server
docker compose logs -f nginx
docker compose logs -f mongo
```

### Health Check

```bash
curl -k https://your-domain.com/api/v1/health
```

Returns:
```json
{
  "status": "ok",
  "timestamp": "2026-03-21T...",
  "websocket": true,
  "redis": true
}
```

### Service Status

```bash
docker compose ps
```

### Resource Usage

```bash
docker stats
```

---

## Troubleshooting

### Services won't start

```bash
# Check Docker Compose config is valid
docker compose config

# Check specific service logs
docker compose logs server
docker compose logs nginx
```

### Certificate errors

Ensure your domain's DNS A record points to the server. Check Certbot logs:
```bash
docker compose logs certbot
```

### WebSocket connection failures

If WebSocket connections fail behind a corporate firewall or CDN, ensure:
1. Your load balancer/CDN supports WebSocket upgrade
2. The connection timeout is at least 60 seconds
3. Check Nginx logs: `docker compose logs nginx`

### Database connection errors

```bash
# Check MongoDB is running and healthy
docker compose ps mongo
docker compose logs mongo

# Test connection from server container
docker exec $(docker compose ps -q server | head -1) \
  node -e "import('mongoose').then(m => m.default.connect(process.env.MONGO_URI).then(() => { console.log('OK'); process.exit(0); }))"
```

### Out of disk space

Check backup directory size and prune old backups:
```bash
du -sh backups/
# Reduce retention or manually remove old backups
rm backups/qlicker_backup_2026*.tar.gz
```

### Performance tuning

For high-traffic deployments:

1. **Increase server replicas** in `.env`
2. **Increase MongoDB cache**: edit `docker-compose.yml` → `wiredTigerCacheSizeGB`
3. **Increase Redis memory**: edit `docker-compose.yml` → `maxmemory`
4. **Enable swap** on the host to handle memory spikes
5. **Use an SSD** for MongoDB data volume
