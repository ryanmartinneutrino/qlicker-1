#!/usr/bin/env bash
set -euo pipefail

if ! git check-ignore -q legacydb; then
  echo "ERROR: legacydb/ must remain ignored in .gitignore." >&2
  exit 1
fi

if git ls-files -- 'legacydb/**' | grep -q .; then
  echo "ERROR: tracked files detected under legacydb/. Remove them from git history/index." >&2
  exit 1
fi

echo "legacydb guard check passed."
