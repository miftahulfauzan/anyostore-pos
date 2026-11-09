const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('owner branch picker stays above the sticky POS cart and keeps every option readable', () => {
  const component = read('app/components/BranchSwitcher.js');
  const css = read('app/globals.css');

  assert.match(component, /branches\.map/);
  assert.match(css, /\.branch-switcher-panel\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.branch-switcher-options strong\s*\{[^}]*white-space:\s*normal/s);
  assert.match(css, /\.branch-switcher-options small\s*\{[^}]*white-space:\s*normal/s);
  assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*?\.branch-switcher-panel\s*\{[^}]*z-index:\s*150/s);
  assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*?\.branch-switcher-backdrop[\s\S]*?z-index:\s*149/s);
});

test('mobile dashboard period controls use the full available width', () => {
  const css = read('app/globals.css');

  assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*?\.dashboard-report-range-controls\s*\{[^}]*width:\s*100%/s);
  assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*?\.dashboard-report-periods\s*\{[^}]*display:\s*grid[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)[\s\S]*?width:\s*100%/s);
  assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*?\.dashboard-report-date-filter\s*\{[^}]*display:\s*grid[\s\S]*?width:\s*100%/s);
  assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*?\.dashboard-report-date-filter\s*>\s*button\s*\{[^}]*width:\s*100%/s);
});
