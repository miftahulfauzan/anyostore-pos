const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const migration = read('migrations/20261111_shipping_rates_product_weight.sql');
const publicRoute = read('src/routes/public.js');
const settingsRoute = read('src/routes/settings.js');
const promotionsRoute = read('src/routes/promotions.js');
const productsRoute = read('src/routes/products.js');

test('migrasi berat produk + tarif ongkir tersedia', () => {
  assert.match(migration, /ALTER TABLE products ADD COLUMN weight_gram INT NOT NULL DEFAULT 0/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS shipping_rates/);
  assert.match(migration, /cost_per_kg DECIMAL\(12,2\)/);
});

test('landing bisa cek ongkir dan validasi voucher tanpa login', () => {
  assert.match(publicRoute, /router\.get\('\/shipping-rates'/);
  assert.match(publicRoute, /FROM shipping_rates WHERE branch_id=\? AND is_active=1/);
  assert.match(publicRoute, /router\.post\('\/voucher'/);
  assert.match(publicRoute, /UPPER\(code\)=UPPER\(\?\)/);
  // Berat produk ikut dikirim ke landing supaya ongkir per kg bisa dihitung.
  assert.match(publicRoute, /p\.weight_gram/);
});

test('admin dapat mengatur tarif ongkir per cabang', () => {
  assert.match(settingsRoute, /router\.get\('\/shipping-rates'/);
  assert.match(settingsRoute, /router\.post\('\/shipping-rates'/);
  assert.match(settingsRoute, /router\.delete\('\/shipping-rates\/:id'/);
  assert.match(settingsRoute, /INSERT INTO shipping_rates/);
});

test('voucher dibuat lewat menu promo dan bisa lintas cabang untuk owner', () => {
  assert.match(promotionsRoute, /req\.user\.role==='owner'&&Number\.isInteger\(requested\)/);
  assert.match(promotionsRoute, /router\.delete\('\/:id'/);
  // Berat produk dapat diisi dari form produk.
  assert.match(productsRoute, /weight_gram/);
});

test('skrip isi berat massal tersedia dan aman dijalankan ulang', () => {
  const script = read('scripts/set-product-weight.js');
  assert.match(script, /UPDATE products SET weight_gram = \?/);
  assert.match(script, /--dry-run/);
  assert.match(script, /--branch/);
});
