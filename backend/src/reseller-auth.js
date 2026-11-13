// Autentikasi pembeli reseller (email + password). Terpisah total dari
// autentikasi pegawai (cookie `pos_access`): pembeli memakai cookie
// `buyer_session` dengan SameSite=Lax karena halaman dibuka dari tautan
// WhatsApp, dan hanya boleh mengakses endpoint /api/reseller.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const COOKIE_NAME = 'buyer_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_TTL_MS,
};

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

function isValidEmail(value) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(normalizeEmail(value));
}

function validatePassword(value) {
  const password = String(value ?? '');
  if (password.length < 8) return 'Password minimal 8 karakter';
  if (password.length > 72) return 'Password maksimal 72 karakter';
  return null;
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(password), String(hash));
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Lockout per email di samping rate limit per IP.
const attempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function recordFailure(email) {
  const key = normalizeEmail(email);
  const now = Date.now();
  const entry = attempts.get(key) || { count: 0, first: now };
  if (now - entry.first > WINDOW_MS) {
    entry.count = 1;
    entry.first = now;
  } else {
    entry.count += 1;
  }
  attempts.set(key, entry);
}

function isLocked(email) {
  const key = normalizeEmail(email);
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function clearFailures(email) {
  attempts.delete(normalizeEmail(email));
}

async function startSession(res, account, { ip = null, userAgent = null } = {}) {
  const token = createSessionToken();
  await db.execute(
    'INSERT INTO reseller_sessions (account_id, token_hash, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, FROM_UNIXTIME(?))',
    [account.id, hashToken(token), ip, userAgent ? String(userAgent).slice(0, 255) : null, Math.floor((Date.now() + SESSION_TTL_MS) / 1000)],
  );
  await db.execute('UPDATE reseller_accounts SET last_login_at = NOW() WHERE id = ?', [account.id]);
  res.cookie(COOKIE_NAME, token, cookieOptions);
  return token;
}

async function endSession(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    await db.execute('DELETE FROM reseller_sessions WHERE token_hash = ?', [hashToken(token)]);
  }
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
}

// Mengembalikan akun aktif atau null. Tidak pernah melempar error 401 sendiri
// supaya endpoint publik (checkout guest) bisa memakainya sebagai opsional.
async function currentAccount(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  const [rows] = await db.execute(
    `SELECT a.id, a.branch_id, a.customer_id, a.email, a.name, a.phone, a.status
       FROM reseller_sessions s
       JOIN reseller_accounts a ON a.id = s.account_id
      WHERE s.token_hash = ? AND s.expires_at > NOW()
      LIMIT 1`,
    [hashToken(token)],
  );
  const account = rows[0];
  if (!account || account.status !== 'active') return null;
  return account;
}

async function requireBuyer(req, res, next) {
  try {
    const account = await currentAccount(req);
    if (!account) return res.status(401).json({ success: false, message: 'Silakan masuk terlebih dahulu' });
    req.buyer = account;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_MS,
  normalizeEmail,
  isValidEmail,
  validatePassword,
  hashPassword,
  verifyPassword,
  createSessionToken,
  hashToken,
  startSession,
  endSession,
  currentAccount,
  requireBuyer,
  recordFailure,
  isLocked,
  clearFailures,
  _attempts: attempts,
};