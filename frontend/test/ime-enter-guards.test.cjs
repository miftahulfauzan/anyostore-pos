const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const mutations = read('app/inventory/mutations/page.js');
const stockView = read('app/inventory/stock-view.js');
const history = read('app/history/page.js');
const layout = read('app/layout.js');

// Temuan Modern Web Guidance: handler Enter pada input harus mengabaikan
// komposisi IME (Jepang/China/Korea), kalau tidak karakter terpotong saat
// dikonfirmasi.
test('dialog qty: Enter tidak men-submit saat IME sedang mengompisis', () => {
  assert.match(
    mutations,
    /if \(e\.key === 'Enter' && !e\.isComposing\) \{ e\.preventDefault\(\); confirmQuantity\(\); \}/,
  );
});

test('edit posisi rak: Enter tidak menyimpan saat IME sedang mengompisis', () => {
  assert.match(
    stockView,
    /if \(event\.key === 'Enter' && !event\.isComposing\) \{ event\.preventDefault\(\); saveRackPosition\(product, warehouse\); \}/,
  );
});

test('pencarian riwayat: Enter tidak memfilter saat IME sedang mengompisis', () => {
  assert.match(
    history,
    /if \(e\.key === 'Enter' && !e\.isComposing\) \{ e\.preventDefault\(\); applyFilter\(\); \}/,
  );
});

test('kartu transaksi: Enter pada role=button juga menghormati IME', () => {
  assert.match(
    history,
    /if \(\(e\.key === 'Enter' && !e\.isComposing\) \|\| e\.key === ' '\)/,
  );
});

test('layout menyatakan color-scheme agar kontrol native ikut tema', () => {
  assert.match(layout, /other: \{ 'color-scheme': 'light dark' \}/);
});