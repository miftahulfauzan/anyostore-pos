const test = require('node:test');
const assert = require('node:assert/strict');
const { withAuditExecutionLimit, executeAuditQuery, countAuditRows } = require('../src/reset-audit-query');

test('adds a bounded MySQL execution hint to read-only audit queries', () => {
  assert.equal(
    withAuditExecutionLimit('SELECT COUNT(*) AS count FROM products'),
    'SELECT /*+ MAX_EXECUTION_TIME(30000) */ COUNT(*) AS count FROM products'
  );
});

test('rejects unsafe timeout values and non-SELECT statements', () => {
  assert.throws(
    () => withAuditExecutionLimit('SELECT 1', '30000; DROP TABLE products'),
    /between 1000 and 120000 milliseconds/
  );
  assert.throws(() => withAuditExecutionLimit('DELETE FROM products'), /only be applied to SELECT statements/);
});

test('executes an audit count and emits bounded progress labels', async () => {
  const events = [];
  const statements = [];
  const connection = {
    execute: async (sql, params) => {
      statements.push({ sql, params });
      return [[{ count: '12' }]];
    },
  };

  const count = await countAuditRows(connection, 'products', 'SELECT COUNT(*) AS count FROM products', [], (line) => events.push(line));

  assert.equal(count, 12);
  assert.deepEqual(statements, [{
    sql: 'SELECT /*+ MAX_EXECUTION_TIME(30000) */ COUNT(*) AS count FROM products',
    params: [],
  }]);
  assert.match(events[0], /^\[reset-audit\] count products started$/);
  assert.match(events[1], /^\[reset-audit\] count products complete \(\d+ms\)$/);
});

test('reports which table count failed without hiding the database error', async () => {
  const events = [];
  const connection = {
    execute: async () => { throw new Error('query interrupted'); },
  };

  await assert.rejects(
    executeAuditQuery(connection, 'stock_mutations', 'SELECT COUNT(*) AS count FROM stock_mutations', [], (line) => events.push(line)),
    /query interrupted/
  );
  assert.match(events.at(-1), /^\[reset-audit\] stock_mutations failed after \d+ms$/);
});
