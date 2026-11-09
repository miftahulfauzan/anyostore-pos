const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'app', file), 'utf8');

test('report product details use compact native disclosures', () => {
  const component = read('reports/ReportDetailAccordions.js');

  assert.match(component, /function ProductDetailList/);
  assert.match(component, /<details\b/);
  assert.match(component, /report-product-disclosure/);
  assert.match(component, /openAll/);
  for (const field of ['Kategori', 'Barcode', 'Varian', 'Qty terjual', 'Pendapatan', 'Modal', 'Laba kotor']) {
    assert.match(component, new RegExp(field));
  }
});

test('report print actions use a popup-safe PWA print view', () => {
  const component = read('reports/ReportDetailAccordions.js');
  const reportsPage = read('reports/page.js');
  const printUtils = read('lib/print-utils.js');

  assert.match(printUtils, /window\.open\(['"]['"],\s*['_"]_blank/);
  assert.match(printUtils, /populatePrintWindow/);
  assert.match(component, /createPrintWindow/);
  assert.match(component, /populatePrintWindow/);
  assert.match(reportsPage, /openPrintView/);
});

test('mobile report chart labels stay inside the chart card', () => {
  const css = read('globals.css');

  assert.match(css, /\.dashboard-report-chart-ylabels\s*\{[^}]*left:\s*-60px/s);
  assert.match(css, /\.dashboard-report-chart-ylabels\s*\{[^}]*right:\s*auto/s);
  assert.match(css, /\.dashboard-report-chart\s*\{[^}]*padding-left:\s*64px/s);
});

test('expanded report accordion keeps readable foreground contrast', () => {
  const css = read('globals.css');

  assert.match(css, /\.report-detail-accordion\.is-expanded\s+\.report-detail-accordion-trigger\s*\{[^}]*background:/s);
  assert.match(css, /\.report-detail-accordion\.is-expanded\s+\.report-detail-accordion-copy\s+strong\s*\{[^}]*color:/s);
  assert.match(css, /\.report-detail-accordion\.is-expanded\s+\.report-detail-accordion-copy\s+small\s*\{[^}]*color:/s);
});
