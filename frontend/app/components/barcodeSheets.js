export function splitBarcodeLabels(labels, labelsPerSheet = 24) {
  const pageCapacity = Math.max(1, Math.floor(Number(labelsPerSheet) || 24));
  const sheets = [];
  for (let index = 0; index < labels.length; index += pageCapacity) {
    sheets.push(labels.slice(index, index + pageCapacity));
  }
  return sheets;
}

export function barcodeItemKey(item) {
  return item.product_id + '-' + (item.variant_id || 0);
}

export function getBarcodeCopies(selection, item) {
  return selection.find((entry) => entry.key === barcodeItemKey(item))?.copies ?? 0;
}

export function updateBarcodeSelection(selection, item, rawCopies) {
  const copies = rawCopies === ''
    ? ''
    : Math.max(0, Math.min(99, Math.floor(Number(rawCopies) || 0)));
  const key = barcodeItemKey(item);
  const entry = { key, item, copies };
  const index = selection.findIndex((selected) => selected.key === key);

  if (index === -1) return [...selection, entry];
  return selection.map((selected, selectedIndex) => selectedIndex === index ? entry : selected);
}

export function selectedBarcodeLabels(selection) {
  return selection.flatMap(({ item, copies }) =>
    Array.from({ length: Math.max(0, Math.min(99, Number(copies) || 0)) }, () => item),
  );
}

export function summarizeBarcodeSelection(selection, labelsPerSheet = 24) {
  const active = selection.filter(({ copies }) => Number(copies) > 0);
  const totalLabels = active.reduce((sum, { copies }) => sum + Math.min(99, Math.floor(Number(copies) || 0)), 0);
  const pageCapacity = Math.max(1, Math.floor(Number(labelsPerSheet) || 24));

  return {
    productCount: active.length,
    totalLabels,
    sheetCount: Math.ceil(totalLabels / pageCapacity),
  };
}

export function printBarcodeLabels() {
  const pageStyle = document.createElement('style');
  pageStyle.dataset.barcodePrintPage = 'a6';
  pageStyle.textContent = '@page { size: A6 portrait; margin: 0; }';
  document.head.appendChild(pageStyle);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    pageStyle.remove();
    window.removeEventListener('afterprint', cleanup);
    window.clearTimeout(cleanupTimer);
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  const cleanupTimer = window.setTimeout(cleanup, 60_000);

  try {
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}
