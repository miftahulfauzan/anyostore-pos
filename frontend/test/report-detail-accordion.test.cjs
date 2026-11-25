const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportsPage = fs.readFileSync(path.join(root, 'app/reports/page.js'), 'utf8');
const workspace = fs.readFileSync(path.join(root, 'app/reports/ReportAnalyticsWorkspace.js'), 'utf8');
const componentPath = path.join(root, 'app/reports/ReportDetailAccordions.js');
const component = fs.existsSync(componentPath)
  ? fs.readFileSync(componentPath, 'utf8')
  : '';

test('reports page keeps the merged summary and delegates detail rendering', () => {
  assert.match(reportsPage, /OlseraDashboardSections/);
  assert.match(reportsPage, /ReportDetailAccordions/);
  assert.match(reportsPage, /<ReportDetailAccordions\b/);
  assert.doesNotMatch(reportsPage, /<ReportTable\b/);
});

test('report tabs follow Android order and sales accordions stay focused', () => {
  const tabs = [
    ['sales', 'Penjualan'],
    ['closing', 'Penutupan'],
    ['payments', 'Pembayaran'],
    ['expenses', 'Pengeluaran'],
    ['returns', 'Pengembalian'],
    ['products', 'Produk & margin'],
    ['inventory', 'Stok & restok'],
    ['channels', 'Kanal'],
    ['customers', 'Pelanggan'],
    ['suppliers', 'Supplier'],
    ['tax', 'PPN Masukan'],
  ];
  const positions = tabs.map(([id, label]) => workspace.indexOf(`{ id: "${id}", label: "${label}"`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));

  for (const label of [
    'Transaksi',
    'Performa penjualan',
    'Analisis periode',
  ]) {
    assert.match(component, new RegExp(label));
  }
  assert.doesNotMatch(component, /key: 'payments'|key: 'returns'/);
  for (const view of ['PaymentsView', 'ExpensesView', 'ReturnsView', 'TaxView']) assert.match(workspace, new RegExp(`function ${view}`));
  assert.match(component, /lucide-react/);
  assert.match(component, /aria-expanded/);
  assert.match(component, /Lihat PDF/);
  assert.match(component, /Cetak/);
  assert.match(component, /printTarget/);
});

test('detail report keeps every overview dataset available', () => {
  for (const field of [
    'transactions',
    'cancellations',
    'products',
    'categories',
    'cashiers',
    'customers',
    'low_stock',
    'daily_sales',
    'hourly_sales',
    'branch_comparison',
    'price_tiers',
  ]) {
    assert.match(component, new RegExp(`report\\?\\.${field}`), field);
  }
  for (const field of ['payment_methods', 'daily_expenses', 'return_summary', 'returns']) {
    assert.match(workspace, new RegExp(`report\\?\\.${field}`), field);
  }
  assert.match(component, /Laporan stok/);
});

test('detail report has mobile-safe table and action styling hooks', () => {
  const css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
  for (const selector of [
    '.report-detail-accordion',
    '.report-detail-actions',
    '.has-print-target',
    '.report-detail-table',
  ]) {
    assert.match(css, new RegExp(selector.replace('.', '\\.'), 'g'), selector);
  }
});
