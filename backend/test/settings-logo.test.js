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
const settingsRouter = require('../src/routes/settings');

function logoDeleteRoute() {
  const layer = settingsRouter.stack.find((item) =>
    item.route?.path === '/logo' && item.route.methods.delete);
  assert.ok(layer, 'DELETE /settings/logo harus ada');
  return layer.route;
}

test('settings menerima catatan kontak kepala nota', () => {
  assert.match(settingsSource, /receipt_contacts/);
});

test('hapus logo invoice tersedia untuk pengelola toko', () => {
  const route = logoDeleteRoute();
  const routeSource = settingsSource.slice(settingsSource.indexOf("router.delete('/logo'"));
  assert.match(settingsSource, /router\.delete\('\/logo', authorize\('owner','manager','admin'\)/);
  assert.match(routeSource, /key !== 'invoice_logo'/);
  assert.match(routeSource, /invoice_logo/);
  assert.match(routeSource, /DELETE FROM store_settings/);
  assert.match(routeSource, /const oldPath = previous\[0\]\?\.value/);
  assert.match(routeSource, /removeMedia\(oldPath\)/);
  assert.ok(route.stack.length >= 2, 'middleware otorisasi dan handler harus ada');
});

test('payload struk memuat kontak kepala nota', () => {
  assert.match(printerSource, /receipt_contacts/);
});
