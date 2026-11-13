/* eslint-disable no-undef */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(
  new URL('../app/dashboard/page.js', `file://${__dirname}/`),
  'utf8',
);
const sections = fs.readFileSync(
  new URL('../app/dashboard/OlseraDashboardSections.js', `file://${__dirname}/`),
  'utf8',
);

test('dashboard web uses the enriched reports overview', () => {
  assert.match(source, /reports\/overview/);
  assert.match(source, /reportData/);
  assert.match(source, /Pilih periode dashboard penjualan/);
  for (const section of [
    'Ringkasan toko',
    'Penjualan',
    'Produk terlaris',
    'Stok rendah',
    'Produk terjual',
    'Laba bersih',
  ]) {
    assert.match(sections, new RegExp(section));
  }
  for (const mergedClass of [
    'dashboard-merged',
    'dashboard-kpi-grid',
    'dashboard-sales-summary',
    'dashboard-secondary-grid',
  ]) {
    assert.match(sections, new RegExp(mergedClass));
  }
  assert.match(sections, /fallbackData/);
  assert.match(sections, /payment_methods/);
  for (const removed of [
    'Pelanggan baru',
    'Pemasukan',
    'Rata-rata transaksi',
    'title="Income"',
    'Top product groups',
    'title="Sales"',
    'title="Expense"',
    'title="Return"',
  ]) {
    assert.doesNotMatch(sections, new RegExp(removed));
  }
  assert.match(sections, /dashboard-report-chart/);
  assert.doesNotMatch(sections, /DateHoursToggle/);
  assert.doesNotMatch(sections, /Nilai per tanggal/);
  // Toggle "Lihat angka" pada grafik dihapus: kartu Penjualan cukup grafik
  // + baris rincian supaya tidak ada tombol tambahan di dasbor.
  assert.doesNotMatch(sections, /showValues/);
  assert.doesNotMatch(sections, /Lihat angka/);
  assert.match(sections, /products_sold/);
});

test('web sales chart uses the same smooth area treatment as Android', () => {
  assert.match(sections, /buildSmoothPath/);
  assert.match(sections, /className="dashboard-report-chart-area"/);
  assert.match(sections, /className="dashboard-report-chart-line"/);
  assert.match(sections, /dashboard-report-chart-point/);
  assert.doesNotMatch(sections, /<polyline points=\{points\}/);
});

test('dashboard cards stay tidy: no decorative icons, badges, or chevrons', () => {
  const styles = fs.readFileSync(new URL('../app/globals.css', `file://${__dirname}/`), 'utf8');
  // Kartu ringkas: KPI tanpa kotak ikon/badge panah, rincian tanpa ikon & chevron.
  assert.doesNotMatch(sections, /dashboard-kpi-icon/);
  // Badge perbandingan (↑ +12,4%) tetap ada, hanya tanpa kotak ikon.
  assert.match(sections, /dashboard-kpi-change/);
  assert.doesNotMatch(sections, /dashboard-finance-icon|dashboard-finance-chevron/);
  assert.match(sections, /dashboard-kpi-label/);
  // Daftar terlaris & stok rendah satu baris (nama + bar + angka).
  assert.match(sections, /dashboard-list-row/);
  assert.match(styles, /\.dashboard-list-row \{ display: flex; align-items: center; gap: 8px; \}/);
  assert.match(styles, /\.dashboard-list-row \.dashboard-list-track \{ flex: 1 1 auto;/);
  // Judul seksi tetap satu baris (aksen + judul + meta) di semua lebar.
  assert.match(styles, /\.dashboard-merged \.dashboard-report-heading \{\s*flex-direction: row !important;/);
});

test('komponen dasbor tidak memakai ikon/props yang tidak diimpor', () => {
  // Regression: `icon={CreditCard}` tertinggal setelah import lucide dihapus →
  // ReferenceError "CreditCard is not defined" dan halaman dasbor gagal render.
  assert.doesNotMatch(sections, /icon=\{[A-Z]/);
  const declared = new Set([...sections.matchAll(/(?:function|const|let)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  declared.add('Link');
  const referenced = [
    ...[...sections.matchAll(/<([A-Z][\w]*)/g)].map((m) => m[1]),
    ...[...sections.matchAll(/(\w+)=\{([A-Z][\w]*)\}/g)].map((m) => m[2]),
  ];
  const unknown = [...new Set(referenced)].filter((name) => !declared.has(name));
  assert.deepEqual(unknown, [], `komponen/prop tidak terdefinisi: ${unknown.join(', ')}`);
});

test('dashboard and reports clear stale data after an access error', () => {
  const reports = fs.readFileSync(new URL('../app/reports/page.js', `file://${__dirname}/`), 'utf8');
  assert.match(source, /setData\(null\);\s*setReportData\(null\);/);
  assert.match(source, /const \[retryVersion, setRetryVersion\] = useState\(0\)/);
  assert.match(source, /className="panel dashboard-load-error"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /Coba lagi/);
  assert.match(reports, /const \[retryVersion, setRetryVersion\] = useState\(0\)/);
  assert.match(reports, /className="panel reports-load-error"/);
  assert.match(reports, /role="alert"/);
  assert.match(reports, /Coba lagi/);
});

test('grafik dasbor tidak menembus keluar kartu (label sumbu Y)', () => {
  const styles = fs.readFileSync(new URL('../app/globals.css', `file://${__dirname}/`), 'utf8');
  // Dulu label sumbu Y diposisikan `right: calc(100% + 38px)` sehingga keluar
  // kartu (di tablet keluar layar dan halaman bisa digeser ke samping).
  assert.match(styles, /\.dashboard-merged \.dashboard-report-chart \{ position: relative;[^}]*overflow: hidden;/);
  assert.match(styles, /\.dashboard-merged \.dashboard-report-chart-ylabels \{ display: none; \}/);
  assert.match(sections, /dashboard-report-chart-max/);
});
