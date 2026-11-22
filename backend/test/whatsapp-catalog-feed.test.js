const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-database';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

let serializeWhatsAppCatalogCsv;
try {
  ({ serializeWhatsAppCatalogCsv } = require('../src/whatsapp-catalog-feed'));
} catch {
  serializeWhatsAppCatalogCsv = null;
}

test('feed memakai judul polos, ID stabil, harga IDR, merek Basik, negara ID, dan URL HTTPS', () => {
  assert.equal(typeof serializeWhatsAppCatalogCsv, 'function', 'serializer belum diimplementasikan');

  const csv = serializeWhatsAppCatalogCsv([{
    id: 977,
    name: 'Anyostore ROK-04',
    description: 'Kemeja denim',
    category_name: 'Atasan',
    price: 115000,
    available_stock: 4,
    photo_paths: '/uploads/rok-04.jpg||/uploads/rok-04-back.jpg',
  }]);

  assert.equal(csv, [
    'id,title,description,availability,condition,price,link,image_link,additional_image_link,brand,google_product_category,product_type,origin_country,visibility',
    'ANYO-977,ROK-04,Kemeja denim,in stock,new,115000.00 IDR,https://grosir.anyostore.id/produk/977,https://grosir.anyostore.id/uploads/rok-04.jpg,https://grosir.anyostore.id/uploads/rok-04-back.jpg,Basik,,Atasan,ID,published',
  ].join('\n'));
});

test('produk tanpa foto atau harga positif tetap ada dalam feed tetapi berstatus staging', () => {
  assert.equal(typeof serializeWhatsAppCatalogCsv, 'function', 'serializer belum diimplementasikan');

  const csv = serializeWhatsAppCatalogCsv([
    { id: 525, name: 'AG01', category_name: 'Atasan', price: 50000, available_stock: 0, photo_paths: '' },
    { id: 526, name: 'AG02', category_name: 'Atasan', price: 0, available_stock: 1, photo_paths: '/uploads/ag02.jpg' },
  ]);

  assert.match(csv, /ANYO-525,AG01,[^\n]*,out of stock,new,50000\.00 IDR,https:\/\/grosir\.anyostore\.id\/produk\/525,,,Basik,,Atasan,ID,staging/);
  assert.match(csv, /ANYO-526,AG02,[^\n]*,in stock,new,,https:\/\/grosir\.anyostore\.id\/produk\/526,https:\/\/grosir\.anyostore\.id\/uploads\/ag02\.jpg,,Basik,,Atasan,ID,staging/);
});

test('CSV mengutip koma, tanda kutip, dan baris baru', () => {
  assert.equal(typeof serializeWhatsAppCatalogCsv, 'function', 'serializer belum diimplementasikan');

  const csv = serializeWhatsAppCatalogCsv([{
    id: 36,
    name: 'Rok, "Basic"',
    description: 'Denim biru, bahan nyaman\nmodel baru',
    category_name: 'Rok, Wanita',
    price: 89000,
    available_stock: 2,
    photo_paths: '/uploads/rok.jpg',
  }]);

  assert.equal(csv, [
    'id,title,description,availability,condition,price,link,image_link,additional_image_link,brand,google_product_category,product_type,origin_country,visibility',
    'ANYO-36,"Rok, ""Basic""","Denim biru, bahan nyaman\nmodel baru",in stock,new,89000.00 IDR,https://grosir.anyostore.id/produk/36,https://grosir.anyostore.id/uploads/rok.jpg,,Basik,,"Rok, Wanita",ID,published',
  ].join('\n'));
});

test('route feed memakai cabang default, mengirim CSV, dan gagal tertutup bila data kosong', async (t) => {
  const db = require('../src/db');
  const publicRoutes = require('../src/routes/public');
  const originalExecute = db.execute;
  const handler = publicRoutes.stack
    .find((layer) => layer.route?.path === '/whatsapp-catalog.csv')
    .route.stack[0].handle;
  let state = 'products';
  let branchQueries = 0;

  db.execute = async (sql, params) => {
    if (sql.includes("LOWER(TRIM(name)) = 'gudang utama'")) {
      branchQueries += 1;
      return [[{ id: 7 }]];
    }
    if (sql.includes('FROM products p JOIN categories c')) {
      assert.deepEqual(params, [7]);
      return state === 'products'
        ? [[{ id: 977, name: 'Anyostore ROK-04', description: 'Kemeja denim', category_name: 'Atasan', price: 115000, available_stock: 4, photo_paths: '/uploads/rok-04.jpg' }]]
        : [[]];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  t.after(() => {
    db.execute = originalExecute;
  });
  const invoke = async () => {
    const response = {
      statusCode: 200,
      headers: {},
      body: null,
      status(code) { this.statusCode = code; return this; },
      type(value) { this.headers['Content-Type'] = value; return this; },
      set(name, value) { this.headers[name] = value; return this; },
      send(body) { this.body = body; return this; },
    };
    let forwardedError = null;
    await handler({}, response, (error) => { forwardedError = error; });
    return { ...response, forwardedError };
  };

  const feed = await invoke();
  assert.equal(feed.statusCode, 200);
  assert.equal(feed.headers['Content-Type'], 'text/csv; charset=utf-8');
  assert.match(feed.body, /ANYO-977,ROK-04,/);
  assert.equal(feed.headers['Cache-Control'], 'no-store');
  assert.equal(branchQueries, 1);

  state = 'empty';
  const emptyFeed = await invoke();
  assert.equal(emptyFeed.statusCode, 503);
  assert.match(emptyFeed.body, /no active products/i);

  state = 'no-branch';
  db.execute = async (sql) => {
    if (sql.includes("LOWER(TRIM(name)) = 'gudang utama'")) return [[]];
    if (sql.includes("name LIKE '%gudang%utama%'")) return [[]];
    if (sql.includes('FROM branches WHERE is_active=TRUE')) return [[]];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const noBranchFeed = await invoke();
  assert.equal(noBranchFeed.statusCode, 503);
  assert.match(noBranchFeed.body, /default branch not found/i);
});
