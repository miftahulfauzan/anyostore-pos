const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regresi aturan 2026-11-17: varian hanya pembeda gambar. Stok disimpan di
// produk (warehouse_stocks.variant_id = NULL) dan product_variants.stock tidak
// dipakai lagi.
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const stock = read('src/stock.js');
const transactions = read('src/routes/transactions.js');
const inventory = read('src/routes/inventory.js');
const inventoryControl = read('src/routes/inventory-control.js');
const publicRoutes = read('src/routes/public.js');
const products = read('src/routes/products.js');
const migration = read('migrations/20261117_variant_stock_to_product.sql');
const reconcile = read('scripts/reconcile-stock.js');
const consolidate = read('scripts/consolidate-variant-stock.js');

test('adjustStock selalu menulis saldo produk dan tidak menyentuh stok varian', () => {
  assert.match(stock, /WHERE warehouse_id = \? AND product_id = \? AND variant_id IS NULL FOR UPDATE/);
  assert.match(stock, /INSERT INTO warehouse_stocks \(warehouse_id, product_id, variant_id, quantity, revision\) VALUES \(\?, \?, NULL, \?, 1\)/);
  assert.doesNotMatch(stock, /UPDATE product_variants/);
  // Varian tetap dicatat sebagai keterangan mutasi.
  assert.match(stock, /stock_mutations[\s\S]*variant_id/);
});

test('checkout memakai stok & harga produk, bukan stok/harga varian', () => {
  assert.match(transactions, /const stockKey = String\(productId\);/);
  assert.match(transactions, /AND variant_id IS NULL FOR UPDATE/);
  assert.match(transactions, /const basePrice = money\(product\.price\);/);
  assert.doesNotMatch(transactions, /variants\[0\]\.stock/);
  assert.doesNotMatch(transactions, /variant\.price > 0/);
});

test('stok masuk/keluar & lokasi rak tidak mewajibkan varian', () => {
  assert.doesNotMatch(inventory, /wajib pilih warna/);
  assert.match(inventory, /AND variant_id IS NULL FOR UPDATE/);
  assert.match(inventory, /const variantId = null;/);
  // /stock tidak lagi membuat baris per varian.
  const stockRoute = inventory.slice(inventory.indexOf("router.get('/stock'"), inventory.indexOf("router.get('/stock-by-category'"));
  assert.doesNotMatch(stockRoute, /JOIN product_variants/);
  assert.match(stockRoute, /ws\.variant_id IS NULL/);
});

test('transfer & opname dihitung per produk', () => {
  assert.doesNotMatch(inventoryControl, /wajib pilih warna/);
  assert.match(inventoryControl, /async function balance\(c, warehouseId, productId\)/);
  assert.match(inventoryControl, /const variantId = null;\s*\n\s*const row = await balance\(c, warehouseId, item\.product_id\);/);
});

test('katalog publik menampilkan stok produk untuk semua varian', () => {
  assert.match(publicRoutes, /AND ws\.variant_id IS NULL\) AS available_stock/);
  assert.doesNotMatch(publicRoutes, /ws\.variant_id=pv\.id/);
  assert.match(publicRoutes, /available_stock: Number\(rows\[0\]\.available_stock \|\| 0\)/);
});

test('form produk tidak lagi menyimpan harga khusus varian', () => {
  assert.match(products, /price: null,/);
  assert.doesNotMatch(products, /variant\.price != null && !positiveNumber/);
});

test('migrasi menggabungkan saldo varian ke baris produk lalu menghapusnya', () => {
  assert.match(migration, /INSERT IGNORE INTO warehouse_stocks[\s\S]*SELECT DISTINCT warehouse_id, product_id, NULL/);
  assert.match(migration, /SET target\.quantity = target\.quantity \+ source\.quantity/);
  assert.match(migration, /DELETE FROM warehouse_stocks WHERE variant_id IS NOT NULL/);
  assert.match(migration, /UPDATE product_variants SET stock = 0/);
  assert.match(migration, /SET p\.stock = w\.total/);
});

test('script audit melaporkan baris stok varian dan bisa merapikannya', () => {
  assert.match(reconcile, /Baris stok per varian \(harus 0\)/);
  assert.match(reconcile, /variant_id IS NOT NULL/);
  assert.match(consolidate, /const APPLY = process.argv.includes\('--apply'\)/);
  assert.match(consolidate, /UPDATE product_variants SET stock = 0/);
});