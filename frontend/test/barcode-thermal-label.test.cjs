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
const {
  getBarcodeCopies,
  selectedBarcodeLabels,
  splitBarcodeLabels,
  summarizeBarcodeSelection,
  updateBarcodeSelection,
} = require(path.join(appRoot, 'components/barcodeSheets.js'));

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

test('mixed product quantities survive searching and fill A6 sheets in selection order', () => {
  const a100 = { product_id: 100, variant_id: null, name: 'A100', barcode_value: '100' };
  const a101 = { product_id: 101, variant_id: 3, name: 'A101', variant_color: 'Denim', barcode_value: '101-D' };
  let selection = updateBarcodeSelection([], a100, '23');

  // Searching for A101 replaces the visible product list, not the print selection.
  selection = updateBarcodeSelection(selection, a101, '4');
  assert.equal(getBarcodeCopies(selection, a100), 23);
  assert.equal(getBarcodeCopies(selection, a101), 4);

  const labels = selectedBarcodeLabels(selection);
  assert.equal(labels.length, 27);
  assert.deepEqual(splitBarcodeLabels(labels).map((sheet) => sheet.length), [24, 3]);
  assert.deepEqual(summarizeBarcodeSelection(selection), {
    productCount: 2,
    totalLabels: 27,
    sheetCount: 2,
  });
  assert.deepEqual(labels.slice(22).map((item) => item.name), ['A100', 'A101', 'A101', 'A101', 'A101']);
  assert.ok(inventoryPage.includes('selectedBarcodeLabels(selection)'));
  assert.ok(!inventoryPage.includes('items.flatMap('), 'print labels must not be derived from the currently filtered list');
  assert.ok(inventoryPage.includes('{selectionSummary.sheetCount} lembar A6'));
  assert.ok(inventoryPage.includes('Pilihan tetap tersimpan saat Anda mencari produk lain.'));
  assert.ok(productsPage.includes('href="/inventory/barcodes"'), 'Master Produk must link to the mixed-product barcode workflow');
  assert.ok(css.includes('.barcode-selection-summary {'));
});

test('barcode quantity can be cleared and re-entered without losing its row', () => {
  const a100 = { product_id: 100, variant_id: null, name: 'A100' };
  const cleared = updateBarcodeSelection(updateBarcodeSelection([], a100, '12'), a100, '');
  assert.equal(getBarcodeCopies(cleared, a100), '');
  assert.deepEqual(selectedBarcodeLabels(cleared), []);

  const reentered = updateBarcodeSelection(cleared, a100, '7');
  assert.equal(getBarcodeCopies(reentered, a100), 7);
  assert.equal(selectedBarcodeLabels(reentered).length, 7);
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
