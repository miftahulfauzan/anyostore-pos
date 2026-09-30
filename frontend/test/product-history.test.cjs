const test = require('node:test');
const assert = require('node:assert/strict');
const { stockHistoryLabel, stockHistoryQuery } = require('../app/products/history/history-state.cjs');

test('riwayat produk melabeli stok masuk, keluar, opname, dan transfer', () => {
  assert.equal(stockHistoryLabel({ reference_type: 'manual_incoming', type: 'purchase' }), 'Stok masuk');
  assert.equal(stockHistoryLabel({ reference_type: 'manual_outgoing', type: 'adjustment' }), 'Stok keluar');
  assert.equal(stockHistoryLabel({ reference_type: 'stock_opname', type: 'adjustment' }), 'Opname');
  assert.equal(stockHistoryLabel({ reference_type: 'inter_store_transfer', type: 'transfer_out' }), 'Transfer keluar');
  assert.equal(stockHistoryLabel({ reference_type: 'transaction', type: 'sale' }), 'Penjualan');
});

test('riwayat produk selalu memfilter product_id dan dapat membawa cabang', () => {
  assert.equal(stockHistoryQuery(17, 4).toString(), 'product_id=17&limit=200&branch_id=4');
  assert.equal(stockHistoryQuery(17, 4, 2).toString(), 'product_id=17&limit=200&branch_id=4&page=2');
});
