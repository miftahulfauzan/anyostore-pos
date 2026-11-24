const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Halaman Laporan TIDAK boleh mengulang isi Dashboard: Ringkasan toko +
// Penjualan memakai komponen & endpoint yang sama dengan Dashboard. Ada dua
// bentuk yang sah:
//   1. memakai OlseraDashboardSections tetapi hanya untuk cetak/PDF, atau
//   2. tidak memakainya sama sekali (halaman Laporan murni detail).
// Test ini mengunci NIAT-nya, bukan salah satu implementasinya, supaya tidak
// memerahkan CI saat susunan halaman dirapikan lagi.
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const reportsPage = read('app/reports/page.js');
const css = read('app/globals.css');
const sections = read('app/dashboard/OlseraDashboardSections.js');
const dashboardPage = read('app/dashboard/page.js');

function reportsRendersSummary() {
  return /OlseraDashboardSections/.test(reportsPage) || /reports-android-summary/.test(reportsPage);
}

test('ringkasan Dashboard tidak tampil di layar Laporan', () => {
  if (reportsRendersSummary()) {
    // Kalau masih dipakai, wajib dibatasi ke cetak lewat kelas print-only.
    assert.match(
      reportsPage,
      /reports-summary-print-only/,
      'ringkasan di halaman Laporan hanya boleh untuk cetak/PDF',
    );
    const screenBlock = css.slice(css.indexOf('@media screen'), css.indexOf('@media screen') + 2000);
    assert.match(screenBlock, /\.reports-summary-print-only\s*\{\s*display:\s*none\s*!important;\s*\}/);
  } else {
    // Tidak dipakai sama sekali: pastikan sisa markup ringkasan juga tidak ada.
    assert.doesNotMatch(reportsPage, /reports-android-summary/);
    assert.doesNotMatch(reportsPage, /OlseraDashboardSections/);
  }
});

test('halaman Laporan tetap menampilkan detail dan penutupan', () => {
  // Detail boleh lewat komponen lama (ReportDetailAccordions) atau workspace
  // baru yang membungkusnya; keduanya sah selama detail benar-benar dirender.
  assert.match(reportsPage, /ReportDetailAccordions|ReportAnalyticsWorkspace/);
  assert.match(reportsPage, /ReportClosingPanel|ReportAnalyticsWorkspace/);
});

test('ringkasan tidak ikut disembunyikan saat mencetak', () => {
  // Satu-satunya aturan print yang menyembunyikan ringkasan berlaku ketika
  // pengguna mencetak detail tertentu (has-print-target); cetak halaman penuh
  // tetap menampilkan ringkasan bila komponennya dipakai.
  const printRules = [...css.matchAll(/@media print\s*\{[\s\S]*?\n\}/g)].map((match) => match[0]);
  for (const rule of printRules) {
    if (!rule.includes('.reports-android-summary')) continue;
    assert.match(
      rule,
      /has-print-target/,
      'aturan print yang menyembunyikan ringkasan hanya boleh untuk cetak detail tertentu',
    );
  }
  assert.doesNotMatch(css, /@media print\s*\{[^}]*\.reports-summary-print-only\s*\{\s*display:\s*none/);
});

test('Dashboard tetap menampilkan ringkasan di layar (tidak ikut tersembunyi)', () => {
  assert.doesNotMatch(dashboardPage, /reports-summary-print-only/);
  assert.match(sections, /title="Ringkasan toko"/);
  assert.match(sections, /title="Penjualan"/);
  assert.match(dashboardPage, /OlseraDashboardSections/);
});