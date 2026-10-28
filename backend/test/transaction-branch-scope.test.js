const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

const calls = [];
const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  execute: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 1 }]];
    if (sql.includes('FROM transaction_items')) return [[]];
    return [[{ id: 17, branch_id: 2 }]];
  },
  getConnection: async () => ({
    beginTransaction: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, params) => { calls.push({ sql, params }); return [[]]; },
  }),
} };
const router = require('../src/routes/transactions');
const returnsRouter = require('../src/routes/returns');
const handler = (path) => router.stack.find((layer) => layer.route?.path === path && layer.route.methods.get).route.stack.at(-1).handle;

async function invoke(path, user, query = {}, params = {}) {
  calls.length = 0;
  const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let error;
  await handler(path)({ user, query, params }, response, (cause) => { error = cause; });
  return { response, error, calls: [...calls] };
}

test('riwayat owner mengikuti cabang terpilih dan rentang tanggal', async () => {
  const result = await invoke('/', { role: 'owner', branch_id: 1 }, { branch_id: '2', date_from: '2026-10-22', date_to: '2026-10-28' });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.calls[0].params, [2, '2026-10-22', '2026-10-28']);
  assert.equal(result.response.body.data[0].branch_id, 2);
});

test('owner dapat melihat semua cabang; pegawai tetap pada cabangnya', async () => {
  const owner = await invoke('/', { role: 'owner', branch_id: 1 }, { branch_id: 'all' });
  assert.deepEqual(owner.calls[0].params, []);
  assert.doesNotMatch(owner.calls[0].sql, /t\.branch_id = \?/);
  const employee = await invoke('/', { role: 'kasir', branch_id: 1 }, { branch_id: '2' });
  assert.deepEqual(employee.calls[0].params, [1]);
  assert.match(employee.calls[0].sql, /t\.branch_id = \?/);
});

test('detail memakai cabang transaksi dan menolak ID cabang tidak valid', async () => {
  const owner = await invoke('/:id', { role: 'owner', branch_id: 1 }, { branch_id: '2' }, { id: '17' });
  assert.deepEqual(owner.calls[0].params, ['17', 2]);
  const employee = await invoke('/:id', { role: 'kasir', branch_id: 1 }, { branch_id: '2' }, { id: '17' });
  assert.deepEqual(employee.calls[0].params, ['17', 1]);
  const invalid = await invoke('/:id', { role: 'owner', branch_id: 1 }, { branch_id: 'all' }, { id: '17' });
  assert.equal(invalid.error?.status, 400);
  assert.equal(invalid.calls.length, 0);
});

test('pembatalan dan retur mencocokkan transaksi dengan cabang yang diizinkan', async () => {
  const cancel = router.stack.find((layer) => layer.route?.path === '/:id/cancel').route.stack.at(-1).handle;
  const createReturn = returnsRouter.stack.find((layer) => layer.route?.path === '/' && layer.route.methods.post).route.stack.at(-1).handle;
  for (const [user, expectedBranch] of [[{ role: 'owner', branch_id: 1 }, 2], [{ role: 'admin', branch_id: 1 }, 1]]) {
    calls.length = 0;
    await cancel({ user, params: { id: '17' }, body: { branch_id: 2, items: [{ transaction_item_id: 1, qty: 1 }] } }, {}, () => {});
    assert.deepEqual(calls[0].params, ['17', expectedBranch]);
    calls.length = 0;
    await createReturn({ user, body: { branch_id: 2, transaction_id: 17, items: [{ transaction_item_id: 1, quantity: 1 }] } }, {}, () => {});
    assert.deepEqual(calls[0].params, [17, expectedBranch]);
  }
});
