const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('app/reseller-orders/page.js');
const css = read('app/globals.css');

test('Pesanan Reseller memakai panel standar, bukan class card yang tidak ada', () => {
  assert.doesNotMatch(page, /className="card"/);
  assert.match(page, /className="panel"/);
  assert.match(page, /className="section-heading"/);
});

test('tabel pesanan & pembeli bisa digeser di layar sempit', () => {
  const wraps = page.match(/className="table-wrap"/g) || [];
  assert.ok(wraps.length >= 2, 'tabel pesanan, pembeli, dan rincian harus memakai table-wrap');
});

test('ringkasan dan tombol aksi dipisah dari tabel', () => {
  assert.match(page, /className="reseller-summary"/);
  assert.match(page, /className="reseller-actions"/);
  assert.match(css, /\.reseller-summary\s*\{[^}]*border-top:\s*1px solid var\(--border\)/s);
  assert.match(css, /\.reseller-actions\s*\{[^}]*border-top:\s*1px solid var\(--border\)/s);
});

test('filter dan form pengiriman memakai flex yang benar-benar terdefinisi', () => {
  assert.match(css, /\.row\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.reseller-filters\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.reseller-ship\s*\{[^}]*display:\s*flex/s);
  assert.match(page, /className="reseller-filters"/);
  assert.match(page, /className="reseller-ship"/);
});

test('detail otomatis di-scroll ke tampilan saat dibuka', () => {
  assert.match(page, /detailRef/);
  assert.match(page, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
});