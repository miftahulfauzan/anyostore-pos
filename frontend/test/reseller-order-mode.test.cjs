const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('landing utama tetap memakai alur WhatsApp saja', () => {
  const page = read('app/page.js');
  // Tanpa prop orderMode → default 'whatsapp' di LandingClient.
  assert.doesNotMatch(page, /orderMode/);
  const landing = read('app/LandingClient.js');
  assert.match(landing, /orderMode = 'whatsapp'/);
  assert.match(landing, /const isResellerOrder = orderMode === 'reseller'/);
});

test('landing reseller mengaktifkan pesanan ke sistem', () => {
  const resellerPage = read('app/reseller/page.js');
  assert.match(resellerPage, /orderMode="reseller"/);
  const landing = read('app/LandingClient.js');
  assert.match(landing, /Kirim Pesanan ke Sistem/);
  assert.match(landing, /fetch\(`\$\{api\}\/reseller\/orders`/);
  assert.match(landing, /client_order_id: clientOrderId\.current/);
});

test('aturan minimum order hanya berlaku di landing utama', () => {
  const landing = read('app/LandingClient.js');
  assert.match(landing, /if \(isResellerOrder\) return 1;/);
});

test('info pembayaran (QRIS + rekening) hanya dirender di mode reseller', () => {
  const landing = read('app/LandingClient.js');
  assert.match(landing, /isResellerOrder && paymentInfo/);
  assert.match(landing, /qris_image/);
  assert.match(landing, /bank_accounts/);
  assert.match(landing, /reseller\/payment-info/);
});

test('middleware memetakan halaman pembeli reseller tanpa mengubah landing utama', () => {
  const middleware = read('middleware.js');
  assert.match(middleware, /BUYER_PATHS = \['\/masuk', '\/daftar', '\/akun', '\/lacak', '\/pesanan'\]/);
  assert.match(middleware, /url\.pathname = `\/reseller\$\{url\.pathname\}`/);
  // Rewrite landing utama hanya untuk root host reseller.
  assert.match(middleware, /if \(url\.pathname === '\/'\) \{/);
});

test('halaman pembeli reseller lengkap', () => {
  for (const file of [
    'app/reseller/masuk/page.js',
    'app/reseller/daftar/page.js',
    'app/reseller/akun/page.js',
    'app/reseller/lacak/page.js',
    'app/reseller/pesanan/[token]/page.js',
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} harus ada`);
  }
});