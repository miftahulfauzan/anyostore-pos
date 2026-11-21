const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const productsPage = read('app', 'products', 'page.js');
const categoryManager = read('app', 'components', 'CategoryManager.js');
const storeSettings = read('app', 'store-settings', 'page.js');

// Commit fe2f4ff memindahkan menu owner dari `/settings` ke `/store-settings`,
// sehingga panel kategori di `/settings` hanya tersisa untuk admin gudang dan
// petunjuk "Kategori produk diatur di halaman Produk" menunjuk ke tempat yang
// tidak punya UI kategori. Sekarang kategori dikelola dari halaman Produk.
test('halaman produk menyediakan tombol Kelola Kategori', () => {
  assert.match(productsPage, /import CategoryManager from '\.\.\/components\/CategoryManager';/);
  assert.match(productsPage, />Kelola Kategori</, 'harus ada tombol "Kelola Kategori" di header');
  assert.match(productsPage, /onClick=\{\(\) => setCategoryOpen\(true\)\}/);
});

test('modal kategori memasang CategoryManager dalam mode embedded', () => {
  assert.match(productsPage, /<CategoryManager[\s\S]*?embedded[\s\S]*?\/>/, 'CategoryManager harus dirender dengan prop embedded');
  assert.match(productsPage, /onChange=\{\(\) => setReload\(/, 'perubahan kategori harus memuat ulang daftar produk');
});

test('modal kategori bisa ditutup lewat Escape dan latar belakang', () => {
  assert.match(productsPage, /event\.key === 'Escape'[\s\S]*?setCategoryOpen\(false\)/, 'Escape harus menutup modal');
  assert.match(productsPage, /className="modal-backdrop"[\s\S]*?onClick=\{\(\) => setCategoryOpen\(false\)\}/);
  assert.match(productsPage, /role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby="category-manager-title"/);
});

test('CategoryManager embedded tidak menggandakan panel dan judul', () => {
  assert.match(categoryManager, /if \(embedded\) return body;/, 'mode embedded harus melepas pembungkus panel');
  const headings = categoryManager.match(/<h2>Kategori Produk<\/h2>/g) || [];
  assert.equal(headings.length, 1, 'judul "Kategori Produk" hanya boleh satu (dipakai mode panel /settings)');
});

test('setelan toko menunjuk tombol Kelola Kategori di halaman produk', () => {
  assert.match(storeSettings, /href="\/products"[\s\S]{0,120}Kelola Kategori/);
});