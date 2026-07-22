# 16. Security

## 16.1 Authentication

### JWT + Refresh Token

```javascript
// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, role: user.role, branch_id: user.branch_id },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const crypto = require('crypto');
const hashRefreshToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Simpan hanya hash refresh token di tabel refresh_tokens untuk revoke.
// Logout menerima refresh token (bukan access token) dan menandainya revoked.
const logout = async (req, res) => {
  const { refresh_token: refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: 'Refresh token required' });
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?',
    [hashRefreshToken(refreshToken)]
  );
  res.json({ success: true, message: 'Logout berhasil' });
};
```

### PIN Security

```javascript
// Lockout after 3 failed attempts
const pinAttempts = new Map();

const validatePin = async (userId, pin) => {
  const attempts = pinAttempts.get(userId) || { count: 0, lockedUntil: null };
  
  if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
    throw new Error('Akun terkunci. Coba lagi dalam 5 menit.');
  }
  
  // Load user dari database
  const [users] = await db.query('SELECT pin_hash FROM users WHERE id = ?', [userId]);
  if (!users.length || !users[0].pin_hash) {
    throw new Error('User tidak ditemukan');
  }
  
  // Check PIN
  const isValid = await bcrypt.compare(pin, users[0].pin_hash);
  
  if (!isValid) {
    attempts.count += 1;
    if (attempts.count >= 3) {
      attempts.lockedUntil = Date.now() + 5 * 60 * 1000; // 5 minutes
    }
    pinAttempts.set(userId, attempts);
    throw new Error('PIN salah');
  }
  
  pinAttempts.delete(userId);
  return true;
};
```

## 16.2 Password Hashing

```javascript
const bcrypt = require('bcrypt');

// Hash password (12 rounds)
const hashPassword = async (password) => {
  return await bcrypt.hash(password, 12);
};

// Verify password
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};
```

## 16.3 Role-Based Access Control

```javascript
// backend/src/middleware/authorize.js
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Akses ditolak' });
    }
    next();
  };
};

// Usage
router.post('/users', authenticate, authorize(['owner']), createUser);
router.post('/expenses', authenticate, authorize(['owner', 'manager']), createExpense);
```

> **Frontend guarding:** Selain `authorize()` di backend, frontend menyembunyikan menu/route berdasarkan `user.role` (lihat matrix di `01-fitur-utama.md` §1.5 dan sidebar di `05-halaman-ui.md` §5.1). Frontend mencegah akses visual; backend tetap menolak dengan 403 jika ada yang nekat hit API langsung.

## 16.4 Input Validation

```javascript
const { body, validationResult } = require('express-validator');

const validateTransaction = [
  body('items').isArray({ min: 1 }),
  body('items.*.product_id').isInt(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('payment_method').isIn(['cash', 'qris', 'debit', 'transfer', 'credit', 'split']),
  body('amount_paid').isFloat({ min: 0 }),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];
```

## 16.5 Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Terlalu banyak request, coba lagi nanti'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Terlalu banyak percobaan login'
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
```

## 16.6 CORS Configuration

```javascript
const cors = require('cors');

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

## 16.7 Security Headers

```javascript
const helmet = require('helmet');

app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
  }
}));
```

## 16.8 File Upload Security

```javascript
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});
```

## 16.9 SQL Injection Prevention

```javascript
// ✅ CORRECT - Parameterized queries
const [rows] = await db.query(
  'SELECT * FROM products WHERE id = ?',
  [productId]
);

// ❌ WRONG - String concatenation
const [rows] = await db.query(
  `SELECT * FROM products WHERE id = ${productId}`
);
```

## 16.10 Data Masking

```javascript
// Mask sensitive data in logs
const maskData = (data) => {
  const masked = { ...data };
  if (masked.password) masked.password = '***';
  if (masked.pin || masked.pin_hash) {
    masked.pin = '***';
    masked.pin_hash = '***';
  }
  if (masked.qris_reference) masked.qris_reference = '****' + masked.qris_reference.slice(-4);
  return masked;
};
```

## 16.11 Security Checklist

- [ ] JWT secret changed from default
- [ ] HTTPS enforced
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (Helmet + sanitization)
- [ ] File upload validation
- [ ] Password hashing (bcrypt 12 rounds)
- [ ] PIN disimpan sebagai bcrypt hash, bukan plaintext
- [ ] Refresh token disimpan sebagai hash dan dapat direvoke
- [ ] PIN lockout enabled
- [ ] Sensitive data masked in logs
- [ ] Error messages don't leak info
- [ ] Database backups configured

## 16.12 Retensi Data & Audit

- Jangan hapus transaksi, jurnal, mutasi stok, atau cash drawer movement; gunakan status pembatalan dan audit log.
- Tentukan owner data, masa retensi, dan prosedur ekspor/hapus untuk data pelanggan sebelum go-live.
- Pengiriman invoice WhatsApp harus berdasarkan persetujuan pelanggan; jangan catat isi pesan atau nomor telepon lengkap di application log.
- Uji pemulihan backup secara berkala dan catat RPO (data yang boleh hilang) serta RTO (waktu pemulihan target).
