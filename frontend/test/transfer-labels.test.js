const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatHistoryLocationLabel,
  formatTransferLocationLabel,
} = require('../app/inventory/transfers/transfer-labels.cjs');

test('cabang gudang memakai satu nama kanonis', () => {
  assert.equal(
    formatTransferLocationLabel({
      branch_name: 'Gudang Riject Perbaikan',
      name: 'Gudang Rijk Perbaik',
      branch_type: 'gudang',
      type: 'utama',
    }),
    'Gudang Riject Perbaikan',
  );
});

test('cabang toko tetap membedakan gudang internal', () => {
  assert.equal(
    formatTransferLocationLabel({
      branch_name: 'Anyostore Metro',
      name: 'Gudang Anyostore Metro',
      type: 'utama',
    }),
    'Anyostore Metro — Gudang Anyostore Metro (Utama)',
  );
});

test('riwayat transfer merangkum lokasi tanpa nama gudang berulang', () => {
  assert.equal(
    formatHistoryLocationLabel({
      branch_name: 'Gudang Utama',
      warehouse_name: 'Gudang Utama',
      branch_type: 'gudang',
    }),
    'Gudang Utama',
  );
  assert.equal(
    formatHistoryLocationLabel({
      branch_name: 'Anyostore Metro',
      warehouse_name: 'Gudang Anyostore Metro',
      branch_type: 'toko',
    }),
    'Anyostore Metro / Gudang Anyostore Metro',
  );
});
