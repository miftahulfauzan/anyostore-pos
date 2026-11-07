const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const router = require('../src/routes/inventory');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function authorization(path, method, role) {
  const layer = router.stack.find((item) =>
    item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} harus ada`);
  const middleware = layer.route.stack[0].handle;
  const res = response();
  let nextCalled = false;
  middleware({ user: { role } }, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test('operasi katalog dan simpan stok masuk/keluar hanya untuk owner atau admin gudang', () => {
  for (const [method, path] of [
    ['post', '/incoming'],
    ['post', '/outgoing'],
    ['post', '/channels'],
  ]) {
    for (const role of ['owner', 'gudang']) {
      const result = authorization(path, method, role);
      assert.equal(result.nextCalled, true, `${role} boleh ${method} ${path}`);
      assert.equal(result.res.statusCode, 200);
    }
    for (const role of ['manager', 'admin', 'kasir']) {
      const result = authorization(path, method, role);
      assert.equal(result.nextCalled, false, `${role} tidak boleh ${method} ${path}`);
      assert.equal(result.res.statusCode, 403);
      assert.equal(result.res.body.message, 'Akses ditolak');
    }
  }
});
