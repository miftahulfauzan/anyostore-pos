const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DB_HOST = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const settingsSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'settings.js'),
  'utf8',
);
const printerSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'printer.js'),
  'utf8',
);
const receiptDataSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'receipt-data.js'),
  'utf8',
);
const settingsRouter = require('../src/routes/settings');

function logoDeleteRoute() {
  const layer = settingsRouter.stack.find((item) =>
    item.route?.path === '/logo' && item.route.methods.delete);
  assert.ok(layer, 'DELETE /settings/logo harus ada');
  return layer.route;
}

test('field kontak kepala nota yang tidak pernah tercetak sudah dibuang', () => {
  // receipt_contacts dulu tersimpan tetapi tidak dipakai receipt-lines;
  // sekarang tidak diterima lagi supaya tidak ada isian yang sia-sia.
  assert.doesNotMatch(settingsSource, /receipt_contacts/);
  assert.doesNotMatch(printerSource, /receipt_contacts/);
});

test('hapus logo invoice (dan QRIS) tersedia untuk pengelola toko', () => {
  const route = logoDeleteRoute();
  const routeSource = settingsSource.slice(settingsSource.indexOf("router.delete('/logo'"));
  assert.match(settingsSource, /router\.delete\('\/logo', authorize\('owner','manager','admin'\)/);
  assert.match(routeSource, /\['invoice_logo', 'payment_qris_image'\]\.includes\(key\)/);
  assert.match(routeSource, /invoice_logo/);
  assert.match(routeSource, /DELETE FROM store_settings/);
  assert.match(routeSource, /const oldPath = previous\[0\]\?\.value/);
  assert.match(routeSource, /removeMedia\(oldPath\)/);
  assert.ok(route.stack.length >= 2, 'middleware otorisasi dan handler harus ada');
});

test('payload struk memuat seluruh setelan cabang kecuali rahasia', () => {
  // Setelan struk diambil di receipt-data.js dan dipakai bersama oleh cetak
  // thermal, halaman resi web, dan pratinjau template.
  assert.match(receiptDataSource, /FROM store_settings WHERE branch_id = \?/);
  assert.match(receiptDataSource, /NOT IN \('daily_email_api_key','rajaongkir_api_key'/);
  assert.match(receiptDataSource, /lines: layout\.lines/);
  assert.match(printerSource, /loadReceiptPayload/);
});
