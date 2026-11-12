const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const detail = read('app/produk/[id]/ProdukDetailClient.js');
const landing = read('app/LandingClient.js');
const reseller = read('app/reseller/page.js');
const publicRoute = fs.readFileSync(path.join(root, '..', 'backend', 'src', 'routes', 'public.js'), 'utf8');

test('landing reseller memakai slug cabang, bukan cabang default', () => {
  assert.match(reseller, /branchSlug="reseller"/);
  assert.match(landing, /public\/branches\?slug=/);
  assert.match(landing, /public\/settings\$\{branchQuery \? `\?\$\{branchQuery\}` : ''\}/);
});

test('detail produk mengambil setelan memakai cabang produk itu', () => {
  // Nomor WA admin di detail produk reseller pernah tertukar karena fetch
  // /public/settings tanpa branch_id (backend jatuh ke "Gudang Utama").
  assert.match(detail, /public\/products\/\$\{id\}/);
  assert.match(detail, /const scope = productData\.branch_id \? `\?branch_id=\$\{productData\.branch_id\}` : '';/);
  assert.match(detail, /public\/settings\$\{scope\}/);
  // Tidak boleh ada fetch setelan tanpa scope.
  assert.doesNotMatch(detail, /public\/settings`/);
  // Setelan diambil setelah produk diketahui (butuh branch_id-nya).
  assert.ok(
    detail.indexOf('public/products/${id}') < detail.indexOf('public/settings${scope}'),
    'produk harus dimuat lebih dulu untuk mendapat branch_id',
  );
});

test('daftar nomor WA tidak mengubah state setelan', () => {
  assert.match(detail, /const waPhones = \[\.\.\.\(settings\?\.whatsapp_numbers \|\| \[\]\)\];/);
});

test('backend tetap menyediakan fallback cabang saat branch_id kosong', () => {
  // Fallback ini yang dulu dipakai tanpa sengaja; sekarang hanya berlaku untuk
  // pemanggil yang memang tidak menyebut cabang (mis. landing utama).
  assert.match(publicRoute, /LOWER\(TRIM\(name\)\) = 'gudang utama'/);
  assert.match(publicRoute, /whatsapp_numbers: waList/);
});