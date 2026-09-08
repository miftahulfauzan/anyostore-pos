const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, numberOrZero } = require('../scripts/import-products-from-csv');

test('parseCsv membaca BOM, koma dalam tanda kutip, dan stok kosong', () => {
  const rows = parseCsv('\uFEFFSKU,Nama Produk,Stok\n"A1","KEMEJA, DENIM",""\n');
  assert.deepEqual(rows, [{ SKU: 'A1', 'Nama Produk': 'KEMEJA, DENIM', Stok: '' }]);
  assert.equal(numberOrZero(rows[0].Stok), 0);
});

test('numberOrZero menolak nilai negatif dan pecahan stok', () => {
  assert.equal(numberOrZero('-2'), 0);
  assert.equal(numberOrZero('12.8'), 12);
});
