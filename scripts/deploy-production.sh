#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${DEPLOY_APP_DIR:-/opt/pau/app}"
BACKUP_ROOT="${DEPLOY_BACKUP_ROOT:-/opt/pau/backups/deploy}"
COMPOSE_PROJECT="${DEPLOY_COMPOSE_PROJECT:-pau-production}"
DASHBOARD_URL="${DEPLOY_DASHBOARD_URL:-https://pau.claricont.com/api/dashboard}"
DEPLOY_REF="${DEPLOY_REF:?DEPLOY_REF is required}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-https://pau.claricont.com/api/health}"
REPO_URL="${DEPLOY_REPO:?DEPLOY_REPO is required}"

log() {
  printf '[deploy] %s\n' "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

compose() {
  docker compose \
    -p "$COMPOSE_PROJECT" \
    --env-file .env.production \
    -f docker-compose.production.yml \
    "$@"
}

clone_or_update_repo() {
  install -d -m 755 "$(dirname "$APP_DIR")"

  if [ ! -d "$APP_DIR/.git" ]; then
    local backup=""
    local env_backup=""

    if [ -d "$APP_DIR" ] && [ "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 | head -n 1)" ]; then
      install -d -m 700 "$BACKUP_ROOT"
      backup="$BACKUP_ROOT/app-before-git-$(date +%Y%m%d%H%M%S)"
      log "Moving existing non-git app directory to $backup"
      mv "$APP_DIR" "$backup"
      if [ -f "$backup/.env.production" ]; then
        env_backup="$backup/.env.production"
      fi
    fi

    log "Cloning repository"
    git clone "$REPO_URL" "$APP_DIR"

    if [ -n "$env_backup" ]; then
      cp "$env_backup" "$APP_DIR/.env.production"
      chmod 600 "$APP_DIR/.env.production"
    fi
  fi
}

wait_for_postgres() {
  local status=""

  for _ in $(seq 1 60); do
    status="$(
      compose exec -T postgres pg_isready \
        -U "${POSTGRES_USER:-pau}" \
        -d "${POSTGRES_DB:-pau}" 2>/dev/null || true
    )"
    if printf '%s' "$status" | grep -q 'accepting connections'; then
      return 0
    fi
    sleep 2
  done

  printf 'Postgres did not become healthy: %s\n' "$status" >&2
  return 1
}

wait_for_http_code() {
  local url="$1"
  local expected="$2"
  local code=""

  for _ in $(seq 1 60); do
    code="$(curl -fsS -o /dev/null -w '%{http_code}' "$url" || true)"
    if [ "$code" = "$expected" ]; then
      return 0
    fi
    sleep 2
  done

  printf 'Expected %s from %s, got %s\n' "$expected" "$url" "${code:-none}" >&2
  return 1
}

wait_for_public_not_found() {
  local url="$1"
  local code=""

  for _ in $(seq 1 20); do
    code="$(curl -fsS -o /dev/null -w '%{http_code}' "$url" || true)"
    if [ "$code" != "200" ]; then
      return 0
    fi
    sleep 1
  done

  printf 'Sensitive path is publicly reachable: %s returned %s\n' "$url" "$code" >&2
  return 1
}

build_and_start() {
  local ref="$1"

  SOURCE_REVISION="$ref" compose build app migrate
  compose up -d postgres
  wait_for_postgres
  compose run --rm migrate pnpm prisma:push
  compose run --rm migrate pnpm db:seed
  SOURCE_REVISION="$ref" compose up -d --remove-orphans app
}

verify_image_revision() {
  local expected_ref="$1"
  local actual_ref

  actual_ref="$(
    compose exec -T app sh -c 'cat /app/.build-revision 2>/dev/null || true' \
      | tr -d '\r\n'
  )"

  if [ "$actual_ref" != "$expected_ref" ]; then
    printf 'Expected running image revision %s, got %s\n' "$expected_ref" "${actual_ref:-missing}" >&2
    return 1
  fi
}

verify_internal_health() {
  for _ in $(seq 1 30); do
    if compose exec -T app node -e \
      "fetch('http://127.0.0.1:3000/api/health').then(async (r) => { if (r.status !== 200) process.exit(1); const body = await r.json(); if (!body.ok) process.exit(1); }).catch(() => process.exit(1))"; then
      return 0
    fi
    sleep 2
  done

  printf 'Internal health check failed\n' >&2
  return 1
}

verify_runtime() {
  local expected_ref="$1"
  local dashboard_code=""
  local published_ports=""
  local user_id=""

  verify_image_revision "$expected_ref"
  verify_internal_health
  wait_for_http_code "$HEALTH_URL" 200

  dashboard_code="$(curl -fsS -o /dev/null -w '%{http_code}' "$DASHBOARD_URL" || true)"
  if [ "$dashboard_code" != "401" ]; then
    printf 'Expected unauthenticated dashboard to return 401, got %s\n' "$dashboard_code" >&2
    return 1
  fi

  wait_for_public_not_found "${HEALTH_URL%/api/health}/.env.production"
  wait_for_public_not_found "${HEALTH_URL%/api/health}/.git/config"

  user_id="$(compose exec -T app id -u | tr -d '\r\n')"
  if [ "$user_id" = "0" ]; then
    printf 'App container is running as root\n' >&2
    return 1
  fi

  published_ports="$(compose ps --format json | grep -E '"PublishedPort":[1-9]' || true)"
  if [ -n "$published_ports" ]; then
    printf 'Production compose exposes host ports unexpectedly\n' >&2
    return 1
  fi
}

main() {
  require_command curl
  require_command docker
  require_command git

  clone_or_update_repo
  cd "$APP_DIR"

  if [ ! -f .env.production ]; then
    printf '%s/.env.production is missing\n' "$APP_DIR" >&2
    exit 1
  fi
  chmod 600 .env.production
  set -a
  # shellcheck disable=SC1091
  . ./.env.production
  set +a

  local previous_ref=""
  previous_ref="$(git rev-parse HEAD 2>/dev/null || true)"

  log "Fetching $DEPLOY_REF"
  git fetch --prune origin
  git checkout -B main "$DEPLOY_REF"
  git reset --hard "$DEPLOY_REF"
  git clean -fdx -e .env.production

  log "Building and starting compose project"
  if ! build_and_start "$DEPLOY_REF"; then
    if [ -n "$previous_ref" ]; then
      log "Build/start failed, rolling back to $previous_ref"
      git reset --hard "$previous_ref"
      git clean -fdx -e .env.production
      build_and_start "$previous_ref"
    fi
    exit 1
  fi

  if ! verify_runtime "$DEPLOY_REF"; then
    if [ -n "$previous_ref" ]; then
      log "Runtime verification failed, rolling back to $previous_ref"
      git reset --hard "$previous_ref"
      git clean -fdx -e .env.production
      build_and_start "$previous_ref"
      verify_runtime "$previous_ref"
    fi
    exit 1
  fi

  git rev-parse HEAD > .deploy-last-good
  log "Deployed $(git rev-parse --short HEAD)"
}

main "$@"
