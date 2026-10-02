/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..', 'app');
const css = fs.readFileSync(path.join(appRoot, 'globals.css'), 'utf8');
const label = fs.readFileSync(path.join(appRoot, 'components/BarcodeLabel.js'), 'utf8');
const cssRules = (selector) => [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]+)\\}`, 'g'))].map((match) => match[1]);

test('thermal barcode printing uses a 100mm web and 19mm label pitch', () => {
  assert.match(css, /@page\s+thermal-barcode\s*\{[^}]*size:\s*100mm\s+19mm;[^}]*margin:\s*0/);
  const printGrid = cssRules('\\.barcode-print-area').find((rule) => /page:\s*thermal-barcode/.test(rule));
  assert.ok(printGrid, 'print grid selects the thermal label page');
  assert.match(printGrid, /width:\s*100mm/);
  assert.match(printGrid, /grid-template-columns:\s*repeat\(3,\s*33mm\)/);
  assert.match(printGrid, /grid-auto-rows:\s*19mm/);
  assert.match(printGrid, /gap:\s*0/);
  assert.match(printGrid, /justify-content:\s*center/);
});

test('each printed sticker occupies exactly one 33 by 19mm label', () => {
  const printLabel = cssRules('\\.barcode-label').find((rule) => /width:\s*33mm/.test(rule));
  assert.ok(printLabel, 'print label has a fixed physical width');
  assert.match(printLabel, /height:\s*19mm/);
  assert.match(printLabel, /box-sizing:\s*border-box/);
  assert.match(printLabel, /min-height:\s*0/);
  assert.match(printLabel, /break-inside:\s*avoid/);
});

test('barcode content stays complete and prints its barcode value only once', () => {
  assert.match(label, /displayValue:\s*true/);
  assert.match(label, /<strong>\{item\.name\}<\/strong>/);
  assert.match(label, /<span>\{item\.variant_color/);
  assert.match(label, /<b>Rp\{Number\(item\.price/);
  assert.doesNotMatch(label, /<small>\{item\.barcode_value\}<\/small>/);
  assert.doesNotMatch(css, /body:has\(\.barcode-print-area\) \.barcode-print-area\s*\{\s*position:\s*fixed/);
});
