function printableSource(selector) {
  if (typeof document === 'undefined') return null;
  const source = document.querySelector(selector);
  if (!source) return null;

  const clone = source.cloneNode(true);
  clone.querySelectorAll('script, .no-print, [data-print-ignore]').forEach((node) => node.remove());
  return clone.outerHTML;
}

function stylesheetMarkup() {
  if (typeof document === 'undefined') return '';
  return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join('');
}

function escapeTitle(value) {
  return String(value || 'Anyostore').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

export function createPrintWindow() {
  if (typeof window === 'undefined') return null;
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.alert('Izinkan pop-up browser untuk membuka tampilan cetak.');
    return null;
  }
  printWindow.opener = null;
  return printWindow;
}

export function populatePrintWindow(printWindow, {
  selector = 'main',
  title = 'Anyostore',
  autoPrint = true,
} = {}) {
  if (!printWindow || printWindow.closed) return false;
  const content = printableSource(selector);
  if (!content) {
    printWindow.close();
    return false;
  }
  const safeTitle = escapeTitle(title);

  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title>${stylesheetMarkup()}<style>
    html, body { margin: 0; min-height: 100%; background: #fff; color: #111827; }
    .print-preview-shell { min-height: 100vh; box-sizing: border-box; padding: 24px; background: #fff; }
    .print-preview-toolbar { display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin: 0 auto 16px; max-width: 1200px; }
    .print-preview-toolbar button { min-height: 40px; padding: 8px 14px; border: 1px solid #1e3a5f; border-radius: 7px; background: #1e3a5f; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    .print-preview-toolbar button.secondary { background: #fff; color: #1e3a5f; }
    .print-preview-shell .report-filter,
    .print-preview-shell .reports-android-summary,
    .print-preview-shell .report-detail-accordion[data-report-print-active="false"],
    .print-preview-shell .report-detail-actions,
    .print-preview-shell .report-detail-links .button-row { display: none !important; }
    .print-preview-shell .report-product-disclosure-body { display: block !important; }
    @media print {
      .print-preview-shell { padding: 0; }
      .print-preview-toolbar { display: none !important; }
    }
  </style></head><body><div class="print-preview-shell">${autoPrint ? '' : '<div class="print-preview-toolbar no-print"><button type="button" onclick="window.print()">Cetak / Simpan PDF</button><button type="button" class="secondary" onclick="window.close()">Tutup</button></div>'}${content}</div></body></html>`);
  printWindow.document.close();
  printWindow.document.title = title;

  if (!autoPrint) return true;

  let printed = false;
  const print = () => {
    if (printed || printWindow.closed) return;
    printed = true;
    printWindow.focus();
    printWindow.print();
  };
  printWindow.addEventListener('load', print, { once: true });
  window.setTimeout(print, 450);
  return true;
}

export function openPrintView(options = {}) {
  const printWindow = createPrintWindow();
  if (!printWindow) return false;
  window.setTimeout(() => populatePrintWindow(printWindow, options), 0);
  return true;
}
