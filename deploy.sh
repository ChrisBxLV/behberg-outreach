#!/usr/bin/env bash
set -euo pipefail

# Automated server deploy: pull latest from git, install, build, restart.
# Usage:
#   ./deploy.sh
#   ./deploy.sh --branch main
#   APP_DIR=/var/www/behberg-outreach ./deploy.sh
#   SERVICE_NAME=behberg-outreach ./deploy.sh

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
BRANCH="main"
REMOTE="${REMOTE:-origin}"
SERVICE_NAME="${SERVICE_NAME:-}"
PM2_APP_NAME="${PM2_APP_NAME:-}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-false}"

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
    --pm2)
      PM2_APP_NAME="${2:-}"; shift 2;;
    --pm2=*)
      PM2_APP_NAME="${1#*=}"; shift 1;;
    --migrate)
      RUN_MIGRATIONS="true"; shift 1;;
    -h|--help)
      cat <<'EOF'
deploy.sh - automated deploy script

Environment variables:
  APP_DIR          Repo directory on server (default: script directory)
  REMOTE           Git remote name (default: origin)
  SERVICE_NAME     systemd service to restart (recommended)
  PM2_APP_NAME     pm2 app name to restart (alternative)
  RUN_MIGRATIONS   true/false (default: false)

Examples:
  ./deploy.sh
  ./deploy.sh --branch main
  SERVICE_NAME=behberg-outreach ./deploy.sh
  PM2_APP_NAME=behberg-outreach ./deploy.sh
  RUN_MIGRATIONS=true ./deploy.sh
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

log "Building"
pnpm run build

if [[ "$RUN_MIGRATIONS" == "true" ]]; then
  log "Running migrations"
  pnpm run db:migrate
fi

restart_done="false"

if [[ -n "$SERVICE_NAME" ]] && command -v systemctl >/dev/null; then
  log "Restarting systemd service: $SERVICE_NAME"
  sudo systemctl restart "$SERVICE_NAME"
  sudo systemctl --no-pager --full status "$SERVICE_NAME" || true
  restart_done="true"
fi

if [[ "$restart_done" != "true" ]] && [[ -n "$PM2_APP_NAME" ]] && command -v pm2 >/dev/null; then
  log "Restarting pm2 app: $PM2_APP_NAME"
  pm2 reload "$PM2_APP_NAME" || pm2 restart "$PM2_APP_NAME"
  pm2 status "$PM2_APP_NAME" || true
  restart_done="true"
fi

if [[ "$restart_done" != "true" ]]; then
  log "No restart method configured."
  echo "Set SERVICE_NAME=... (systemd) or PM2_APP_NAME=... (pm2) to auto-restart."
  echo "If you restart manually, run: pnpm run start"
fi

log "Deploy complete"
