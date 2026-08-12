const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const db = require('./db');
const { corsOrigin } = require('./config');
const { authenticate, loginWithPassword, loginWithPin, refresh, mobileRefresh, logout } = require('./auth');
const productsRouter = require('./routes/products');
const inventoryRouter = require('./routes/inventory');
const transactionsRouter = require('./routes/transactions');
const printerRouter = require('./routes/printer');
const customersRouter = require('./routes/customers');
const returnsRouter = require('./routes/returns');
const cashDrawerRouter = require('./routes/cash-drawer');
const suppliersRouter = require('./routes/suppliers');
const reportsRouter = require('./routes/reports');
const purchaseOrdersRouter = require('./routes/purchase-orders');
const inventoryControlRouter = require('./routes/inventory-control');
const financeRouter = require('./routes/finance');
const usersRouter = require('./routes/users');
const settingsRouter = require('./routes/settings');
const dashboardRouter = require('./routes/dashboard');
const commissionsRouter = require('./routes/commissions');
const { router: promotionsRouter } = require('./routes/promotions');
const taxRouter = require('./routes/tax');
const publicRouter = require('./routes/public');
const linkPageRouter = require('./routes/link-page');
const activityLogsRouter = require('./routes/activity-logs');
const backupRouter = require('./routes/backup');
const path = require('path');
const { serveBlob } = require('./media-storage');

const app = express();
app.set('trust proxy', 1);
// Key generator memakai req.ip (dari proxy tepercaya), bukan header yang bisa
// dipalsukan klien (mis. x-nf-client-connection-ip).
const limiterOptions = { keyGenerator: (req) => req.ip || 'unknown', validate: { ip: false } };
// Product images are served by the API port and rendered by the frontend port.
// Permit that cross-origin resource use while retaining Helmet's other headers.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '6mb' }));
app.use(cookieParser());
app.use('/uploads', serveBlob, express.static(path.join(process.cwd(), 'uploads'), { maxAge: '7d' }));
app.use('/api', rateLimit({ ...limiterOptions, windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false, handler: (req, res) => res.status(429).json({ success: false, message: 'Terlalu banyak permintaan, coba lagi dalam 1 menit' }) }));

const loginLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 15 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ success: false, message: 'Terlalu banyak percobaan login, coba lagi 15 menit' }),
});

app.get('/api/health', async (_req, res, next) => {
  try { await db.query('SELECT 1'); res.json({ success: true, data: { status: 'ok' } }); }
  catch (error) { next(error); }
});
app.post('/api/auth/login', loginLimiter, loginWithPassword);
app.post('/api/auth/login-pin', loginLimiter, loginWithPin);
app.post('/api/auth/refresh', loginLimiter, refresh);
app.post('/api/auth/mobile-refresh', loginLimiter, mobileRefresh);
app.post('/api/auth/logout', logout);
app.get('/api/auth/me', authenticate, async (req, res, next) => {
  try {
    const [[user], [branch]] = await Promise.all([
      db.execute('SELECT id, name, email, role, branch_id FROM users WHERE id = ? LIMIT 1', [req.user.id]),
      db.execute('SELECT id, name FROM branches WHERE id = ? LIMIT 1', [req.user.branch_id])
    ]);
    if (!user[0]) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    res.json({ success: true, data: { ...user[0], branch_name: branch[0]?.name || null } });
  } catch (error) { next(error); }
});
app.use('/api/public', publicRouter);
app.use('/api/link-page', linkPageRouter);
app.use('/api/activity-logs', activityLogsRouter);
app.use('/api/backup', backupRouter);
app.use('/api/products', productsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/printer', printerRouter);
app.use('/api/customers', customersRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/cash-drawer', cashDrawerRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/inventory-control', inventoryControlRouter);
app.use('/api/finance', financeRouter);
app.use('/api/users', usersRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/commissions', commissionsRouter);
app.use('/api/promotions', promotionsRouter);
app.use('/api/tax', taxRouter);

app.use((req, res) => res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Data sudah ada (SKU, barcode, email, atau kode mungkin duplikat)' });
  }
  res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Terjadi kesalahan internal' });
});

module.exports = app;
