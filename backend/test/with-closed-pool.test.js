const test = require('node:test');
const assert = require('node:assert/strict');
const { withClosedPool } = require('../src/with-closed-pool');

test('closes the database pool after a successful operation', async () => {
  let closed = false;
  const pool = { async end() { closed = true; } };

  const result = await withClosedPool(pool, async () => 'audit complete');

  assert.equal(result, 'audit complete');
  assert.equal(closed, true);
});

test('closes the database pool when the operation fails', async () => {
  let closed = false;
  const pool = { async end() { closed = true; } };
  const failure = new Error('database operation failed');

  await assert.rejects(withClosedPool(pool, async () => { throw failure; }), failure);
  assert.equal(closed, true);
});
