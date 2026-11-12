const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app/products/page.js'), 'utf8');

// Ambil semua blok @media dengan max-width tertentu; ada beberapa blok 600px
// di berkas ini, jadi pencarian dilakukan ke seluruh kemunculan.
function mediaBlocks(maxWidth) {
  const marker = `@media (max-width: ${maxWidth}px)`;
  const blocks = [];
  let start = css.indexOf(marker);
  while (start >= 0) {
    const open = css.indexOf('{', start);
    let depth = 0;
    let end = -1;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    assert.ok(end > 0, `${marker} tidak tertutup`);
    blocks.push(css.slice(open, end + 1));
    start = css.indexOf(marker, end);
  }
  assert.ok(blocks.length, `${marker} tidak ditemukan`);
  return blocks.join('\n');
}

test('kontrol pilih produk tetap 32 px di desktop', () => {
  const base = css.slice(css.indexOf('.product-select-control {'), css.indexOf('.product-select-control input[type="checkbox"]'));
  assert.match(base, /width: 32px;/);
  assert.match(base, /height: 32px;/);
});

test('di kartu HP 3 kolom, kontrol pilih diperkecil agar tidak menutupi foto', () => {
  const mobile = mediaBlocks(600);
  // Hanya kontrol yang menempel di foto; kontrol kolom (mode daftar) tidak diubah.
  assert.match(mobile, /\.product-photo > \.product-select-control \{[^}]*width: 24px;/);
  assert.match(mobile, /\.product-photo > \.product-select-control \{[^}]*height: 24px;/);
  assert.match(mobile, /\.product-photo > \.product-select-control input\[type="checkbox"\] \{[^}]*width: 14px !important;/);
  // Area sentuh tetap 36 px (24 px + 6 px di tiap sisi) supaya mudah ditekan.
  assert.match(mobile, /\.product-photo > \.product-select-control::after \{[^}]*inset: -6px;/);
});

test('aturan pengecil berada setelah aturan dasar (kaskade menang)', () => {
  assert.ok(
    css.indexOf('.product-photo > .product-select-control {') > css.indexOf('.product-select-control {'),
    'override mobile harus ditulis setelah aturan dasar',
  );
});

test('markup memakai kelas yang sama dengan aturan CSS', () => {
  assert.match(page, /className="product-select-control"/);
  assert.match(page, /type="checkbox"/);
});