// Matematika animasi angka ringkasan. Fungsi murni supaya bisa diuji tanpa DOM
// (lihat frontend/test/count-up.test.cjs).
const easeOutCubic = (progress) => 1 - Math.pow(1 - Math.min(1, Math.max(0, progress)), 3);

function countValue(from, to, progress) {
  const start = Number(from) || 0;
  const target = Number(to) || 0;
  return start + (target - start) * easeOutCubic(progress);
}

function formatCount(value, money = false) {
  const rounded = Math.round(Number(value) || 0);
  const text = Math.abs(rounded).toLocaleString('id-ID');
  return money ? `Rp${text}` : text;
}

// Durasi mengikuti mode gerak pengguna: Nonaktif = tanpa animasi, Sederhana =
// hanya fade singkat, Penuh = durasi penuh.
function countDuration(mode, base = 520) {
  if (mode === 'off') return 0;
  if (mode === 'reduced') return Math.min(120, base);
  return base;
}

module.exports = { easeOutCubic, countValue, formatCount, countDuration };