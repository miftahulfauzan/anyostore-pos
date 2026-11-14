const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regresi untuk temuan audit keamanan (run-1): pastikan perbaikan tidak
// dikembalikan tanpa sengaja.
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const settings = read('src/routes/settings.js');
const reseller = read('src/routes/reseller.js');
const resellerAdmin = read('src/routes/reseller-admin.js');
const products = read('src/routes/products.js');
const backup = read('src/backup.js');

test('reseller-admin: seluruh route dibatasi owner/manager/admin', () => {
  assert.match(resellerAdmin, /router\.use\(authenticate, authorize\('owner', 'manager', 'admin'\)\)/);
});

test('settings: rajaongkir_api_key tidak pernah dikirim, hanya flag _set', () => {
  assert.match(settings, /row\.key !== 'rajaongkir_api_key'/);
  assert.match(settings, /rajaongkir_api_key_set: Boolean\(rajaongkirKey\?\.value\)/);
  // Menyimpan setelan lain (field key kosong) tidak boleh menghapus key lama.
  assert.match(settings, /key === 'rajaongkir_api_key'\) && !String\(value \|\| ''\)\.trim\(\)\) continue;/);
});

test('settings: media dari compare/apply disalin, penghapusan memakai refcount', () => {
  assert.match(settings, /const mediaKeys = new Set\(\['store_logo', 'invoice_logo', 'payment_qris_image'\]\)/);
  assert.match(settings, /value = await copyMediaFile\(value, 'logos'\)/);
  assert.match(settings, /async function mediaStillReferenced/);
  const guardCalls = settings.match(/mediaStillReferenced\(oldPath, \{ branchId: id, key/g) || [];
  assert.ok(guardCalls.length >= 3, 'tiga jalur penggantian/penghapusan media setelan harus memakai refcount');
  assert.doesNotMatch(settings, /if \(oldPath\?\.startsWith\('\/uploads\/logos\/'\)\) await removeMedia\(oldPath\);/);
});

test('backup: rajaongkir_api_key ikut diredaksi', () => {
  assert.match(backup, /sensitiveSettingKeys = new Set\(\['daily_email_api_key', 'rajaongkir_api_key'\]\)/);
});

test('reseller: registrasi tidak lagi menautkan pesanan guest berdasarkan nomor HP', () => {
  assert.doesNotMatch(reseller, /UPDATE reseller_orders SET account_id = \?, customer_id = \? WHERE account_id IS NULL/);
  assert.match(reseller, /TIDAK ditautkan otomatis/);
});

test('reseller: lookup status pesanan memakai rate limit khusus', () => {
  assert.match(reseller, /const lookupLimiter = rateLimit\(/);
  assert.match(reseller, /router\.get\('\/orders\/lookup', lookupLimiter,/);
});

test('products: branch_id=all untuk gudang dibatasi ke cabang bertipe gudang', () => {
  assert.match(products, /branchId === 'all'\s*\n\s*\? " AND p\.branch_id IN \(SELECT id FROM branches WHERE type = 'gudang' AND is_active = TRUE\)"/);
  // Sentinel lama yang menjadi OR 1=1 tidak boleh kembali.
  assert.doesNotMatch(products, /branchId === 'all' \? 1 : 0\]/);
});