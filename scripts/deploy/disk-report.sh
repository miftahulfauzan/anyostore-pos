#!/usr/bin/env bash
# Laporan pemakaian disk VPS + pembersihan aman untuk Anyostore POS.
#
# PEMAKAIAN (hanya membaca, tidak mengubah apa pun):
#   bash scripts/deploy/disk-report.sh
#
# BERSIHKAN (butuh sudo karena docker & journal):
#   bash scripts/deploy/disk-report.sh --clean
#
# Yang dibersihkan hanya data yang bisa dibuat ulang: container berhenti,
# image tanpa tag/dangling, build cache, container+image lama yang tidak
# dipakai, journal & apt cache. Tidak menyentuh volume MySQL, folder
# uploads/media, maupun backup.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/home/ubuntu/anyostore-pos}"
CLEAN=0
[[ "${1:-}" == "--clean" ]] || [[ "${1:-}" == "--apply" ]] && CLEAN=1

report() {
  printf '\n== Pemakaian disk ==\n'
  df -h / | tail -2

  printf '\n== 12 direktori terbesar di / ==\n'
  sudo du -xh --max-depth=2 / 2>/dev/null | sort -rh | head -12 || true

  printf '\n== Docker ==\n'
  sudo docker system df 2>/dev/null || echo 'docker tidak tersedia'

  printf '\n== Image aplikasi (tag SHA) ==\n'
  sudo docker images --format '{{.Repository}}:{{.Tag}} {{.Size}} {{.CreatedSince}}' \
    | grep -E 'anyostore|backend|frontend' || true

  printf '\n== Container berhenti ==\n'
  sudo docker ps -a --filter status=exited --format '{{.Names}} {{.Status}} {{.Size}}' || true

  printf '\n== Journal & log ==\n'
  sudo journalctl --disk-usage 2>/dev/null || true
  sudo du -sh /var/log 2>/dev/null || true

  printf '\n== Repo & media ==\n'
  sudo du -sh "$DEPLOY_DIR" 2>/dev/null || true
  sudo du -sh "$DEPLOY_DIR"/backend/uploads 2>/dev/null || true
  sudo du -sh /var/lib/docker 2>/dev/null || true
}

clean() {
  printf '\n== Membersihkan data yang bisa dibuat ulang ==\n'

  # Container berhenti & jaringan yatim.
  sudo docker container prune -f || true
  sudo docker network prune -f || true

  # Image dangling dan build cache lama (7 hari) supaya build berikutnya
  # tidak mengulang seluruh layer.
  sudo docker image prune -f || true
  sudo docker builder prune -f --filter 'until=168h' || true

  # Image rilis lama: simpan 3 tag terbaru, hapus sisanya.
  local keep=3
  sudo docker images --format '{{.Repository}} {{.Tag}}' \
    | awk '$1 ~ /anyostore/ && $2 != "latest" && $2 != "<none>" { print $1":"$2 }' \
    | tail -n +$((keep + 1)) \
    | xargs -r -n1 sudo docker image rm || true

  # Journal & apt cache.
  sudo journalctl --vacuum-size=200M || true
  sudo apt-get clean || true

  printf '\n== Setelah dibersihkan ==\n'
  df -h / | tail -2
  sudo docker system df 2>/dev/null || true

  cat <<'NOTES'

Yang TIDAK dihapus oleh skrip ini (aman, jangan dibersihkan sembarangan):
  - volume MySQL (docker volume anyostore-pos_db-data)
  - folder media/uploads (foto produk & logo)
  - file backup harian
  - sertifikat Caddy (/var/lib/caddy)
NOTES
}

if [[ "$CLEAN" == "1" ]]; then
  report
  clean
else
  report
  printf '\nJalankan dengan --clean untuk membersihkan container berhenti, image lama, build cache, journal, dan apt cache.\n'
fi
