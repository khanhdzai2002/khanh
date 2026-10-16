#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?Set a separate restore/test database URL}"
: "${1:?Usage: restore-test.sh backup.dump}"
restore_name="$(node -e 'const u=new URL(process.env.RESTORE_DATABASE_URL);process.stdout.write(u.pathname.slice(1))')"
case "$restore_name" in *_restore|*_test) ;; *) printf 'Refusing target: database must end in _restore or _test\n' >&2; exit 1;; esac
pg_restore --dbname="$RESTORE_DATABASE_URL" --clean --if-exists --no-owner --exit-on-error "$1"
printf 'Restore completed in isolated database. Validate row counts, receipts, revisions and application access before any production recovery.\n'
