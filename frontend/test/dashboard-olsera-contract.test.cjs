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
    'Sales',
    'Expense',
    'Return',
    'Hasil usaha',
    'Produk terjual',
  ]) {
    assert.match(sections, new RegExp(section));
  }
  for (const removed of [
    'Pelanggan baru',
    'Pemasukan',
    'Rata-rata transaksi',
    'title="Income"',
    'Top product groups',
  ]) {
    assert.doesNotMatch(sections, new RegExp(removed));
  }
  assert.match(sections, /dashboard-report-chart/);
  assert.doesNotMatch(sections, /DateHoursToggle/);
  assert.doesNotMatch(sections, /Nilai per tanggal/);
  assert.match(sections, /showValues/);
  assert.match(sections, /onClick=\{\(\) => setShowValues/);
  assert.match(sections, /aria-expanded=\{showValues\}/);
  assert.match(sections, /products_sold/);
});
