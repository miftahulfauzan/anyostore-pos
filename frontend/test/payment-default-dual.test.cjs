const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const pos = read('app/pos/page.js');
const defaults = read('app/lib/payment-defaults.js');
const styles = read('app/globals.css');

test('POS memakai metode pembayaran default per toko', () => {
  assert.match(defaults, /if \(name\.includes\('BASIK'\)\) return 'transfer';/);
  assert.match(defaults, /return 'qris';/);
  assert.match(pos, /import \{ defaultPaymentMethod \} from '\.\.\/lib\/payment-defaults';/);
  assert.match(pos, /setSelectedPaymentMethods\(\[defaultPaymentMethod\(store\.name, store\.address\)\]\)/);
});

test('pindah metode tidak otomatis menjadi bayar terpisah', () => {
  // Mode bayar terpisah harus dinyalakan lewat tombol dulu.
  assert.match(pos, /const \[dualPayment, setDualPayment\] = useState\(false\);/);
  assert.match(pos, /const isSplitPayment = dualPayment && selectedPaymentMethods\.length > 1;/);
  assert.match(pos, /if \(!dualPayment\) \{/);
  assert.match(pos, /class(?:Name=\{`|Name="[^"]*)payment-option payment-dual/);
  assert.match(pos, /Bayar terpisah/);
  assert.match(styles, /\.payment-option\.payment-dual \{/);
});
