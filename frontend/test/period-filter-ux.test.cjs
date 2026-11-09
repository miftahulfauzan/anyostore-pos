const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'app', file), 'utf8');
const css = read('globals.css');

test('laporan: periode default hari ini, tanpa tombol Tampilkan, bisa dibuka-tutup', () => {
  const page = read('reports/page.js');
  assert.match(page, /useState\("today"\)/);
  assert.match(page, /getWarehousePeriodRange\('today'\)/);
  assert.doesNotMatch(page, />Tampilkan</);
  assert.match(page, /period-filter-toggle/);
  assert.match(page, /aria-expanded=\{filterOpen\}/);
  assert.match(page, /pos_period_filter_open/);
  assert.match(page, /setTimeout\(/, 'tanggal harus diterapkan otomatis setelah jeda');
});

test('laporan: kartu brand tidak lagi mengulang baris periode', () => {
  const page = read('reports/page.js');
  assert.doesNotMatch(page, /<small>Periode \{period\.start\}/);
});

test('dasbor & dashboard stok: periode default hari ini dan tanpa tombol Terapkan', () => {
  const dashboard = read('dashboard/page.js');
  const stock = read('inventory/dashboard/page.js');
  for (const page of [dashboard, stock]) {
    assert.match(page, /useState\('today'\)/);
    assert.match(page, /getWarehousePeriodRange\('today'\)/);
    assert.doesNotMatch(page, />Terapkan</);
    assert.match(page, /setTimeout\(/);
  }
});

test('semua halaman periode memakai default hari ini', () => {
  assert.match(read('inventory/mutation-report/page.js'), /useState\('today'\)/);
  assert.match(read('reports/cashflow/page.js'), /useState\('today'\)/);
  assert.match(read('reports/tax/page.js'), /useState\('today'\)/);
  assert.match(read('history/page.js'), /useState\('today'\)/);
  assert.match(read('expenses/page.js'), /useState\('today'\)/);
});

test('preset periode tampil sebagai chip satu baris yang bisa digeser', () => {
  assert.match(
    css,
    /\.date-range-presets,[\s\S]*?\.dashboard-report-periods,[\s\S]*?\.warehouse-dashboard-periods,[\s\S]*?\.stock-dashboard-periods,[\s\S]*?\.mutation-report-periods\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;/,
    'wadah preset harus satu baris dan bisa digeser',
  );
  assert.match(
    css,
    /\.date-range-presets button,[\s\S]*?\.dashboard-report-periods button,[\s\S]*?\{[^}]*border-radius:\s*999px;/,
    'tombol preset harus berbentuk chip',
  );
});

test('header menyembunyikan tombol aksi ke dalam menu di layar sempit', () => {
  assert.match(css, /\.header-actions-menu\s*\{[^}]*display:\s*none;/s);
  assert.match(css, /@media\s*\(max-width:\s*820px\)\s*\{[\s\S]*?\.header-actions-menu\s*\{\s*display:\s*grid;/s);
  assert.match(css, /@media\s*\(max-width:\s*820px\)\s*\{[\s\S]*?\.header-actions\s*>\s*\.header-action-links\s*\{\s*display:\s*none;/s);
  assert.match(css, /\.header-actions-sheet-panel\s*\{/);
});

test('sheet aksi halaman ada di AppShell dan bisa ditutup', () => {
  const shell = read('components/AppShell.js');
  assert.match(shell, /className="header-actions-menu"/);
  assert.match(shell, /className="header-actions-sheet"/);
  assert.match(shell, /aria-modal="true"/);
  assert.match(shell, /event\.key === 'Escape'/);
});
