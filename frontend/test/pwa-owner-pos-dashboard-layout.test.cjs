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
  assert.match(component, /createPortal/);
    assert.match(component, /branch-switcher\$\{open \? ' is-open' : ''\}/);
  assert.match(css, /\.branch-switcher-panel\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.branch-switcher-options strong\s*\{[^}]*white-space:\s*normal/s);
  assert.match(css, /\.branch-switcher-options small\s*\{[^}]*white-space:\s*normal/s);
    assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*?\.branch-switcher-panel\s*\{[^}]*z-index:\s*150[\s\S]*?inset:\s*max\(12px,\s*env\(safe-area-inset-top\)\)\s+12px\s+max\(12px,\s*env\(safe-area-inset-bottom\)\)/s);
    assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*?\.branch-switcher-options\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*?\.branch-switcher-options\s*\{[^}]*flex:\s*1 1 auto/s);
  assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*?\.branch-switcher-backdrop[\s\S]*?z-index:\s*149/s);
});

test('portal-backed owner picker fills the small POS viewport above the cart', () => {
  const css = read('app/globals.css');

  assert.match(css, /@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*820px\)[\s\S]*?\.branch-switcher-panel\s*\{[^}]*position:\s*fixed[^}]*height:\s*calc\(100dvh - 32px\)/s);
  assert.match(css, /@media\s*\(min-width:\s*701px\)\s*and\s*\(max-width:\s*820px\)[\s\S]*?\.branch-switcher-options\s*\{[^}]*flex:\s*1 1 auto[^}]*overflow-y:\s*auto/s);
});

test('mobile dashboard period controls use the full available width', () => {
  const css = read('app/globals.css');

  assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*?\.dashboard-report-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*?\.dashboard-report-range-controls\s*\{[^}]*width:\s*100%/s);
  assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*?\.dashboard-report-periods\s*\{[^}]*display:\s*grid[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)[\s\S]*?width:\s*100%/s);
  assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*?\.dashboard-report-date-filter\s*\{[^}]*display:\s*grid[\s\S]*?width:\s*100%/s);
  assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*?\.dashboard-report-date-filter\s*>\s*button\s*\{[^}]*width:\s*100%/s);
  assert.match(css, /\.dashboard-report-date-filter\s*>\s*span\s*\{[^}]*display:\s*grid[^}]*min-height:\s*36px[^}]*color:\s*#475569/s);
});

test('report date separator has a dedicated centered track', () => {
  const css = read('app/globals.css');

  assert.match(css, /\.report-period-date-fields\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+38px\s+minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.report-period-date-fields\s*>\s*span\s*\{[^}]*display:\s*grid[^}]*place-items:\s*center[^}]*min-height:\s*44px[^}]*background:\s*#eef3f8[^}]*color:\s*#1e3a5f/s);
});
