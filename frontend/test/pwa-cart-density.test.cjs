const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'app', 'pos', 'page.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');
const finalMobile = styles.slice(styles.lastIndexOf('/* Final mobile POS cart overrides'));

test('PWA POS catalog uses three compact product columns on mobile', () => {
  assert.match(finalMobile, /\.catalog-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(finalMobile, /\.product-tile\s*\{[^}]*padding:\s*6px/s);
});

test('PWA cart allows vertical scrolling only and uses compact rows', () => {
  assert.match(finalMobile, /\.pos-cart-scroll\s*\{[^}]*overflow-y:\s*auto[^}]*overflow-x:\s*hidden[^}]*touch-action:\s*pan-y/s);
  assert.match(finalMobile, /\.cart-lines\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(finalMobile, /\.cart-lines article\s*\{[^}]*padding:\s*6px\s+0/s);
});

test('PWA cart keeps discount input and hold draft action reachable', () => {
  assert.match(page, /className="pos-discount-field"/);
  assert.match(page, /id="pos-manual-discount"/);
  assert.match(page, /fetch\(`\$\{apiUrl\}\/transactions\/hold`/);
  assert.match(page, /<PauseCircle/);
});
