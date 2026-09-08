const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuantity } = require('../app/inventory/mutations/mutation-quantity.cjs');

test('jumlah mutasi menerima bilangan bulat positif', () => {
  assert.equal(normalizeQuantity('12'), 12);
});

test('jumlah mutasi menolak kosong, nol, negatif, dan pecahan', () => {
  for (const value of ['', '0', '-2', '1.5', 'abc']) {
    assert.equal(normalizeQuantity(value), null, `nilai ${value} harus ditolak`);
  }
});
