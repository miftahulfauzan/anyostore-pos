const test = require('node:test');
const assert = require('node:assert/strict');
const { formatRackLocationLabels } = require('../app/products/rack-location-labels.cjs');
const { productsQuery } = require('../app/products/catalog-state.cjs');

test('query Master Produk meminta data posisi rak, query katalog lain tidak', () => {
  const filters = { branchId: '', search: '', sort: 'name', page: 1 };
  assert.equal(productsQuery(filters, { includeRackLocations: true }).get('include_rack_locations'), '1');
  assert.equal(productsQuery(filters).has('include_rack_locations'), false);
});

test('membuat label rak yang mencantumkan gudang dan varian', () => {
  assert.deepEqual(formatRackLocationLabels([
    { branch_name: 'Toko A', warehouse_name: 'Gudang Utama', variant_color: 'Navy', variant_size: 'M', rack_position: 'B-02' },
    { branch_name: 'Toko A', warehouse_name: 'Gudang Reject', variant_color: null, variant_size: null, rack_position: 'C-03' },
  ], { includeBranchName: true }), [
    'Toko A · Gudang Utama: Navy / M · B-02',
    'Toko A · Gudang Reject: C-03',
  ]);
});

test('tidak menampilkan label untuk posisi rak kosong', () => {
  assert.deepEqual(formatRackLocationLabels([
    { warehouse_name: 'Gudang Utama', rack_position: '' },
    { warehouse_name: 'Gudang Reject', rack_position: 'A-01' },
  ]), ['Gudang Reject: A-01']);
});
