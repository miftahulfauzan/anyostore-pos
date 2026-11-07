const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = path.join(__dirname, '..', 'app');
const read = (file) => fs.readFileSync(path.join(app, file), 'utf8');

test('closing page follows shared owner branch context and renders finance totals', () => {
  const page = read('closing/page.js');
  assert.match(page, /useAppSession/);
  assert.match(page, /activeBranchId/);
  assert.match(page, /query\.set\('branch_id', activeBranchId\)/);
  assert.match(page, /Pilih satu toko/);
  assert.match(page, /data\.expenses/);
  assert.match(page, /data\.income/);
});

test('mobile POS branch selector gets a full-width row and trigger', () => {
  const styles = read('globals.css');
  assert.match(styles, /\.pos-standalone-header nav > \.branch-switcher\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(styles, /\.pos-standalone-header nav > \.branch-switcher \.branch-switcher-trigger\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/s);
});

test('finance history is a dedicated filterable page', () => {
  const page = read('expenses/page.js');
  const finance = read('finance/page.js');
  assert.doesNotMatch(page, /redirect\(/);
  assert.match(page, /DateRangePresets/);
  assert.match(page, /date_from/);
  assert.match(page, /date_to/);
  assert.match(page, /category_id/);
  assert.match(page, /payment_method/);
  assert.match(page, /search/);
  assert.match(page, /page/);
  assert.match(finance, /href="\/expenses"/);
  assert.doesNotMatch(finance, /<h2>Riwayat \{active === 'income'/);
});

test('PWA cart mirrors Android payment separation and visible transaction date', () => {
  const page = read('pos/page.js');
  assert.match(page, /paymentSheetOpen/);
  assert.match(page, /className="pos-payment-sheet"/);
  assert.match(page, /Selesaikan pembayaran/);
  assert.match(page, /className="pos-cart-date pos-transaction-date"/);
  assert.match(page, /renderPaymentControls\('pos-inline-payment'\)/);
  assert.match(page, /onClick=\{openPaymentFlow\}/);
});
