const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

// ---------------------------------------------------------------- stubs -----

const calls = [];
const stockCalls = [];
const sequenceNumber = 7;
const ORDER_INSERT_ID = 100;

const catalog = [
  { id: 10, name: 'Kaos Denim', sku: 'B3-K10', price: 95000 },
  { id: 11, name: 'Celana Denim', sku: 'B3-C11', price: 150000 },
];

async function baseExecute(sql, params = []) {
  calls.push({ sql, params });
  const compact = sql.replace(/\s+/g, ' ').trim();
  if (/^INSERT INTO reseller_orders/i.test(compact)) return [{ insertId: ORDER_INSERT_ID }];
  if (/^INSERT INTO reseller_order_items/i.test(compact)) return [{ insertId: 1 }];
  if (/^INSERT INTO customers/i.test(compact)) return [{ insertId: 55 }];
  if (/^INSERT INTO reseller_sequences/i.test(compact)) return [{ affectedRows: 1 }];
  if (/^UPDATE reseller_sequences/i.test(compact)) return [{ affectedRows: 1 }];
  if (/SELECT last_number FROM reseller_sequences/i.test(compact)) return [[{ last_number: sequenceNumber }]];
  if (/FROM products/i.test(compact) && /price/i.test(compact)) {
    const ids = params.slice(1).map(Number).filter((value) => Number.isInteger(value));
    return [catalog.filter((row) => ids.includes(row.id))];
  }
  if (/FROM product_variants/i.test(compact)) return [[{ id: 21, color: 'Biru', size: 'L', price: 0 }]];
  if (/FROM promotions/i.test(compact)) return [[]];
  if (/FROM shipping_rates/i.test(compact)) return [[{ cost: 20000, cost_per_kg: 0 }]];
  if (/FROM branches/i.test(compact)) return [[{ id: 3, name: 'Anyo Blok B' }]];
  if (/FROM reseller_orders/i.test(compact)) return [[]];
  if (/FROM customers/i.test(compact)) return [[]];
  if (/FROM transactions/i.test(compact)) return [[]];
  if (/FROM warehouses/i.test(compact)) return [[{ id: 3 }]];
  if (/FROM invoice_sequences/i.test(compact)) return [[{ last_number: 12 }]];
  if (/FROM store_settings/i.test(compact)) return [[{ value: 'INV' }]];
  if (/^INSERT INTO transactions/i.test(compact)) return [{ insertId: 900 }];
  return [[]];
}

const connection = {
  beginTransaction: async () => {},
  commit: async () => {},
  rollback: async () => {},
  release: () => {},
  execute: baseExecute,
  query: baseExecute,
};

const dbPath = require.resolve('../src/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    execute: baseExecute,
    query: baseExecute,
    getConnection: async () => connection,
    end: async () => {},
  },
};

const stockPath = require.resolve('../src/stock');
require.cache[stockPath] = {
  id: stockPath,
  filename: stockPath,
  loaded: true,
  exports: {
    adjustStock: async (_connection, payload) => { stockCalls.push(payload); return { before: 10, after: 9 }; },
  },
};

const authPath = require.resolve('../src/auth');
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: {
    authenticate: (req, _res, next) => { req.user = { id: 1, role: 'owner', branch_id: 3 }; next(); },
    authorize: () => (req, _res, next) => next(),
  },
};

const resellerRouter = require('../src/routes/reseller');
const adminRouter = require('../src/routes/reseller-admin');
const resellerAuth = require('../src/reseller-auth');
const { __test } = require('../src/routes/reseller');

function handlerFor(router, path, method) {
  const layer = router.stack.find((item) => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, `route ${method.toUpperCase()} ${path} harus terdaftar`);
  return layer.route.stack.at(-1).handle;
}

function fakeRes() {
  return {
    statusCode: 200,
    cookie: () => {},
    clearCookie: () => {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function reset() {
  connection.execute = baseExecute;
  calls.length = 0;
}

const buyerBody = {
  buyer: {
    name: 'Siti Reseller',
    phone: '081234567890',
    address: 'Jl. Merdeka No. 10, Bandung',
    city: 'Bandung',
    postal_code: '40111',
  },
  items: [{ product_id: 10, quantity: 1 }],
  shipping_area: 'Bandung',
};

// --------------------------------------------------------------- helper -----

test('validasi email & password pembeli', () => {
  assert.equal(resellerAuth.normalizeEmail('  Siti@Example.COM '), 'siti@example.com');
  assert.equal(resellerAuth.isValidEmail('siti@example.com'), true);
  assert.equal(resellerAuth.isValidEmail('bukan-email'), false);
  assert.match(resellerAuth.validatePassword('1234567'), /minimal 8/);
  assert.equal(resellerAuth.validatePassword('rahasia123'), null);
});

test('password disimpan sebagai hash bcrypt yang bisa diverifikasi', async () => {
  const hash = await resellerAuth.hashPassword('rahasia123');
  assert.notEqual(hash, 'rahasia123');
  assert.equal(await resellerAuth.verifyPassword('rahasia123', hash), true);
  assert.equal(await resellerAuth.verifyPassword('salah', hash), false);
});

test('nomor pesanan memakai format RS-YYYYMMDD-B<branch>-NNNN', async () => {
  const number = await __test.nextOrderNo(connection, 3, '2026-11-15');
  assert.equal(number, 'RS-20261115-B3-0007');
});

test('voucher per_pcs menghitung diskon dari jumlah pcs', async () => {
  connection.execute = async (sql) => {
    if (/FROM promotions/i.test(sql)) {
      return [[{ code: 'HEMAT', discount_type: 'per_pcs', discount_value: 5000, min_purchase: 0, max_discount: null }]];
    }
    return [[]];
  };
  try {
    const result = await __test.voucherDiscount(connection, 3, 'HEMAT', 200000, 4);
    assert.equal(result.discount, 20000);
    assert.equal(result.code, 'HEMAT');
  } finally {
    reset();
  }
});

// -------------------------------------------------------------- pesanan -----

test('checkout guest: 1 pcs boleh, harga dari server, ongkir dari tarif cabang', async () => {
  reset();
  const handler = handlerFor(resellerRouter, '/orders', 'post');
  const res = fakeRes();
  let error;
  await handler(
    { body: { ...buyerBody, branch_id: 3, shipping_cost: 1 }, cookies: {} },
    res,
    (cause) => { error = cause; },
  );

  assert.equal(error, undefined);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.subtotal, 95000);
  assert.equal(res.body.data.shipping_cost, 20000);
  assert.equal(res.body.data.total, 115000);
  assert.match(res.body.data.order_no, /^RS-\d{8}-B3-0007$/);
  assert.match(res.body.data.public_token, /^[0-9a-f]{32}$/);

  const itemInsert = calls.find(({ sql }) => /^INSERT INTO reseller_order_items/i.test(sql.trim()));
  assert.ok(itemInsert, 'item pesanan harus tersimpan');
  assert.equal(itemInsert.params[6], 95000, 'harga item memakai harga produk di server');
  assert.equal(itemInsert.params[7], 1, 'quantity 1 pcs diterima (reseller tanpa minimum)');
});

test('checkout idempoten: client_order_id yang sama tidak membuat pesanan ganda', async () => {
  reset();
  const dbModule = require('../src/db');
  const previousDbExecute = dbModule.execute;
  const idempotentStub = async (sql) => {
    if (/SELECT id, order_no, public_token/i.test(sql)) {
      return [[{ id: 77, order_no: 'RS-20261115-B3-0001', public_token: 'a'.repeat(32), total: 115000, status: 'new', payment_status: 'unpaid' }]];
    }
    return [[]];
  };
  dbModule.execute = idempotentStub;
  connection.execute = idempotentStub;
  const handler = handlerFor(resellerRouter, '/orders', 'post');
  const res = fakeRes();
  let error;
  try {
    await handler({ body: { ...buyerBody, client_order_id: 'order-abc' }, cookies: {} }, res, (cause) => { error = cause; });
  } finally {
    dbModule.execute = previousDbExecute;
    reset();
  }
  assert.equal(error, undefined);
  assert.equal(res.body.idempotent, true);
  assert.equal(res.body.data.order_no, 'RS-20261115-B3-0001');
});

test('checkout menolak keranjang kosong dan alamat kosong', async () => {
  reset();
  const handler = handlerFor(resellerRouter, '/orders', 'post');

  const emptyCart = fakeRes();
  let errorCart;
  await handler({ body: { items: [] }, cookies: {} }, emptyCart, (cause) => { errorCart = cause; });
  assert.equal(errorCart.status, 400);

  const noAddress = fakeRes();
  let errorAddress;
  await handler(
    { body: { items: buyerBody.items, buyer: { name: 'A', phone: '081234567890', address: '' } }, cookies: {} },
    noAddress,
    (cause) => { errorAddress = cause; },
  );
  assert.equal(errorAddress.status, 400);
});

// ---------------------------------------------------------------- admin -----

test('konversi ditolak sebelum pesanan ditandai dibayar', async () => {
  reset();
  connection.execute = async (sql) => {
    if (/FROM reseller_orders/i.test(sql)) {
      return [[{
        id: 5, order_no: 'RS-20261115-B3-0001', branch_id: 3, status: 'confirmed',
        payment_status: 'unpaid', subtotal: 95000, discount: 0, shipping_cost: 20000,
        total: 115000, customer_id: 55, transaction_id: null,
      }]];
    }
    return [[]];
  };
  let error;
  try {
    await handlerFor(adminRouter, '/orders/:id/convert', 'post')(
      { user: { id: 1, role: 'owner', branch_id: 3 }, body: { payment_method: 'transfer' }, params: { id: '5' }, query: {} },
      fakeRes(),
      (cause) => { error = cause; },
    );
  } finally {
    reset();
  }
  assert.equal(error?.status, 409);
});

test('konversi pesanan yang sudah dibayar membuat transaksi dengan ongkir dan memotong stok', async () => {
  reset();
  stockCalls.length = 0;
  connection.execute = async (sql, params = []) => {
    calls.push({ sql, params });
    const compact = sql.replace(/\s+/g, ' ').trim();
    if (/FROM reseller_orders/i.test(compact)) {
      return [[{
        id: 5, order_no: 'RS-20261115-B3-0001', branch_id: 3, status: 'paid',
        payment_status: 'paid', subtotal: 95000, discount: 0, shipping_cost: 20000,
        total: 115000, customer_id: 55, transaction_id: null,
      }]];
    }
    if (/FROM reseller_order_items/i.test(compact)) {
      return [[{ id: 1, product_id: 10, variant_id: null, product_name: 'Kaos Denim', sku: 'B3-K10', variant_label: null, price: 95000, quantity: 1, subtotal: 95000 }]];
    }
    if (/FROM warehouses/i.test(compact)) return [[{ id: 3 }]];
    if (/FROM products/i.test(compact)) return [[{ id: 10, cost: 60000 }]];
    if (/FROM invoice_sequences/i.test(compact)) return [[{ last_number: 12 }]];
    if (/FROM store_settings/i.test(compact)) return [[{ value: 'INV' }]];
    if (/^INSERT INTO transactions/i.test(compact)) return [{ insertId: 900 }];
    return [[]];
  };

  const res = fakeRes();
  let error;
  try {
    await handlerFor(adminRouter, '/orders/:id/convert', 'post')(
      { user: { id: 1, role: 'owner', branch_id: 3 }, body: { payment_method: 'transfer' }, params: { id: '5' }, query: {} },
      res,
      (cause) => { error = cause; },
    );
  } finally {
    const captured = [...calls];
    reset();
    assert.equal(error, undefined);
    assert.equal(res.body.data.transaction_id, 900);
    assert.equal(res.body.data.grand_total, 115000);
    assert.equal(stockCalls.length, 1);
    assert.equal(stockCalls[0].delta, -1);
    assert.equal(stockCalls[0].channel, 'reseller');

    const transactionInsert = captured.find(({ sql }) => /^INSERT INTO transactions/i.test(sql.trim()));
    assert.equal(transactionInsert.params[8], 115000, 'grand_total termasuk ongkir (uang diterima)');
    assert.equal(transactionInsert.params[9], 20000, 'shipping_cost tercatat terpisah di transaksi');
  }
});

test('endpoint admin memakai scoping cabang dan metode bayar yang valid', () => {
  const { scopedBranch, PAYMENT_METHODS } = require('../src/routes/reseller-admin').__test;
  assert.equal(scopedBranch({ user: { role: 'kasir', branch_id: 4 } }, 9), 4);
  assert.equal(scopedBranch({ user: { role: 'owner', branch_id: 1 } }, 9), 9);
  assert.deepEqual(PAYMENT_METHODS, ['cash', 'qris', 'transfer', 'debit']);
});

test('informasi pembayaran jatuh ke rekening default bila setelan kosong', async () => {
  reset();
  connection.execute = async (sql) => {
    if (/FROM store_settings/i.test(sql)) return [[]];
    if (/FROM branches/i.test(sql)) return [[{ id: 3, name: 'Anyo Blok B' }]];
    return [[]];
  };
  const res = fakeRes();
  let error;
  try {
    await handlerFor(resellerRouter, '/payment-info', 'get')({ query: {} }, res, (cause) => { error = cause; });
  } finally {
    reset();
  }
  assert.equal(error, undefined);
  assert.equal(res.body.data.bank_accounts[0].bank, 'BCA');
  assert.ok(res.body.data.note.includes('WhatsApp'));
});