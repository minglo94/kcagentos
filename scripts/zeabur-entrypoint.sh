#!/bin/sh
set -eu

fail() { echo 'REVIEW_CONFIGURATION_REQUIRED' >&2; exit 1; }

[ "${AGENTOS_REVIEW_MODE:-}" = synthetic ] || fail
[ "${AGENTOS_TASK_DATA_MODE:-}" = synthetic ] || fail
[ "${AGENTOS_LOCAL_AUTH_ENABLED:-}" = true ] || fail
[ "${AGENTOS_AD_AUTH_ENABLED:-}" = false ] || fail
[ "${AGENTOS_AUDIT_ROOT:-}" = /data/audit ] || fail
[ -n "${DATABASE_URL:-}" ] || fail
[ -n "${NEXTAUTH_URL:-}" ] || fail
session_secret="${NEXTAUTH_SECRET:-}"
[ "${#session_secret}" -ge 32 ] || fail

port="${PORT:-3000}"
case "$port" in *[!0-9]*|'') fail ;; esac
[ "$port" -ge 1 ] && [ "$port" -le 65535 ] || fail

[ ! -L /data ] && [ ! -L /data/audit ] || fail
awk '$5 == "/data" { found=1 } END { exit !found }' /proc/self/mountinfo || fail
install -d -o node -g node -m 0700 /data/audit
exec gosu node:node node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port "$port"
