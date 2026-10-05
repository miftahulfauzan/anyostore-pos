const test = require('node:test');
const assert = require('node:assert/strict');
const {
  selectTransferDefaults,
  selectTransferSourceWarehouses,
} = require('../app/inventory/transfers/transfer-defaults.cjs');

test('admin gudang dapat memilih gudang asal lintas cabang yang diizinkan API', () => {
  const warehouses = [
    { id: 20, branch_id: 7, name: 'Gudang Utama' },
    { id: 30, branch_id: 8, name: 'Rak Riject' },
    { id: 31, branch_id: 9, name: 'Riject Perbaikan' },
  ];

  const result = selectTransferSourceWarehouses({
    role: 'gudang',
    activeBranchId: 'all',
    warehouses,
  });

  assert.deepEqual(result, warehouses);
});

test('pilihan sumber Owner tetap mengikuti cabang aktif dan agregat menampilkan semua gudang', () => {
  const warehouses = [
    { id: 20, branch_id: 7 },
    { id: 30, branch_id: 8 },
  ];

  assert.deepEqual(
    selectTransferSourceWarehouses({ role: 'owner', activeBranchId: '8', warehouses }),
    [warehouses[1]],
  );
  assert.deepEqual(
    selectTransferSourceWarehouses({ role: 'owner', activeBranchId: 'all', warehouses }),
    warehouses,
  );
});

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
