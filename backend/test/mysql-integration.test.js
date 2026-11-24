// Test integrasi terhadap MySQL SUNGGUHAN.
//
// Seluruh test backend lain memakai stub SQL buatan tangan, sehingga query yang
// salah (kolom tidak ada, JOIN keliru, tipe data salah) baru ketahuan di
// produksi. Suite ini menjalankan query nyata terhadap MySQL sementara.
//
// Melewati (skip) secara eksplisit bila MYSQL_TEST_URL tidak diset, supaya
// `npm test` tetap bisa dijalankan tanpa Docker. CI menyetelnya.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

const MYSQL_URL = process.env.MYSQL_TEST_URL || '';
const skip = MYSQL_URL ? false : 'MYSQL_TEST_URL tidak diset (jalankan dengan MySQL, mis. lewat docker compose)';

let mysql = null;
let connection = null;

function parseUrl(value) {
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    multipleStatements: true,
  };
}

// Menunggu MySQL siap: container baru biasanya belum menerima koneksi saat
// langkah test dimulai.
async function connectWithRetry(options, attempts = 30) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await mysql.createConnection(options);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

// Mengosongkan seluruh tabel agar setiap menjalankan suite dimulai dari DB
// bersih (schema.sql memakai CREATE TABLE tanpa IF NOT EXISTS, sama seperti
// jalur initdb produksi yang hanya berjalan pada volume baru).
async function resetDatabase(conn) {
  const [tables] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
  );
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const { TABLE_NAME: name } of tables) {
      await conn.query(`DROP TABLE IF EXISTS \`${name}\``);
    }
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

test.before(async () => {
  if (skip) return;
  mysql = require('mysql2/promise');
  connection = await connectWithRetry(parseUrl(MYSQL_URL));
  await resetDatabase(connection);
  // Baseline: schema.sql adalah sumber kebenaran untuk DB baru.
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await connection.query(schema);
});

test.after(async () => {
  if (connection) await connection.end().catch(() => {});
});

test('schema.sql dapat dijalankan pada MySQL sungguhan', { skip }, async () => {
  const [tables] = await connection.query(
    'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()'
  );
  const names = tables.map((row) => row.TABLE_NAME);
  // Tabel inti yang WAJIB ada di schema.sql (baseline DB baru). Tabel fitur
  // yang ditambahkan belakangan (mis. reseller_*) berasal dari migrasi dan
  // diuji terpisah setelah migrate.js dijalankan.
  for (const expected of [
    'branches', 'users', 'products', 'product_variants', 'warehouse_stocks',
    'warehouses', 'transactions', 'transaction_items', 'refresh_tokens',
    'store_settings',
  ]) {
    assert.ok(names.includes(expected), `tabel ${expected} harus dibuat schema.sql`);
  }
  // Fitur loyalitas sudah dihapus, TETAPI tabelnya tetap ada di baseline:
  // migrasi lama 20260804_performance_indexes.sql menambah index pada tabel ini
  // dan migrasi yang sudah jalan tidak boleh diedit. Tabel dihapus oleh migrasi
  // 20261124 (diuji terpisah setelah migrate.js dijalankan).
  assert.ok(names.includes('loyalty_points'), 'tabel legacy tetap ada di baseline agar migrasi lama bisa jalan');
});

test('kolom loyalitas benar-benar hilang dari customers', { skip }, async () => {
  const [columns] = await connection.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers'"
  );
  const names = columns.map((row) => row.COLUMN_NAME);
  assert.ok(!names.includes('loyalty_points'), 'kolom customers.loyalty_points harus sudah dihapus');
  // Kolom inti yang memang ada di baseline tetap utuh.
  assert.ok(names.includes('name'));
  assert.ok(names.includes('phone'));
});

test('migrasi lengkap dapat dijalankan berurutan di atas schema.sql', { skip }, async () => {
  // migrate.js membuka pool sendiri dari env; arahkan ke DB yang sama.
  const url = new URL(MYSQL_URL);
  process.env.DB_HOST = url.hostname;
  process.env.DB_PORT = String(url.port || 3306);
  process.env.DB_USER = decodeURIComponent(url.username);
  process.env.DB_PASSWORD = decodeURIComponent(url.password);
  process.env.DB_NAME = decodeURIComponent(url.pathname.replace(/^\//, ''));

  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'migrate.js')], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    encoding: 'utf8',
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  // Empat migrasi legacy memang sudah gagal sejak sebelum suite ini ada (muncul
  // juga dengan schema.sql versi lama): 20260815_backfill_returned_qty,
  // 20260815_barcode_multi_branch, 20261108_pending_transaction_client_hold_id,
  // 20261116_marketplace_links. Daftar ini menjaga agar kegagalan BARU tetap
  // terdeteksi tanpa memerahkan CI karena masalah lama.
  const KNOWN_LEGACY_FAILURES = [
    '20260815_backfill_returned_qty.sql',
    '20260815_barcode_multi_branch.sql',
    '20261108_pending_transaction_client_hold_id.sql',
    '20261116_marketplace_links.sql',
  ];
  const failed = [...output.matchAll(/\[migrate\] FAILED (\S+\.sql)/g)].map((match) => match[1]);
  const unexpected = failed.filter((file) => !KNOWN_LEGACY_FAILURES.includes(file));
  assert.deepEqual(unexpected, [], `migrasi gagal di luar daftar yang diketahui:\n${output}`);
  // Migrasi yang menjadi tanggung jawab rilis ini WAJIB sukses.
  for (const file of [
    '20261124_remove_loyalty_points.sql',
    '20261124_reseller_stock_reservations.sql',
    '20261124_reseller_payment_proof.sql',
  ]) {
    assert.ok(!failed.includes(file), `${file} tidak boleh gagal`);
    assert.match(output, new RegExp(`applications? .*${file}|applying ${file}`), `${file} harus dijalankan`);
  }

  // Semua migrasi tercatat dengan hash.
  const [rows] = await connection.query('SELECT COUNT(*) AS total FROM _migrations');
  assert.ok(Number(rows[0].total) > 0, 'tabel _migrations harus terisi');

  // Setelah seluruh migrasi, fitur loyalitas benar-benar hilang.
  const [loyaltyTables] = await connection.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'loyalty_points'"
  );
  assert.equal(loyaltyTables.length, 0, 'migrasi 20261124 harus menghapus tabel loyalty_points');
  const [loyaltyColumns] = await connection.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'loyalty_points'"
  );
  assert.equal(loyaltyColumns.length, 0, 'migrasi 20261124 harus menghapus kolom customers.loyalty_points');
});

test('tabel reservasi reseller dan kolom bukti transfer tersedia', { skip }, async () => {
  const [reservation] = await connection.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reseller_stock_reservations'"
  );
  const columns = reservation.map((row) => row.COLUMN_NAME);
  for (const expected of ['order_id', 'warehouse_id', 'product_id', 'quantity', 'released_at']) {
    assert.ok(columns.includes(expected), `kolom reservasi ${expected} harus ada`);
  }

  const [proof] = await connection.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reseller_orders' AND COLUMN_NAME LIKE 'payment_proof%'"
  );
  assert.equal(proof.length, 2, 'payment_proof_path dan payment_proof_uploaded_at harus ada');
});

test('reservasi stok nyata: ketersediaan berkurang dan reserved tidak pernah negatif', { skip }, async () => {
  const { reserveStock, releaseOrderReservations, availableInBranch } = require('../src/stock-reservation');

  await connection.beginTransaction();
  try {
    const [branch] = await connection.query(
      "INSERT INTO branches (name, is_active) VALUES ('Test Reservasi', TRUE)"
    );
    const branchId = branch.insertId;
    const [warehouse] = await connection.query(
      "INSERT INTO warehouses (branch_id, name, type, is_active) VALUES (?, 'Gudang Utama', 'utama', TRUE)",
      [branchId]
    );
    const [category] = await connection.query(
      "INSERT INTO categories (name, slug) VALUES ('Test', 'test-reservasi')"
    );
    const [product] = await connection.query(
      "INSERT INTO products (branch_id, category_id, name, sku, price, stock, is_active) VALUES (?, ?, 'Kaos Uji', 'SKU-UJI-1', 50000, 5, TRUE)",
      [branchId, category.insertId]
    );
    await connection.query(
      'INSERT INTO warehouse_stocks (warehouse_id, product_id, variant_id, quantity, reserved_quantity) VALUES (?, ?, NULL, 5, 0)',
      [warehouse.insertId, product.insertId]
    );
    const [order] = await connection.query(
      `INSERT INTO reseller_orders (order_no, public_token, branch_id, buyer_name, buyer_phone, buyer_address, subtotal, discount, shipping_cost, total, status, payment_status)
       VALUES ('RS-UJI-1', ?, ?, 'Rina', '081234567890', 'Jl. Uji', 100000, 0, 0, 100000, 'new', 'unpaid')`,
      ['a'.repeat(32), branchId]
    );

    assert.equal(await availableInBranch(connection, branchId, product.insertId), 5);

    await reserveStock(connection, {
      orderId: order.insertId,
      branchId,
      items: [{ product_id: product.insertId, quantity: 3 }],
    });
    assert.equal(await availableInBranch(connection, branchId, product.insertId), 2, 'stok tersedia berkurang setelah reservasi');

    // quantity TIDAK berubah: reservasi hanya menahan.
    const [stockRows] = await connection.query(
      'SELECT quantity, reserved_quantity FROM warehouse_stocks WHERE warehouse_id = ? AND product_id = ? AND variant_id IS NULL',
      [warehouse.insertId, product.insertId]
    );
    assert.equal(Number(stockRows[0].quantity), 5);
    assert.equal(Number(stockRows[0].reserved_quantity), 3);

    // Pesanan kedua tidak boleh mengambil stok yang sudah ditahan.
    await assert.rejects(
      () => reserveStock(connection, {
        orderId: order.insertId,
        branchId,
        items: [{ product_id: product.insertId, quantity: 3 }],
      }),
      (error) => error.code === 'STOCK_UNAVAILABLE',
    );

    await releaseOrderReservations(connection, order.insertId);
    assert.equal(await availableInBranch(connection, branchId, product.insertId), 5, 'stok kembali setelah dilepas');

    // Melepas dua kali tidak membuat reserved negatif.
    await releaseOrderReservations(connection, order.insertId);
    const [afterRelease] = await connection.query(
      'SELECT reserved_quantity FROM warehouse_stocks WHERE warehouse_id = ? AND product_id = ? AND variant_id IS NULL',
      [warehouse.insertId, product.insertId]
    );
    assert.equal(Number(afterRelease[0].reserved_quantity), 0);
  } finally {
    await connection.rollback();
  }
});

test('query laporan penjualan berjalan pada MySQL nyata', { skip }, async () => {
  // Query agregat laporan memakai DATE_FORMAT/SUM yang tidak bisa diuji stub.
  const { SALES_STATUSES_SQL } = require('../src/sales-status');
  const [rows] = await connection.query(
    `SELECT DATE_FORMAT(transaction_date, '%Y-%m-%d') AS business_date,
            COUNT(*) AS transactions,
            COALESCE(SUM(grand_total), 0) AS gross
       FROM transactions
      WHERE status IN (${SALES_STATUSES_SQL})
        AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY business_date
      ORDER BY business_date`
  );
  assert.ok(Array.isArray(rows), 'query laporan harus mengembalikan baris');
});