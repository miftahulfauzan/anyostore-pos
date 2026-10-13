const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

test('mutation report insights use the full filtered scope, not the visible batch page', async () => {
  const calls = [];
  const dbPath = require.resolve('../src/db');
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      execute: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('AS movement_date')) return [[
          { movement_date: new Date('2026-10-12T00:00:00+07:00'), total_qty: 7 },
        ]];
        if (sql.includes('AS product_name')) return [[
          { product_id: 8, product_name: 'A100', sku: 'B4-A100', total_qty: 6 },
        ]];
        if (sql.trim().startsWith('SELECT COUNT(DISTINCT sm.product_id)')) return [[{ product_count: 30, total_qty: 436 }]];
        if (sql.includes('AS label')) return [[]];
        return [[]];
      },
    },
  };

  const router = require('../src/routes/inventory');
  const layer = router.stack.find((item) => item.route?.path === '/mutation-report' && item.route.methods.get);
  assert.ok(layer);
  const handler = layer.route.stack.at(-1).handle;
  const res = { body: null, json(body) { this.body = body; return this; } };
  let nextError;

  await handler({
    user: { role: 'owner', branch_id: 1 },
    query: { type: 'out', branch_id: '4', start: '2026-10-10', end: '2026-10-12', description: 'Retur', limit: '10' },
  }, res, (error) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.deepEqual(res.body.daily, [{ date: '2026-10-12', total_qty: 7 }]);
  assert.deepEqual(res.body.top_products, [{ product_id: 8, name: 'A100', sku: 'B4-A100', total_qty: 6 }]);

  const daily = calls.find(({ sql }) => sql.includes('AS movement_date'));
  const top = calls.find(({ sql }) => sql.includes('AS product_name'));
  assert.ok(daily);
  assert.ok(top);
  assert.deepEqual(daily.params, ['manual_outgoing', 'legacy_stock_out', 4, '2026-10-10', '2026-10-12', '%Retur%']);
  assert.deepEqual(top.params, daily.params);
  assert.match(top.sql, /GROUP BY sm\.product_id/);
  assert.doesNotMatch(daily.sql, /OFFSET/);
  assert.doesNotMatch(top.sql, /OFFSET/);
});
