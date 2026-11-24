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

// ===== Akun tersimpan (web "Ganti Akun") =====
// Satu cookie refresh HttpOnly per akun yang diingat, diskop ke /api/auth agar
// hanya endpoint auth yang menerimanya. Family sesinya SENDIRI (sid berbeda)
// supaya "Keluar saja" pada sesi aktif tidak ikut mematikan akun tersimpan.
const SAVED_COOKIE_PREFIX = 'pos_saved_';
const SAVED_COOKIE_PATH = '/api/auth';
const SAVED_ACCOUNT_LIMIT = 8;
const savedCookieName = (userId) => `${SAVED_COOKIE_PREFIX}${Number(userId)}`;
const savedCookieOptions = () => ({ ...cookieBase, path: SAVED_COOKIE_PATH, maxAge: REFRESH_COOKIE_MAX_AGE });
const clearSavedCookie = (res, userId) => res.clearCookie(savedCookieName(userId), { ...cookieBase, path: SAVED_COOKIE_PATH });
const safeUser = (user) => user ? {
  id: Number(user.id), name: user.name ?? null, username: user.username ?? null, email: user.email ?? null,
  role: user.role ?? null, branch_id: user.branch_id ?? null,
} : null;

function savedCookieUserIds(req) {
  const ids = new Set();
  for (const name of Object.keys(req.cookies || {})) {
    if (!name.startsWith(SAVED_COOKIE_PREFIX)) continue;
    const id = Number(name.slice(SAVED_COOKIE_PREFIX.length));
    if (Number.isSafeInteger(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

// Validasi cookie tersimpan: tanda tangan sah, id di nama cookie cocok dengan
// klaim token, dan baris refresh_tokens-nya masih hidup. Mengembalikan null
// (bukan melempar) supaya cookie rusak hanya menghapus satu akun.
async function readSavedSession(req, userId, connection = db) {
  const token = req.cookies?.[savedCookieName(userId)];
  if (!token) return null;
  try {
    const payload = verifyToken(token, jwtRefreshSecret);
    if (Number(payload.id) !== Number(userId)) return null;
    const [rows] = await connection.execute(
      'SELECT id, session_id FROM refresh_tokens WHERE token_hash = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1',
      [refreshHash(token), Number(userId)]
    );
    if (!rows[0] || !validSessionId(rows[0].session_id)) return null;
    return { token, payload, row: rows[0] };
  } catch { return null; }
}

async function revokeSessionFamily(userId, sessionId, connection = db) {
  if (!validSessionId(sessionId)) return;
  await connection.execute(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND session_id = ? AND revoked_at IS NULL',
    [Number(userId), sessionId]
  );
}

// Mencabut satu family sesi berdasarkan token akses (Bearer maupun cookie).
// Dipakai alur akun tersimpan saat sesi sumber harus diakhiri tanpa
// bergantung pada cookie pos_refresh (klien mobile memakai Bearer).
function accessSessionFrom(req) {
  const token = accessTokenFrom(req);
  if (!token) return null;
  try {
    const payload = verifyToken(token, jwtSecret);
    if (!validSessionId(payload.sid)) return null;
    return { userId: Number(payload.id), sessionId: payload.sid };
  } catch { return null; }
}

// Mencabut family sesi AKTIF. Akun tersimpan memakai family sendiri sehingga
// tetap bisa dipilih kembali setelah "Keluar saja".
async function revokeActiveSession(req) {
  if (req.user?.sid) {
    await revokeSessionFamily(req.user.id, req.user.sid);
    return;
  }
  const active = accessSessionFrom(req);
  if (active) await revokeSessionFamily(active.userId, active.sessionId);
}

// Simpan akun aktif sebagai akun tersimpan (opt-in). Cookie sah yang sudah ada
// dipakai ulang; batas 8 dihitung setelah cookie rusak dibersihkan.
async function ensureSavedAccount(req, res, user) {
  const existing = await readSavedSession(req, user.id);
  if (existing) {
    res.cookie(savedCookieName(user.id), existing.token, savedCookieOptions());
    return true;
  }
  let live = 0;
  for (const id of savedCookieUserIds(req)) {
    if (await readSavedSession(req, id)) live += 1;
    else clearSavedCookie(res, id);
  }
  if (live >= SAVED_ACCOUNT_LIMIT) return false;
  const tokens = issueTokens(user);
  await persistRefreshToken(user.id, tokens.refreshToken);
  res.cookie(savedCookieName(user.id), tokens.refreshToken, savedCookieOptions());
  return true;
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
    const accountSaved = req.body?.remember_account === true ? await ensureSavedAccount(req, res, user) : false;
    const data = { user: safeUser(user), account_saved: accountSaved };
    if (req.query?.mobile === '1') {
      data.accessToken = tokens.accessToken;
      data.refreshToken = tokens.refreshToken;
    }
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
    const accountSaved = req.body?.remember_account === true ? await ensureSavedAccount(req, res, user) : false;
    const data = { user: safeUser(user), account_saved: accountSaved };
    if (req.query?.mobile === '1') {
      data.accessToken = tokens.accessToken;
      data.refreshToken = tokens.refreshToken;
    }
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
    // Token tetap hanya di cookie HttpOnly; JS browser tidak menerimanya.
    return res.json({ success: true, data: {} });
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
    // "Keluar saja" (default & preserve_saved): hanya family sesi aktif yang
    // dicabut; cookie akun tersimpan tetap hidup agar bisa dipilih kembali.
    // "Keluar & hapus akun ini" (remove_saved) ikut mencabut family tersimpan.
    if (req.body?.remove_saved === true) {
      const accessToken = accessTokenFrom(req);
      let ownerId = null;
      try { ownerId = verifyToken(accessToken, jwtSecret).id; }
      catch { ownerId = null; }
      if (ownerId) {
        const saved = await readSavedSession(req, ownerId);
        if (saved) await revokeSessionFamily(ownerId, saved.row.session_id);
        clearSavedCookie(res, ownerId);
      }
    }
    clearAuthCookies(res);
    return res.json({ success: true, message: 'Logout berhasil' });
  } catch (error) { return next(error); }
}

// ===== Endpoint akun tersimpan (web "Ganti Akun") =====

// GET /api/auth/accounts — metadata akun aktif + tersimpan. Token tidak pernah
// dikirim ke JS; hanya field aman yang dipakai untuk menampilkan daftar.
async function listAccounts(req, res, next) {
  try {
    const accounts = [];
    const active = await db.execute('SELECT id, name, username, email, role, branch_id FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const activeUser = safeUser(active[0][0]);
    let activeSaved = false;
    for (const id of savedCookieUserIds(req)) {
      const saved = await readSavedSession(req, id);
      if (!saved) { clearSavedCookie(res, id); continue; }
      const [rows] = await db.execute(
        'SELECT id, name, username, email, role, branch_id, is_active, token_version FROM users WHERE id = ? AND is_active = TRUE LIMIT 1', [id]
      );
      // Akun yang dinonaktifkan/dihapus atau token-nya sudah kedaluwarsa karena
      // perubahan kredensial (token_version naik) tidak boleh tetap terdaftar.
      if (!rows[0] || !versionMatches(saved.payload, rows[0], true)) {
        clearSavedCookie(res, id);
        if (rows[0]) await revokeSessionFamily(id, saved.row.session_id);
        continue;
      }
      if (id === req.user.id) activeSaved = true;
      accounts.push(safeUser(rows[0]));
    }
    return res.json({ success: true, data: { active: activeUser, active_saved: activeSaved, accounts } });
  } catch (error) { return next(error); }
}

// POST /api/auth/accounts/remember — ingat akun yang sedang aktif.
async function rememberAccount(req, res, next) {
  try {
    const [rows] = await db.execute(
      'SELECT id, name, username, email, role, branch_id FROM users WHERE id = ? AND is_active = TRUE LIMIT 1', [req.user.id]
    );
    if (!rows[0]) return unauthorized(res);
    const saved = await ensureSavedAccount(req, res, rows[0]);
    if (!saved) {
      return res.status(409).json({
        success: false, account_saved: false,
        message: `Maksimal ${SAVED_ACCOUNT_LIMIT} akun tersimpan per browser. Hapus salah satu akun untuk menambah yang baru.`,
      });
    }
    return res.json({ success: true, data: { account_saved: true, account: safeUser(rows[0]) } });
  } catch (error) { return next(error); }
}

// POST /api/auth/accounts/switch — pindah ke akun tersimpan tanpa kredensial.
// Sumber sesi: dipertahankan bila diingat, dicabut bila tidak (agar sesi lama
// tidak menggantung tanpa pemilik).
async function switchAccount(req, res, next) {
  try {
    const targetId = Number(req.body?.user_id);
    if (!Number.isSafeInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ success: false, message: 'Akun tujuan tidak valid' });
    }
    if (targetId === req.user.id) {
      const [rows] = await db.execute(
        'SELECT id, name, username, email, role, branch_id FROM users WHERE id = ? AND is_active = TRUE LIMIT 1', [req.user.id]
      );
      if (!rows[0]) return unauthorized(res);
      return res.json({ success: true, data: { user: safeUser(rows[0]) } });
    }
    const saved = await readSavedSession(req, targetId);
    if (!saved) {
      clearSavedCookie(res, targetId);
      return res.status(404).json({
        success: false,
        message: 'Akun tersimpan tidak lagi berlaku. Pilih akun lain atau masuk ulang.',
      });
    }
    const [users] = await db.execute(
      'SELECT id, name, username, email, role, branch_id, is_active, token_version FROM users WHERE id = ? AND is_active = TRUE LIMIT 1', [targetId]
    );
    // versionMatches menolak akun yang token_version-nya bergeser (reset
    // password/role): token tersimpan lama tidak boleh menghasilkan sesi baru.
    if (!users[0] || !versionMatches(saved.payload, users[0], true)) {
      clearSavedCookie(res, targetId);
      if (saved.row) await revokeSessionFamily(targetId, saved.row.session_id);
      return res.status(404).json({
        success: false,
        message: 'Akun tersimpan sudah tidak berlaku (kredensial berubah). Masuk ulang dengan password baru.',
      });
    }
    // putaran rotasi keluarga akun tujuan (token lama langsung hangus)
    const nextTokens = await inAuthTransaction(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT id, session_id FROM refresh_tokens WHERE token_hash = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1 FOR UPDATE',
        [refreshHash(saved.token), targetId]
      );
      if (!rows[0]) return null;
      await connection.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE session_id = ? AND user_id = ? AND revoked_at IS NULL',
        [rows[0].session_id, targetId]);
      const issued = issueTokens(users[0], rows[0].session_id);
      await persistRefreshToken(targetId, issued.refreshToken, connection);
      return issued;
    });
    if (!nextTokens) {
      clearSavedCookie(res, targetId);
      return res.status(404).json({ success: false, message: 'Sesi akun tersimpan sudah tidak berlaku. Masuk ulang.' });
    }
    // Sesi asal: kalau akunnya tidak diingat, cabut supaya tidak jadi sesi hantu.
    const sourceSaved = await readSavedSession(req, req.user.id);
    if (sourceSaved) res.cookie(savedCookieName(req.user.id), sourceSaved.token, savedCookieOptions());
    else await revokeActiveSession(req);
    setAuthCookies(res, nextTokens);
    res.cookie(savedCookieName(targetId), nextTokens.refreshToken, savedCookieOptions());
    return res.json({ success: true, data: { user: safeUser(users[0]) } });
  } catch (error) { return authError(error, res, next); }
}

// DELETE /api/auth/accounts/:userId — hapus satu akun tersimpan. Menghapus akun
// yang sedang aktif sekaligus mengakhiri sesi aktif (browser kembali ke login).
async function removeAccount(req, res, next) {
  try {
    const targetId = Number(req.params?.userId);
    if (!Number.isSafeInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ success: false, message: 'Akun tidak valid' });
    }
    const saved = await readSavedSession(req, targetId);
    if (saved) await revokeSessionFamily(targetId, saved.row.session_id);
    clearSavedCookie(res, targetId);
    const removedActive = targetId === req.user.id;
    if (removedActive) {
      await revokeActiveSession(req);
      clearAuthCookies(res);
    }
    return res.json({ success: true, data: { removed_active: removedActive } });
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
    const user = { id: users[0].id, role: users[0].role, branch_id: users[0].branch_id, sid: payload.sid };
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

module.exports = {
  loginWithPassword, loginWithPin, refresh, mobileRefresh, logout, authenticate, authorize,
  listAccounts, rememberAccount, switchAccount, removeAccount,
};
