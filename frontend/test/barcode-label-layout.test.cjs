const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  A6_LAYOUT,
  barcodeItemKey,
  countBarcodeLabels,
  createA6PrintCss,
  getBarcodeValue,
  getFirstLabelPage,
  getLabelPages,
  getSelectedBarcodeItems,
  printBarcodeItems,
  validateBarcodeItems,
} = require('../app/components/barcode-print.cjs');

const appRoot = path.join(__dirname, '..', 'app');
const component = fs.readFileSync(path.join(appRoot, 'components/BarcodeLabel.js'), 'utf8');
const bulkPage = fs.readFileSync(path.join(appRoot, 'inventory/barcodes/page.js'), 'utf8');
const previewCss = fs.readFileSync(path.join(appRoot, 'inventory/barcodes/barcode-preview.module.css'), 'utf8');
const productPage = fs.readFileSync(path.join(appRoot, 'products/page.js'), 'utf8');

test('retail label has one aligned name-price heading, real bars and centered value', () => {
  assert.match(component, /className="barcode-label__heading"/);
  assert.match(component, /className="barcode-label__name"/);
  assert.match(component, /className="barcode-label__price"/);
  assert.match(component, /className="barcode-label__barcode"/);
  assert.match(component, /className="barcode-label__value"/);
  assert.doesNotMatch(component, /Produk standar/);
  assert.match(previewCss, /barcode-label__product\)\s*\{[^}]*display:\s*flex/s);
});

test('A6 sheets hold 24 equal 3x8 labels with 4 mm gaps and safe page bounds', () => {
  assert.deepEqual(A6_LAYOUT, {
    pageWidthMm: 105,
    pageHeightMm: 148,
    columns: 3,
    rows: 8,
    labelsPerPage: 24,
    gapMm: 4,
    verticalMarginMm: 3,
    sideMarginMm: 11.375,
    labelWidthMm: 24.75,
    labelHeightMm: 14.25,
  });
  assert.equal(2 * A6_LAYOUT.sideMarginMm + 3 * A6_LAYOUT.labelWidthMm + 2 * A6_LAYOUT.gapMm, 105);
  assert.equal(2 * A6_LAYOUT.verticalMarginMm + 8 * A6_LAYOUT.labelHeightMm + 7 * A6_LAYOUT.gapMm, 148);
  assert.ok(Math.abs(A6_LAYOUT.labelWidthMm / A6_LAYOUT.labelHeightMm - 3.3 / 1.9) < 0.002);
});

test('mixed products paginate in selection order and only the first 24 labels preview', () => {
  const labels = [
    { name: 'A100', copies: 2, barcode_value: 'B7-B4-A100-2' },
    { name: 'A101', copies: 23, barcode_value: 'B7-B4-A101-2' },
  ];
  const pages = getLabelPages(labels);
  assert.deepEqual(pages.map((page) => page.length), [24, 1]);
  assert.equal(countBarcodeLabels(labels), 25);
  assert.equal(getFirstLabelPage(labels).length, 24);
  assert.equal(pages[0][0].name, 'A100');
  assert.equal(pages[0][2].name, 'A101');
  assert.equal(pages[1][0].name, 'A101');
});

test('mixed selection survives searching for another product and refreshes visible data', () => {
  const a100 = { product_id: 1, name: 'A100', sku: 'B7-A100', price: 100 };
  const a101 = { product_id: 2, variant_id: 7, name: 'A101', sku: 'B7-A101', price: 200 };
  const selection = {
    [barcodeItemKey(a100)]: { item: a100, copies: 2 },
    [barcodeItemKey(a101)]: { item: a101, copies: 1 },
  };
  const selectedItems = getSelectedBarcodeItems([{ ...a100, price: 150 }], selection);
  assert.deepEqual(selectedItems.map(({ name, copies }) => [name, copies]), [['A100', 2], ['A101', 1]]);
  assert.equal(selectedItems[0].price, 150);
  assert.equal(selectedItems[1].barcode_value, 'B7-A101');
});

test('only a real barcode or SKU is used and CODE128-invalid values are rejected', () => {
  assert.equal(getBarcodeValue({ variant_barcode: '', variant_sku: 'B7-A100-2', product_sku: 'A100' }), 'B7-A100-2');
  assert.equal(getBarcodeValue({ name: 'A100' }), '');
  assert.throws(() => getLabelPages([{ name: 'A100', copies: 1 }]), /barcode atau SKU/i);
  assert.doesNotThrow(() => validateBarcodeItems([{ barcode_value: 'B7-B4-A100-2', copies: 1 }]));
  assert.throws(() => validateBarcodeItems([{ barcode_value: 'A100 😀', copies: 1 }]), /barcode/i);
});

test('A6 print CSS uses millimeters and exposes the calculated size in preview', () => {
  const css = createA6PrintCss();
  assert.match(css, /@page\s*\{\s*size:\s*105mm\s+148mm;\s*margin:\s*0;/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*24\.75mm\)/);
  assert.match(css, /grid-template-rows:\s*repeat\(8,\s*14\.25mm\)/);
  assert.match(css, /column-gap:\s*4mm/);
  assert.match(css, /row-gap:\s*4mm/);
  assert.match(bulkPage, /A6_LAYOUT\.labelWidthMm\.toLocaleString\('id-ID'\)/);
  assert.match(bulkPage, /A6_LAYOUT\.labelHeightMm\.toLocaleString\('id-ID'\)/);
});

test('owner store context scopes barcode lookup and selections reset on store change', () => {
  assert.match(bulkPage, /useAppSession/);
  assert.match(bulkPage, /createBranchQuery\(user\?\.role, activeBranchId\)/);
  assert.match(bulkPage, /setSelected\(\{\}\)/);
  assert.match(bulkPage, /Coba lagi/);
});

test('bulk and product-detail printing use the isolated A6 print workflow', () => {
  assert.match(bulkPage, /printBarcodeItems\(/);
  assert.match(productPage, /printBarcodeItems\(/);
  assert.doesNotMatch(bulkPage, /window\.print\(\)/);
  assert.doesNotMatch(productPage, /window\.print\(\)/);
  assert.match(productPage, /barcodePreview\?\.barcode_value/);
});

test('print popup safely encodes mixed products and submits a single print request', () => {
  class FakeNode {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.attributes = {};
      this.classList = { add: (name) => { this.className = name; } };
    }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(name, value) { this.attributes[name] = value; }
    cloneNode(deep) {
      const clone = new FakeNode(this.tagName);
      clone.className = this.className;
      clone.textContent = this.textContent;
      clone.attributes = { ...this.attributes };
      clone.children = deep ? this.children.map((child) => child.cloneNode(true)) : [];
      return clone;
    }
  }
  const documentRef = {
    documentElement: {}, head: new FakeNode('head'), body: new FakeNode('body'),
    createElement: (tag) => new FakeNode(tag), createElementNS: (_namespace, tag) => new FakeNode(tag),
  };
  let printCalls = 0;
  let barcodeRenders = 0;
  const popup = { document: documentRef, requestAnimationFrame: (callback) => callback(), focus() {}, print() { printCalls += 1; }, close() {} };
  const browserWindow = { open: () => popup, setTimeout: (callback) => callback() };
  const result = printBarcodeItems([
    { name: '<img onerror=alert(1)>', price: 150000, barcode_value: 'B7-A100', copies: 24 },
    { name: 'A101', price: 125000, barcode_value: 'B7-A101', copies: 1 },
  ], browserWindow, (svg, value) => { barcodeRenders += 1; svg.textContent = `CODE128 ${value}`; });
  assert.deepEqual(result, { labelCount: 25, pageCount: 2 });
  assert.equal(printCalls, 1);
  assert.equal(barcodeRenders, 2);
  assert.deepEqual(documentRef.body.children.map((sheet) => sheet.children.length), [24, 1]);
  const productName = documentRef.body.children[0].children[0].children[0].children[0];
  assert.equal(productName.textContent, '<img onerror=alert(1)>');
  assert.equal(productName.children.length, 0);
});
