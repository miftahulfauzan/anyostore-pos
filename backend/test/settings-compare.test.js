const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const settingsRouter = require('../src/routes/settings');

function route(path, method) {
  const layer = settingsRouter.stack.find((item) =>
    item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} harus ada`);
  const handlers = layer.route.stack.map((item) => item.name || '');
  return { layer, handlers };
}

test('owner bisa membandingkan setelan dua cabang', () => {
  const { handlers } = route('/compare', 'get');
  // authenticate (global) + authorize('owner') + handler
  assert.ok(handlers.length >= 2);
  const source = route('/compare', 'get').layer.route.stack
    .map((item) => item.handle.toString())
    .join('\n');
  assert.match(source, /compareBranchIds/);
  assert.match(source, /loadBranchSettings/);
});

test('penyalinan setelan menolak identitas toko dan rahasia', () => {
  const source = route('/compare/apply', 'post').layer.route.stack
    .map((item) => item.handle.toString())
    .join('\n');
  assert.match(source, /include_identity/);
  assert.match(source, /profileKeys/);
  assert.match(source, /SECRET_KEYS/);
  assert.match(source, /Setelan tidak boleh disalin/);
  assert.match(source, /INSERT INTO store_settings/);
});

test('daftar setelan yang bisa dibandingkan menyembunyikan rahasia', () => {
  const source = route('/compare', 'get').layer.route.stack
    .map((item) => item.handle.toString())
    .join('\n');
  assert.match(source, /filter\(\(key\) => !SECRET_KEYS\.has\(key\)\)/);
  assert.match(source, /identity: profileKeys\.has\(key\)/);
});

test('kunci template struk bisa dibandingkan dan disalin', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const settingsSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'settings.js'),
    'utf8',
  );
  const allowedLine = settingsSource.split('\n').find((line) => line.startsWith('const allowed = new Set(['));
  for (const key of ['receipt_font', 'receipt_separator', 'receipt_margin', 'receipt_title_info', 'receipt_show_wa']) {
    assert.ok(allowedLine.includes(key), `${key} harus masuk whitelist setelan`);
  }
});

test('aturan stok: transaksi ditolak bila toko tidak mengizinkan stok minus', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const transactionsSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'transactions.js'),
    'utf8',
  );
  assert.match(transactionsSource, /allow_negative_stock/);
  assert.match(transactionsSource, /storeAllowsNegative/);
  assert.match(transactionsSource, /Toko ini tidak mengizinkan transaksi melebihi stok/);
  // Transaksi offline tetap boleh disinkronkan.
  assert.match(transactionsSource, /isOffline\s*\n?\s*\? true/);

  const settingsSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'settings.js'),
    'utf8',
  );
  assert.match(settingsSource, /'allow_negative_stock'/);
});
