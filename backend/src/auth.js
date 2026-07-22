const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { jwtSecret, jwtRefreshSecret } = require('./config');

const refreshHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

function issueTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, role: user.role, branch_id: user.branch_id },
    jwtSecret,
    { expiresIn: '12h' }
  );
  const refreshToken = jwt.sign({ id: user.id }, jwtRefreshSecret, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

async function persistRefreshToken(userId, refreshToken) {
  const decoded = jwt.decode(refreshToken);
  await db.execute(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, FROM_UNIXTIME(?))',
    [userId, refreshHash(refreshToken), decoded.exp]
  );
}

async function loginWithPassword(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email dan password wajib diisi' });
    const [rows] = await db.execute(
      'SELECT id, branch_id, name, email, password, role FROM users WHERE email = ? AND is_active = TRUE LIMIT 1',
      [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: 'Kredensial tidak valid' });
    }
    const tokens = issueTokens(user);
    await persistRefreshToken(user.id, tokens.refreshToken);
    await db.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    return res.json({ success: true, data: { user: { id: user.id, name: user.name, email: user.email, role: user.role, branch_id: user.branch_id }, ...tokens } });
  } catch (error) { return next(error); }
}

async function refresh(req, res, next) {
  try {
    const { refresh_token: token } = req.body;
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
    return res.json({ success: true, data: nextTokens });
  } catch (error) { return next(error); }
}

async function logout(req, res, next) {
  try {
    const { refresh_token: token } = req.body;
    if (token) await db.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?', [refreshHash(token)]);
    return res.json({ success: true, message: 'Logout berhasil' });
  } catch (error) { return next(error); }
}

function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ success: false, message: 'Token wajib diisi' });
    req.user = jwt.verify(token, jwtSecret);
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

module.exports = { loginWithPassword, refresh, logout, authenticate, authorize };
