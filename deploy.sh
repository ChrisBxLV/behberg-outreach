#!/usr/bin/env bash
set -euo pipefail

# Automated server deploy: pull latest from git, install, check, test, build, restart.
# Usage:
#   ./deploy.sh
#   ./deploy.sh --branch main
#   APP_DIR=/var/www/behberg-outreach ./deploy.sh
#   WEB_SERVICE_NAME=behberg-web WORKER_SERVICE_NAME=behberg-worker ./deploy.sh
#   SERVICE_NAME=behberg-outreach ./deploy.sh   # legacy single systemd unit

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
BRANCH="main"
REMOTE="${REMOTE:-origin}"

# systemd (split web/worker preferred; SERVICE_NAME is legacy single unit)
WEB_SERVICE_NAME="${WEB_SERVICE_NAME:-}"
WORKER_SERVICE_NAME="${WORKER_SERVICE_NAME:-}"
SERVICE_NAME="${SERVICE_NAME:-}"

# pm2 (split preferred; PM2_APP_NAME is legacy)
PM2_WEB_APP_NAME="${PM2_WEB_APP_NAME:-}"
PM2_WORKER_APP_NAME="${PM2_WORKER_APP_NAME:-}"
PM2_APP_NAME="${PM2_APP_NAME:-}"

RUN_MIGRATIONS="${RUN_MIGRATIONS:-false}"
RUN_CHECKS="${RUN_CHECKS:-true}"
RUN_TESTS="${RUN_TESTS:-true}"

HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"

# Returns 0 if the value means "run" (default-on helpers use default "true").
# Uses tr for lowercase so this works on Bash 3.x (e.g. macOS) as well as Linux.
env_run_enabled() {
  local v="${1:-true}"
  v=$(printf '%s' "$v" | tr '[:upper:]' '[:lower:]')
  case "$v" in
    false|0|no|off) return 1 ;;
    *) return 0 ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH="${2:-}"; shift 2;;
    --branch=*)
      BRANCH="${1#*=}"; shift 1;;
    --remote)
      REMOTE="${2:-}"; shift 2;;
    --remote=*)
      REMOTE="${1#*=}"; shift 1;;
    --service)
      SERVICE_NAME="${2:-}"; shift 2;;
    --service=*)
      SERVICE_NAME="${1#*=}"; shift 1;;
    --web-service)
      WEB_SERVICE_NAME="${2:-}"; shift 2;;
    --web-service=*)
      WEB_SERVICE_NAME="${1#*=}"; shift 1;;
    --worker-service)
      WORKER_SERVICE_NAME="${2:-}"; shift 2;;
    --worker-service=*)
      WORKER_SERVICE_NAME="${1#*=}"; shift 1;;
    --pm2)
      PM2_APP_NAME="${2:-}"; shift 2;;
    --pm2=*)
      PM2_APP_NAME="${1#*=}"; shift 1;;
    --pm2-web)
      PM2_WEB_APP_NAME="${2:-}"; shift 2;;
    --pm2-web=*)
      PM2_WEB_APP_NAME="${1#*=}"; shift 1;;
    --pm2-worker)
      PM2_WORKER_APP_NAME="${2:-}"; shift 2;;
    --pm2-worker=*)
      PM2_WORKER_APP_NAME="${1#*=}"; shift 1;;
    --migrate)
      RUN_MIGRATIONS="true"; shift 1;;
    -h|--help)
      cat <<'EOF'
deploy.sh - automated deploy script

Environment variables:
  APP_DIR               Repo directory on server (default: script directory)
  REMOTE                Git remote name (default: origin)

  systemd (recommended for production):
    WEB_SERVICE_NAME      systemd unit for the web process
    WORKER_SERVICE_NAME   systemd unit for the worker (cron/scheduler) process
    SERVICE_NAME          legacy: single unit when web/worker names are not set

  pm2 (alternative):
    PM2_WEB_APP_NAME      pm2 app name for the web process
    PM2_WORKER_APP_NAME   pm2 app name for the worker process
    PM2_APP_NAME          legacy: single app when split names are not set

  RUN_MIGRATIONS        true/false (default: false)
  RUN_CHECKS            true/false — run `pnpm run check` before build (default: true)
  RUN_TESTS             true/false — run `pnpm test` before build (default: true)

  HEALTHCHECK_URL       optional; if set, `curl -fsS` is run after restart (do not embed secrets in URLs)

Examples:
  ./deploy.sh
  ./deploy.sh --branch main
  WEB_SERVICE_NAME=behberg-web WORKER_SERVICE_NAME=behberg-worker ./deploy.sh
  SERVICE_NAME=behberg-outreach ./deploy.sh
  PM2_WEB_APP_NAME=app-web PM2_WORKER_APP_NAME=app-worker ./deploy.sh
  PM2_APP_NAME=behberg-outreach ./deploy.sh
  RUN_MIGRATIONS=true ./deploy.sh
  RUN_CHECKS=false RUN_TESTS=false ./deploy.sh
  HEALTHCHECK_URL=http://127.0.0.1:3000/api/health ./deploy.sh
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

log() { printf '\n[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

LOG_FILE="${LOG_FILE:-/var/log/behberg-deploy.log}"
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"
exec >> "$LOG_FILE" 2>&1

cd "$APP_DIR"
[[ -d .git ]] || die "APP_DIR is not a git repo: $APP_DIR"

# Prevent concurrent deploys.
LOCK_DIR="${LOCK_DIR:-/tmp/behberg-outreach.deploy.lock}"
cleanup_lock() { rmdir "$LOCK_DIR" 2>/dev/null || true; }
if mkdir "$LOCK_DIR" 2>/dev/null; then
  trap cleanup_lock EXIT
else
  die "Deploy already running (lock: $LOCK_DIR)"
fi

command -v git >/dev/null || die "git not found"

log "Fetching latest from $REMOTE/$BRANCH"
git fetch --prune "$REMOTE"

log "Resetting working tree to $REMOTE/$BRANCH"
git checkout -q "$BRANCH" || git checkout -q -B "$BRANCH" "$REMOTE/$BRANCH"
git reset --hard "$REMOTE/$BRANCH"
git clean -fd

log "Writing build-info.json (superadmin-only metadata; not served as a static file)"
COMMIT_SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
APP_VERSION="$(date -u +"%Y.%m.%d")-${SHORT_SHA}"
node -e 'const fs=require("fs");const [sha,short,branch,btime,appv]=process.argv.slice(1);fs.writeFileSync("build-info.json",JSON.stringify({appVersion:appv,gitCommitSha:sha,gitCommitShortSha:short,gitBranch:branch,buildTime:btime},null,2)+"\n");' \
  "$COMMIT_SHA" "$SHORT_SHA" "$BRANCH" "$BUILD_TIME" "$APP_VERSION"

if [[ -f pnpm-lock.yaml ]]; then
  if command -v pnpm >/dev/null; then
    log "Installing dependencies (pnpm)"
    pnpm install --frozen-lockfile
  else
    if command -v corepack >/dev/null; then
      log "Enabling corepack (to provide pnpm)"
      corepack enable
      log "Installing dependencies (pnpm via corepack)"
      pnpm install --frozen-lockfile
    else
      die "pnpm not found and corepack not available"
    fi
  fi
else
  log "pnpm-lock.yaml not found; skipping dependency install"
fi

if env_run_enabled "${RUN_CHECKS}"; then
  log "Running typecheck (pnpm run check)"
  pnpm run check
else
  log "Skipping pnpm run check (RUN_CHECKS disabled)"
fi

if env_run_enabled "${RUN_TESTS}"; then
  log "Running tests (pnpm test)"
  pnpm test
else
  log "Skipping pnpm test (RUN_TESTS disabled)"
fi

log "Building"
pnpm run build

if [[ "$RUN_MIGRATIONS" == "true" ]]; then
  log "Running migrations"
  pnpm run db:migrate
fi

restart_done="false"

restart_systemd_if_set() {
  local name="$1"
  [[ -n "$name" ]] || return 0
  log "Restarting systemd service: $name"
  sudo systemctl restart "$name"
  sudo systemctl --no-pager --full status "$name" || true
}

if command -v systemctl >/dev/null; then
  if [[ -n "$WEB_SERVICE_NAME" ]] || [[ -n "$WORKER_SERVICE_NAME" ]]; then
    restart_systemd_if_set "$WEB_SERVICE_NAME"
    restart_systemd_if_set "$WORKER_SERVICE_NAME"
    restart_done="true"
  elif [[ -n "$SERVICE_NAME" ]]; then
    restart_systemd_if_set "$SERVICE_NAME"
    restart_done="true"
  fi
fi

reload_pm2_if_set() {
  local name="$1"
  [[ -n "$name" ]] || return 0
  log "Reloading/restarting pm2 app: $name"
  pm2 reload "$name" || pm2 restart "$name"
  pm2 status "$name" || true
}

if [[ "$restart_done" != "true" ]] && command -v pm2 >/dev/null; then
  if [[ -n "$PM2_WEB_APP_NAME" ]] || [[ -n "$PM2_WORKER_APP_NAME" ]]; then
    reload_pm2_if_set "$PM2_WEB_APP_NAME"
    reload_pm2_if_set "$PM2_WORKER_APP_NAME"
    restart_done="true"
  elif [[ -n "$PM2_APP_NAME" ]]; then
    reload_pm2_if_set "$PM2_APP_NAME"
    restart_done="true"
  fi
fi

if [[ "$restart_done" != "true" ]]; then
  log "No restart method configured."
  echo "Set WEB_SERVICE_NAME / WORKER_SERVICE_NAME (systemd), SERVICE_NAME (legacy),"
  echo "or PM2_WEB_APP_NAME / PM2_WORKER_APP_NAME (pm2), PM2_APP_NAME (legacy), to auto-restart."
  echo "If you restart manually, run: pnpm run start (and start the worker if applicable)."
fi

if [[ -n "${HEALTHCHECK_URL}" ]]; then
  command -v curl >/dev/null || die "curl not found (required for HEALTHCHECK_URL)"
  HEALTHCHECK_MAX_ATTEMPTS="${HEALTHCHECK_MAX_ATTEMPTS:-10}"
  HEALTHCHECK_SLEEP_SECONDS="${HEALTHCHECK_SLEEP_SECONDS:-2}"
  log "Running post-restart health check (curl -fsS; URL not logged; up to ${HEALTHCHECK_MAX_ATTEMPTS} attempts, ${HEALTHCHECK_SLEEP_SECONDS}s apart)"
  attempt=1
  healthcheck_ok="false"
  while (( attempt <= HEALTHCHECK_MAX_ATTEMPTS )); do
    log "Health check attempt ${attempt}/${HEALTHCHECK_MAX_ATTEMPTS}"
    if curl -fsS "${HEALTHCHECK_URL}" >/dev/null; then
      healthcheck_ok="true"
      break
    fi
    if (( attempt < HEALTHCHECK_MAX_ATTEMPTS )); then
      sleep "${HEALTHCHECK_SLEEP_SECONDS}"
    fi
    attempt=$(( attempt + 1 ))
  done
  if [[ "$healthcheck_ok" != "true" ]]; then
    die "Health check failed after ${HEALTHCHECK_MAX_ATTEMPTS} attempts"
  fi
  log "Health check passed on attempt ${attempt}/${HEALTHCHECK_MAX_ATTEMPTS}"
fi

log "Deploy complete"
