const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

test('dashboard JSON preserves the WIB date of stock movements at both period boundaries', async () => {
  const dbPath = require.resolve('../src/db');
  const calls = [];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('AS total_in')) return [[
        { date: new Date('2026-09-30T00:00:00+07:00'), total_in: '12', total_out: '3' },
        { date: new Date('2026-10-05T00:00:00+07:00'), total_in: '20', total_out: '8' },
        { date: new Date('2026-10-06T00:00:00+07:00'), total_in: '2', total_out: '1' },
      ]];
      return [[{}]];
    },
  } };
  const router = require('../src/routes/dashboard');
  const handler = router.stack.find((layer) => layer.route?.path === '/').route.stack.at(-1).handle;
  let body;
  await handler({ user: { role: 'gudang', branch_id: 7 }, query: { start: '2026-09-30', end: '2026-10-06' } },
    { json(value) { body = JSON.parse(JSON.stringify(value)); } },
    (error) => { throw error; });
  assert.deepEqual(body.data.warehouse_dashboard.daily, [
    { date: '2026-09-30', in: 12, out: 3 },
    { date: '2026-10-05', in: 20, out: 8 },
    { date: '2026-10-06', in: 2, out: 1 },
  ]);
  const movementQuery = calls.find(({ sql }) => sql.includes('AS total_in'));
  assert.deepEqual(movementQuery.params, ['2026-09-30', '2026-10-06']);
});
