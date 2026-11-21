const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'app', file), 'utf8');
const pos = read('pos/page.js');
const css = read('globals.css');
const invoice = read('lib/invoice-image.js');

test('POS menampilkan pemilih pelanggan tanpa membuka panel Opsi', () => {
  assert.match(pos, /className="pos-customer-row"/);
  assert.match(pos, /pos-customer-add/);
  assert.match(pos, /Umum \(tanpa pelanggan\)/);
  // Tidak ada lagi chip pelanggan lama / select ganda di panel opsi.
  assert.doesNotMatch(pos, /pos-cart-customer/);
  const optionsBlock = pos.slice(pos.indexOf('pos-cart-options'), pos.indexOf('pos-notes-field'));
  assert.doesNotMatch(optionsBlock, /pos-customer-select/);
});

test('tombol Opsi juga bisa dibuka di desktop', () => {
  assert.match(css, /\.cart-actions-toggle\s*\{[^}]*display:\s*inline-grid/s);
  assert.doesNotMatch(css, /\.cart-back-button,\n\.cart-actions-toggle\s*\{\s*display:\s*none/s);
});

test('catatan ikut dikirim ke invoice share dan digambar', () => {
  assert.match(pos, /notes: notes\.trim\(\)/);
  assert.match(invoice, /payload\.notes/);
  assert.match(invoice, /drawSpacedText\(ctx, 'CATATAN'/);
  assert.match(invoice, /slice\(0, 4\)/);
});