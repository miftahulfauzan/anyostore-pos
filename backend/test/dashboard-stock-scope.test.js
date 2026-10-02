const test = require('node:test');
const assert = require('node:assert/strict');
const { stockDashboardScope } = require('../src/dashboard-stock-scope');

test('Owner tanpa filter melihat agregat semua cabang aktif', () => {
  assert.deepEqual(stockDashboardScope({ role: 'owner', branchId: 4 }), {
    branchFilter: '',
    warehouseBranchFilter: '',
    branchParams: [],
    warehouseBranchParams: [],
    selectedBranchId: null,
  });
});

test('Owner yang memilih cabang mendapat scope cabang yang sama di semua query stok', () => {
  assert.deepEqual(stockDashboardScope({ role: 'owner', queryBranchId: '12' }), {
    branchFilter: ' AND b.id = ?',
    warehouseBranchFilter: ' AND wb.id = ?',
    branchParams: [12],
    warehouseBranchParams: [12],
    selectedBranchId: 12,
  });
});

test('manager dan admin tetap dibatasi pada cabang akunnya', () => {
  for (const role of ['manager', 'admin']) {
    const scope = stockDashboardScope({ role, branchId: 7, queryBranchId: '12' });
    assert.equal(scope.branchFilter, ' AND b.id = ?');
    assert.equal(scope.warehouseBranchFilter, ' AND wb.id = ?');
    assert.deepEqual(scope.branchParams, [7]);
    assert.deepEqual(scope.warehouseBranchParams, [7]);
    assert.equal(scope.selectedBranchId, 7);
  }
});

test('Admin gudang tetap hanya melihat cabang bertipe gudang', () => {
  const scope = stockDashboardScope({ role: 'gudang', branchId: 9, queryBranchId: '12' });
  assert.equal(scope.branchFilter, " AND b.type = 'gudang'");
  assert.equal(scope.warehouseBranchFilter, " AND wb.type = 'gudang'");
  assert.deepEqual(scope.branchParams, []);
  assert.deepEqual(scope.warehouseBranchParams, []);
});

test('role toko gagal tertutup jika identitas cabangnya tidak ada', () => {
  const scope = stockDashboardScope({ role: 'manager', queryBranchId: '12' });
  assert.equal(scope.branchFilter, ' AND 1 = 0');
  assert.equal(scope.warehouseBranchFilter, ' AND 1 = 0');
  assert.deepEqual(scope.branchParams, []);
});
