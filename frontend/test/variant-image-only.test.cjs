const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// UI: varian hanya pembeda gambar; stok & harga selalu dari produk.
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'app', file), 'utf8');

test('POS web menjual produk tanpa memilih varian', () => {
  const pos = read('pos/page.js');
  assert.match(pos, /const availableStock = Number\(product\.stock \|\| 0\);/);
  assert.doesNotMatch(pos, /variant_stock_total/);
  assert.doesNotMatch(pos, /variant\.stock/);
  assert.doesNotMatch(pos, /variant\.price/);
  assert.match(pos, /const price = product\.price;/);
  // Tidak ada dialog "Pilih warna" atau pemanggilan chooseProduct.
  assert.doesNotMatch(pos, /Pilih warna/);
  assert.doesNotMatch(pos, /chooseProduct/);
  assert.doesNotMatch(pos, /variantProduct/);
  assert.match(pos, /onClick=\{\(\) => addToCart\(product\)\}/);
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

test('POS Android langsung menambah produk tanpa dialog varian', () => {
  const pos = fs.readFileSync(path.join(root, '..', 'mobile', 'lib', 'src', 'pos_page.dart'), 'utf8');
  assert.doesNotMatch(pos, /VariantPicker/);
  assert.doesNotMatch(pos, /variant_picker\.dart/);
  assert.match(pos, /POS menjual produk/);
  assert.match(pos, /variantId: null,/);
  // File picker varian sudah tidak ada di repo.
  assert.equal(fs.existsSync(path.join(root, '..', 'mobile', 'lib', 'src', 'variant_picker.dart')), false);
});
