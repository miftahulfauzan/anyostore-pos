'use strict';

const JsBarcode = require('jsbarcode');

const PAGE_WIDTH_MM = 105;
const PAGE_HEIGHT_MM = 148;
const COLUMNS = 3;
const ROWS = 8;
const LABEL_GAP_MM = 4;
const VERTICAL_MARGIN_MM = 3;
const TARGET_LABEL_RATIO = 3.3 / 1.9;
const LABEL_HEIGHT_MM = Number(((PAGE_HEIGHT_MM - 2 * VERTICAL_MARGIN_MM - (ROWS - 1) * LABEL_GAP_MM) / ROWS).toFixed(2));
const LABEL_WIDTH_MM = Number((LABEL_HEIGHT_MM * TARGET_LABEL_RATIO).toFixed(2));
const SIDE_MARGIN_MM = Number(((PAGE_WIDTH_MM - COLUMNS * LABEL_WIDTH_MM - (COLUMNS - 1) * LABEL_GAP_MM) / 2).toFixed(3));

const A6_LAYOUT = Object.freeze({
  pageWidthMm: PAGE_WIDTH_MM,
  pageHeightMm: PAGE_HEIGHT_MM,
  columns: COLUMNS,
  rows: ROWS,
  labelsPerPage: COLUMNS * ROWS,
  gapMm: LABEL_GAP_MM,
  verticalMarginMm: VERTICAL_MARGIN_MM,
  sideMarginMm: SIDE_MARGIN_MM,
  labelWidthMm: LABEL_WIDTH_MM,
  labelHeightMm: LABEL_HEIGHT_MM,
});

const CODE128_OPTIONS = Object.freeze({
  format: 'CODE128',
  displayValue: false,
  width: 1,
  height: 60,
  margin: 0,
  marginLeft: 10,
  marginRight: 10,
  lineColor: '#000000',
  background: '#ffffff',
});

function getBarcodeValue(item = {}) {
  const candidates = [
    item.barcode_value,
    item.variant_barcode,
    item.variant_sku,
    item.barcode,
    item.product_barcode,
    item.product_sku,
    item.sku,
  ];
  const value = candidates.find((candidate) => candidate !== null && candidate !== undefined && String(candidate).trim());
  return value === undefined ? '' : String(value).trim();
}

function copyCount(item = {}) {
  const value = item.copies === undefined ? 1 : Number(item.copies);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(99, Math.trunc(value)));
}

function barcodeItemKey(item = {}) {
  return `${item.product_id}-${item.variant_id || 0}`;
}

function countBarcodeLabels(items = []) {
  return items.reduce((total, item) => total + copyCount(item), 0);
}

function getSelectedBarcodeItems(currentItems = [], selections = {}) {
  const currentItemsByKey = new Map(currentItems.map((item) => [barcodeItemKey(item), item]));

  return Object.entries(selections).flatMap(([key, selection]) => {
    const copies = copyCount(selection);
    if (!copies) return [];

    const item = currentItemsByKey.get(key) || selection.item;
    if (!item) return [];
    return [{ ...item, copies, barcode_value: getBarcodeValue(item) }];
  });
}

function getFirstLabelPage(items = []) {
  const firstPage = [];
  for (const item of items) {
    const copies = copyCount(item);
    if (!copies) continue;

    const barcodeValue = getBarcodeValue(item);
    if (!barcodeValue) throw new Error('Produk ini belum memiliki barcode atau SKU untuk dicetak.');
    const label = { ...item, barcode_value: barcodeValue };
    for (let copy = 0; copy < copies && firstPage.length < A6_LAYOUT.labelsPerPage; copy += 1) {
      firstPage.push(label);
    }
    if (firstPage.length === A6_LAYOUT.labelsPerPage) break;
  }
  return firstPage;
}

function getLabelPages(items = []) {
  const pages = [];
  let page = [];

  for (const item of items) {
    const copies = copyCount(item);
    if (!copies) continue;

    const barcodeValue = getBarcodeValue(item);
    if (!barcodeValue) throw new Error('Produk ini belum memiliki barcode atau SKU untuk dicetak.');
    const label = { ...item, barcode_value: barcodeValue };

    for (let copy = 0; copy < copies; copy += 1) {
      page.push(label);
      if (page.length === A6_LAYOUT.labelsPerPage) {
        pages.push(page);
        page = [];
      }
    }
  }

  if (page.length) pages.push(page);
  return pages;
}

function validateLabelPages(pages) {
  const checked = new Set();

  for (const page of pages) {
    for (const item of page) {
      if (checked.has(item.barcode_value)) continue;
      checked.add(item.barcode_value);
      try {
        JsBarcode({}, item.barcode_value, { ...CODE128_OPTIONS });
      } catch {
        throw new Error(`Nilai barcode atau SKU "${item.barcode_value}" tidak dapat dibuat sebagai CODE128.`);
      }
    }
  }

  return true;
}

function validateBarcodeItems(items = []) {
  return validateLabelPages(getLabelPages(items));
}

function mm(value) {
  return `${Number(value.toFixed(3))}mm`;
}

function createA6PrintCss() {
  const columns = `repeat(${A6_LAYOUT.columns}, ${mm(A6_LAYOUT.labelWidthMm)})`;
  const rows = `repeat(${A6_LAYOUT.rows}, ${mm(A6_LAYOUT.labelHeightMm)})`;

  return `
    @page { size: ${A6_LAYOUT.pageWidthMm}mm ${A6_LAYOUT.pageHeightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: ${A6_LAYOUT.pageWidthMm}mm; margin: 0; padding: 0; }
    body { background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .barcode-sheet {
      display: grid;
      grid-template-columns: ${columns};
      grid-template-rows: ${rows};
      column-gap: ${A6_LAYOUT.gapMm}mm;
      row-gap: ${A6_LAYOUT.gapMm}mm;
      width: ${A6_LAYOUT.pageWidthMm}mm;
      height: ${A6_LAYOUT.pageHeightMm}mm;
      margin: 0;
      padding: ${A6_LAYOUT.verticalMarginMm}mm ${mm(A6_LAYOUT.sideMarginMm)};
      overflow: hidden;
      break-after: page;
      page-break-after: always;
    }
    .barcode-sheet:last-child { break-after: auto; page-break-after: auto; }
    .barcode-label {
      display: grid;
      grid-template-rows: 2.8mm minmax(0, 1fr) 2.1mm;
      gap: .25mm;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      padding: .55mm .7mm;
      border: .15mm solid #d1d1d1;
      border-radius: 1mm;
      background: #fff;
      color: #000;
    }
    .barcode-label__heading {
      display: grid;
      grid-template-columns: minmax(0, 1fr) .15mm auto;
      align-items: center;
      gap: .6mm;
      min-width: 0;
      white-space: nowrap;
    }
    .barcode-label__name, .barcode-label__price {
      overflow: hidden;
      color: #000;
      font-weight: 700;
      line-height: 1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .barcode-label__name { font-size: 6pt; }
    .barcode-label__divider { width: .15mm; height: 72%; background: #777; }
    .barcode-label__price { max-width: 11.5mm; font-size: 4.8pt; text-align: right; }
    .barcode-label__barcode { display: block; align-self: center; width: 100%; height: auto; max-height: 7.4mm; overflow: visible; shape-rendering: crispEdges; }
    .barcode-label__value { display: block; overflow: hidden; color: #000; font-size: 5.1pt; line-height: 1; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
    @media screen {
      body { width: auto; padding: 12px 0; background: #f1f2f3; }
      .barcode-sheet { margin: 12px auto; background: #fff; }
    }
    @media print {
      html, body { width: ${A6_LAYOUT.pageWidthMm}mm; margin: 0; padding: 0; }
      .barcode-sheet { margin: 0; }
    }
  `;
}

function appendLabel(documentRef, sheet, item, barcodeRenderer, barcodeTemplates) {
  const label = documentRef.createElement('article');
  label.className = 'barcode-label';

  const header = documentRef.createElement('header');
  header.className = 'barcode-label__heading';

  const name = documentRef.createElement('strong');
  name.className = 'barcode-label__name';
  name.textContent = String(item.name || item.product_name || item.product_sku || item.sku || item.barcode_value);

  const divider = documentRef.createElement('span');
  divider.className = 'barcode-label__divider';
  divider.setAttribute('aria-hidden', 'true');

  const price = documentRef.createElement('b');
  price.className = 'barcode-label__price';
  price.textContent = `Rp ${Number(item.price || 0).toLocaleString('id-ID')}`;
  header.append(name, divider, price);

  let barcodeTemplate = barcodeTemplates.get(item.barcode_value);
  if (!barcodeTemplate) {
    barcodeTemplate = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg');
    barcodeTemplate.classList.add('barcode-label__barcode');
    barcodeTemplate.setAttribute('role', 'img');
    barcodeTemplate.setAttribute('aria-label', `Barcode ${item.barcode_value}`);
    barcodeRenderer(barcodeTemplate, item.barcode_value, { ...CODE128_OPTIONS });
    barcodeTemplates.set(item.barcode_value, barcodeTemplate);
  }
  const barcode = barcodeTemplate.cloneNode(true);

  const value = documentRef.createElement('small');
  value.className = 'barcode-label__value';
  value.textContent = item.barcode_value;

  label.append(header, barcode, value);
  sheet.append(label);
}

// Isolating print output keeps global A4/report/receipt rules from resizing A6 labels.
function printBarcodeItems(items, windowRef = globalThis.window, barcodeRenderer = JsBarcode) {
  const pages = getLabelPages(items);
  if (!pages.length) throw new Error('Pilih minimal satu label sebelum mencetak.');
  validateLabelPages(pages);

  const printWindow = windowRef.open('', '_blank');
  if (!printWindow) throw new Error('Pop-up cetak diblokir. Izinkan pop-up untuk halaman Anyostore, lalu coba lagi.');

  try {
    printWindow.opener = null;
    const documentRef = printWindow.document;
    documentRef.title = 'Cetak Barcode A6';
    documentRef.documentElement.lang = 'id';

    const viewport = documentRef.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1';
    documentRef.head.append(viewport);

    const style = documentRef.createElement('style');
    style.textContent = createA6PrintCss();
    documentRef.head.append(style);
    documentRef.body.replaceChildren();

    const barcodeTemplates = new Map();
    pages.forEach((itemsForPage, pageIndex) => {
      const sheet = documentRef.createElement('main');
      sheet.className = 'barcode-sheet';
      sheet.setAttribute('aria-label', `Lembar A6 ${pageIndex + 1}`);
      itemsForPage.forEach((item) => appendLabel(documentRef, sheet, item, barcodeRenderer, barcodeTemplates));
      documentRef.body.append(sheet);
    });

    const openPrintDialog = () => {
      printWindow.focus();
      printWindow.print();
    };
    if (typeof printWindow.requestAnimationFrame === 'function') {
      printWindow.requestAnimationFrame(openPrintDialog);
    } else {
      windowRef.setTimeout(openPrintDialog, 50);
    }
    return { labelCount: countBarcodeLabels(items), pageCount: pages.length };
  } catch (error) {
    printWindow.close();
    throw new Error(`Lembar barcode gagal disiapkan: ${error?.message || 'periksa nilai barcode produk.'}`);
  }
}

module.exports = {
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
};
