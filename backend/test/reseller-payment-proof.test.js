const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.MEDIA_STORAGE ||= 'disk';

// Bukti transfer diunggah lewat public_token (bukti kepemilikan tautan).
// Test ini menjaga aturan: hanya pesanan yang belum dibayar/ditutup, format
// gambar divalidasi, dan bukti lama dibersihkan agar tidak ada file yatim.
const calls = [];
let orderRow = null;

const dbPath = require.resolve('../src/db');
const dbStub = {
  execute: async (sql, params = []) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (/FROM reseller_order_items/i.test(sql)) {
      return [[{ product_name: 'Kaos Denim', sku: 'B3-K10', variant_label: null, price: 1000, quantity: 1, subtotal: 1000 }]];
    }
    if (/FROM reseller_orders o/i.test(sql) || /LEFT JOIN transactions/i.test(sql)) {
      // GET /orders/:token memakai alias `o` + LEFT JOIN invoice.
      return [orderRow ? [orderRow] : []];
    }
    if (/FROM reseller_orders WHERE public_token/i.test(sql)) return [orderRow ? [orderRow] : []];
    return [[]];
  },
  query: async () => [[]],
  getConnection: async () => ({ execute: dbStub.execute, release() {} }),
  end: async () => {},
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: dbStub };

const mediaPath = require.resolve('../src/media-storage');
const mediaCalls = { persisted: [], removed: [] };
let validUpload = true;
const mediaStub = {
  assertValidUpload: async (file) => {
    if (!file) return;
    if (!validUpload) {
      const error = new Error('Isi file tidak sesuai dengan format media');
      error.status = 400;
      throw error;
    }
  },
  createMediaUpload: () => ({
    single: () => (req, _res, next) => { next(); },
  }),
  persistUploadedFile: async (file, folder) => {
    const publicPath = `/uploads/${folder}/proof-${mediaCalls.persisted.length + 1}.jpg`;
    mediaCalls.persisted.push({ file, folder, publicPath });
    return publicPath;
  },
  removeMedia: async (publicPath) => { mediaCalls.removed.push(publicPath); },
};
require.cache[mediaPath] = { id: mediaPath, filename: mediaPath, loaded: true, exports: mediaStub };

const router = require('../src/routes/reseller');

function handlerFor(method, path) {
  const layer = router.stack.find((item) => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, `route ${method.toUpperCase()} ${path} harus terdaftar`);
  return layer.route.stack.at(-1).handle;
}

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const TOKEN = 'a'.repeat(32);
const file = { mimetype: 'image/jpeg', size: 1024, filename: 'proof.jpg', path: '/tmp/proof.jpg' };

function reset() {
  calls.length = 0;
  mediaCalls.persisted.length = 0;
  mediaCalls.removed.length = 0;
  validUpload = true;
  orderRow = {
    id: 5, status: 'new', payment_status: 'unpaid', payment_proof_path: null,
  };
}

test('bukti transfer tersimpan untuk pesanan yang belum dibayar', async () => {
  reset();
  const handler = handlerFor('post', '/orders/:token/proof');
  const res = fakeRes();
  let error;
  await handler({ params: { token: TOKEN }, file }, res, (cause) => { error = cause; });

  assert.equal(error, undefined);
  assert.equal(res.statusCode, 201);
  assert.match(res.body.data.payment_proof_path, /^\/uploads\/payment-proofs\//);
  assert.equal(mediaCalls.persisted.length, 1);
  assert.equal(mediaCalls.persisted[0].folder, 'payment-proofs');

  const update = calls.find(({ sql }) => /^UPDATE reseller_orders SET payment_proof_path/i.test(sql));
  assert.ok(update, 'path bukti harus disimpan');
  assert.equal(update.params[1], 5);
});

test('unggah ulang mengganti bukti dan menghapus file lama', async () => {
  reset();
  orderRow.payment_proof_path = '/uploads/payment-proofs/proof-lama.jpg';
  const handler = handlerFor('post', '/orders/:token/proof');
  const res = fakeRes();
  await handler({ params: { token: TOKEN }, file }, res, () => {});

  assert.equal(res.statusCode, 201);
  assert.deepEqual(mediaCalls.removed, ['/uploads/payment-proofs/proof-lama.jpg']);
});

test('pesanan yang sudah dibayar menolak bukti baru', async () => {
  reset();
  orderRow.payment_status = 'paid';
  const res = fakeRes();
  let error;
  await handlerFor('post', '/orders/:token/proof')(
    { params: { token: TOKEN }, file }, res, (cause) => { error = cause; },
  );
  assert.ok(error);
  assert.equal(error.status, 409);
  assert.equal(mediaCalls.persisted.length, 0);
});

for (const status of ['rejected', 'done', 'cancelled']) {
  test(`pesanan berstatus ${status} menolak bukti baru`, async () => {
    reset();
    orderRow.status = status;
    const res = fakeRes();
    let error;
    await handlerFor('post', '/orders/:token/proof')(
      { params: { token: TOKEN }, file }, res, (cause) => { error = cause; },
    );
    assert.ok(error);
    assert.equal(error.status, 409);
    assert.equal(mediaCalls.persisted.length, 0);
  });
}

test('token tidak valid ditolak sebelum menyimpan file', async () => {
  reset();
  const res = fakeRes();
  let error;
  await handlerFor('post', '/orders/:token/proof')(
    { params: { token: 'bukan-token' }, file }, res, (cause) => { error = cause; },
  );
  assert.ok(error);
  assert.equal(error.status, 400);
  assert.equal(mediaCalls.persisted.length, 0);
});

test('file yang isinya bukan gambar ditolak', async () => {
  reset();
  validUpload = false;
  const res = fakeRes();
  let error;
  await handlerFor('post', '/orders/:token/proof')(
    { params: { token: TOKEN }, file }, res, (cause) => { error = cause; },
  );
  assert.ok(error);
  assert.equal(error.status, 400);
  assert.equal(mediaCalls.persisted.length, 0);
});

test('pesanan tanpa public_token yang cocok menghasilkan 404', async () => {
  reset();
  orderRow = null;
  const res = fakeRes();
  let error;
  await handlerFor('post', '/orders/:token/proof')(
    { params: { token: TOKEN }, file }, res, (cause) => { error = cause; },
  );
  assert.ok(error);
  assert.equal(error.status, 404);
  assert.equal(mediaCalls.persisted.length, 0);
});

test('path bukti ikut terekspos pada status publik', async () => {
  reset();
  orderRow = {
    id: 5, order_no: 'RS-1', status: 'new', payment_status: 'unpaid',
    subtotal: 1000, discount: 0, shipping_cost: 0, total: 1000,
    payment_proof_path: '/uploads/payment-proofs/proof.jpg',
    payment_proof_uploaded_at: '2026-11-24 10:00:00',
    buyer_name: 'Rina',
  };
  const res = fakeRes();
  await handlerFor('get', '/orders/:token')(
    { params: { token: TOKEN } }, res, () => {},
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.payment_proof_path, '/uploads/payment-proofs/proof.jpg');
  assert.ok(res.body.data.payment_proof_uploaded_at);
  // Data sensitif pesanan lain tidak boleh ikut.
  assert.equal(res.body.data.payment_proof_secret, undefined);
});
