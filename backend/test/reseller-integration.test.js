const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('omzet laporan mengecualikan ongkir, penutupan kas tetap memakai uang diterima', () => {
  const reports = read('src/routes/reports.js');
  const dashboard = read('src/routes/dashboard.js');

  // Omzet transaksi: grand_total dikurangi ongkir lebih dulu.
  for (const [name, source] of [['reports.js', reports], ['dashboard.js', dashboard]]) {
    assert.match(
      source,
      /SUM\(GREATEST\([a-z.]*grand_total - [a-z.]*cancelled_amount - [a-z.]*refunded_amount - COALESCE\([a-z.]*shipping_cost, 0\), 0\)\)/,
      `${name}: omzet transaksi wajib mengurangi ongkir`,
    );
  }

  // Omzet per produk/kategori memakai porsi grand_total setelah ongkir.
  assert.match(reports, /\(t\.grand_total - COALESCE\(t\.shipping_cost, 0\)\) \/ NULLIF\(t\.subtotal, 0\)/);

  // Pembayaran per metode tetap jumlah uang yang diterima (termasuk ongkir).
  assert.match(reports, /COALESCE\(SUM\(tp\.amount\), 0\) AS sales/);

  // Penutupan (uang di laci kas) tetap total bruto termasuk ongkir.
  const closingLine = reports.split('\n').find((line) => /AS total_sales/.test(line));
  assert.ok(closingLine, 'query penutupan harus ada');
  assert.doesNotMatch(closingLine, /shipping_cost/, 'penutupan kas tidak boleh mengurangi ongkir');
});

test('setelan pembayaran reseller diizinkan di API setelan', () => {
  const settings = read('src/routes/settings.js');
  for (const key of ['payment_bank_accounts', 'payment_qris_image', 'payment_note']) {
    assert.ok(settings.includes(key), `key ${key} harus ada di daftar allowed`);
  }
  assert.match(settings, /payment_qris/);
});

test('router reseller dan admin reseller terpasang di app', () => {
  const app = read('src/app.js');
  assert.match(app, /app\.use\('\/api\/reseller', resellerRouter\)/);
  assert.match(app, /app\.use\('\/api\/reseller-admin', resellerAdminRouter\)/);
});

test('migrasi reseller membuat tabel dan kolom yang dibutuhkan', () => {
  const accounts = read('migrations/20261115_reseller_accounts.sql');
  const orders = read('migrations/20261115_reseller_orders.sql');
  const shipping = read('migrations/20261115_transaction_shipping_cost.sql');

  assert.match(accounts, /CREATE TABLE IF NOT EXISTS reseller_accounts/);
  assert.match(accounts, /CREATE TABLE IF NOT EXISTS reseller_sessions/);
  assert.match(accounts, /CREATE TABLE IF NOT EXISTS customer_addresses/);

  assert.match(orders, /CREATE TABLE IF NOT EXISTS reseller_orders/);
  assert.match(orders, /CREATE TABLE IF NOT EXISTS reseller_order_items/);
  assert.match(orders, /public_token CHAR\(32\) NOT NULL/);
  assert.match(orders, /UNIQUE KEY uq_reseller_orders_client \(client_order_id\)/);

  assert.match(shipping, /ALTER TABLE transactions ADD COLUMN shipping_cost/);
});

test('checkout reseller tidak menerapkan minimum order (aturan hanya untuk landing utama)', () => {
  const reseller = read('src/routes/reseller.js');
  assert.doesNotMatch(reseller, /min_order_qty/, 'endpoint reseller tidak boleh memakai min_order_qty');
});