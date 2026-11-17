#!/usr/bin/env node
/**
 * Konsolidasi stok varian ke stok produk.
 *
 * Aturan bisnis baru: varian hanya pembeda gambar (warna/ukuran + foto).
 * Stok disimpan satu angka per produk per gudang pada warehouse_stocks dengan
 * variant_id = NULL. Script ini:
 *   1. (dry-run) melaporkan baris stok per varian, selisih products.stock vs
 *      total gudang, dan varian yang masih punya stok.
 *   2. (--apply) menggabungkan semua baris (gudang, produk) menjadi satu baris
 *      variant_id NULL, menghapus baris varian, menolkan product_variants.stock,
 *      lalu menyamakan products.stock dengan total gudang.
 *
 * Jalankan di container backend:
 *   node scripts/consolidate-variant-stock.js            # audit (default)
 *   node scripts/consolidate-variant-stock.js --apply    # eksekusi
 */

const db = require('../src/db');

const APPLY = process.argv.includes('--apply');

async function collectReport() {
  const [variantRows] = await db.execute(
    `SELECT ws.warehouse_id, ws.product_id, p.sku, p.name,
            COUNT(*) AS rows_total,
            SUM(CASE WHEN ws.variant_id IS NOT NULL THEN 1 ELSE 0 END) AS variant_rows,
            SUM(ws.quantity) AS qty_total,
            SUM(CASE WHEN ws.variant_id IS NOT NULL THEN ws.quantity ELSE 0 END) AS qty_in_variants
       FROM warehouse_stocks ws
       JOIN products p ON p.id = ws.product_id
      GROUP BY ws.warehouse_id, ws.product_id, p.sku, p.name
     HAVING SUM(CASE WHEN ws.variant_id IS NOT NULL THEN 1 ELSE 0 END) > 0
      ORDER BY ws.product_id, ws.warehouse_id`
  );

  const [totals] = await db.execute(
    `SELECT
       (SELECT COUNT(*) FROM warehouse_stocks) AS stock_rows,
       (SELECT COUNT(*) FROM warehouse_stocks WHERE variant_id IS NOT NULL) AS variant_stock_rows,
       (SELECT COUNT(*) FROM product_variants WHERE is_active = TRUE AND stock <> 0) AS variant_with_stock,
       (SELECT COUNT(*) FROM product_variants WHERE is_active = TRUE) AS active_variants,
       (SELECT COUNT(DISTINCT product_id) FROM product_variants WHERE is_active = TRUE) AS products_with_variants`
  );

  const [productMismatch] = await db.execute(
    `SELECT p.id, p.sku, p.name, p.stock AS products_stock,
            COALESCE(w.total, 0) AS warehouse_total
       FROM products p
       LEFT JOIN (
         SELECT product_id, SUM(quantity) AS total
           FROM warehouse_stocks
          GROUP BY product_id
       ) w ON w.product_id = p.id
      WHERE w.total IS NOT NULL AND p.stock <> w.total
      ORDER BY p.id`
  );

  return { variantRows, totals: totals[0], productMismatch };
}

function printReport({ variantRows, totals, productMismatch }) {
  console.log('[konsolidasi] Ringkasan stok saat ini');
  console.log(`  baris warehouse_stocks      : ${totals.stock_rows}`);
  console.log(`  baris stok per varian       : ${totals.variant_stock_rows}`);
  console.log(`  produk aktif punya varian   : ${totals.products_with_variants}`);
  console.log(`  varian aktif                : ${totals.active_variants}`);
  console.log(`  varian dengan stok != 0     : ${totals.variant_with_stock}`);
  console.log(`  produk dengan selisih total : ${productMismatch.length}`);

  if (variantRows.length) {
    console.log('\n[konsolidasi] (gudang, produk) yang masih punya baris varian:');
    for (const row of variantRows) {
      console.log(`  produk #${row.product_id} ${row.sku || row.name} · gudang ${row.warehouse_id}`
        + ` · baris=${row.rows_total} (varian=${row.variant_rows})`
        + ` · qty total=${row.qty_total} (di varian=${row.qty_in_variants || 0})`);
    }
  } else {
    console.log('\n[konsolidasi] Tidak ada baris stok per varian. Tidak ada yang perlu digabung.');
  }

  if (productMismatch.length) {
    console.log('\n[konsolidasi] products.stock berbeda dari total gudang (akan disamakan saat --apply):');
    for (const row of productMismatch.slice(0, 30)) {
      console.log(`  produk #${row.id} ${row.sku || row.name} · products.stock=${row.products_stock} · gudang=${row.warehouse_total}`);
    }
    if (productMismatch.length > 30) console.log(`  … dan ${productMismatch.length - 30} produk lain`);
  }
}

async function applyConsolidation() {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [pairs] = await connection.execute(
      `SELECT DISTINCT warehouse_id, product_id
         FROM warehouse_stocks
        WHERE variant_id IS NOT NULL
        ORDER BY product_id, warehouse_id`
    );

    let mergedPairs = 0;
    let removedRows = 0;
    for (const pair of pairs) {
      const [rows] = await connection.execute(
        `SELECT id, variant_id, quantity, rack_position
           FROM warehouse_stocks
          WHERE warehouse_id = ? AND product_id = ?
          FOR UPDATE`,
        [pair.warehouse_id, pair.product_id]
      );
      rows.sort((a, b) => (a.variant_id === null ? -1 : 0) - (b.variant_id === null ? -1 : 0) || a.id - b.id);
      const total = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
      const productRow = rows.find((row) => row.variant_id === null);
      const rack = (productRow && productRow.rack_position)
        || rows.map((row) => row.rack_position).find(Boolean)
        || null;

      if (productRow) {
        await connection.execute(
          'UPDATE warehouse_stocks SET quantity = ?, rack_position = COALESCE(?, rack_position), revision = revision + 1 WHERE id = ?',
          [total, rack, productRow.id]
        );
      } else {
        await connection.execute(
          'INSERT INTO warehouse_stocks (warehouse_id, product_id, variant_id, quantity, reserved_quantity, rack_position, revision) VALUES (?, ?, NULL, ?, 0, ?, 1)',
          [pair.warehouse_id, pair.product_id, total, rack]
        );
      }

      const variantIds = rows.filter((row) => row.variant_id !== null).map((row) => row.id);
      if (variantIds.length) {
        const placeholders = variantIds.map(() => '?').join(',');
        const [deleted] = await connection.execute(
          `DELETE FROM warehouse_stocks WHERE id IN (${placeholders})`,
          variantIds
        );
        removedRows += deleted.affectedRows || variantIds.length;
      }
      mergedPairs += 1;
    }

    const [variantReset] = await connection.execute('UPDATE product_variants SET stock = 0 WHERE stock <> 0');

    const [recalculated] = await connection.execute(
      `UPDATE products p
         JOIN (SELECT product_id, SUM(quantity) AS total FROM warehouse_stocks GROUP BY product_id) w
           ON w.product_id = p.id
          SET p.stock = w.total
        WHERE p.stock <> w.total`
    );

    await connection.commit();
    console.log('\n[konsolidasi] Selesai.');
    console.log(`  pasangan gudang+produk digabung : ${mergedPairs}`);
    console.log(`  baris varian dihapus            : ${removedRows}`);
    console.log(`  baris product_variants ditolkan : ${variantReset.affectedRows || 0}`);
    console.log(`  products.stock disamakan        : ${recalculated.affectedRows || 0}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  const report = await collectReport();
  printReport(report);

  if (!APPLY) {
    console.log('\n[konsolidasi] Mode audit. Jalankan dengan --apply untuk mengeksekusi.');
    return;
  }

  await applyConsolidation();
  const after = await collectReport();
  printReport(after);
  if (after.totals.variant_stock_rows !== 0) {
    throw new Error('Masih ada baris stok per varian setelah konsolidasi');
  }
}

main()
  .then(async () => { await db.end(); })
  .catch(async (error) => {
    console.error('[konsolidasi] GAGAL', error.message || error);
    try { await db.end(); } catch { /* pool mungkin sudah tertutup */ }
    process.exit(1);
  });