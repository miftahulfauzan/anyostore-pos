const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Fitur loyalitas poin DIHAPUS 2026-11-24 (belum dipakai: tidak pernah ada
// jalur earn/redeem). Test ini menjaga agar permukaan yang sudah dibuang tidak
// muncul lagi tanpa sengaja, termasuk setelan yang bisa disimpan ke DB.
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const backendSettings = read('backend/src/routes/settings.js');
const backendCustomers = read('backend/src/routes/customers.js');
const schema = read('backend/schema.sql');
const migration = read('backend/migrations/20261124_remove_loyalty_points.sql');

const webSettings = read('frontend/app/settings/page.js');
const branchCompare = read('frontend/app/settings/branch-compare/page.js');
const storeSettings = read('frontend/app/store-settings/page.js');

test('setelan loyalitas tidak bisa lagi disimpan lewat API', () => {
  assert.doesNotMatch(backendSettings, /loyalty_enabled/);
  assert.doesNotMatch(backendSettings, /loyalty_points_rate/);
  assert.doesNotMatch(backendSettings, /loyalty_points_value/);
});

test('pelanggan tidak lagi membawa kolom loyalty_points', () => {
  assert.doesNotMatch(backendCustomers, /loyalty_points/);
  assert.doesNotMatch(schema, /loyalty_points/);
});

test('tidak ada UI loyalitas yang tersisa di web', () => {
  for (const source of [webSettings, branchCompare, storeSettings]) {
    assert.doesNotMatch(source, /loyalty/i);
  }
});

test('migrasi penghapusan bersifat kondisional sehingga aman di DB lama dan baru', () => {
  // Kolom dihapus hanya bila ada; tabel dihapus dengan IF EXISTS.
  assert.match(migration, /INFORMATION_SCHEMA\.COLUMNS/);
  assert.match(migration, /DROP COLUMN loyalty_points/);
  assert.match(migration, /DROP TABLE IF EXISTS loyalty_points/);
  // Setelan lama ikut dibersihkan.
  assert.match(migration, /DELETE FROM store_settings/);
  assert.match(migration, /loyalty_enabled/);
});