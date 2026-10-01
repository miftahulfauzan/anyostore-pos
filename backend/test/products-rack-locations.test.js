const test = require('node:test');
const assert = require('node:assert/strict');
const { mapRackLocationsByProduct, loadProductRackLocations } = require('../src/product-rack-locations');

test('mengelompokkan posisi rak produk dan varian menurut produk', () => {
  const grouped = mapRackLocationsByProduct([
    { product_id: 12, warehouse_id: 3, warehouse_name: 'Gudang Utama', branch_name: 'Toko A', variant_id: null, variant_color: null, variant_size: null, rack_position: ' A-01 ' },
    { product_id: 12, warehouse_id: 3, warehouse_name: 'Gudang Utama', branch_name: 'Toko A', variant_id: 7, variant_color: 'Navy', variant_size: 'M', rack_position: 'B-02' },
    { product_id: 18, warehouse_id: 4, warehouse_name: 'Gudang Reject', branch_name: 'Gudang B', variant_id: null, variant_color: null, variant_size: null, rack_position: 'C-03' },
  ]);

  assert.deepEqual(grouped.get(12), [
    { warehouse_id: 3, warehouse_name: 'Gudang Utama', branch_name: 'Toko A', variant_id: null, variant_color: null, variant_size: null, rack_position: 'A-01' },
    { warehouse_id: 3, warehouse_name: 'Gudang Utama', branch_name: 'Toko A', variant_id: 7, variant_color: 'Navy', variant_size: 'M', rack_position: 'B-02' },
  ]);
  assert.equal(grouped.get(18)[0].rack_position, 'C-03');
});

test('mengabaikan posisi rak kosong atau baris tanpa id produk valid', () => {
  const grouped = mapRackLocationsByProduct([
    { product_id: 12, warehouse_id: 3, warehouse_name: 'Gudang Utama', rack_position: '  ' },
    { product_id: null, warehouse_id: 3, warehouse_name: 'Gudang Utama', rack_position: 'A-01' },
  ]);

  assert.equal(grouped.size, 0);
});

test('memuat lokasi hanya untuk produk pada halaman dan tetap membatasi cabang gudang', async () => {
  let called = false;
  const database = {
    async execute(sql, params) {
      called = true;
      assert.match(sql, /ws\.product_id IN \(\?, \?\)/);
      assert.match(sql, /p\.branch_id = w\.branch_id/);
      assert.match(sql, /w\.is_active = TRUE/);
      assert.deepEqual(params, [12, 18]);
      return [[{ product_id: 12, warehouse_id: 3, warehouse_name: 'Gudang Utama', branch_name: 'Toko A', variant_id: null, rack_position: 'A-01' }], []];
    },
  };

  const grouped = await loadProductRackLocations(database, [{ id: 12 }, { id: 18 }, { id: 12 }]);
  assert.equal(called, true);
  assert.equal(grouped.get(12)[0].rack_position, 'A-01');
  assert.equal(grouped.has(18), false);
});

test('tidak menjalankan query lokasi jika halaman produk kosong', async () => {
  const database = { execute: async () => assert.fail('query tidak seharusnya dijalankan') };
  assert.equal((await loadProductRackLocations(database, [])).size, 0);
});
