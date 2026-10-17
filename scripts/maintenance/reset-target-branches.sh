#!/usr/bin/env bash
set -euo pipefail

operation=${1:-}
expected_fingerprint=${2:-}
run_id=${3:-}
actor=${4:-}
expected_release=${5:-}
deploy_dir=/home/ubuntu/anyostore-pos
backup_root=/home/ubuntu/anyostore-backups/branch-resets
backend_container=anyostore-backend-live

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ "$operation" = audit || "$operation" = apply ]] || fail 'Expected audit or apply operation'
cd "$deploy_dir"
exec 9>"$(git rev-parse --git-dir)/deploy.lock"
flock -n 9 || fail 'Production deployment/maintenance lock is held; retry after it completes'

live_release=$(sudo docker exec "$backend_container" node -p 'process.env.RELEASE_SHA || ""')
[[ -n "$live_release" && "$live_release" = "$expected_release" ]] || fail "Live backend release is $live_release, expected $expected_release; wait for deployment"

if [[ "$operation" = audit ]]; then
  sudo docker exec "$backend_container" node scripts/reset-target-branch-data.js audit
  exit 0
fi

[[ "$expected_fingerprint" =~ ^[a-f0-9]{64}$ ]] || fail 'Apply requires an audit fingerprint'
[[ "$run_id" =~ ^[0-9]+$ ]] || fail 'Invalid GitHub run id'
[[ "$actor" =~ ^[A-Za-z0-9-]{1,100}$ ]] || fail 'Invalid GitHub actor'
audit_json=$(sudo docker exec "$backend_container" node scripts/reset-target-branch-data.js audit)
printf '%s' "$audit_json" | node -e 'const fs=require("fs"); const a=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(a.source.name)' | grep -Fxq 'Gudang Utama' || fail 'Resolved source is not exactly Gudang Utama'
sudo docker exec "$backend_container" node scripts/reset-target-branch-data.js verify "$expected_fingerprint" >&2

stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="$backup_root/${stamp}-${run_id}"
mkdir -p "$backup_root"
chmod 700 "$backup_root"
[[ ! -e "$backup_dir" ]] || fail "Backup path already exists: $backup_dir"
mkdir -m 700 "$backup_dir"
trap 'status=$?; if [[ $status -ne 0 ]]; then printf "Maintenance stopped; backup retained at %s\n" "$backup_dir" >&2; fi' EXIT

db_container=$(sudo docker ps --filter 'label=com.docker.compose.project=anyostore-pos' --filter 'label=com.docker.compose.service=db' --format '{{.Names}}')
[[ -n "$db_container" && "$(wc -l <<< "$db_container" | tr -d ' ')" = 1 ]] || fail 'Expected exactly one production database container'
db_kb=$(sudo docker exec "$db_container" du -sk /var/lib/mysql | awk '{print $1}')
media_kb=$(sudo docker exec "$backend_container" du -sk /app/uploads | awk '{print $1}')
available_kb=$(df -Pk "$backup_root" | awk 'NR==2 {print $4}')
[[ "$db_kb" =~ ^[0-9]+$ && "$media_kb" =~ ^[0-9]+$ && "$available_kb" =~ ^[0-9]+$ ]] || fail 'Could not determine database/media/disk sizes'
required_kb=$((db_kb + media_kb + 262144))
(( available_kb >= required_kb )) || fail "Insufficient disk for verified backup: available=${available_kb}KB required=${required_kb}KB"

printf 'Creating protected production backup at %s\n' "$backup_dir" >&2
sudo docker exec "$db_container" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump --single-transaction --routines --triggers --events --hex-blob --default-character-set=utf8mb4 --databases "$MYSQL_DATABASE" -uroot' | gzip -1 > "$backup_dir/database.sql.gz"
sudo docker exec "$backend_container" tar -C /app -czf - uploads > "$backup_dir/uploads.tar.gz"
gzip -t "$backup_dir/database.sql.gz"
gzip -t "$backup_dir/uploads.tar.gz"
sha256sum "$backup_dir/database.sql.gz" "$backup_dir/uploads.tar.gz" > "$backup_dir/SHA256SUMS"
chmod 600 "$backup_dir"/*
(cd "$backup_dir" && sha256sum -c SHA256SUMS) >&2

source_name=$(printf '%s' "$audit_json" | node -e 'const fs=require("fs"); const a=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(a.source.name)')
mapfile -t target_names < <(printf '%s' "$audit_json" | node -e 'const fs=require("fs"); const a=JSON.parse(fs.readFileSync(0,"utf8")); for (const t of a.targets) console.log(t.name)')
[[ ${#target_names[@]} -eq 2 ]] || fail 'Audit did not resolve exactly two target branches'
printf 'Replacing active target catalog from %s; copied balances will be reset to zero.\n' "$source_name" >&2
sudo docker exec "$backend_container" node scripts/sync-catalog-to-branches.js --apply "$source_name" "${target_names[@]}" >&2
sudo docker exec "$backend_container" node scripts/reset-target-branch-data.js apply "$expected_fingerprint" "$backup_dir" "$actor"
printf 'Verified reset completed. Backup retained at %s\n' "$backup_dir" >&2
