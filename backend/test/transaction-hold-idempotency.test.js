const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

const calls = [];
let existing = false;
const dbPath = require.resolve('../src/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT id FROM pending_transactions') && sql.includes('client_hold_id')) {
        return [existing ? [{ id: 42 }] : [], []];
      }
      if (sql.includes('UPDATE pending_transactions SET')) {
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('INSERT INTO pending_transactions')) {
        return [{ insertId: 99 }, []];
      }
      assert.fail(`Unexpected SQL: ${sql}`);
    },
  },
};

const router = require('../src/routes/transactions');
const holdHandler = router.stack
  .find((layer) => layer.route?.path === '/hold' && layer.route.methods.post)
  .route.stack.at(-1).handle;

async function invoke(body) {
  calls.length = 0;
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let error;
  await holdHandler(
    { user: { role: 'owner', id: 7, branch_id: 1 }, body },
    response,
    (cause) => { error = cause; },
  );
  return { response, error, calls: [...calls] };
}

test('hold dengan client_hold_id yang sama tidak membuat draft server kedua', async () => {
  existing = true;
  const result = await invoke({
    branch_id: 2,
    client_hold_id: 'auto-draft-1',
    items: [{ product_id: 10, quantity: 4 }],
  });

  assert.equal(result.error, undefined);
  assert.equal(result.response.statusCode, 200);
  assert.deepEqual(result.response.body.data, { id: 42 });
  assert.equal(result.calls.filter((call) => call.sql.includes('INSERT INTO pending_transactions')).length, 0);
});

test('hold baru menyimpan client_hold_id untuk retry lifecycle Android', async () => {
  existing = false;
  const result = await invoke({
    branch_id: 2,
    client_hold_id: 'auto-draft-2',
    items: [{ product_id: 10, quantity: 4 }],
  });

  assert.equal(result.error, undefined);
  assert.equal(result.response.statusCode, 201);
  const insert = result.calls.find((call) => call.sql.includes('INSERT INTO pending_transactions'));
  assert.match(insert.sql, /client_hold_id/);
  assert.ok(insert.params.includes('auto-draft-2'));
  assert.deepEqual(result.response.body.data, { id: 99 });
});
