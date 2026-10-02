/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..', 'app');
const css = fs.readFileSync(path.join(appRoot, 'globals.css'), 'utf8');
const label = fs.readFileSync(path.join(appRoot, 'components/BarcodeLabel.js'), 'utf8');
const sheetsSource = fs.readFileSync(path.join(appRoot, 'components/barcodeSheets.js'), 'utf8');
const inventoryPage = fs.readFileSync(path.join(appRoot, 'inventory/barcodes/page.js'), 'utf8');
const productsPage = fs.readFileSync(path.join(appRoot, 'products/page.js'), 'utf8');
const { splitBarcodeLabels } = require(path.join(appRoot, 'components/barcodeSheets.js'));

test('barcode print applies A6 only when printing barcode labels', () => {
  assert.ok(sheetsSource.includes("pageStyle.textContent = '@page { size: A6 portrait; margin: 0; }';"));
  assert.ok(sheetsSource.includes("window.addEventListener('afterprint', cleanup, { once: true });"));
  assert.ok(css.includes('body:has(.barcode-print-area) .barcode-print-sheet {'));
  assert.ok(css.includes('width: 105mm;'));
  assert.ok(css.includes('height: 148mm;'));
});

test('barcode sheets fit 3 columns and 8 rows of 33 by 18.5mm labels', () => {
  assert.ok(css.includes('grid-template-columns: repeat(3, 33mm);'));
  assert.ok(css.includes('grid-template-rows: repeat(8, 18.5mm);'));
  assert.ok(css.includes('.barcode-print-sheet:not(:last-child) {'));
  assert.ok(css.includes('break-after: page;'));
  assert.equal(3 * 33, 99);
  assert.equal(8 * 18.5, 148);
});

test('both barcode entry points split selected labels into 24-label sheets', () => {
  const labels = Array.from({ length: 51 }, (_, index) => index);
  const sheets = splitBarcodeLabels(labels);
  assert.deepEqual(sheets.map((sheet) => sheet.length), [24, 24, 3]);
  assert.ok(inventoryPage.includes('splitBarcodeLabels(chosen)'));
  assert.ok(productsPage.includes('splitBarcodeLabels(chosenBarcodes)'));
  assert.ok(inventoryPage.includes('className="barcode-print-sheet"'));
  assert.ok(productsPage.includes('className="barcode-print-sheet"'));
  assert.ok(inventoryPage.includes('onClick={printBarcodeLabels}'));
  assert.ok(productsPage.includes('onClick={printBarcodeLabels}'));
});

test('each label fits physical dimensions and retains barcode, product, variant, and price', () => {
  assert.ok(css.includes('width: 33mm;\n    height: 18.5mm;'));
  assert.ok(css.includes('box-sizing: border-box;'));
  assert.ok(css.includes('break-inside: avoid;'));
  assert.ok(label.includes('displayValue: true'));
  assert.ok(label.includes('<strong>{item.name}</strong>'));
  assert.ok(label.includes('<span>{item.variant_color'));
  assert.ok(label.includes('<b>Rp{Number(item.price'));
  assert.ok(!label.includes('<small>{item.barcode_value}</small>'));
});
