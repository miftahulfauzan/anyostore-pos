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
  assert.match(app, /const contentType = UPLOAD_CONTENT_TYPES\[ext\] \|\| sniffMediaContentType\(filePath\)/);
  assert.match(app, /res\.setHeader\('Content-Type', contentType \|\| 'application\/octet-stream'\)/);
  assert.match(app, /res\.setHeader\('Content-Disposition', 'attachment'\)/);
  assert.match(app, /res\.setHeader\('X-Content-Type-Options', 'nosniff'\)/);
});

test('Caddy memberi CSP tanpa script khusus untuk /uploads', () => {
  // Matcher eksplisit WAJIB: blok `header` tingkat site bersifat deferred dan
  // menimpa CSP yang ditulis di dalam handle, sehingga /uploads sempat tetap
  // memakai CSP longgar ('unsafe-inline').
  assert.match(caddy, /@uploads path \/uploads\/*/);
  assert.match(caddy, /handle @uploads \{/);
  const uploadsBlock = /header @uploads \{([\s\S]*?)\n\t\}/.exec(caddy);
  assert.ok(uploadsBlock, 'blok header @uploads harus ada');
  assert.match(uploadsBlock[1], /default-src 'none'/);
  assert.match(uploadsBlock[1], /script-src 'none'/);
  assert.match(uploadsBlock[1], /frame-ancestors 'none'/);
  assert.match(uploadsBlock[1], /sandbox/);
  // Jalur non-unggah tetap memakai CSP aplikasi.
  assert.match(caddy, /@app not path \/uploads\/*/);
  const appBlock = /header @app \{([\s\S]*?)\n\t\}/.exec(caddy);
  assert.ok(appBlock, 'blok header @app harus ada');
  assert.match(appBlock[1], /script-src 'self' 'unsafe-inline'/);
  // CSP tidak boleh lagi ditulis di blok header tingkat site.
  const siteBlock = /\n\theader \{([\s\S]*?)\n\t\}/.exec(caddy);
  assert.ok(siteBlock, 'blok header site harus ada');
  assert.doesNotMatch(siteBlock[1], /Content-Security-Policy/);
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
test('berkas lama tanpa ekstensi tetap dikenali sebagai media', () => {
  // 17 baris product_photos lama tidak punya ekstensi; tanpa deteksi isi,
  // gambarnya gagal tampil karena octet-stream + nosniff.
  assert.match(app, /function sniffMediaContentType\(filePath\)/);
  for (const sig of ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']) {
    assert.match(app, new RegExp(`return '${sig}'`));
  }
});
