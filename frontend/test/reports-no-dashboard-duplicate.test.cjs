const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Halaman Laporan tidak boleh mengulang isi Dashboard: Ringkasan toko +
// Penjualan memakai komponen & endpoint yang sama dengan Dashboard, jadi
// Laporan dimulai dari "Laporan detail". Ringkasan tetap ikut tercetak.
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const reportsPage = read('app/reports/page.js');
const css = read('app/globals.css');
const sections = read('app/dashboard/OlseraDashboardSections.js');
const dashboardPage = read('app/dashboard/page.js');

test('Laporan memakai komponen ringkasan yang sama dengan Dashboard', () => {
  // Bukti bahwa ringkasan di Laporan memang duplikat Dashboard.
  assert.match(reportsPage, /import OlseraDashboardSections from "\.\.\/dashboard\/OlseraDashboardSections"/);
  assert.match(dashboardPage, /import OlseraDashboardSections from '\.\/OlseraDashboardSections'/);
  assert.match(reportsPage, /<OlseraDashboardSections reportData=\{report\}/);
  assert.match(dashboardPage, /<OlseraDashboardSections reportData=\{reportData\}/);
});

test('ringkasan di halaman Laporan hanya untuk cetak, disembunyikan di layar', () => {
  // Wrapper wajib memakai kelas print-only agar tidak tampil di layar.
  assert.match(reportsPage, /reports-android-summary reports-summary-print-only/);
  // Aturan layar: sembunyikan. Harus berada di dalam blok @media screen.
  const screenBlock = css.slice(css.indexOf('@media screen'), css.indexOf('@media screen') + 2000);
  assert.match(screenBlock, /\.reports-summary-print-only\s*\{\s*display:\s*none\s*!important;\s*\}/);
});

test('ringkasan tidak ikut disembunyikan saat mencetak', () => {
  // Satu-satunya aturan print yang menyembunyikan .reports-android-summary
  // berlaku ketika pengguna mencetak detail tertentu (has-print-target);
  // cetak halaman penuh tetap menampilkan ringkasan.
  const printRules = [...css.matchAll(/@media print\s*\{[\s\S]*?\n\}/g)].map((match) => match[0]);
  for (const rule of printRules) {
    if (!rule.includes('.reports-android-summary')) continue;
    assert.match(
      rule,
      /has-print-target/,
      'aturan print yang menyembunyikan ringkasan hanya boleh untuk cetak detail tertentu',
    );
  }
  // Kelas print-only tidak boleh di-nol-kan di print.
  assert.doesNotMatch(css, /@media print\s*\{[^}]*\.reports-summary-print-only\s*\{\s*display:\s*none/);
});

test('Laporan tetap merender detail dan panel penutupan setelah ringkasan', () => {
  assert.match(reportsPage, /<ReportDetailAccordions report=\{report\}/);
  assert.match(reportsPage, /<ReportClosingPanel date=\{period\.end\}/);
  // Urutan: ringkasan (cetak) → detail → penutupan.
  const summaryAt = reportsPage.indexOf('reports-summary-print-only');
  const detailAt = reportsPage.indexOf('<ReportDetailAccordions');
  const closingAt = reportsPage.indexOf('<ReportClosingPanel');
  assert.ok(summaryAt > -1 && detailAt > summaryAt && closingAt > detailAt);
});

test('Dashboard tetap menampilkan ringkasan di layar (tidak ikut disembunyikan)', () => {
  assert.doesNotMatch(dashboardPage, /reports-summary-print-only/);
  // Dashboard memakai wrapper tanpa kelas print-only.
  assert.match(sections, /title="Ringkasan toko"/);
  assert.match(sections, /title="Penjualan"/);
});
