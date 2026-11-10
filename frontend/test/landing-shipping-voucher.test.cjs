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
  assert.match(landing, /Ongkir\$\{shippingLabel \? ` \(\$\{shippingLabel\}\)` : ''\}: \$\{fmtRp\(shippingCost\)\}/);
  // Minimal order bisa diatur per cabang (0 = tanpa minimum).
  assert.match(landing, /min_order_qty/);
  // Ongkir otomatis RajaOngkir: cari kecamatan + daftar layanan kurir.
  assert.match(landing, /public\/shipping\/destinations/);
  assert.match(landing, /public\/shipping\/cost/);
  // Voucher per pcs: jumlah pcs ikut divalidasi dan dihitung ulang saat keranjang berubah.
  assert.match(landing, /pcs: cartPcs/);
  assert.match(landing, /\}, \[cartTotal, cartPcs\]\);/);
});

test('setelan landing (ongkir & voucher) ada di satu halaman', () => {
  const landingSettings = read('app/landing-settings/page.js');
  const shell = read('app/components/AppShell.js');
  assert.match(shell, /href: '\/landing-settings', label: 'Landing Page'/);
  assert.match(landingSettings, /Ongkir/);
  assert.match(landingSettings, /Voucher/);
  assert.match(landingSettings, /settings\/shipping-rates/);
  assert.match(landingSettings, /promotions/);
  assert.match(landingSettings, /Produk per halaman/);
  // Tidak lagi dobel di halaman Pengaturan.
  assert.doesNotMatch(settings, /Ongkir landing \(per kota\)/);
  assert.doesNotMatch(settings, /Landing page \(grosir\)/);
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
