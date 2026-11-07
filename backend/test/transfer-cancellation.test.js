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
const db = require('../src/db');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function cancelHandler() {
  const layer = router.stack.find((item) =>
    item.route?.path === '/transfers/:id/cancel' && item.route.methods.post);
  assert.ok(layer, 'POST /transfers/:id/cancel harus ada');
  return layer.route.stack.at(-1).handle;
}

function fakeConnection({ status = 'completed', destinationStock = 5 } = {}) {
  const stocks = new Map([
    ['10:21:null', 0],
    ['11:121:null', destinationStock],
  ]);
  const state = {
    stocks,
    began: false,
    committed: false,
    rolledBack: false,
    mutationCount: 0,
    lastBalanceKey: null,
  };
  const transfer = {
    id: 42,
    status,
    created_by: 77,
    created_at: new Date('2026-11-07T03:00:00Z'),
    source_warehouse_id: 10,
    source_branch_id: 4,
    destination_warehouse_id: 11,
    destination_branch_id: 9,
  };
  const items = [{
    product_id: 21,
    variant_id: null,
    destination_product_id: 121,
    destination_variant_id: null,
    quantity: 4,
  }];
  return {
    state,
    async beginTransaction() { state.began = true; },
    async commit() { state.committed = true; },
    async rollback() { state.rolledBack = true; },
    release() {},
    async execute(sql, params = []) {
      if (sql.includes('FROM stock_transfers st')) return [[transfer]];
      if (sql.includes('FROM stock_transfer_items')) return [items];
      if (sql.includes('CAST(revision AS CHAR)')) {
        const key = `${params[0]}:${params[1]}:${params[2] == null ? 'null' : params[2]}`;
        state.lastBalanceKey = key;
        return [[{ id: 1, quantity: state.stocks.get(key) ?? 0, revision: '0' }]];
      }
      if (sql.includes('FROM warehouse_stocks') && sql.includes('revision')) {
        const key = `${params[0]}:${params[1]}:${params[2] == null ? 'null' : params[2]}`;
        state.lastBalanceKey = key;
        return [[{ id: 1, quantity: state.stocks.get(key) ?? 0, revision: 0 }]];
      }
      if (sql.startsWith('UPDATE warehouse_stocks SET quantity')) {
        const [quantity] = params;
        state.stocks.set(state.lastBalanceKey, quantity);
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO warehouse_stocks')) return [{ insertId: 1 }];
      if (sql.startsWith('UPDATE products') || sql.startsWith('UPDATE product_variants')) return [{ affectedRows: 1 }];
      if (sql.startsWith('INSERT INTO stock_mutations')) {
        state.mutationCount += 1;
        return [{ insertId: state.mutationCount }];
      }
      if (sql.startsWith('UPDATE stock_transfers')) return [{ affectedRows: 1 }];
      if (sql.startsWith('INSERT INTO activity_logs')) return [{ insertId: 1 }];
      throw new Error(`Unexpected fake query: ${sql}`);
    },
  };
}

async function invokeCancel(connection, user = { id: 77, role: 'owner', branch_id: 4 }) {
  const original = db.getConnection;
  db.getConnection = async () => connection;
  let nextError = null;
  const res = response();
  try {
    await cancelHandler()({
      user,
      params: { id: '42' },
      body: { reason: 'Salah pilih gudang' },
      ip: 'test',
      get: () => null,
    }, res, (error) => { nextError = error; });
  } finally {
    db.getConnection = original;
  }
  return { res, nextError };
}

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

test('inter-store cancellation refuses legacy rows without destination mapping', () => {
  assert.throws(
    () => buildTransferCancellationMovements(
      {
        id: 44,
        source_branch_id: 4,
        destination_branch_id: 9,
        source_warehouse_id: 10,
        destination_warehouse_id: 20,
      },
      [{ product_id: 21, variant_id: 31, destination_product_id: null, destination_variant_id: null, quantity: 2 }],
    ),
    (error) => error.status === 400 && /mapping produk tujuan/i.test(error.message),
  );
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

test('insufficient destination stock rolls back without mutating either side', async () => {
  const connection = fakeConnection({ destinationStock: 2 });
  const result = await invokeCancel(connection);

  assert.equal(result.nextError?.status, 400);
  assert.equal(connection.state.rolledBack, true);
  assert.equal(connection.state.committed, false);
  assert.equal(connection.state.mutationCount, 0);
  assert.equal(connection.state.stocks.get('10:21:null'), 0);
  assert.equal(connection.state.stocks.get('11:121:null'), 2);
});

test('successful cancellation commits both compensating movements', async () => {
  const connection = fakeConnection({ destinationStock: 5 });
  const result = await invokeCancel(connection);

  assert.equal(result.nextError, null);
  assert.equal(result.res.body.data.status, 'cancelled');
  assert.equal(connection.state.began, true);
  assert.equal(connection.state.committed, true);
  assert.equal(connection.state.rolledBack, false);
  assert.equal(connection.state.mutationCount, 2);
  assert.equal(connection.state.stocks.get('10:21:null'), 4);
  assert.equal(connection.state.stocks.get('11:121:null'), 1);
});

test('repeated cancellation returns conflict without another mutation', async () => {
  const connection = fakeConnection({ status: 'cancelled', destinationStock: 5 });
  const result = await invokeCancel(connection);

  assert.equal(result.nextError?.status, 409);
  assert.equal(connection.state.rolledBack, true);
  assert.equal(connection.state.mutationCount, 0);
});

test('route keeps rollback guard and uses compensating mutation reference', () => {
  const source = fs.readFileSync(require.resolve('../src/routes/inventory-control'), 'utf8');
  assert.match(source, /await c\.rollback\(\)/);
  assert.match(source, /if \(after < 0\) throw fail\(400, "Stok gudang tidak mencukupi"\)/);
  assert.match(source, /transfer_cancel/);
  assert.match(source, /cancelled_by/);
});
