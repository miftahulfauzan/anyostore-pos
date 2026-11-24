const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';

// Stateful mini-DB khusus modul reservasi: cukup untuk membuktikan alokasi,
// pelepasan, dan penolakan stok kurang tanpa menyentuh MySQL.
function makeDb() {
  const state = {
    // per (warehouse, product): { id, warehouse_id, quantity, reserved }
    stocks: new Map(),
    reservations: [],
    nextReservationId: 1,
  };
  const key = (warehouseId, productId) => `${warehouseId}:${productId}`;
  function seed(warehouseId, productId, quantity, reserved = 0, id = undefined) {
    state.stocks.set(key(warehouseId, productId), {
      id: id ?? state.stocks.size + 1, warehouse_id: warehouseId, product_id: productId, quantity, reserved,
    });
  }
  async function execute(sql, params = []) {
    const compact = sql.replace(/\s+/g, ' ').trim();
    // Query ketersediaan memilih kolom sebagai `stock_id`; query pelepasan
    // memilih `id`. Tiru perbedaan itu seperti MySQL sungguhan.
    if (/FROM warehouse_stocks/i.test(compact) && /reserved_quantity/i.test(compact)) {
      if (/AS stock_id/i.test(compact)) {
        const [, productId] = params;
        return [[...state.stocks.values()]
          .filter((row) => row.product_id === Number(productId))
          .map((row) => ({ stock_id: row.id, warehouse_id: row.warehouse_id, quantity: row.quantity, reserved: row.reserved }))];
      }
      const [warehouseId, productId] = params;
      const row = state.stocks.get(key(Number(warehouseId), Number(productId)));
      return [row ? [{ id: row.id, reserved: row.reserved }] : []];
    }
    if (/FROM warehouse_stocks/i.test(compact)) {
      const [warehouseId, productId] = params;
      const row = state.stocks.get(key(Number(warehouseId), Number(productId)));
      return [row ? [{ id: row.id, reserved: row.reserved, quantity: row.quantity }] : []];
    }
    if (/^UPDATE warehouse_stocks SET reserved_quantity = COALESCE/i.test(compact)) {
      const [delta, stockId] = params;
      for (const row of state.stocks.values()) {
        if (row.id === Number(stockId)) row.reserved += Number(delta);
      }
      return [{ affectedRows: 1 }];
    }
    if (/^UPDATE warehouse_stocks SET reserved_quantity = \?/i.test(compact)) {
      const [value, stockId] = params;
      for (const row of state.stocks.values()) {
        if (row.id === Number(stockId)) row.reserved = Number(value);
      }
      return [{ affectedRows: 1 }];
    }
    if (/^INSERT INTO reseller_stock_reservations/i.test(compact)) {
      const [orderId, branchId, warehouseId, productId, quantity] = params;
      state.reservations.push({
        id: state.nextReservationId++, order_id: Number(orderId), branch_id: Number(branchId),
        warehouse_id: Number(warehouseId), product_id: Number(productId), quantity: Number(quantity), released_at: null,
      });
      return [{ insertId: state.nextReservationId - 1 }];
    }
    if (/FROM reseller_stock_reservations/i.test(compact) && /released_at IS NULL/i.test(compact)) {
      const orderId = Number(params[0]);
      return [state.reservations.filter((row) => row.order_id === orderId && !row.released_at)];
    }
    if (/^UPDATE reseller_stock_reservations SET released_at = NOW\(\) WHERE id = \?/i.test(compact)) {
      const row = state.reservations.find((item) => item.id === Number(params[0]));
      if (row) row.released_at = Date.now();
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (/SELECT name, sku FROM products/i.test(compact)) return [[{ name: 'Kaos Denim', sku: 'B3-K10' }]];
    if (/SELECT DISTINCT order_id FROM reseller_stock_reservations/i.test(compact)) return [[]];
    return [[]];
  }
  return { state, execute, seed, key };
}

const { reserveStock, releaseOrderReservations, availableInBranch } = require('../src/stock-reservation');

function reservedOf(db, warehouseId, productId) {
  return db.state.stocks.get(db.key(warehouseId, productId))?.reserved ?? 0;
}

test('reserveStock menahan stok yang tersedia dan mencatat alokasi per gudang', async () => {
  const db = makeDb();
  db.seed(3, 10, 5);
  await reserveStock(db, { orderId: 1, branchId: 3, items: [{ product_id: 10, quantity: 2 }] });
  assert.equal(reservedOf(db, 3, 10), 2);
  assert.equal(db.state.reservations.length, 1);
  assert.equal(db.state.reservations[0].quantity, 2);
  // quantity TIDAK disentuh: reservasi hanya menahan, bukan mengubah saldo.
  assert.equal(db.state.stocks.get(db.key(3, 10)).quantity, 5);
});

test('reserveStock menolak pesanan yang melebihi stok tersedia', async () => {
  const db = makeDb();
  db.seed(3, 10, 1);
  await assert.rejects(
    () => reserveStock(db, { orderId: 2, branchId: 3, items: [{ product_id: 10, quantity: 3 }] }),
    (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, 'STOCK_UNAVAILABLE');
      assert.match(error.message, /tidak cukup/);
      return true;
    },
  );
  assert.equal(reservedOf(db, 3, 10), 0, 'tidak boleh ada alokasi parsial saat gagal');
});

test('pesanan kedua tidak bisa merebut stok yang sudah ditahan pesanan pertama', async () => {
  const db = makeDb();
  db.seed(3, 10, 2);
  await reserveStock(db, { orderId: 1, branchId: 3, items: [{ product_id: 10, quantity: 2 }] });
  // Inilah bug yang diperbaiki: dulu keduanya lolos lalu stok minus saat convert.
  await assert.rejects(
    () => reserveStock(db, { orderId: 2, branchId: 3, items: [{ product_id: 10, quantity: 1 }] }),
    (error) => error.code === 'STOCK_UNAVAILABLE',
  );
  assert.equal(await availableInBranch(db, 3, 10), 0);
});

test('alokasi dibagi ke beberapa gudang bila satu gudang tidak cukup', async () => {
  const db = makeDb();
  db.seed(3, 10, 1, 0, 1);
  db.seed(4, 10, 4, 0, 2);
  await reserveStock(db, { orderId: 1, branchId: 3, items: [{ product_id: 10, quantity: 3 }] });
  assert.equal(reservedOf(db, 3, 10), 1);
  assert.equal(reservedOf(db, 4, 10), 2);
  assert.equal(db.state.reservations.length, 2);
});

test('satu produk di beberapa baris pesanan dijumlahkan sebelum dialokasikan', async () => {
  const db = makeDb();
  db.seed(3, 10, 3);
  await reserveStock(db, {
    orderId: 1, branchId: 3,
    items: [{ product_id: 10, quantity: 2 }, { product_id: 10, quantity: 2 }],
  }).then(
    () => assert.fail('seharusnya ditolak: total 4 > stok 3'),
    (error) => assert.equal(error.code, 'STOCK_UNAVAILABLE'),
  );
  assert.equal(reservedOf(db, 3, 10), 0);
});

test('releaseOrderReservations melepas seluruh reservasi dan idempoten', async () => {
  const db = makeDb();
  db.seed(3, 10, 5);
  await reserveStock(db, { orderId: 1, branchId: 3, items: [{ product_id: 10, quantity: 3 }] });
  assert.equal(reservedOf(db, 3, 10), 3);

  assert.equal(await releaseOrderReservations(db, 1), 1);
  assert.equal(reservedOf(db, 3, 10), 0);

  // Pelepasan kedua tidak boleh mengurangi reserved lagi (tidak minus).
  assert.equal(await releaseOrderReservations(db, 1), 0);
  assert.equal(reservedOf(db, 3, 10), 0);

  // Stok bisa dipesan lagi setelah dilepas.
  await reserveStock(db, { orderId: 2, branchId: 3, items: [{ product_id: 10, quantity: 3 }] });
  assert.equal(reservedOf(db, 3, 10), 3);
});

test('releaseOrderReservations tidak membuat reserved negatif pada data tak konsisten', async () => {
  const db = makeDb();
  db.seed(3, 10, 5, 1); // reserved 1
  db.state.reservations.push({ id: 99, order_id: 9, branch_id: 3, warehouse_id: 3, product_id: 10, quantity: 4, released_at: null });
  await releaseOrderReservations(db, 9);
  assert.equal(reservedOf(db, 3, 10), 0, 'reserved dijepit di 0, bukan -3');
});
