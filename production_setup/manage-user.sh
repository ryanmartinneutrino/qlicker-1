#!/usr/bin/env bash
# =============================================================================
# Qlicker Production — User Management Script
# =============================================================================
# Manage users from the command line. Runs inside the Docker server container
# so all server dependencies (Mongoose, Argon2) are available.
#
# Usage:
#   ./manage-user.sh change-password --email user@example.com [--password newpwd]
#   ./manage-user.sh create --email user@example.com --firstname John --lastname Doe [--role student|professor|admin] [--password pass123]
#   ./manage-user.sh promote --email user@example.com --role professor|admin
#   ./manage-user.sh list
#   ./manage-user.sh --help
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { printf "${GREEN}[INFO]${NC}  %s\n" "$*"; }
error() { printf "${RED}[ERROR]${NC} %s\n" "$*" >&2; }

usage() {
  cat <<'EOF'
Qlicker User Management

Commands:
  change-password  Change a user's password
  create           Create a new user account
  promote          Change a user's role
  list             List all users (email, name, role)

Options:
  --email EMAIL        User email (required for change-password, create, promote)
  --password PASS      New password (min 6 chars; auto-generated if omitted for create)
  --firstname NAME     First name (required for create)
  --lastname NAME      Last name (required for create)
  --role ROLE          Role: student, professor, or admin (default: student)

Examples:
  ./manage-user.sh change-password --email admin@example.com --password newSecure123
  ./manage-user.sh create --email prof@university.edu --firstname Jane --lastname Smith --role professor
  ./manage-user.sh promote --email user@example.com --role admin
  ./manage-user.sh list
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ] || [ $# -eq 0 ]; then
  usage
  exit 0
fi

# Load .env
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; . "$SCRIPT_DIR/.env"; set +a
fi

# Get a running server container
SERVER_CONTAINER="$(docker compose -f "$COMPOSE_FILE" ps -q server 2>/dev/null | head -1)"
if [ -z "$SERVER_CONTAINER" ]; then
  error "Server container is not running. Start with: docker compose up -d"
  exit 1
fi

COMMAND="$1"
shift

# Parse remaining arguments into a JS-friendly JSON object
EMAIL="" PASSWORD="" FIRSTNAME="" LASTNAME="" ROLE="student"

while [ $# -gt 0 ]; do
  case "$1" in
    --email)     EMAIL="$2"; shift 2 ;;
    --password)  PASSWORD="$2"; shift 2 ;;
    --firstname) FIRSTNAME="$2"; shift 2 ;;
    --lastname)  LASTNAME="$2"; shift 2 ;;
    --role)      ROLE="$2"; shift 2 ;;
    *) error "Unknown argument: $1"; usage; exit 1 ;;
  esac
done

# Generate inline Node.js script that uses server's installed dependencies
run_in_container() {
  local js_code="$1"
  docker exec "$SERVER_CONTAINER" node -e "$js_code"
}

case "$COMMAND" in
  change-password)
    if [ -z "$EMAIL" ]; then
      error "--email is required"; exit 1
    fi
    if [ -z "$PASSWORD" ]; then
      PASSWORD="$(openssl rand -base64 12)"
      info "Generated password: $PASSWORD"
    fi
    if [ "${#PASSWORD}" -lt 6 ]; then
      error "Password must be at least 6 characters."; exit 1
    fi

    # Escape for JS string
    JS_EMAIL="${EMAIL//\\/\\\\}"; JS_EMAIL="${JS_EMAIL//\"/\\\"}"
    JS_PASS="${PASSWORD//\\/\\\\}"; JS_PASS="${JS_PASS//\"/\\\"}"

    run_in_container "
      import mongoose from 'mongoose';
      import { hash, Algorithm, Version } from '@node-rs/argon2';
      const uri = process.env.MONGO_URI || 'mongodb://mongo:27017/qlicker';
      await mongoose.connect(uri);
      const col = mongoose.connection.collection('users');
      const email = \"$JS_EMAIL\";
      const user = await col.findOne({ 'emails.address': new RegExp('^' + email.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\\\$&') + '\$', 'i') });
      if (!user) { console.error('User not found: ' + email); process.exit(1); }
      const hashed = await hash(\"$JS_PASS\", { algorithm: Algorithm.Argon2id, version: Version.V0x13, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 });
      await col.updateOne({ _id: user._id }, { \\\$set: { 'services.password.hash': hashed }, \\\$unset: { 'services.password.bcrypt': '', 'services.resetPassword': '' } });
      console.log('Password updated for ' + email);
      await mongoose.disconnect();
    "
    ;;

  create)
    if [ -z "$EMAIL" ] || [ -z "$FIRSTNAME" ] || [ -z "$LASTNAME" ]; then
      error "--email, --firstname, and --lastname are required"; exit 1
    fi
    if [ -z "$PASSWORD" ]; then
      PASSWORD="$(openssl rand -base64 12)"
      info "Generated password: $PASSWORD"
    fi
    if [ "${#PASSWORD}" -lt 6 ]; then
      error "Password must be at least 6 characters."; exit 1
    fi

    JS_EMAIL="${EMAIL//\\/\\\\}"; JS_EMAIL="${JS_EMAIL//\"/\\\"}"
    JS_PASS="${PASSWORD//\\/\\\\}"; JS_PASS="${JS_PASS//\"/\\\"}"
    JS_FNAME="${FIRSTNAME//\\/\\\\}"; JS_FNAME="${JS_FNAME//\"/\\\"}"
    JS_LNAME="${LASTNAME//\\/\\\\}"; JS_LNAME="${JS_LNAME//\"/\\\"}"
    JS_ROLE="${ROLE//\\/\\\\}"; JS_ROLE="${JS_ROLE//\"/\\\"}"

    run_in_container "
      import mongoose from 'mongoose';
      import crypto from 'crypto';
      import { hash, Algorithm, Version } from '@node-rs/argon2';
      const uri = process.env.MONGO_URI || 'mongodb://mongo:27017/qlicker';
      await mongoose.connect(uri);
      const col = mongoose.connection.collection('users');
      const email = \"$JS_EMAIL\";
      const existing = await col.findOne({ 'emails.address': new RegExp('^' + email.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\\\$&') + '\$', 'i') });
      if (existing) { console.error('User already exists: ' + email); process.exit(1); }
      const chars = '23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz';
      let id = ''; const bytes = crypto.randomBytes(17); for (let i = 0; i < 17; i++) id += chars[bytes[i] % chars.length];
      const hashed = await hash(\"$JS_PASS\", { algorithm: Algorithm.Argon2id, version: Version.V0x13, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 });
      await col.insertOne({ _id: id, emails: [{ address: email, verified: true }], services: { password: { hash: hashed }, resume: { loginTokens: [] }, email: { verificationTokens: [] } }, profile: { firstname: \"$JS_FNAME\", lastname: \"$JS_LNAME\", roles: [\"$JS_ROLE\"], courses: [], studentNumber: '', profileImage: '', profileThumbnail: '', canPromote: false }, createdAt: new Date() });
      console.log('Created user: ' + email + ' (role: $JS_ROLE)');
      await mongoose.disconnect();
    "
    ;;

  promote)
    if [ -z "$EMAIL" ]; then
      error "--email is required"; exit 1
    fi
    case "$ROLE" in
      student|professor|admin) ;;
      *) error "Role must be student, professor, or admin"; exit 1 ;;
    esac

    JS_EMAIL="${EMAIL//\\/\\\\}"; JS_EMAIL="${JS_EMAIL//\"/\\\"}"
    JS_ROLE="${ROLE//\\/\\\\}"; JS_ROLE="${JS_ROLE//\"/\\\"}"

    run_in_container "
      import mongoose from 'mongoose';
      const uri = process.env.MONGO_URI || 'mongodb://mongo:27017/qlicker';
      await mongoose.connect(uri);
      const col = mongoose.connection.collection('users');
      const email = \"$JS_EMAIL\";
      const user = await col.findOne({ 'emails.address': new RegExp('^' + email.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\\\$&') + '\$', 'i') });
      if (!user) { console.error('User not found: ' + email); process.exit(1); }
      await col.updateOne({ _id: user._id }, { \\\$set: { 'profile.roles': [\"$JS_ROLE\"] } });
      console.log('Updated ' + email + ' role to: $JS_ROLE');
      await mongoose.disconnect();
    "
    ;;

  list)
    run_in_container "
      import mongoose from 'mongoose';
      const uri = process.env.MONGO_URI || 'mongodb://mongo:27017/qlicker';
      await mongoose.connect(uri);
      const users = await mongoose.connection.collection('users').find({}, { projection: { 'emails.address': 1, 'profile.firstname': 1, 'profile.lastname': 1, 'profile.roles': 1 } }).toArray();
      console.log('Email | Name | Roles');
      console.log('------|------|------');
      for (const u of users) {
        const email = u.emails?.[0]?.address || 'N/A';
        const name = (u.profile?.firstname || '') + ' ' + (u.profile?.lastname || '');
        const roles = (u.profile?.roles || []).join(', ');
        console.log(email + ' | ' + name.trim() + ' | ' + roles);
      }
      console.log('\\nTotal: ' + users.length + ' users');
      await mongoose.disconnect();
    "
    ;;

  *)
    error "Unknown command: $COMMAND"
    usage
    exit 1
    ;;
esac
