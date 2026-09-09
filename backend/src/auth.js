const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { jwtSecret, jwtRefreshSecret } = require('./config');

const refreshHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

const cookieBase = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' };
const ACCESS_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;
function setAuthCookies(res, tokens) {
  res.cookie('pos_access', tokens.accessToken, { ...cookieBase, maxAge: ACCESS_COOKIE_MAX_AGE });
  res.cookie('pos_refresh', tokens.refreshToken, { ...cookieBase, maxAge: REFRESH_COOKIE_MAX_AGE });
}
function clearAuthCookies(res) {
  res.clearCookie('pos_access', cookieBase);
  res.clearCookie('pos_refresh', cookieBase);
}

// Lockout per akun (di luar rate limit per IP) untuk PIN/password 6 digit.
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const attemptKey = (email) => String(email || '').toLowerCase().trim();
function recordLoginFailure(email) {
  const key = attemptKey(email);
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, first: now };
  if (now - entry.first > LOGIN_WINDOW_MS) {
    entry.count = 1;
    entry.first = now;
  } else {
    entry.count += 1;
  }
  loginAttempts.set(key, entry);
}
function loginLocked(email) {
  const key = attemptKey(email);
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS;
}
function clearLoginAttempts(email) {
  loginAttempts.delete(attemptKey(email));
}

function issueTokens(user, sessionId = crypto.randomUUID()) {
  const tokenVersion = user.token_version == null ? 0 : Number(user.token_version);
  if (!Number.isSafeInteger(tokenVersion) || tokenVersion < 0) {
    throw new Error('Invalid user token_version; auth migrations are required');
  }
  const identity = { id: user.id, token_version: tokenVersion, sid: sessionId };
  const accessToken = jwt.sign(
    { ...identity, role: user.role, branch_id: user.branch_id },
    jwtSecret,
    { expiresIn: '365d', algorithm: 'HS256' }
  );
  const refreshToken = jwt.sign(identity, jwtRefreshSecret, {
    expiresIn: '365d', algorithm: 'HS256', jwtid: crypto.randomUUID(),
  });
  return { accessToken, refreshToken };
}

async function persistRefreshToken(userId, refreshToken, connection = db) {
  const decoded = jwt.decode(refreshToken);
  await connection.execute('DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at <= NOW()', [userId]);
  await connection.execute(
    'INSERT INTO refresh_tokens (user_id, token_hash, session_id, expires_at) VALUES (?, ?, ?, FROM_UNIXTIME(?))',
    [userId, refreshHash(refreshToken), decoded.sid, decoded.exp]
  );
}

function verifyToken(token, secret, options = {}) {
  const payload = jwt.verify(token, secret, { ...options, algorithms: ['HS256'] });
  if (!payload || !Number.isSafeInteger(payload.id) || payload.id <= 0) {
    throw new jwt.JsonWebTokenError('Invalid token identity');
  }
  return payload;
}

const validSessionId = sid => typeof sid === 'string' && /^[a-f0-9-]{36}$/i.test(sid);
const accessTokenFrom = req => req.headers?.authorization?.replace(/^Bearer\s+/i, '') || req.cookies?.pos_access;
const unauthorized = res => res.status(401).json({ success: false, message: 'Sesi tidak valid, silakan login kembali' });
const authError = (error, res, next) => error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError
  ? unauthorized(res) : next(error);

function versionMatches(payload, user, allowLegacy = false) {
  if (!user || !Number(user.is_active)) return false;
  // Only a still-persisted, unrevoked legacy refresh can upgrade version zero.
  // Unbound legacy access is rejected so a previously logged-out token is never revived.
  const version = allowLegacy && payload.token_version === undefined && payload.sid === undefined ? 0 : payload.token_version;
  const currentVersion = user.token_version == null ? 0 : Number(user.token_version);
  return Number.isSafeInteger(version) && version >= 0 && Number.isSafeInteger(currentVersion) && version === currentVersion;
}

async function inAuthTransaction(work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); }
}

async function loginWithPassword(req, res, next) {
  try {
    const { email, password } = req.body;
    const identifier = String(email || '').trim();
    if (!identifier || !password) return res.status(400).json({ success: false, message: 'Email/username dan password wajib diisi' });
    if (loginLocked(identifier)) return res.status(429).json({ success: false, message: 'Terlalu banyak percobaan login, coba lagi 15 menit' });
    const [rows] = await db.execute(
      'SELECT id, branch_id, name, email, username, password, role, token_version FROM users WHERE (email = ? OR username = ?) AND is_active = TRUE LIMIT 1',
      [identifier, identifier]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      recordLoginFailure(identifier);
      return res.status(401).json({ success: false, message: 'Kredensial tidak valid' });
    }
    clearLoginAttempts(email);
    const tokens = issueTokens(user);
    await persistRefreshToken(user.id, tokens.refreshToken);
    await db.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    setAuthCookies(res, tokens);
    const data = { user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, branch_id: user.branch_id }, accessToken: tokens.accessToken };
    if (req.query?.mobile === '1') data.refreshToken = tokens.refreshToken;
    return res.json({ success: true, data });
  } catch (error) { return next(error); }
}

// Login PIN untuk kasir/pegawai. PIN dikelola di halaman Pegawai & Akses
// (users.js). Sebelumnya pin_hash disimpan tapi tidak pernah dipakai.
async function loginWithPin(req, res, next) {
  try {
    const { email, pin } = req.body;
    const identifier = String(email || '').trim();
    if (!identifier || !pin) return res.status(400).json({ success: false, message: 'Email/username dan PIN wajib diisi' });
    if (loginLocked(identifier)) return res.status(429).json({ success: false, message: 'Terlalu banyak percobaan login, coba lagi 15 menit' });
    const [rows] = await db.execute(
      'SELECT id, branch_id, name, email, username, password, role, pin_hash, token_version FROM users WHERE (email = ? OR username = ?) AND is_active = TRUE LIMIT 1',
      [identifier, identifier]
    );
    const user = rows[0];
    if (!user?.pin_hash || !(await bcrypt.compare(String(pin), user.pin_hash))) {
      recordLoginFailure(email);
      return res.status(401).json({ success: false, message: 'Email atau PIN tidak valid' });
    }
    clearLoginAttempts(email);
    const tokens = issueTokens(user);
    await persistRefreshToken(user.id, tokens.refreshToken);
    await db.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    setAuthCookies(res, tokens);
    const data = { user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, branch_id: user.branch_id }, accessToken: tokens.accessToken };
    if (req.query?.mobile === '1') data.refreshToken = tokens.refreshToken;
    return res.json({ success: true, data });
  } catch (error) { return next(error); }
}

async function rotateRefresh(token) {
  const payload = verifyToken(token, jwtRefreshSecret);
  return inAuthTransaction(async connection => {
    // Same user lock/order for refresh and logout. Credential/status updates
    // increment the version in their UPDATE, so rotation cannot resurrect them.
    const [users] = await connection.execute(
      'SELECT id, branch_id, role, is_active, token_version FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [payload.id]
    );
    if (!versionMatches(payload, users[0], true)) return null;
    const [tokens] = await connection.execute(
      'SELECT id, session_id FROM refresh_tokens WHERE token_hash = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1 FOR UPDATE',
      [refreshHash(token), payload.id]
    );
    const current = tokens[0];
    if (!current) return null;
    if (payload.sid !== undefined && (!validSessionId(payload.sid) || current.session_id !== payload.sid)) return null;
    if (payload.sid === undefined && (payload.token_version !== undefined || current.session_id != null)) return null;
    const sessionId = payload.sid || crypto.randomUUID();
    // Remember the upgraded legacy token's family, including after rotation,
    // so logout arriving with its old refresh still revokes the successor.
    await connection.execute('UPDATE refresh_tokens SET revoked_at = NOW(), session_id = ? WHERE id = ?', [sessionId, current.id]);
    const nextTokens = issueTokens(users[0], sessionId);
    await persistRefreshToken(payload.id, nextTokens.refreshToken, connection);
    return nextTokens;
  });
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.pos_refresh;
    if (!token) return res.status(400).json({ success: false, message: 'Refresh token wajib diisi' });
    const nextTokens = await rotateRefresh(token);
    if (!nextTokens) return unauthorized(res);
    setAuthCookies(res, nextTokens);
    return res.json({ success: true, data: { accessToken: nextTokens.accessToken } });
  } catch (error) { return authError(error, res, next); }
}

async function logout(req, res, next) {
  try {
    const refreshToken = req.body?.refresh_token || req.cookies?.pos_refresh;
    const accessToken = accessTokenFrom(req);
    for (const [token, secret, isRefresh] of [[refreshToken, jwtRefreshSecret, true], [accessToken, jwtSecret, false]]) {
      if (!token) continue;
      let payload;
      try { payload = verifyToken(token, secret, { ignoreExpiration: true }); }
      catch (error) {
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) continue;
        throw error;
      }
      await inAuthTransaction(async connection => {
        await connection.execute('SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [payload.id]);
        let sessionId = payload.sid;
        if (isRefresh) {
          const [rows] = await connection.execute(
            'SELECT id, session_id FROM refresh_tokens WHERE token_hash = ? AND user_id = ? LIMIT 1 FOR UPDATE',
            [refreshHash(token), payload.id]
          );
          if (!rows[0]) return;
          sessionId = rows[0].session_id;
          if (!sessionId) {
            await connection.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [rows[0].id]);
            return;
          }
        }
        if (validSessionId(sessionId)) {
          await connection.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND session_id = ? AND revoked_at IS NULL', [payload.id, sessionId]);
        }
      });
    }
    clearAuthCookies(res);
    return res.json({ success: true, message: 'Logout berhasil' });
  } catch (error) { return next(error); }
}

async function authenticate(req, res, next) {
  try {
    const token = accessTokenFrom(req);
    if (!token) return res.status(401).json({ success: false, message: 'Token wajib diisi' });
    const payload = verifyToken(token, jwtSecret);
    if (!validSessionId(payload.sid)) return unauthorized(res);
    const [users] = await db.execute('SELECT id, branch_id, role, is_active, token_version FROM users WHERE id = ? LIMIT 1', [payload.id]);
    if (!versionMatches(payload, users[0])) return unauthorized(res);
    const [sessions] = await db.execute(
      'SELECT id FROM refresh_tokens WHERE user_id = ? AND session_id = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1',
      [payload.id, payload.sid]
    );
    if (!sessions[0]) return unauthorized(res);
    const user = { id: users[0].id, role: users[0].role, branch_id: users[0].branch_id };
    // Owner bisa memilih toko/gudang aktif: semua route otomatis memakai
    // branch_id dari query/body (GET maupun POST/PUT), tanpa mengubah token.
    if (user.role === 'owner') {
      const requested = Number(req.query?.branch_id || req.body?.branch_id);
      if (Number.isInteger(requested) && requested > 0) user.branch_id = requested;
    }
    req.user = user;
    return next();
  } catch (error) { return authError(error, res, next); }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }
    return next();
  };
}

async function mobileRefresh(req, res, next) {
  try {
    const token = req.body?.refresh_token;
    if (!token) return res.status(400).json({ success: false, message: 'Refresh token wajib diisi' });
    const nextTokens = await rotateRefresh(token);
    if (!nextTokens) return unauthorized(res);
    return res.json({ success: true, data: { accessToken: nextTokens.accessToken, refreshToken: nextTokens.refreshToken } });
  } catch (error) { return authError(error, res, next); }
}

module.exports = { loginWithPassword, loginWithPin, refresh, mobileRefresh, logout, authenticate, authorize };
