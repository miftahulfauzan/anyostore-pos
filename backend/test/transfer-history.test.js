const test = require('node:test');
const assert = require('node:assert/strict');
const {
  toTransferNumber,
  groupTransferMovements,
} = require('../src/transfer-history');

test('toTransferNumber memakai tanggal WIB dan id transfer yang stabil', () => {
  const createdAt = new Date('2026-09-08T16:00:00Z');

  assert.equal(toTransferNumber(createdAt, 7), 'TRF-20260908-0007');
});

test('groupTransferMovements memisahkan mutasi asal dan tujuan', () => {
  const grouped = groupTransferMovements([
    {
      transfer_id: 7,
      mutation_id: 101,
      product_id: 10,
      variant_id: 11,
      product_name: 'AT67',
      product_sku: 'AT67',
      variant_color: 'BIRU',
      qty: -3,
      stock_before: 20,
      stock_after: 17,
      branch_name: 'Gudang Utama',
      warehouse_name: 'Gudang Utama',
    },
    {
      transfer_id: 7,
      mutation_id: 102,
      product_id: 20,
      variant_id: 21,
      product_name: 'AT67',
      product_sku: 'B2-AT67',
      variant_color: 'BIRU',
      qty: 3,
      stock_before: 2,
      stock_after: 5,
      branch_name: 'Toko B',
      warehouse_name: 'Gudang Toko B',
    },
  ]);

  assert.deepEqual(grouped.get('7'), {
    from: [{
      id: 10,
      variant_id: 11,
      name: 'AT67',
      sku: 'AT67',
      variant_color: 'BIRU',
      qty: 3,
      stock_before: 20,
      stock_after: 17,
      branch_name: 'Gudang Utama',
      warehouse_name: 'Gudang Utama',
    }],
    to: [{
      id: 20,
      variant_id: 21,
      name: 'AT67',
      sku: 'B2-AT67',
      variant_color: 'BIRU',
      qty: 3,
      stock_before: 2,
      stock_after: 5,
      branch_name: 'Toko B',
      warehouse_name: 'Gudang Toko B',
    }],
  });
});

test('groupTransferMovements mengabaikan baris tanpa arah qty', () => {
  assert.deepEqual(
    [...groupTransferMovements([{ transfer_id: 9, qty: 0 }].map((row) => row)).entries()],
    [],
  );
});
