const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

process.env.DB_HOST = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const {
  TRANSFER_CANCELLATION_ROLES,
  buildTransferCancellationMovements,
  canCancelTransfer,
  validateTransferStatus,
} = require('../src/transfer-cancellation');
const router = require('../src/routes/inventory-control');

test('transfer cancellation is limited to owner and gudang', () => {
  assert.deepEqual([...TRANSFER_CANCELLATION_ROLES], ['owner', 'gudang']);

  const transfer = {
    source_branch_id: 4,
    destination_branch_id: 9,
    created_by: 77,
  };
  assert.equal(canCancelTransfer({ role: 'owner', branch_id: 1, id: 1 }, transfer), true);
  assert.equal(canCancelTransfer({ role: 'gudang', branch_id: 4, id: 1 }, transfer), true);
  assert.equal(canCancelTransfer({ role: 'gudang', branch_id: 9, id: 1 }, transfer), true);
  assert.equal(canCancelTransfer({ role: 'gudang', branch_id: 99, id: 77 }, transfer), true);
  assert.equal(canCancelTransfer({ role: 'gudang', branch_id: 99, id: 1 }, transfer), false);
  assert.equal(canCancelTransfer({ role: 'manager', branch_id: 4, id: 1 }, transfer), false);
});

test('same-branch cancellation reverses the original product in both warehouses', () => {
  const movements = buildTransferCancellationMovements(
    {
      id: 42,
      number: 'TRF-20261107-0042',
      source_branch_id: 4,
      destination_branch_id: 4,
      source_warehouse_id: 10,
      destination_warehouse_id: 11,
    },
    [{ product_id: 21, variant_id: null, destination_product_id: 21, destination_variant_id: null, quantity: 4 }],
    'Salah pilih gudang',
  );

  assert.deepEqual(movements, [
    {
      side: 'destination', branchId: 4, warehouseId: 11, productId: 21, variantId: null,
      delta: -4, type: 'adjustment', referenceType: 'transfer_cancel', referenceId: 42,
      notes: 'Pembatalan TRF-20261107-0042: Salah pilih gudang',
    },
    {
      side: 'source', branchId: 4, warehouseId: 10, productId: 21, variantId: null,
      delta: 4, type: 'adjustment', referenceType: 'transfer_cancel', referenceId: 42,
      notes: 'Pembatalan TRF-20261107-0042: Salah pilih gudang',
    },
  ]);
});

test('inter-store cancellation uses destination product and variant mappings', () => {
  const movements = buildTransferCancellationMovements(
    {
      id: 43,
      number: 'TRF-20261107-0043',
      source_branch_id: 4,
      destination_branch_id: 9,
      source_warehouse_id: 10,
      destination_warehouse_id: 20,
    },
    [{ product_id: 21, variant_id: 31, destination_product_id: 121, destination_variant_id: 131, quantity: 2 }],
  );

  assert.equal(movements[0].productId, 121);
  assert.equal(movements[0].variantId, 131);
  assert.equal(movements[0].branchId, 9);
  assert.equal(movements[0].delta, -2);
  assert.equal(movements[1].productId, 21);
  assert.equal(movements[1].variantId, 31);
  assert.equal(movements[1].branchId, 4);
  assert.equal(movements[1].delta, 2);
});

test('only completed transfers can be cancelled and cancelled repeats conflict', () => {
  assert.equal(validateTransferStatus('completed'), null);
  assert.throws(() => validateTransferStatus('cancelled'), (error) => error.status === 409);
  assert.throws(() => validateTransferStatus('pending'), (error) => error.status === 400);
});

test('cancel route exists and is protected for owner/gudang', () => {
  const layer = router.stack.find((item) =>
    item.route?.path === '/transfers/:id/cancel' && item.route.methods.post);
  assert.ok(layer, 'POST /transfers/:id/cancel harus ada');
  const middleware = layer.route.stack[0].handle;
  for (const role of ['owner', 'gudang']) {
    let nextCalled = false;
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() {} };
    middleware({ user: { role } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, `${role} boleh membatalkan transfer`);
  }
  for (const role of ['manager', 'admin', 'kasir']) {
    let nextCalled = false;
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    middleware({ user: { role } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, `${role} tidak boleh membatalkan transfer`);
    assert.equal(res.statusCode, 403);
  }
});

test('route keeps rollback guard and uses compensating mutation reference', () => {
  const source = fs.readFileSync(require.resolve('../src/routes/inventory-control'), 'utf8');
  assert.match(source, /await c\.rollback\(\)/);
  assert.match(source, /if \(after < 0\) throw fail\(400, "Stok gudang tidak mencukupi"\)/);
  assert.match(source, /transfer_cancel/);
  assert.match(source, /cancelled_by/);
});
