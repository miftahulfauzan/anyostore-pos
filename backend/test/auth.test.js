const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.DB_HOST = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const { authenticate, authorize } = require('../src/auth');

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('authenticate accepts a valid access token', () => {
  const token = jwt.sign({ id: 7, role: 'kasir', branch_id: 2 }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = response(); let nextCalled = false;
  authenticate(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.user.id, 7);
  assert.equal(req.user.branch_id, 2);
});

test('authenticate rejects a missing token', () => {
  const res = response();
  authenticate({ headers: {} }, res, () => assert.fail('next must not be called'));
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});

test('authorize accepts the configured role and rejects others', () => {
  const allowed = response(); let nextCalled = false;
  authorize('owner', 'admin')({ user: { role: 'admin' } }, allowed, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  const denied = response();
  authorize('owner')({ user: { role: 'kasir' } }, denied, () => assert.fail('next must not be called'));
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.message, 'Akses ditolak');
});
