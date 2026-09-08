const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTransferLocationLabel } = require('../app/inventory/transfers/transfer-labels.cjs');

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
