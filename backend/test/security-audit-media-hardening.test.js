const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regresi audit keamanan run-1, temuan needs_validation yang sudah divalidasi:
// 1) ekstensi unggahan diturunkan dari MIME terdeteksi (bukan nama klien),
// 2) /uploads menyajikan tipe media terbatas + CSP ketat tanpa script,
// 3) penggantian foto varian memakai refcount sebelum menghapus file,
// 4) migrasi membersihkan baris product_photos yatim.
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const media = read('src/media-storage.js');
const app = read('src/app.js');
const products = read('src/routes/products.js');
const caddy = fs.readFileSync(path.join(__dirname, '..', '..', 'deploy', 'Caddyfile'), 'utf8');
const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20261116_cleanup_orphan_product_photos.sql'),
  'utf8',
);

test('nama file unggahan memakai ekstensi dari MIME, bukan dari klien', () => {
  assert.match(media, /const SAFE_EXTENSIONS = \{/);
  assert.match(media, /const makeFilename = \(file\) => `\$\{Date\.now\(\)\}-\$\{crypto\.randomUUID\(\)\}\$\{extensionForMime\(file\.mimetype\)\}`/);
  // Nama dari klien hanya dipakai sebagai base name; ekstensinya dibuang.
  assert.match(media, /const baseName = suppliedName\.replace\(\/\\\.\[\^\.\]\*\$\/, ''\) \|\| 'media';/);
  assert.match(media, /const originalname = `\$\{baseName\}\$\{extensionForMime\(detectedMimetype\)\}`/);
});

test('/uploads hanya menyajikan tipe media dan menolak sisanya', () => {
  assert.match(app, /const UPLOAD_CONTENT_TYPES = \{/);
  assert.match(app, /res\.setHeader\('Content-Type', contentType \|\| 'application\/octet-stream'\)/);
  assert.match(app, /res\.setHeader\('Content-Disposition', 'attachment'\)/);
  assert.match(app, /res\.setHeader\('X-Content-Type-Options', 'nosniff'\)/);
});

test('Caddy memberi CSP tanpa script untuk /uploads', () => {
  assert.match(caddy, /handle \/uploads\/\*/);
  assert.match(caddy, /Content-Security-Policy "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'none'; script-src 'none'; frame-ancestors 'none'; sandbox"/);
});

test('ganti foto varian memakai refcount sebelum menghapus file', () => {
  const guards = products.match(/SELECT COUNT\(\*\) AS cnt FROM product_photos WHERE path = \?/g) || [];
  assert.ok(guards.length >= 3, 'media produk + dua jalur foto varian harus memakai refcount');
  assert.doesNotMatch(products, /for \(const item of previous\) await removeMedia\(item\.path\);/);
});

test('migrasi membersihkan baris product_photos yatim', () => {
  assert.match(migration, /DELETE pp FROM product_photos pp/);
  assert.match(migration, /WHERE p\.id IS NULL/);
});