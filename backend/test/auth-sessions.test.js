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

// Web memakai cookie HttpOnly saja; hanya `?mobile=1` yang mengembalikan token
// di body. Helper ini membaca kontrak cookie untuk sesi web.
const cookieValue = (res, name) => res.cookies.find(c => c.name === name)?.value;

async function login(id = 7, mobile = true, pin = false) {
  const { res } = await call(pin ? auth.loginWithPin : auth.loginWithPassword, {
    body: { email: `user${id}@test.local`, password, pin: '123456' },
    query: mobile ? { mobile: '1' } : {},
  });
  assert.equal(res.error, undefined);
  assert.equal(res.statusCode, 200);
  return {
    ...res.body.data, res,
    accessToken: cookieValue(res, 'pos_access'),
    refreshToken: cookieValue(res, 'pos_refresh'),
  };
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
    // Web: token hanya di cookie HttpOnly. Mobile: tetap di body.
    const upgradedAccess = mobile ? result.res.body.data.accessToken : cookieValue(result.res, 'pos_access');
    assert.ok(jwt.decode(upgradedAccess).sid);
    assert.equal((await access(upgradedAccess)).res.nextCalled, true);
    denied(await refresh(old.refreshToken, mobile));
    if (!mobile) {
      assert.equal(result.res.body.data.accessToken, undefined);
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


// ===== Akun tersimpan (web "Ganti Akun") =====

const savedCookie = (id) => `pos_saved_${id}`;
const savedTokenOf = (res, id) => res.cookies.find(c => c.name === savedCookie(id) && !c.clear)?.value;
const savedCookieOptions = (res, id) => res.cookies.find(c => c.name === savedCookie(id) && !c.clear)?.options;

async function loginRemembered(id = 7, remember = true) {
  const { res } = await call(auth.loginWithPassword, {
    body: { email: `user${id}@test.local`, password, remember_account: remember },
    query: {},
  });
  assert.equal(res.error, undefined);
  assert.equal(res.statusCode, 200);
  return {
    ...res.body.data, res,
    accessToken: cookieValue(res, 'pos_access'),
    refreshToken: cookieValue(res, 'pos_refresh'),
    savedToken: savedTokenOf(res, id),
  };
}

// Route terautentikasi: jalankan authenticate dulu agar req.user terisi, lalu
// handler-nya dengan req yang sama (meniru middleware Express).
async function authed(handler, { accessToken, ...req } = {}) {
  const base = { headers: { authorization: `Bearer ${accessToken}` }, body: {}, query: {}, ...req };
  if (!base.cookies) base.cookies = {};
  if (!base.params) base.params = {};
  await auth.authenticate(base, response(), (error) => { if (error) throw error; });
  assert.ok(base.user, 'authenticate harus mengisi req.user');
  return call(handler, base);
}

async function mobileRefreshResult(token) {
  return call(auth.mobileRefresh, { body: { refresh_token: token } });
}

test('login web menyembunyikan token dan remember_account menyimpan akun', async () => {
  const plain = await login(7, false);
  assert.equal(plain.res.body.data.accessToken, undefined);
  assert.equal(plain.res.body.data.refreshToken, undefined);
  assert.equal(plain.res.body.data.account_saved, false);

  const remembered = await loginRemembered(7, true);
  assert.equal(remembered.res.body.data.account_saved, true);
  assert.ok(remembered.savedToken);
  // Cookie tersimpan: HttpOnly, SameSite=Strict, diskop ke /api/auth.
  const options = savedCookieOptions(remembered.res, 7);
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, 'strict');
  assert.equal(options.path, '/api/auth');
  assert.equal(options.maxAge, 365 * 86400000);
  // Family sesi tersimpan berbeda dari sesi aktif: logout biasa tidak mematikannya.
  assert.notEqual(jwt.decode(remembered.savedToken).sid, jwt.decode(remembered.refreshToken).sid);
});

test('daftar akun hanya berisi metadata aman dan menandai akun aktif tersimpan', async () => {
  const session = await loginRemembered(7, true);
  const result = await authed(auth.listAccounts, {
    accessToken: session.accessToken,
    cookies: { [savedCookie(7)]: session.savedToken },
  });
  assert.equal(result.res.error, undefined);
  assert.equal(result.res.statusCode, 200);
  const data = result.res.body.data;
  assert.equal(data.active.id, 7);
  assert.equal(data.active_saved, true);
  assert.equal(data.accounts.length, 1);
  assert.deepEqual(Object.keys(data.accounts[0]).sort(), ['branch_id', 'email', 'id', 'name', 'role', 'username']);
  assert.equal(JSON.stringify(data).includes(session.savedToken), false, 'token tidak boleh dikirim ke JS');
});

test('daftar akun membuang cookie yang tidak lagi valid', async () => {
  const session = await loginRemembered(7, true);
  const row = db.state.tokens.find(t => t.token_hash === hash(session.savedToken));
  row.revoked_at = Date.now();
  const result = await authed(auth.listAccounts, {
    accessToken: session.accessToken,
    cookies: { [savedCookie(7)]: session.savedToken },
  });
  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.body.data.accounts.length, 0);
  assert.equal(result.res.body.data.active_saved, false);
  assert.ok(result.res.cookies.some(c => c.name === savedCookie(7) && c.clear), 'cookie basi harus dibersihkan');
});

test('switch akun tersimpan memutar sesi tujuan dan mencabut sesi asal yang tidak diingat', async () => {
  const source = await login(7, false);
  const target = await loginRemembered(8, true);
  const result = await authed(auth.switchAccount, {
    accessToken: source.accessToken,
    body: { user_id: 8 },
    cookies: { [savedCookie(8)]: target.savedToken },
  });
  assert.equal(result.res.error, undefined);
  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.body.data.user.id, 8);
  const newAccess = cookieValue(result.res, 'pos_access');
  assert.ok(newAccess);
  assert.equal((await access(newAccess)).req.user.id, 8);
  // Sesi asal tidak diingat → dicabut supaya tidak jadi sesi hantu.
  denied(await access(source.accessToken));
  // Cookie akun tersimpan dirotasi ke token baru dan masih bisa dipakai.
  const rotatedSaved = savedTokenOf(result.res, 8);
  assert.ok(rotatedSaved);
  assert.notEqual(rotatedSaved, target.savedToken);
  assert.equal((await mobileRefreshResult(rotatedSaved)).res.statusCode, 200);
});

test('setelah switch, sesi aktif dan akun tersimpan memakai family berbeda', async () => {
  const source = await login(7, false);
  const target = await loginRemembered(8, true);
  const result = await authed(auth.switchAccount, {
    accessToken: source.accessToken,
    body: { user_id: 8 },
    cookies: { [savedCookie(8)]: target.savedToken },
  });
  assert.equal(result.res.statusCode, 200);
  const activeRefresh = cookieValue(result.res, 'pos_refresh');
  const savedRefresh = savedTokenOf(result.res, 8);
  assert.ok(activeRefresh && savedRefresh);
  // Invarian: cookie tersimpan tidak boleh berupa token sesi aktif.
  assert.notEqual(savedRefresh, activeRefresh, 'token tersimpan harus berbeda dari token aktif');
  assert.notEqual(jwt.decode(savedRefresh).sid, jwt.decode(activeRefresh).sid, 'family harus berbeda');

  // Rotasi sesi aktif tidak boleh membunuh akun tersimpan.
  const refreshed = await call(auth.refresh, { cookies: { pos_refresh: activeRefresh } });
  assert.equal(refreshed.res.statusCode, 200);
  assert.equal(
    (await mobileRefreshResult(savedRefresh)).res.statusCode, 200,
    'akun tersimpan harus tetap bisa dipakai setelah sesi aktif dirotasi',
  );
});

test('setelah switch, "Keluar saja" tetap mempertahankan akun tersimpan', async () => {
  const source = await login(7, false);
  const target = await loginRemembered(8, true);
  const switched = await authed(auth.switchAccount, {
    accessToken: source.accessToken,
    body: { user_id: 8 },
    cookies: { [savedCookie(8)]: target.savedToken },
  });
  assert.equal(switched.res.statusCode, 200);
  const savedRefresh = savedTokenOf(switched.res, 8);
  const activeRefresh = cookieValue(switched.res, 'pos_refresh');
  const access = cookieValue(switched.res, 'pos_access');
  const out = await call(auth.logout, {
    body: { preserve_saved: true },
    cookies: { pos_refresh: activeRefresh, [savedCookie(8)]: savedRefresh },
    headers: { authorization: `Bearer ${access}` },
  });
  assert.equal(out.res.statusCode, 200);
  assert.equal(
    (await mobileRefreshResult(savedRefresh)).res.statusCode, 200,
    'akun tersimpan harus selamat dari "Keluar saja"',
  );
});

test('switch ke akun yang sama bersifat idempoten dan tidak merusak sesi', async () => {
  const session = await loginRemembered(7, true);
  const result = await authed(auth.switchAccount, {
    accessToken: session.accessToken,
    body: { user_id: 7 },
    cookies: { [savedCookie(7)]: session.savedToken },
  });
  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.body.data.user.id, 7);
  assert.equal((await access(session.accessToken)).res.nextCalled, true, 'sesi aktif tetap sah');
  assert.equal((await mobileRefreshResult(session.savedToken)).res.statusCode, 200, 'akun tersimpan tetap sah');
});

test('switch bersamaan menghasilkan tepat satu sesi sah untuk akun tujuan', async () => {
  const source = await login(7, false);
  const target = await loginRemembered(8, true);
  const results = await Promise.all([1, 2].map(() => authed(auth.switchAccount, {
    accessToken: source.accessToken,
    body: { user_id: 8 },
    cookies: { [savedCookie(8)]: target.savedToken },
  })));
  // Satu berhasil memutar token; yang lain melihat token sudah hangus (404).
  const codes = results.map(r => r.res.statusCode).sort();
  assert.deepEqual(codes, [200, 404], `dapat ${codes}`);
  const winner = results.find(r => r.res.statusCode === 200);
  const savedTokens = [target.savedToken];
  const rotated = savedTokenOf(winner.res, 8);
  if (rotated) savedTokens.push(rotated);
  const alive = [];
  for (const token of new Set(savedTokens)) {
    if ((await mobileRefreshResult(token)).res.statusCode === 200) alive.push(token);
  }
  assert.equal(alive.length, 1, 'tepat satu token tersimpan yang masih sah');
});

test('switch akun tersimpan mempertahankan akun asal yang diingat', async () => {
  const source = await loginRemembered(7, true);
  const target = await loginRemembered(8, true);
  const result = await authed(auth.switchAccount, {
    accessToken: source.accessToken,
    body: { user_id: 8 },
    cookies: { [savedCookie(7)]: source.savedToken, [savedCookie(8)]: target.savedToken },
  });
  assert.equal(result.res.statusCode, 200);
  // Sesi aktif berganti; akun asal tetap tersimpan untuk dipilih kembali.
  assert.equal((await access(cookieValue(result.res, 'pos_access'))).req.user.id, 8);
  assert.ok(savedTokenOf(result.res, 7));
  assert.equal((await mobileRefreshResult(savedTokenOf(result.res, 7))).res.statusCode, 200);
});

test('switch menolak cookie tersimpan yang dicabut', async () => {
  const source = await login(7, false);
  const target = await loginRemembered(8, true);
  const row = db.state.tokens.find(t => t.token_hash === hash(target.savedToken));
  row.revoked_at = Date.now();
  const result = await authed(auth.switchAccount, {
    accessToken: source.accessToken,
    body: { user_id: 8 },
    cookies: { [savedCookie(8)]: target.savedToken },
  });
  assert.ok([401, 404].includes(result.res.statusCode));
  assert.equal(result.res.body.data, undefined);
  assert.ok(result.res.cookies.some(c => c.name === savedCookie(8) && c.clear));
});

test('remember akun dengan token_version > 0 menerbitkan token versi yang benar', async () => {
  // Token_version naik setiap reset password/role. Token tersimpan yang
  // bercap versi 0 akan langsung ditolak saat dipakai berpindah.
  const user = db.state.users.get(7);
  user.token_version = 1;
  const { res } = await call(auth.loginWithPassword, {
    body: { email: 'user7@test.local', password, remember_account: false }, query: {},
  });
  assert.equal(res.statusCode, 200);
  const accessToken = cookieValue(res, 'pos_access');
  const remembered = await authed(auth.rememberAccount, { accessToken });
  assert.equal(remembered.res.statusCode, 200);
  assert.equal(remembered.res.body.data.account_saved, true);

  const saved = savedTokenOf(remembered.res, 7);
  assert.ok(saved);
  assert.equal(jwt.decode(saved).token_version, 1, 'token tersimpan harus memakai token_version user saat ini');
  // Dan benar-benar bisa dipakai berpindah.
  const switched = await authed(auth.switchAccount, {
    accessToken, body: { user_id: 7 }, cookies: { [savedCookie(7)]: saved },
  });
  assert.equal(switched.res.statusCode, 200);
});

test('switch menolak akun tersimpan yang token_version-nya berubah (reset password)', async () => {
  const source = await login(7, false);
  const target = await loginRemembered(8, true);
  // Reset password / ubah role menaikkan token_version: token lama tidak boleh
  // dipakai lagi, termasuk untuk berpindah akun.
  db.state.users.get(8).token_version += 1;
  const result = await authed(auth.switchAccount, {
    accessToken: source.accessToken,
    body: { user_id: 8 },
    cookies: { [savedCookie(8)]: target.savedToken },
  });
  assert.ok([401, 404].includes(result.res.statusCode), `harus ditolak, dapat ${result.res.statusCode}`);
  assert.equal(result.res.body.data, undefined);
  assert.ok(result.res.cookies.some(c => c.name === savedCookie(8) && c.clear), 'cookie basi harus dibersihkan');
});

test('daftar akun membuang akun tersimpan yang token_version-nya berubah', async () => {
  // Aktif sebagai user 7; akun tersimpan user 8 kredensialnya berubah.
  const active = await loginRemembered(7, true);
  const other = await loginRemembered(8, true);
  db.state.users.get(8).token_version += 1;
  const result = await authed(auth.listAccounts, {
    accessToken: active.accessToken,
    cookies: { [savedCookie(7)]: active.savedToken, [savedCookie(8)]: other.savedToken },
  });
  assert.equal(result.res.statusCode, 200);
  const ids = result.res.body.data.accounts.map(a => a.id);
  assert.deepEqual(ids, [7], 'hanya akun yang token-nya masih sah yang terdaftar');
  assert.ok(result.res.cookies.some(c => c.name === savedCookie(8) && c.clear), 'cookie basi dibersihkan');
});

test('switch menolak akun tersimpan yang dinonaktifkan', async () => {
  const source = await login(7, false);
  const target = await loginRemembered(8, true);
  db.state.users.get(8).is_active = false;
  const result = await authed(auth.switchAccount, {
    accessToken: source.accessToken,
    body: { user_id: 8 },
    cookies: { [savedCookie(8)]: target.savedToken },
  });
  assert.ok([401, 404].includes(result.res.statusCode));
  assert.equal(result.res.body.data, undefined);
});

test('cookie tersimpan milik user lain tidak bisa dipakai berpindah', async () => {
  const session = await loginRemembered(7, true);
  // Token user 7 ditempel pada nama cookie user 8 → id tidak cocok, ditolak.
  const result = await authed(auth.switchAccount, {
    accessToken: session.accessToken,
    body: { user_id: 8 },
    cookies: { [savedCookie(8)]: session.savedToken },
  });
  assert.equal(result.res.statusCode, 404);
  assert.equal(result.res.body.data, undefined);
});

test('logout "Keluar saja" mempertahankan akun tersimpan', async () => {
  const keep = await loginRemembered(7, true);
  const preserved = await call(auth.logout, {
    body: { preserve_saved: true },
    cookies: { pos_refresh: keep.refreshToken, [savedCookie(7)]: keep.savedToken },
    headers: { authorization: `Bearer ${keep.accessToken}` },
  });
  assert.equal(preserved.res.statusCode, 200);
  assert.equal(preserved.res.cookies.some(c => c.name === savedCookie(7) && c.clear), false);
  denied(await access(keep.accessToken));
  assert.equal((await mobileRefreshResult(keep.savedToken)).res.statusCode, 200);
});

test('logout "Keluar & hapus akun ini" mencabut akun tersimpan', async () => {
  const drop = await loginRemembered(8, true);
  const removed = await call(auth.logout, {
    body: { remove_saved: true },
    cookies: { pos_refresh: drop.refreshToken, [savedCookie(8)]: drop.savedToken },
    headers: { authorization: `Bearer ${drop.accessToken}` },
  });
  assert.equal(removed.res.statusCode, 200);
  assert.ok(removed.res.cookies.some(c => c.name === savedCookie(8) && c.clear));
  denied(await access(drop.accessToken));
  denied(await mobileRefreshResult(drop.savedToken));
});

test('hapus akun lain tidak mengakhiri sesi aktif', async () => {
  const active = await loginRemembered(7, true);
  const other = await loginRemembered(8, true);
  const result = await authed(auth.removeAccount, {
    accessToken: active.accessToken,
    params: { userId: '8' },
    cookies: { [savedCookie(7)]: active.savedToken, [savedCookie(8)]: other.savedToken },
  });
  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.body.data.removed_active, false);
  assert.equal((await access(active.accessToken)).res.nextCalled, true);
  denied(await mobileRefreshResult(other.savedToken));
});

test('hapus akun aktif mengakhiri sesi aktif dan mengosongkan cookie', async () => {
  const active = await loginRemembered(7, true);
  const result = await authed(auth.removeAccount, {
    accessToken: active.accessToken,
    params: { userId: '7' },
    cookies: { [savedCookie(7)]: active.savedToken },
  });
  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.body.data.removed_active, true);
  denied(await access(active.accessToken));
  denied(await mobileRefreshResult(active.savedToken));
  const cleared = result.res.cookies.filter(c => c.clear).map(c => c.name).sort();
  assert.deepEqual(cleared, ['pos_access', 'pos_refresh', savedCookie(7)]);
});

test('remember akun yang sudah tersimpan memakai ulang cookie yang sama', async () => {
  const session = await loginRemembered(7, true);
  const again = await authed(auth.rememberAccount, {
    accessToken: session.accessToken,
    cookies: { [savedCookie(7)]: session.savedToken },
  });
  assert.equal(again.res.statusCode, 200);
  assert.equal(again.res.body.data.account_saved, true);
  assert.equal(savedTokenOf(again.res, 7), session.savedToken);
});

test('batas 8 akun: akun kesembilan tetap bisa login tapi tidak disimpan', async () => {
  // Fixture default hanya 2 user; tambah 8 user agar batas benar-benar diuji
  // dengan 8 cookie tersimpan yang SAH (bukan cookie yang lalu ditolak).
  const ids = Array.from({ length: 8 }, (_, i) => 100 + i);
  for (const id of ids) {
    db.state.users.set(id, {
      id, branch_id: 2, name: `User ${id}`, username: `user${id}`, email: `user${id}@test.local`,
      role: 'kasir', is_active: true, token_version: 0,
      password: passwordHash, pin_hash: pinHash,
    });
  }

  const cookies = {};
  for (const id of ids) {
    const { res } = await call(auth.loginWithPassword, {
      body: { email: `user${id}@test.local`, password, remember_account: true }, query: {},
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.account_saved, true, `akun ${id} harus tersimpan (slot belum penuh)`);
    cookies[savedCookie(id)] = savedTokenOf(res, id);
  }
  assert.equal(Object.keys(cookies).length, 8, 'delapan akun tersimpan');

  // Akun kesembilan: login TETAP berhasil, tetapi tidak disimpan.
  const ninth = await call(auth.loginWithPassword, {
    body: { email: 'user7@test.local', password, remember_account: true }, query: {},
    cookies,
  });
  assert.equal(ninth.res.statusCode, 200, 'login tidak boleh gagal karena daftar akun penuh');
  assert.equal(ninth.res.body.data.account_saved, false);
  assert.equal(savedTokenOf(ninth.res, 7), undefined, 'akun ke-9 tidak boleh disimpan');

  // Remember eksplisit juga ditolak dengan pesan batas yang jelas.
  const remember = await authed(auth.rememberAccount, {
    accessToken: cookieValue(ninth.res, 'pos_access'), cookies,
  });
  assert.equal(remember.res.statusCode, 409);
  assert.equal(remember.res.body.account_saved, false);
  assert.match(remember.res.body.message, /8 akun/);
});

test('menghapus satu akun membebaskan slot untuk akun baru', async () => {
  const ids = Array.from({ length: 8 }, (_, i) => 200 + i);
  for (const id of ids) {
    db.state.users.set(id, {
      id, branch_id: 2, name: `User ${id}`, username: `user${id}`, email: `user${id}@test.local`,
      role: 'kasir', is_active: true, token_version: 0,
      password: passwordHash, pin_hash: pinHash,
    });
  }
  const cookies = {};
  for (const id of ids) {
    const { res } = await call(auth.loginWithPassword, {
      body: { email: `user${id}@test.local`, password, remember_account: true }, query: {},
    });
    cookies[savedCookie(id)] = savedTokenOf(res, id);
  }

  // Dengan 8 slot penuh, user 7 tidak tersimpan.
  const blocked = await call(auth.loginWithPassword, {
    body: { email: 'user7@test.local', password, remember_account: true }, query: {},
    cookies,
  });
  assert.equal(blocked.res.body.data.account_saved, false);

  // Hapus satu akun tersimpan (bukan akun aktif) → slot bebas.
  const removeTarget = ids[0];
  const removed = await authed(auth.removeAccount, {
    accessToken: cookieValue(blocked.res, 'pos_access'),
    params: { userId: String(removeTarget) },
    cookies,
  });
  assert.equal(removed.res.statusCode, 200);

  const remaining = { ...cookies };
  delete remaining[savedCookie(removeTarget)];
  assert.equal(Object.keys(remaining).length, 7);
  const retry = await call(auth.loginWithPassword, {
    body: { email: 'user7@test.local', password, remember_account: true }, query: {},
    cookies: remaining,
  });
  assert.equal(retry.res.body.data.account_saved, true);
  assert.ok(savedTokenOf(retry.res, 7), 'setelah satu akun dihapus, akun baru bisa disimpan');
});
