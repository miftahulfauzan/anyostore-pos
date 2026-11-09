const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = path.join(__dirname, '..', 'app');
const css = fs.readFileSync(path.join(app, 'globals.css'), 'utf8');
const page = fs.readFileSync(path.join(app, 'reports/tax/page.js'), 'utf8');

test('tax report keeps its date controls inside the mobile viewport', () => {
  assert.match(page, /className="form-page tax-report-page"/);
  assert.match(page, /className="tax-report-date-fields"/);
  assert.match(page, /<span aria-hidden="true">s\/d<\/span>/);
  assert.match(page, /className="tax-report-tabs"/);
});

test('tax report uses bounded mobile grids instead of overflowing flex rows', () => {
  assert.match(css, /\.tax-report-date-fields\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+38px\s+minmax\(0,\s*1fr\)\s+auto/);
  assert.match(css, /\.tax-report-date-fields input\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.tax-report-summary-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.tax-report-date-fields\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+38px\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.tax-report-load-button\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.tax-report-summary-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});
