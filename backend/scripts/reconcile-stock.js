#!/usr/bin/env node
// Rekonsiliasi stok level PRODUK (varian tidak menyimpan stok).
//   - products.stock harus sama dengan SUM(warehouse_stocks.quantity).
//   - product_variants.stock harus 0 (deprecated).
//   - warehouse_stocks tidak boleh punya baris variant_id NOT NULL
//     (pakai scripts/consolidate-variant-stock.js --apply untuk merapikan).
//
// Jalankan di dalam container backend:
//   node scripts/reconcile-stock.js            # audit saja
//   node scripts/reconcile-stock.js --fix      # audit + perbaiki total & stok varian

const db = require('../src/db');

async function main() {
  const fix = process.argv.includes('--fix');
  const [products] = await db.execute(
    `SELECT p.id, p.branch_id, p.sku, p.name, p.stock AS products_stock,
            (SELECT COALESCE(SUM(ws.quantity), 0) FROM warehouse_stocks ws WHERE ws.product_id = p.id) AS warehouse_total
     FROM products p
     WHERE p.is_active = TRUE
     ORDER BY p.branch_id, p.sku`
  );
  const [variantRows] = await db.execute(
    `SELECT ws.id, ws.warehouse_id, ws.product_id, ws.variant_id, ws.quantity
       FROM warehouse_stocks ws
      WHERE ws.variant_id IS NOT NULL
      ORDER BY ws.product_id, ws.warehouse_id`
  );
  const [[variantStock]] = await db.execute(
    `SELECT COUNT(*) AS total, COALESCE(SUM(stock), 0) AS qty
       FROM product_variants
      WHERE is_active = TRUE AND stock <> 0`
  );

  const mismatch = products.filter((p) => Number(p.products_stock || 0) !== Number(p.warehouse_total || 0));

  console.log(`Produk dicek: ${products.length}`);
  console.log(`Selisih products.stock vs gudang: ${mismatch.length}`);
  console.log(`Baris stok per varian (harus 0): ${variantRows.length}`);
  console.log(`Varian dengan stok != 0 (harus 0): ${variantStock.total} (total qty ${variantStock.qty})`);

  for (const p of mismatch) {
    console.log(`PRODUK  #${p.id} ${p.sku || p.name} — products.stock=${p.products_stock}, gudang=${p.warehouse_total}`);
  }
  for (const row of variantRows.slice(0, 30)) {
    console.log(`VARIAN  ws#${row.id} gudang ${row.warehouse_id} produk #${row.product_id} varian #${row.variant_id} qty=${row.quantity}`);
  }
  if (variantRows.length > 30) console.log(`… dan ${variantRows.length - 30} baris varian lain`);

  if (!fix) {
    if (mismatch.length || variantRows.length || variantStock.total) {
      console.log('\nJalankan dengan --fix untuk menyamakan products.stock dan menolkan stok varian.');
      console.log('Untuk menggabungkan baris stok varian: node scripts/consolidate-variant-stock.js --apply');
    }
    await db.end();
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [synced] = await connection.execute(
      `UPDATE products p
         JOIN (SELECT product_id, SUM(quantity) AS total FROM warehouse_stocks GROUP BY product_id) w
           ON w.product_id = p.id
          SET p.stock = w.total
        WHERE p.stock <> w.total`
    );
    const [variantReset] = await connection.execute('UPDATE product_variants SET stock = 0 WHERE stock <> 0');
    await connection.commit();
    console.log(`\n[fix] products.stock disamakan: ${synced.affectedRows || 0}`);
    console.log(`[fix] product_variants.stock ditolkan: ${variantReset.affectedRows || 0}`);
    if (variantRows.length) {
      console.log('[fix] Baris stok per varian BELUM digabung. Jalankan scripts/consolidate-variant-stock.js --apply.');
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await db.end();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});