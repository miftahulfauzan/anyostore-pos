const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createAuthDb } = require('./helpers/auth-db');

process.env.DB_HOST = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const db = createAuthDb();
const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const auth = require('../src/auth');
const usersRouter = require('../src/routes/users');
const password = 'test-password';
const passwordHash = bcrypt.hashSync(password, 4);
const pinHash = bcrypt.hashSync('123456', 4);
const hash = token => crypto.createHash('sha256').update(token).digest('hex');

beforeEach(() => {
  db.state.users = new Map([7, 8].map(id => [id, {
    id, branch_id: 2, name: `User ${id}`, username: `user${id}`, email: `user${id}@test.local`,
    role: id === 8 ? 'owner' : 'kasir', is_active: true, token_version: 0,
    password: passwordHash, pin_hash: pinHash,
  }]));
  db.state.tokens = [];
  db.state.queries = [];
  db.state.failure = null;
});

function response() {
  return {
    statusCode: 200, body: null, cookies: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
    clearCookie(name) { this.cookies.push({ name, clear: true }); return this; },
  };
}

async function call(handler, req = {}) {
  req = { headers: {}, body: {}, query: {}, ...req };
  const res = response();
  await handler(req, res, error => { res.nextCalled = true; res.error = error; });
  return { req, res };
}

async function login(id = 7, mobile = true, pin = false) {
  const { res } = await call(pin ? auth.loginWithPin : auth.loginWithPassword, {
    body: { email: `user${id}@test.local`, password, pin: '123456' },
    query: mobile ? { mobile: '1' } : {},
  });
  assert.equal(res.error, undefined);
  assert.equal(res.statusCode, 200);
  return { ...res.body.data, res, refreshToken: res.cookies.find(c => c.name === 'pos_refresh').value };
}

const access = (token, extra = {}) => call(auth.authenticate, { headers: { authorization: `Bearer ${token}` }, ...extra });
const refresh = (token, mobile = true) => call(mobile ? auth.mobileRefresh : auth.refresh,
  mobile ? { body: { refresh_token: token } } : { cookies: { pos_refresh: token } });

function legacy(id = 7) {
  const accessToken = jwt.sign({ id, role: 'owner', branch_id: 99 }, process.env.JWT_SECRET, { expiresIn: '365d' });
  const refreshToken = jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '365d' });
  db.state.tokens.push({ id: db.state.nextId++, user_id: id, token_hash: hash(refreshToken),
    session_id: null, revoked_at: null, expires_at: Date.now() + 86400000 });
  return { accessToken, refreshToken };
}

async function userRoute(path, token, body = {}, method = 'PUT') {
  const req = { method, url: path, headers: { authorization: `Bearer ${token}` }, body, query: {} };
  const res = response();
  await new Promise(resolve => {
    const json = res.json;
    res.json = value => { json.call(res, value); resolve(); return res; };
    usersRouter.handle(req, res, error => { res.error = error; resolve(); });
  });
  return res;
}

function denied(result) {
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.res.nextCalled, undefined);
  assert.equal(result.req.user, undefined);
}

test('password and PIN login issue unique, versioned 365-day sessions with httpOnly cookies', async () => {
  const first = await login(7, false);
  const second = await login(7, true, true);
  for (const session of [first, second]) {
    const a = jwt.verify(session.accessToken, process.env.JWT_SECRET);
    const r = jwt.verify(session.refreshToken, process.env.JWT_REFRESH_SECRET);
    assert.equal(a.token_version, 0);
    assert.equal(r.token_version, 0);
    assert.ok(a.sid);
    assert.equal(a.sid, r.sid);
    assert.equal(a.exp - a.iat, 365 * 86400);
    assert.equal(r.exp - r.iat, 365 * 86400);
    for (const cookie of session.res.cookies) {
      assert.equal(cookie.options.httpOnly, true);
      assert.equal(cookie.options.sameSite, 'strict');
      assert.equal(cookie.options.maxAge, 365 * 86400000);
    }
    assert.equal((await access(session.accessToken)).res.nextCalled, true);
  }
  assert.notEqual(first.refreshToken, second.refreshToken);
  assert.notEqual(jwt.decode(first.accessToken).sid, jwt.decode(second.accessToken).sid);
  assert.equal(first.res.body.data.refreshToken, undefined);
  assert.equal(second.res.body.data.refreshToken, second.refreshToken);
});

test('authenticate accepts cookie and Bearer clients and reads current role and branch', async () => {
  const session = await login(8);
  const cookie = await access(null, { headers: {}, cookies: { pos_access: session.accessToken } });
  assert.equal(cookie.req.user.id, 8);
  const user = db.state.users.get(8);
  user.role = 'kasir'; user.branch_id = 5;
  const result = await access(session.accessToken, { query: { branch_id: '99' } });
  assert.equal(result.res.nextCalled, true);
  assert.equal(result.req.user.role, 'kasir');
  assert.equal(result.req.user.branch_id, 5);
  const res = response();
  auth.authorize('owner')(result.req, res, () => assert.fail('stale owner must not be authorized'));
  assert.equal(res.statusCode, 403);
});

test('current owner can select a branch without mutating stored identity', async () => {
  const session = await login(8);
  assert.equal((await access(session.accessToken, { query: { branch_id: '3' } })).req.user.branch_id, 3);
  assert.equal((await access(session.accessToken, { body: { branch_id: 4 } })).req.user.branch_id, 4);
  for (const branch_id of ['all', '-1', '1.5', 'no']) {
    assert.equal((await access(session.accessToken, { query: { branch_id } })).req.user.branch_id, 2);
  }
  assert.equal(db.state.users.get(8).branch_id, 2);
});

for (const change of ['disabled', 'deleted', 'version changed', 'session revoked', 'session expired', 'session deleted']) {
  test(`access and both refresh endpoints reject ${change}`, async () => {
    const session = await login();
    if (change === 'disabled') db.state.users.get(7).is_active = false;
    if (change === 'deleted') db.state.users.delete(7);
    if (change === 'version changed') db.state.users.get(7).token_version++;
    if (change === 'session revoked') db.state.tokens[0].revoked_at = Date.now();
    if (change === 'session expired') db.state.tokens[0].expires_at = Date.now() - 1;
    if (change === 'session deleted') db.state.tokens = [];
    denied(await access(session.accessToken));
    denied(await refresh(session.refreshToken));
    denied(await refresh(session.refreshToken, false));
  });
}

test('legacy access is rejected; unchanged legacy refresh upgrades browser/mobile without login', async () => {
  for (const mobile of [true, false]) {
    const old = legacy(mobile ? 7 : 8);
    denied(await access(old.accessToken));
    const result = await refresh(old.refreshToken, mobile);
    assert.equal(result.res.error, undefined);
    assert.equal(result.res.statusCode, 200);
    assert.ok(jwt.decode(result.res.body.data.accessToken).sid);
    assert.equal((await access(result.res.body.data.accessToken)).res.nextCalled, true);
    denied(await refresh(old.refreshToken, mobile));
    if (!mobile) {
      assert.equal(result.res.body.data.refreshToken, undefined);
      assert.equal(result.res.cookies.length, 2);
    }
  }
});

test('legacy refresh cannot bypass a security version change', async () => {
  const old = legacy();
  db.state.users.get(7).token_version = 1;
  denied(await refresh(old.refreshToken));
  denied(await refresh(old.refreshToken, false));
});

test('refresh rotation is unique in the same second, keeps session access and rejects reuse', async () => {
  const session = await login();
  const rotated = await refresh(session.refreshToken);
  assert.equal(rotated.res.error, undefined);
  assert.notEqual(rotated.res.body.data.refreshToken, session.refreshToken);
  assert.equal(jwt.decode(rotated.res.body.data.accessToken).sid, jwt.decode(session.accessToken).sid);
  assert.equal((await access(session.accessToken)).res.nextCalled, true);
  denied(await refresh(session.refreshToken));
});

test('concurrent refresh spends a token only once', async () => {
  const session = await login();
  const results = await Promise.all([refresh(session.refreshToken), refresh(session.refreshToken)]);
  assert.deepEqual(results.map(r => r.res.statusCode).sort(), [200, 401]);
  assert.equal(db.state.tokens.filter(t => !t.revoked_at).length, 1);
});

for (const tokenSource of ['body', 'cookie', 'access', 'rotated refresh']) {
  test(`logout through ${tokenSource} revokes entire session and preserves another device`, async () => {
    const session = await login();
    const other = await login();
    const rotated = await refresh(session.refreshToken);
    const current = rotated.res.body.data;
    const req = tokenSource === 'body' || tokenSource === 'rotated refresh'
      ? { body: { refresh_token: tokenSource === 'body' ? current.refreshToken : session.refreshToken } }
      : tokenSource === 'cookie' ? { cookies: { pos_refresh: current.refreshToken } }
        : { headers: { authorization: `Bearer ${session.accessToken}` } };
    const result = await call(auth.logout, req);
    assert.equal(result.res.error, undefined);
    assert.equal(result.res.statusCode, 200);
    assert.equal(result.res.cookies.filter(c => c.clear).length, 2);
    denied(await access(session.accessToken));
    denied(await access(current.accessToken));
    denied(await refresh(current.refreshToken));
    assert.equal((await access(other.accessToken)).res.nextCalled, true);
  });
}

test('logout of upgraded legacy refresh revokes successor session', async () => {
  const old = legacy();
  const upgraded = await refresh(old.refreshToken);
  await call(auth.logout, { body: { refresh_token: old.refreshToken } });
  denied(await access(upgraded.res.body.data.accessToken));
  denied(await refresh(upgraded.res.body.data.refreshToken));
});

test('database outage fails closed through next(error), distinct from invalid JWT', async () => {
  const session = await login();
  db.state.failure = () => true;
  for (const result of [await access(session.accessToken), await refresh(session.refreshToken), await refresh(session.refreshToken, false)]) {
    assert.equal(result.res.nextCalled, true);
    assert.match(result.res.error.message, /Database unavailable/);
    assert.equal(result.req.user, undefined);
    assert.equal(result.res.body, null);
  }
});

test('failed refresh persistence rolls back rotation and issues no cookies', async () => {
  const session = await login();
  db.state.failure = sql => sql.startsWith('INSERT INTO refresh_tokens');
  const result = await refresh(session.refreshToken, false);
  assert.match(result.res.error.message, /Database unavailable/);
  assert.equal(result.res.cookies.length, 0);
  assert.equal(db.state.tokens.filter(t => !t.revoked_at).length, 1);
  db.state.failure = null;
  assert.equal((await refresh(session.refreshToken)).res.statusCode, 200);
});

for (const token of ['malformed', jwt.sign({ id: 7 }, 'wrong-secret'), jwt.sign({ id: 7 }, process.env.JWT_REFRESH_SECRET, { expiresIn: -1 })]) {
  test('malformed, incorrectly signed and expired tokens return 401', async () => {
    denied(await refresh(token));
    denied(await refresh(token, false));
    denied(await access(token));
    assert.equal(db.state.queries.length, 0);
  });
}

test('missing access is 401, missing refresh is 400, unauthenticated logout is idempotent', async () => {
  denied(await call(auth.authenticate));
  assert.equal((await call(auth.refresh)).res.statusCode, 400);
  assert.equal((await call(auth.mobileRefresh)).res.statusCode, 400);
  assert.equal((await call(auth.logout)).res.body.success, true);
});

const changes = [
  { name: 'self password', path: '/profile/password', self: true, body: { current_password: password, new_password: 'new-password' } },
  { name: 'owner password reset', path: '/7/password', body: { new_password: 'new-password' } },
  { name: 'self PIN', path: '/7/pin', self: true, body: { current_pin: '123456', pin: '654321' } },
  { name: 'owner PIN reset', path: '/7/pin', body: { pin: '654321' } },
  { name: 'user edit PIN', path: '/7', body: { name: 'User 7', username: 'user7', email: 'user7@test.local', role: 'kasir', pin: '654321' } },
  { name: 'role change', path: '/7', body: { name: 'User 7', username: 'user7', email: 'user7@test.local', role: 'gudang' } },
  { name: 'disable/re-enable', path: '/7/toggle-active', body: {}, toggle: true },
  { name: 'soft delete/re-enable', path: '/7', body: {}, method: 'DELETE', toggle: true },
];

for (const change of changes) {
  test(`${change.name} invalidates all existing tokens including legacy after re-enable`, async () => {
    const old = legacy();
    const victim = await login();
    const owner = await login(8);
    const result = await userRoute(change.path, change.self ? victim.accessToken : owner.accessToken, change.body, change.method);
    assert.equal(result.error, undefined);
    assert.equal(result.statusCode, 200);
    assert.ok(db.state.users.get(7).token_version > 0);
    if (change.toggle) {
      denied(await access(victim.accessToken));
      const enabled = await userRoute('/7/toggle-active', owner.accessToken);
      assert.equal(enabled.statusCode, 200);
      assert.ok(db.state.users.get(7).is_active);
    }
    denied(await access(victim.accessToken));
    denied(await refresh(victim.refreshToken));
    denied(await refresh(victim.refreshToken, false));
    denied(await refresh(old.refreshToken));
  });
}

test('ordinary name/email edit preserves long-lived session', async () => {
  const session = await login();
  const owner = await login(8);
  const result = await userRoute('/7', owner.accessToken, { name: 'Updated', username: 'user7', email: 'user7@test.local', role: 'kasir' });
  assert.equal(result.error, undefined);
  assert.equal(result.statusCode, 200);
  assert.equal(db.state.users.get(7).token_version, 0);
  assert.equal((await access(session.accessToken)).res.nextCalled, true);
});

test('wrong current password/PIN and forbidden edits do not revoke sessions', async () => {
  const session = await login();
  assert.equal((await userRoute('/profile/password', session.accessToken, { current_password: 'wrong', new_password: 'new-password' })).statusCode, 400);
  assert.equal((await userRoute('/7/pin', session.accessToken, { current_pin: 'wrong', pin: '654321' })).statusCode, 400);
  assert.equal((await userRoute('/8/pin', session.accessToken, { pin: '654321' })).statusCode, 403);
  assert.equal((await userRoute('/8/password', session.accessToken, { new_password: 'new-password' })).statusCode, 403);
  assert.equal(db.state.users.get(7).token_version, 0);
  assert.equal((await access(session.accessToken)).res.nextCalled, true);
});
