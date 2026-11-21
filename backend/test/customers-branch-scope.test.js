const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

function loadCustomerHandler(dbStub) {
  const dbPath = require.resolve('../src/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: dbStub };
  const routePath = require.resolve('../src/routes/customers');
  delete require.cache[routePath];
  const router = require('../src/routes/customers');
  const layer = router.stack.find((item) => item.route?.path === '/' && item.route.methods.get);
  assert.ok(layer, 'route GET / customers harus ada');
  return layer.route.stack.at(-1).handle;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('owner dapat meminta pelanggan cabang lain lewat branch_id', async () => {
  const calls = [];
  const dbStub = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FROM branches')) return [[{ id: 2 }], []];
      return [[{ id: 9, name: 'Pelanggan Toko B' }], []];
    },
  };
  const handler = loadCustomerHandler(dbStub);
  const res = makeRes();
  let nextError;
  await handler(
    { user: { role: 'owner', branch_id: 1 }, query: { branch_id: '2', limit: '500' } },
    res,
    (error) => { nextError = error; },
  );
  assert.equal(nextError, undefined);
  assert.equal(res.body.branch_id, 2);
  const customerQuery = calls.find((call) => call.sql.includes('FROM customers'));
  assert.ok(customerQuery.params.includes(2), 'query pelanggan harus memakai cabang pilihan owner');
  assert.match(customerQuery.sql, /LIMIT 500/);
});

test('manager tetap terkunci ke cabang akun walau mengirim branch_id lain', async () => {
  const calls = [];
  const dbStub = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return [[], []];
    },
  };
  const handler = loadCustomerHandler(dbStub);
  const res = makeRes();
  await handler(
    { user: { role: 'manager', branch_id: 1 }, query: { branch_id: '2', limit: '10' } },
    res,
    (error) => { throw error; },
  );
  assert.equal(calls.length, 1, 'role non-owner tidak boleh mengecek cabang lain');
  assert.ok(calls[0].params.includes(1));
  assert.match(calls[0].sql, /LIMIT 10/);
});

function loadCustomerPostHandler(dbStub) {
  const dbPath = require.resolve('../src/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: dbStub };
  const routePath = require.resolve('../src/routes/customers');
  delete require.cache[routePath];
  const router = require('../src/routes/customers');
  const layer = router.stack.find((item) => item.route?.path === '/' && item.route.methods.post);
  assert.ok(layer, 'route POST / customers harus ada');
  return layer.route.stack.at(-1).handle;
}

test('ekspedisi pelanggan disimpan dan dikirim kembali ke POS', async () => {
  const calls = [];
  const dbStub = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return [{ insertId: 5 }, []];
    },
  };
  const handler = loadCustomerPostHandler(dbStub);
  const res = makeRes();
  let nextError;
  await handler(
    { user: { role: 'owner', branch_id: 1 }, body: { name: ' Hanni Mart ', expedition: ' JNE ' } },
    res,
    (error) => { nextError = error; },
  );
  assert.equal(nextError, undefined);
  const insert = calls.find((call) => call.sql.includes('INSERT INTO customers'));
  assert.match(insert.sql, /expedition/);
  assert.ok(insert.params.includes('JNE'), 'ekspedisi harus ikut tersimpan');

  calls.length = 0;
  const getHandler = loadCustomerHandler(dbStub);
  const listRes = makeRes();
  await getHandler(
    { user: { role: 'owner', branch_id: 1 }, query: {} },
    listRes,
    (error) => { nextError = error; },
  );
  assert.equal(nextError, undefined);
  const select = calls.find((call) => call.sql.includes('FROM customers'));
  assert.match(select.sql, /expedition/, 'daftar pelanggan harus memuat ekspedisi');
});
