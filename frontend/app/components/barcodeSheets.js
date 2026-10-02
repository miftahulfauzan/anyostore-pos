export function splitBarcodeLabels(labels, labelsPerSheet = 24) {
  const sheets = [];
  for (let index = 0; index < labels.length; index += labelsPerSheet) {
    sheets.push(labels.slice(index, index + labelsPerSheet));
  }
  return sheets;
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
