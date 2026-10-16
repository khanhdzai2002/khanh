#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL securely; do not enable shell tracing}"
backup_dir="${1:-./backups}"
umask 077
mkdir -p "$backup_dir"
backup_file="$backup_dir/comsflow-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --file="$backup_file"
pg_restore --list "$backup_file" >/dev/null
printf 'Backup created: %s\n' "$backup_file"
