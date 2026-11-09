const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('report period dates use a bounded single-row control', () => {
  const page = read('app/reports/page.js');
  const css = read('app/globals.css');
  assert.match(page, /className="report-period-date-fields"/);
  assert.match(css, /\.report-period-date-fields\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.report-period-date-fields input\s*\{[^}]*min-width:\s*0/);
});

test('dashboard finance rows navigate to source details', () => {
  const sections = read('app/dashboard/OlseraDashboardSections.js');
  const details = read('app/reports/cashflow/page.js');
  assert.match(sections, /dashboard-finance-row-link/);
  assert.match(sections, /detailHref\('payments'\)/);
  assert.match(sections, /detailHref\('expenses'\)/);
  assert.match(sections, /detailHref\('returns'\)/);
  assert.match(details, /window\.location\.search/);
  assert.match(details, /reports\/overview/);
  assert.match(details, /finance\/expenses/);
  assert.match(details, /Lihat sumber/);
});

test('dashboard sales and recent transactions have compact full-width hooks', () => {
  const page = read('app/dashboard/page.js');
  const css = read('app/globals.css');
  assert.match(page, /dashboard-recent-item/);
  assert.match(css, /\.reports-android-summary,\s*\.reports-android-summary \.dashboard-report-layout[\s\S]*?width:\s*100%/s);
  assert.match(css, /\.dashboard-recent-list \.dashboard-recent-item\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.dashboard-recent-item__meta\s*\{[^}]*white-space:\s*nowrap/s);
});
