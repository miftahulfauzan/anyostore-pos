#!/usr/bin/env bash
# Streamed by the CI-gated workflow over SSH. Local tests replace all external commands.
set -euo pipefail

fail() { printf '::error::%s\n' "$*" >&2; exit 1; }
RELEASE_SHA=${1:-}
DEPLOY_MODE=${2:-}
[[ "$RELEASE_SHA" =~ ^[a-f0-9]{40}$ ]] || fail 'Expected a full commit SHA'
[[ "$DEPLOY_MODE" = automatic || "$DEPLOY_MODE" = manual ]] || fail 'Expected automatic or manual deploy mode'
export RELEASE_SHA
DEPLOY_DIR=${DEPLOY_DIR:-/home/ubuntu/anyostore-pos}
HEALTH_ATTEMPTS=${HEALTH_ATTEMPTS:-60}
HEALTH_INTERVAL=${HEALTH_INTERVAL:-5}
ENDPOINT_ATTEMPTS=${ENDPOINT_ATTEMPTS:-12}
[[ "$HEALTH_ATTEMPTS" =~ ^[1-9][0-9]*$ && "$HEALTH_INTERVAL" =~ ^[0-9]+$ && "$ENDPOINT_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || fail 'Invalid health retry configuration'
cd "$DEPLOY_DIR"
git_dir=$(git rev-parse --git-dir)
# A host lock also protects against overlapping SSH sessions after a runner disconnects.
exec 9>"$git_dir/deploy.lock"
flock -n 9 || fail 'Another production release holds the server lock; retry after it finishes'
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail 'VPS checkout has tracked local changes; preserve and reconcile them before release'
[[ -f .env.production ]] || fail 'Missing .env.production'
git fetch --no-tags origin main
git merge-base --is-ancestor "$RELEASE_SHA" origin/main || fail 'Requested SHA is not in origin/main history'

last_release=''
if [[ -f "$git_dir/last-successful-release" ]]; then
  read -r last_release < "$git_dir/last-successful-release"
  [[ "$last_release" =~ ^[a-f0-9]{40}$ ]] || fail 'Invalid last-successful-release marker'
fi
if [[ "$DEPLOY_MODE" = automatic && -n "$last_release" && "$last_release" != "$RELEASE_SHA" ]]; then
  if git merge-base --is-ancestor "$RELEASE_SHA" "$last_release"; then
    fail 'Older queued automatic release refused; use an explicit manual rollback if intended'
  fi
fi
# No reset, clean, rebase, or moving branch checkout; Git refuses untracked collisions.
git checkout --detach "$RELEASE_SHA"
[[ "$(git rev-parse HEAD)" = "$RELEASE_SHA" ]] || fail 'VPS checkout SHA mismatch'
printf 'Deploy release %s (last verified: %s)\n' "$RELEASE_SHA" "${last_release:-unknown}"

disk_usage=$(df --output=pcent "$DEPLOY_DIR" | tail -1 | tr -dc '0-9')
[[ "$disk_usage" =~ ^[0-9]+$ ]] || fail 'Cannot determine disk usage'
(( disk_usage < 92 )) || fail "Disk usage ${disk_usage}%; inspect capacity before retrying"
if (( disk_usage >= 80 )); then
  # Keep tagged release images, recent BuildKit cache, all containers and volumes.
  sudo docker image prune -f
  sudo docker builder prune -f --filter 'until=168h'
fi

# Pass RELEASE_SHA explicitly through sudo (sudo commonly drops exported variables).
compose() {
  sudo RELEASE_SHA="$RELEASE_SHA" docker compose -f docker-compose.production.yml --env-file .env.production "$@"
}

wait_healthy() {
  local attempt service container state expected all_healthy
  for ((attempt=1; attempt<=HEALTH_ATTEMPTS; attempt++)); do
    all_healthy=true
    for service in "$@"; do
      # `compose run --rm` can leave an old one-off container behind when the
      # runner is interrupted. Compose's `ps --filter` does not support label
      # filters on every installed Compose version, so inspect the candidates
      # directly and keep only the long-running service container.
      ps_output=$(compose ps --all --quiet "$service") || fail "Cannot inspect $service container list"
      containers=()
      while IFS= read -r candidate; do
        [[ -z "$candidate" ]] && continue
        oneoff=$(sudo docker inspect --format '{{index .Config.Labels "com.docker.compose.oneoff"}}' "$candidate") || fail "Cannot inspect $service container label"
        [[ "$oneoff" = True ]] && continue
        containers+=("$candidate")
      done <<< "$ps_output"
      if (( ${#containers[@]} == 0 )); then
        printf '%s: container missing (%s/%s)\n' "$service" "$attempt" "$HEALTH_ATTEMPTS"
        all_healthy=false
        continue
      fi
      if (( ${#containers[@]} != 1 )); then fail "Expected exactly one $service container"; fi
      container=${containers[0]}
      if [[ "$service" = db ]]; then
        state=$(sudo docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container") || fail "Cannot inspect $service health"
        expected='running healthy'
      else
        state=$(sudo docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "$container") || fail "Cannot inspect $service health"
        expected="running healthy $RELEASE_SHA"
      fi
      printf '%s: %s (%s/%s)\n' "$service" "$state" "$attempt" "$HEALTH_ATTEMPTS"
      if [[ "$state" = "$expected" ]]; then continue; fi
      # Only the exact starting state for the intended image may be retried.
      if [[ "$state" = 'running starting' && "$service" = db ]] || [[ "$state" = "running starting $RELEASE_SHA" ]]; then
        all_healthy=false
      else
        fail "$service is not healthy for the requested release: $state"
      fi
    done
    if [[ "$all_healthy" = true ]]; then return 0; fi
    if (( attempt < HEALTH_ATTEMPTS )); then sleep "$HEALTH_INTERVAL"; fi
  done
  fail "Health timeout waiting for: $*"
}

# Finish both builds before replacing either live app. Image tags retain rollback candidates.
compose build backend frontend
compose up -d db
wait_healthy db
# Migration failure leaves existing app containers running and fails this release.
compose run --rm --no-deps -T --entrypoint node backend scripts/migrate.js
# Force recreation allows a failed or unhealthy attempt at the same SHA to be retried.
compose up -d --no-deps --force-recreate backend frontend
wait_healthy backend frontend
compose up -d --no-deps caddy

# Verify actual HTTPS responses through Caddy, including the release identity.
domain=$(compose exec -T caddy printenv APP_DOMAIN)
[[ "$domain" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]+)?$ ]] || fail 'APP_DOMAIN must be a hostname with optional port'
if [[ -n "${EXPECTED_APP_DOMAIN:-}" && "$domain" != "$EXPECTED_APP_DOMAIN" ]]; then
  fail "APP_DOMAIN mismatch: expected $EXPECTED_APP_DOMAIN, got $domain"
fi
verify_endpoint() {
  local endpoint=$1 attempt body
  for ((attempt=1; attempt<=ENDPOINT_ATTEMPTS; attempt++)); do
    if body=$(curl --fail --silent --show-error --proto '=https' --connect-timeout 5 --max-time 10 \
      -H 'Cache-Control: no-cache' "https://$domain$endpoint?release=$RELEASE_SHA") \
      && printf '%s' "$body" | python3 -c '
import json, sys
try:
    body = json.load(sys.stdin)
    valid = isinstance(body, dict) and body.get("release_sha") == sys.argv[1]
    if sys.argv[2] == "/api/health":
        valid = valid and body.get("ok") is True
    sys.exit(0 if valid else 1)
except (ValueError, TypeError):
    sys.exit(1)
' "$RELEASE_SHA" "$endpoint"; then
      printf 'Verified %s at %s\n' "$endpoint" "$RELEASE_SHA"
      return 0
    fi
    if (( attempt < ENDPOINT_ATTEMPTS )); then sleep "$HEALTH_INTERVAL"; fi
  done
  fail "Endpoint verification failed: $endpoint (expected $RELEASE_SHA)"
}
verify_endpoint /api/health
verify_endpoint /version
# Re-check both together after the public probes so a regression cannot be recorded as success.
wait_healthy backend frontend
if [[ -n "$last_release" && "$last_release" != "$RELEASE_SHA" ]]; then
  printf '%s\n' "$last_release" > "$git_dir/previous-successful-release.tmp"
  mv "$git_dir/previous-successful-release.tmp" "$git_dir/previous-successful-release"
fi
printf '%s\n' "$RELEASE_SHA" > "$git_dir/last-successful-release.tmp"
mv "$git_dir/last-successful-release.tmp" "$git_dir/last-successful-release"
printf 'Verified production release: %s\n' "$RELEASE_SHA"
