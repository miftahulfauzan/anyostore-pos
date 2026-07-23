const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { corsOrigin } = require('./config');
const { authenticate, loginWithPassword, refresh, logout } = require('./auth');
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
const path = require('path');
const { serveBlob } = require('./media-storage');

const app = express();
app.set('trust proxy', 1);
const serverlessClientKey = (req) => {
  const forwarded = req.headers['x-nf-client-connection-ip'] || req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded)) return forwarded[0] || 'netlify-client';
  return String(forwarded || req.socket?.remoteAddress || 'netlify-client').split(',')[0].trim() || 'netlify-client';
};
const limiterOptions = { keyGenerator: serverlessClientKey, validate: { ip: false } };
// Product images are served by the API port and rendered by the frontend port.
// Permit that cross-origin resource use while retaining Helmet's other headers.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '6mb' }));
app.use('/uploads', serveBlob, express.static(path.join(process.cwd(), 'uploads'), { maxAge: '7d' }));
app.use('/api', rateLimit({ ...limiterOptions, windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false, handler: (req, res) => res.status(429).json({ success: false, message: 'Terlalu banyak permintaan, coba lagi dalam 1 menit' }) }));
app.use('/api/auth', rateLimit({ ...limiterOptions, windowMs: 15 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', async (_req, res, next) => {
  try { await db.query('SELECT 1'); res.json({ success: true, data: { status: 'ok' } }); }
  catch (error) { next(error); }
});
app.post('/api/auth/login', loginWithPassword);
app.post('/api/auth/refresh', refresh);
app.post('/api/auth/logout', logout);
app.get('/api/auth/me', authenticate, (req, res) => res.json({ success: true, data: req.user }));
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

app.use((req, res) => res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Terjadi kesalahan internal' });
});

module.exports = app;
