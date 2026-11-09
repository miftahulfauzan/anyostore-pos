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

test('chip periode memakai class sendiri supaya tidak terkena aturan tombol global', () => {
  assert.match(read('components/DateRangePresets.js'), /className="period-chip"/);
  assert.match(read('dashboard/page.js'), /className="period-chip"/);
  assert.match(read('inventory/dashboard/page.js'), /className="period-chip"/);
  assert.match(read('inventory/mutation-report/page.js'), /className="period-chip"/);
  assert.match(css, /\.period-chip\s*\{[^}]*background:\s*#fff;/s, 'chip netral harus putih');
  assert.match(css, /\.period-chip\[aria-pressed="true"\]\s*\{[^}]*background:\s*var\(--action-bg/s, 'chip aktif memakai warna aksi');
  assert.match(css, /\.period-filter-toggle\s*\{[^}]*background:\s*#fff;/s, 'toggle periode harus netral, bukan warna tombol aksi');
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

test('sidebar memakai gaya denim dengan hierarki jelas', () => {
  assert.match(css, /html\[data-theme\] \.sidebar:not\(\.sidebar-warehouse\)\s*\{[^}]*linear-gradient\(180deg, #22456e/s);
  assert.match(css, /html\[data-theme\] \.sidebar \.nav-group-toggle\s*\{[^}]*color: rgba\(255,255,255,\.45\)/s, 'label grup harus redup');
  assert.match(css, /html\[data-theme\] \.sidebar \.side-nav a\.active[\s\S]{0,120}?rgba\(255,255,255,\.14\)/s, 'item aktif pakai tint, bukan blok biru menyala');
  assert.match(css, /@media \(hover: none\)\s*\{[\s\S]*?\.sidebar \.side-nav a:hover:not\(\.active\)/s, 'hover tidak boleh menempel di layar sentuh');
});

test('mode gelap: judul dan sub-judul kartu laporan detail dibedakan', () => {
  assert.match(css, /\.dark \.app-main \.report-detail-accordion-copy strong\s*\{[^}]*#f8fafc/s);
  assert.match(css, /\.dark \.app-main \.report-detail-accordion-copy small\s*\{[^}]*#94a3b8/s);
});

test('baris pemilih toko tidak ikut diwarnai sebagai tombol aksi', () => {
  assert.doesNotMatch(
    css,
    /html\[data-theme\] \.app-main :where\(button:not\(\[class\]\)/,
    'aturan tema tidak boleh mewarnai semua <button> tanpa class (merusak baris pemilih toko)',
  );
  assert.match(css, /\.branch-switcher-options > button \{[^}]*background: transparent/s);
});

test('POS: navigasi satu baris dan pemilih toko tanpa avatar', () => {
  assert.match(css, /\.pos-standalone-header nav\s*\{[^}]*flex-wrap:\s*nowrap\s*!important/s);
  assert.match(css, /\.pos-standalone-header nav\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.pos-standalone-header nav > \.branch-switcher \.branch-switcher-avatar\s*\{[^}]*display:\s*none/s);
});

test('mode gelap: badge, tile ikon, dan pemisah s/d punya kontras', () => {
  assert.match(css, /\.dark \.dashboard-kpi-change\s*\{[^}]*color:\s*#6ee7b7\s*!important/s);
  assert.match(css, /\.dark \.dashboard-kpi-change\.is-down\s*\{[^}]*color:\s*#fdba74\s*!important/s);
  assert.match(css, /\.dark \.dashboard-kpi-icon\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*\.12\)\s*!important/s);
  assert.match(css, /\.dark \.report-period-date-fields > span,[\s\S]{0,200}?background:\s*#22304b\s*!important/s);
});

test('POS: kepala katalog dipadatkan jadi satu baris', () => {
  const pos = read('pos/page.js');
  assert.match(pos, /catalog-toolbar/);
  assert.match(pos, /catalog-count/);
  assert.match(pos, /catalog-search/);
  assert.doesNotMatch(pos, /className="warehouse-label"/);
  assert.match(css, /\.catalog-toolbar\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /@media \(max-width: 430px\)\s*\{[^}]*\.catalog-count\s*\{\s*display:\s*none/s);
});

test('header HP sejajar judul: satu baris, tema pindah ke menu bila ada aksi', () => {
  const shell = read('components/AppShell.js');
  assert.match(shell, /header-actions\$\{actions \? ' has-menu' : ''\}/);
  assert.match(shell, /header-actions-sheet-theme/);
  assert.match(css, /@media \(max-width: 820px\)\s*\{[\s\S]{0,400}?\.app-header\s*\{[^}]*flex-direction:\s*row\s*!important/s);
  assert.match(css, /@media \(max-width: 520px\)\s*\{[\s\S]{0,400}?\.header-actions\.has-menu > \.theme-toggle\s*\{\s*display:\s*none\s*!important/s);
  assert.match(css, /@media \(max-width: 520px\)\s*\{[\s\S]{0,600}?\.header-actions\s*\{[^}]*display:\s*flex\s*!important/s);
});

test('sidebar HP: tombol tutup kecil dan tidak menimpa nama toko', () => {
  assert.match(css, /@media \(max-width: 820px\)\s*\{[\s\S]{0,300}?html\[data-theme\] \.sidebar \.brand\s*\{[^}]*padding:\s*4px 52px 13px 6px\s*!important/s);
  assert.match(css, /@media \(max-width: 820px\)\s*\{[\s\S]{0,900}?\.sidebar-close\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;/s);
  assert.match(css, /\.sidebar \.brand small\s*\{[^}]*text-overflow:\s*ellipsis/s, 'teks brand harus dipotong rapi');
});

test('Riwayat memakai pola filter periode yang sama dengan Dasbor', () => {
  const history = read('history/page.js');
  assert.match(history, /period-filter-toggle/);
  assert.match(history, /period-filter-body/);
  assert.match(history, /dashboard-report-date-filter/);
  assert.match(history, /pos_period_filter_open/);
  assert.match(history, /setTimeout\(/, 'tanggal harus diterapkan otomatis');
  assert.doesNotMatch(history, />Filter</, 'tombol Filter terpisah tidak dipakai lagi');
});

test('sidebar: menu pelanggan tidak lagi berlabel "Transaksi"', () => {
  const shell = read('components/AppShell.js');
  assert.match(shell, /href: '\/customers', label: 'Pelanggan'/);
  assert.doesNotMatch(shell, /href: '\/customers', label: 'Transaksi'/);
});

test('Dasbor: kepala kartu periode tidak mengulang periode & nama toko', () => {
  const dashboard = read('dashboard/page.js');
  assert.match(dashboard, /period-toolbar-compact/);
  assert.doesNotMatch(dashboard, /<span className="eyebrow">DASHBOARD PENJUALAN<\/span>/);
  assert.doesNotMatch(dashboard, /<span className="eyebrow">DASHBOARD GUDANG<\/span>/);
  assert.match(css, /\.period-toolbar-compact\s*\{[^}]*display:\s*block\s*!important/s);
});
