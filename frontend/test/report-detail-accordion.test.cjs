const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportsPage = fs.readFileSync(path.join(root, 'app/reports/page.js'), 'utf8');
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

test('detail report uses five icon-led accordion groups and scoped actions', () => {
  for (const label of [
    'Transaksi',
    'Produk',
    'Pembayaran',
    'Retur',
    'Analisis periode',
  ]) {
    assert.match(component, new RegExp(label));
  }
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
    'payment_methods',
    'cashiers',
    'customers',
    'low_stock',
    'return_summary',
    'returns',
    'daily_sales',
    'hourly_sales',
    'branch_comparison',
    'price_tiers',
  ]) {
    assert.match(component, new RegExp(`report\\?\\.${field}`), field);
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
