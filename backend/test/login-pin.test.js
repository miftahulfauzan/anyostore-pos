const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

process.env.DB_HOST = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

// Stub modul db SEBELUM require('../src/auth').
const dbPath = require.resolve('../src/db');
const userRow = {
  id: 7, branch_id: 2, name: 'Kasir A', email: 'kasir@test.local',
  role: 'kasir', password: 'x', pin_hash: bcrypt.hashSync('123456', 4),
};
const dbStub = {
  execute: async (sql, params) => {
    if (sql.includes('FROM users WHERE')) {
      if (params[0] === 'kasir@test.local') return [[userRow], []];
      if (params[0] === 'nopin@test.local') return [[{ ...userRow, email: 'nopin@test.local', pin_hash: null }], []];
      return [[], []];
    }
    if (sql.includes('INSERT INTO refresh_tokens')) return [{ insertId: 1 }, []];
    if (sql.includes('DELETE FROM refresh_tokens')) return [{ affectedRows: 0 }, []];
    if (sql.includes('UPDATE users SET last_login')) return [{ affectedRows: 1 }, []];
    throw new Error('unexpected sql: ' + sql);
  },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: dbStub };

const { loginWithPin } = require('../src/auth');

function response() {
  return {
    statusCode: 200,
    body: null,
    cookies: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
    clearCookie(name, options) { this.cookies.push({ name, clear: true, options }); return this; },
  };
}

test('loginWithPin berhasil dengan PIN yang benar', async () => {
  const res = response();
  await loginWithPin({ body: { email: 'kasir@test.local', pin: '123456' } }, res, () => assert.fail('next tidak boleh dipanggil'));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.user.role, 'kasir');
  assert.ok(res.body.data.accessToken);
  assert.ok(res.cookies.some((c) => c.name === 'pos_access'));
  assert.ok(res.cookies.some((c) => c.name === 'pos_refresh'));
});

test('loginWithPin menolak PIN yang salah', async () => {
  const res = response();
  await loginWithPin({ body: { email: 'kasir@test.local', pin: '000000' } }, res, () => assert.fail('next tidak boleh dipanggil'));
  assert.equal(res.statusCode, 401);
});

test('loginWithPin menolak user yang belum punya PIN', async () => {
  const res = response();
  await loginWithPin({ body: { email: 'nopin@test.local', pin: '123456' } }, res, () => assert.fail('next tidak boleh dipanggil'));
  assert.equal(res.statusCode, 401);
});

test('loginWithPin mengunci akun setelah 10 percobaan gagal', async () => {
  const req = { body: { email: 'lockout@test.local', pin: '000000' } };
  for (let i = 0; i < 10; i++) {
    const res = response();
    await loginWithPin(req, res, () => assert.fail('next tidak boleh dipanggil'));
    assert.equal(res.statusCode, 401);
  }
  const locked = response();
  await loginWithPin(req, locked, () => assert.fail('next tidak boleh dipanggil'));
  assert.equal(locked.statusCode, 429);
});
