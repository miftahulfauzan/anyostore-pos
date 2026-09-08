const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canTransferAcrossBranches,
  normalizeProductName,
  selectCanonicalProductByName,
} = require('../src/transfer-rules');

test('owner dan admin gudang boleh memilih gudang lintas cabang', () => {
  assert.equal(canTransferAcrossBranches('owner'), true);
  assert.equal(canTransferAcrossBranches('gudang'), true);
  assert.equal(canTransferAcrossBranches('admin'), false);
  assert.equal(canTransferAcrossBranches('kasir'), false);
});

test('nama produk dinormalisasi untuk pencocokan lintas katalog', () => {
  assert.equal(normalizeProductName('  AB12   Bordir '), 'AB12 BORDIR');
  assert.equal(normalizeProductName(null), '');
});

test('produk tujuan dipilih berdasarkan nama jika tepat satu yang cocok', () => {
  const result = selectCanonicalProductByName([
    { id: 10, name: 'AB12 BORDIR' },
    { id: 11, name: 'AT67' },
  ], ' ab12   bordir ');
  assert.deepEqual(result, { product: { id: 10, name: 'AB12 BORDIR' }, ambiguous: false, duplicates: [] });
});

test('pencocokan nama memilih katalog canonical saat ada duplikat clone', () => {
  const result = selectCanonicalProductByName([
    { id: 11, name: 'AT67', sku: 'B7-AT67-2' },
    { id: 10, name: ' AT67 ', sku: 'B7-B4-AT67-2' },
  ], 'AT67');
  assert.deepEqual(result, {
    product: { id: 10, name: ' AT67 ', sku: 'B7-B4-AT67-2' },
    ambiguous: false,
    duplicates: [{ id: 11, name: 'AT67', sku: 'B7-AT67-2' }],
  });
});
