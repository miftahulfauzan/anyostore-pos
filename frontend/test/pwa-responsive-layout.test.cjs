const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'app', file), 'utf8');

test('mobile reports expose disclosure rows for compact detail reflow', () => {
  const component = read('reports/ReportDetailAccordions.js');
  assert.match(component, /className="report-detail-disclosures"/);
  assert.match(component, /className="report-product-disclosure report-detail-disclosure"/);
  assert.match(component, /className="report-detail-disclosure-body"/);
});

test('mobile settings store table exposes responsive card hooks', () => {
  const settings = read('settings/page.js');
  assert.match(settings, /settings-branch-table/);
  assert.match(settings, /data-label="No"/);
  assert.match(settings, /data-label="Nama"/);
});

test('PWA mobile controls use equal-width action tracks without table overflow', () => {
  const css = read('globals.css');
  assert.match(css, /\.header-action-links\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.report-detail-table-wrap\s*\{[^}]*overflow:\s*visible/s);
  assert.match(css, /\.report-detail-table\s+td::before,\s*\.settings-branch-table\s+td::before\s*\{[^}]*content:\s*attr\(data-label\)/s);
  assert.match(css, /\.settings-branch-table\s+td::before\s*\{[^}]*content:\s*attr\(data-label\)/s);
  assert.match(css, /\.dashboard-report-range-controls,\s*\.dashboard-report-date-filter,\s*\.dashboard-report-periods\s*\{[^}]*width:\s*100%/s);
});
