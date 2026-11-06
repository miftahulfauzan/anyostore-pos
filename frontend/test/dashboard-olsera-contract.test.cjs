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
    'Sekilas toko',
    'Sales',
    'Income',
    'Expense',
    'Return',
    'Top product groups',
  ]) {
    assert.match(sections, new RegExp(section));
  }
  assert.match(sections, /dashboard-report-chart/);
  assert.doesNotMatch(sections, /DateHoursToggle/);
  assert.match(sections, /dashboard-report-values/);
  assert.match(sections, /Nilai per tanggal/);
});
