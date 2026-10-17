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
[[ "$operation" = audit || "$operation" = apply || "$operation" = diagnose_lock ]] || fail 'Expected audit, apply, or diagnose_lock operation'
cd "$deploy_dir"
lock_file="$(git rev-parse --git-dir)/deploy.lock"
show_lock_holders() {
  local pids pid process found=0 lock_stat lock_major lock_minor lock_inode lock_identity lock_entries lock_type
  printf 'LOCK_FILE: %s\n' "$lock_file"
  lock_stat=$(stat -Lc '%t %T %i' "$lock_file" 2>/dev/null || true)
  if [[ -n "$lock_stat" ]]; then
    read -r lock_major lock_minor lock_inode <<< "$lock_stat"
    printf -v lock_identity '%02x:%02x:%s' "$((16#$lock_major))" "$((16#$lock_minor))" "$lock_inode"
    printf 'LOCK_FILE_IDENTITY: %s\n' "$lock_identity"
  else
    printf 'LOCK_FILE_IDENTITY: unavailable\n'
    lock_identity=''
  fi
  command -v sudo >/dev/null 2>&1 || { printf 'sudo is unavailable; cannot inspect lock holders\n'; return 0; }
  if command -v fuser >/dev/null 2>&1; then
    pids=$(sudo fuser -- "$lock_file" 2>/dev/null || true)
    for pid in $pids; do
      [[ "$pid" =~ ^[0-9]+$ ]] || continue
      [[ "$pid" = "$$" ]] && continue
      # Do not log argv: maintenance command lines can contain credentials. The
      # executable name plus PID/PPID/state/elapsed time is enough to identify a
      # stale holder without exposing process arguments to workflow logs.
      process=$(sudo ps -p "$pid" -o pid=,ppid=,stat=,etime=,comm= 2>/dev/null || true)
      [[ -n "$process" ]] || continue
      printf 'OPEN_FILE_PID/PPID/STATE/ELAPSED/EXECUTABLE: %s\n' "$process"
      found=1
    done
    [[ "$found" -eq 1 ]] || printf 'OPEN_FILE_PROCESSES: none reported by fuser\n'
  else
    printf 'FUSER: unavailable\n'
  fi

  if [[ -n "$lock_identity" ]] && [[ -r /proc/locks ]]; then
    lock_entries=$(sudo awk -v identity="$lock_identity" '$6 == identity { print $2, $5 }' /proc/locks 2>/dev/null || true)
    if [[ -n "$lock_entries" ]]; then
      while read -r lock_type pid; do
        printf 'KERNEL_LOCK_TYPE/PID: %s %s\n' "$lock_type" "$pid"
        if [[ "$pid" =~ ^[0-9]+$ ]]; then
          process=$(sudo ps -p "$pid" -o pid=,ppid=,stat=,etime=,comm= 2>/dev/null || true)
          [[ -n "$process" ]] && printf 'PID/PPID/STATE/ELAPSED/EXECUTABLE: %s\n' "$process"
        fi
      done <<< "$lock_entries"
    else
      printf 'KERNEL_LOCKS: no entry matches this file identity\n'
    fi
  else
    printf 'KERNEL_LOCKS: unavailable\n'
  fi

  if [[ -e "$lock_file" ]]; then
    exec 9>>"$lock_file"
    if flock -n 9; then
      printf 'LOCK_PROBE: free\n'
      flock -u 9
    else
      printf 'LOCK_PROBE: held\n'
    fi
  else
    printf 'LOCK_PROBE: lock file is missing\n'
  fi
}
if [[ "$operation" = diagnose_lock ]]; then
  show_lock_holders
  exit 0
fi
exec 9>"$lock_file"
if ! flock -n 9; then
  show_lock_holders >&2 || true
  fail 'Production deployment/maintenance lock is held; retry after it completes'
fi

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
