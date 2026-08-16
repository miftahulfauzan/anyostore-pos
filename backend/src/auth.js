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

function issueTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, role: user.role, branch_id: user.branch_id },
    jwtSecret,
    { expiresIn: '365d' }
  );
  const refreshToken = jwt.sign({ id: user.id }, jwtRefreshSecret, { expiresIn: '365d' });
  return { accessToken, refreshToken };
}

async function persistRefreshToken(userId, refreshToken) {
  const decoded = jwt.decode(refreshToken);
  await db.execute('DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at <= NOW()', [userId]);
  await db.execute(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, FROM_UNIXTIME(?))',
    [userId, refreshHash(refreshToken), decoded.exp]
  );
}

async function loginWithPassword(req, res, next) {
  try {
    const { email, password } = req.body;
    const identifier = String(email || '').trim();
    if (!identifier || !password) return res.status(400).json({ success: false, message: 'Email/username dan password wajib diisi' });
    if (loginLocked(identifier)) return res.status(429).json({ success: false, message: 'Terlalu banyak percobaan login, coba lagi 15 menit' });
    const [rows] = await db.execute(
      'SELECT id, branch_id, name, email, username, password, role FROM users WHERE (email = ? OR username = ?) AND is_active = TRUE LIMIT 1',
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
      'SELECT id, branch_id, name, email, username, password, role, pin_hash FROM users WHERE (email = ? OR username = ?) AND is_active = TRUE LIMIT 1',
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

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.pos_refresh;
    if (!token) return res.status(400).json({ success: false, message: 'Refresh token wajib diisi' });
    const payload = jwt.verify(token, jwtRefreshSecret);
    const [tokens] = await db.execute(
      'SELECT id FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1',
      [refreshHash(token)]
    );
    if (!tokens[0]) return res.status(401).json({ success: false, message: 'Refresh token tidak valid' });
    const [users] = await db.execute('SELECT id, branch_id, role FROM users WHERE id = ? AND is_active = TRUE LIMIT 1', [payload.id]);
    if (!users[0]) return res.status(401).json({ success: false, message: 'User tidak aktif' });
    await db.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [tokens[0].id]);
    const nextTokens = issueTokens(users[0]);
    await persistRefreshToken(users[0].id, nextTokens.refreshToken);
    setAuthCookies(res, nextTokens);
    return res.json({ success: true, data: { accessToken: nextTokens.accessToken } });
  } catch (error) { return next(error); }
}

async function logout(req, res, next) {
  try {
    const { refresh_token: token } = req.body;
    const refreshToken = token || req.cookies?.pos_refresh;
    if (refreshToken) await db.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?', [refreshHash(refreshToken)]);
    clearAuthCookies(res);
    return res.json({ success: true, message: 'Logout berhasil' });
  } catch (error) { return next(error); }
}

function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.cookies?.pos_access || null;
    if (!token) return res.status(401).json({ success: false, message: 'Token wajib diisi' });
    const user = jwt.verify(token, jwtSecret);
    // Owner bisa memilih toko/gudang aktif: semua route otomatis memakai
    // branch_id dari query/body (GET maupun POST/PUT), tanpa mengubah token.
    if (user.role === 'owner') {
      const requested = Number(req.query.branch_id || req.body.branch_id);
      if (Number.isInteger(requested) && requested > 0) user.branch_id = requested;
    }
    req.user = user;
    return next();
  } catch (_) { return res.status(401).json({ success: false, message: 'Token tidak valid' }); }
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
    const payload = jwt.verify(token, jwtRefreshSecret);
    const [tokens] = await db.execute(
      'SELECT id FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1',
      [refreshHash(token)]
    );
    if (!tokens[0]) return res.status(401).json({ success: false, message: 'Refresh token tidak valid' });
    const [users] = await db.execute('SELECT id, branch_id, role FROM users WHERE id = ? AND is_active = TRUE LIMIT 1', [payload.id]);
    if (!users[0]) return res.status(401).json({ success: false, message: 'User tidak aktif' });
    await db.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [tokens[0].id]);
    const nextTokens = issueTokens(users[0]);
    await persistRefreshToken(users[0].id, nextTokens.refreshToken);
    return res.json({ success: true, data: { accessToken: nextTokens.accessToken, refreshToken: nextTokens.refreshToken } });
  } catch (error) { return next(error); }
}

module.exports = { loginWithPassword, loginWithPin, refresh, mobileRefresh, logout, authenticate, authorize };
