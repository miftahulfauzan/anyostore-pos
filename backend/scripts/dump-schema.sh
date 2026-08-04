#!/usr/bin/env bash
# Regenerasi dokumentasi skema dari database yang sedang berjalan.
# Jalankan dari VPS di folder repo (pakai compose production):
#   bash backend/scripts/dump-schema.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

mkdir -p docs
if [ -f .env.production ] && [ -f docker-compose.production.yml ]; then
  sudo docker compose -f docker-compose.production.yml --env-file .env.production exec -T db \
    sh -c 'mysqldump --no-data --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" --skip-comments --compact' \
    > docs/live-schema.sql
else
  echo "File .env.production / docker-compose.production.yml tidak ditemukan. Jalankan dari VPS." >&2
  exit 1
fi

echo "Skema tersimpan: docs/live-schema.sql ($(wc -l < docs/live-schema.sql) baris)"
