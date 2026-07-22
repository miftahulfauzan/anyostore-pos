#!/bin/sh
set -eu

compose_file=${COMPOSE_FILE:-docker-compose.production.yml}
environment_file=${ENV_FILE:-.env.production}
backup_root=${1:-backups}
timestamp=$(date +%Y%m%d-%H%M%S)
backup_directory="$backup_root/$timestamp"

mkdir -p "$backup_directory"

if docker compose version >/dev/null 2>&1; then
  compose() { docker compose "$@"; }
else
  compose() { docker-compose "$@"; }
fi

compose -f "$compose_file" --env-file "$environment_file" exec -T db \
  sh -c 'exec mysqldump -u"${MYSQL_USER:-root}" -p"${MYSQL_PASSWORD:-$MYSQL_ROOT_PASSWORD}" --single-transaction --routines --triggers "${MYSQL_DATABASE:-pos_pakaian}"' \
  > "$backup_directory/database.sql"

tar -czf "$backup_directory/uploads.tar.gz" uploads

printf 'Backup tersimpan di %s\n' "$backup_directory"
