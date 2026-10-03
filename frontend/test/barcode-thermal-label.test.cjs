/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..', 'app');
const label = fs.readFileSync(path.join(appRoot, 'components/BarcodeLabel.js'), 'utf8');
const inventoryPage = fs.readFileSync(path.join(appRoot, 'inventory/barcodes/page.js'), 'utf8');
const productsPage = fs.readFileSync(path.join(appRoot, 'products/page.js'), 'utf8');
const {
  A6_LAYOUT,
  createA6PrintCss,
  getLabelPages,
} = require(path.join(appRoot, 'components/barcode-print.cjs'));

test('A6 barcode output owns its physical page rules instead of global report print styles', () => {
  const printCss = createA6PrintCss();
  assert.match(printCss, /@page\s*\{\s*size:\s*105mm\s+148mm;\s*margin:\s*0;/);
  assert.match(printCss, /grid-template-columns:\s*repeat\(3,\s*24\.75mm\)/);
  assert.match(printCss, /grid-template-rows:\s*repeat\(8,\s*14\.25mm\)/);
  assert.match(inventoryPage, /printBarcodeItems\(/);
  assert.match(productsPage, /printBarcodeItems\(/);
  assert.doesNotMatch(inventoryPage, /window\.print\(\)/);
  assert.doesNotMatch(productsPage, /window\.print\(\)/);
});

test('A6 sheet dimensions include 24 labels, exact gaps, and the calculated label size', () => {
  assert.equal(A6_LAYOUT.labelsPerPage, 24);
  assert.equal(A6_LAYOUT.columns, 3);
  assert.equal(A6_LAYOUT.rows, 8);
  assert.equal(A6_LAYOUT.gapMm, 4);
  assert.equal(A6_LAYOUT.labelWidthMm, 24.75);
  assert.equal(A6_LAYOUT.labelHeightMm, 14.25);
  assert.match(inventoryPage, /Ukuran label aktual/);
});

test('product-detail barcode modal stays portal-isolated and previews one label, not a long copy stack', () => {
  assert.ok(productsPage.includes("import { createPortal } from 'react-dom';"));
  assert.ok(productsPage.includes('barcodePortalTarget && createPortal('));
  assert.ok(productsPage.includes('barcodePreview?.barcode_value'));
  assert.ok(productsPage.includes('Pratinjau satu label'));
  assert.ok(!productsPage.includes('chosenBarcodes'));
});

test('one copy prints on one A6 sheet; more copies paginate in groups of 24', () => {
  const one = getLabelPages([{ name: 'A106', sku: 'B4-A106-2', copies: 1 }]);
  const thirtyTwo = getLabelPages([{ name: 'A106', sku: 'B4-A106-2', copies: 32 }]);
  assert.deepEqual(one.map((page) => page.length), [1]);
  assert.deepEqual(thirtyTwo.map((page) => page.length), [24, 8]);
});

test('barcode label keeps the retail hierarchy and encodes the real SKU', () => {
  assert.match(label, /className="barcode-label__heading"/);
  assert.match(label, /className="barcode-label__name"/);
  assert.match(label, /className="barcode-label__price"/);
  assert.match(label, /className="barcode-label__barcode"/);
  assert.match(label, /className="barcode-label__value"/);
  assert.match(label, /format:\s*'CODE128'/);
  assert.doesNotMatch(productsPage, /barcodeProduct\.name,\s*variant_color/);
});
