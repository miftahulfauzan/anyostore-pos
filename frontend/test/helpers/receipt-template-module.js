// Memuat modul ESM `app/lib/receipt-template.js` sebagai teks (tanpa bundler).
const fs = require('node:fs');
const path = require('node:path');

module.exports = function loadReceiptTemplateModule() {
  const file = path.join(__dirname, '..', '..', 'app', 'lib', 'receipt-template.js');
  const source = fs.readFileSync(file, 'utf8').replace(/^export /gm, '');
  return new Function(`${source}
    return { RECEIPT_TEMPLATE_DEFAULTS, RECEIPT_SAMPLE, isOn };`)();
};