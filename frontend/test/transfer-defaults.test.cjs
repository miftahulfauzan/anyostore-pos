const test = require('node:test');
const assert = require('node:assert/strict');
const { selectTransferDefaults } = require('../app/inventory/transfers/transfer-defaults.cjs');

test('akun gudang memilih gudang utama dari cabangnya, bukan item pertama lintas cabang', () => {
  const result = selectTransferDefaults({
    role: 'gudang',
    branchId: 7,
    warehouses: [
      { id: 10, branch_id: 2, type: 'utama' },
      { id: 20, branch_id: 7, type: 'reject' },
      { id: 21, branch_id: 7, type: 'utama' },
    ],
  });

  assert.deepEqual(result, { sourceId: '21', targetId: '10' });
});

test('akun gudang memakai gudang pertama di cabangnya bila belum ada tipe utama', () => {
  const result = selectTransferDefaults({
    role: 'gudang',
    branchId: 7,
    warehouses: [
      { id: 20, branch_id: 7, type: 'reject' },
      { id: 30, branch_id: 2, type: 'utama' },
    ],
  });

  assert.deepEqual(result, { sourceId: '20', targetId: '30' });
});
