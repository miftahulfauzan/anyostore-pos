const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// UI: varian hanya pembeda gambar; stok & harga selalu dari produk.
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'app', file), 'utf8');

test('POS menampilkan stok produk untuk semua varian', () => {
  const pos = read('pos/page.js');
  assert.match(pos, /const availableStock = Number\(product\.stock \|\| 0\);/);
  assert.doesNotMatch(pos, /variant_stock_total/);
  assert.doesNotMatch(pos, /variant\.stock/);
  assert.doesNotMatch(pos, /variant\.price/);
  assert.match(pos, /const price = product\.price;/);
});

test('form varian hanya warna/ukuran/foto (tanpa stok & harga khusus)', () => {
  for (const file of ['products/new/page.js', 'products/[id]/edit/page.js']) {
    const page = read(file);
    assert.doesNotMatch(page, /Harga khusus/, `${file} tidak boleh punya harga varian`);
    assert.doesNotMatch(page, /variant-stock/, `${file} tidak boleh menampilkan stok varian`);
  }
});

test('stok masuk/keluar & transfer memilih produk tanpa varian', () => {
  for (const file of ['inventory/mutations/page.js', 'inventory/transfers/page.js']) {
    const page = read(file);
    assert.doesNotMatch(page, /StockVariantPicker/, `${file} tidak memakai picker varian`);
    assert.doesNotMatch(page, /stock-picker-variant-note/, `${file} tidak memecah kartu per warna`);
    assert.match(page, /onClick=\{\(\) => (askQuantity|addToCart)\(p\)/, `${file} klik kartu langsung menambah produk`);
  }
});

test('tabel stok tidak lagi punya kolom/CSV warna', () => {
  const view = read('inventory/stock-view.js');
  assert.doesNotMatch(view, />Warna</);
  assert.doesNotMatch(view, /'Warna'/);
  assert.match(view, /const key = String\(r\.product_id\);/);
});

test('picker varian di Android memakai stok & harga produk', () => {
  const picker = fs.readFileSync(path.join(root, '..', 'mobile', 'lib', 'src', 'variant_picker.dart'), 'utf8');
  assert.match(picker, /final price = asNum\(widget\.product\['price'\]\)/);
  assert.match(picker, /final productStock = int\.tryParse\('\$\{widget\.product\['stock'\] \?\? 0\}'\)/);
  assert.doesNotMatch(picker, /sel\['stock'\]/);
});