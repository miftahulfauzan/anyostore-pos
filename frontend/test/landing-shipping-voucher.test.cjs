const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const landing = read('app/LandingClient.js');
const settings = read('app/settings/page.js');
const promotions = read('app/promotions/page.js');
const productNew = read('app/products/new/page.js');

test('keranjang landing punya alamat, cek ongkir, dan voucher', () => {
  assert.match(landing, /shipping-rates\?branch_id=/);
  assert.match(landing, /Pilih kota\/kecamatan \(cek ongkir\)/);
  assert.match(landing, /Kode voucher/);
  assert.match(landing, /public\/voucher/);
  // Total akhir = subtotal - voucher + ongkir
  assert.match(landing, /const grandTotal = Math\.max\(0, cartTotal - voucherDiscount\) \+ shippingCost;/);
  // Ongkir per kg dibulatkan ke atas per kg bila tarif per kg diisi.
  assert.match(landing, /Math\.ceil\(Math\.max\(cartWeightGram, 1\) \/ 1000\) \* Number\(selectedRate\.cost_per_kg\)/);
  // Pesanan WhatsApp memuat alamat & rincian biaya.
  assert.match(landing, /Alamat: \$\{buyer\.address\.trim\(\)\}/);
  assert.match(landing, /Ongkir \(\$\{shippingArea\}\): \$\{fmtRp\(shippingCost\)\}/);
});

test('pengaturan punya bagian tarif ongkir per cabang', () => {
  assert.match(settings, /Ongkir landing \(per kota\)/);
  assert.match(settings, /settings\/shipping-rates/);
  assert.match(settings, /Tarif per kg \(Rp\)/);
});

test('menu Promo & Voucher bisa membuat voucher untuk cabang tertentu', () => {
  assert.match(promotions, /Promo & Voucher/);
  assert.match(promotions, /Berlaku di toko/);
  assert.match(promotions, /branch_id: Number\(branch\)/);
  assert.match(promotions, /method: 'DELETE'/);
});

test('form produk baru punya kolom berat', () => {
  assert.match(productNew, /Berat \(gram\)/);
  assert.match(productNew, /weight_gram: Number\(form\.weight_gram \|\| 0\)/);
});
