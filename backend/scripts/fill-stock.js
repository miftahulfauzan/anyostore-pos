const mysql = require('mysql2/promise');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const branchName = process.argv[2] || 'toko blok b';
const qtyPerModel = parseInt(process.argv[3] || '10', 10);

async function main() {
  const db = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'pos_pakaian',
    user: process.env.DB_USER || 'pos_user',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 5,
  });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [branchRows] = await connection.execute(
      `SELECT id FROM branches WHERE LOWER(name) = LOWER(?) AND is_active = TRUE LIMIT 1`,
      [branchName]
    );
    if (!branchRows.length) {
      console.error(`Branch "${branchName}" tidak ditemukan.`);
      const [all] = await connection.execute(`SELECT id, name FROM branches WHERE is_active = TRUE`);
      console.log('Branch aktif tersedia:', all.map(b => `${b.id}=${b.name}`).join(', '));
      process.exit(1);
    }
    const branchId = branchRows[0].id;

    const [warehouseRows] = await connection.execute(
      `SELECT id FROM warehouses WHERE branch_id = ? AND is_active = TRUE ORDER BY id LIMIT 1`,
      [branchId]
    );
    if (!warehouseRows.length) {
      console.error(`Tidak ada gudang aktif untuk branch ${branchId}.`);
      process.exit(1);
    }
    const warehouseId = warehouseRows[0].id;

    const [variants] = await connection.execute(
      `SELECT pv.id, pv.product_id
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE p.branch_id = ? AND p.is_active = TRUE AND pv.is_active = TRUE`,
      [branchId]
    );

    let updated = 0;
    for (const v of variants) {
      const [balanceRows] = await connection.execute(
        `SELECT id, quantity FROM warehouse_stocks WHERE warehouse_id = ? AND product_id = ? AND variant_id <=> ?`,
        [warehouseId, v.product_id, v.id]
      );
      const stockBefore = balanceRows.length ? Number(balanceRows[0].quantity) : 0;
      const stockAfter = qtyPerModel;

      if (balanceRows.length) {
        await connection.execute(
          `UPDATE warehouse_stocks SET quantity = ? WHERE id = ?`,
          [stockAfter, balanceRows[0].id]
        );
      } else {
        await connection.execute(
          `INSERT INTO warehouse_stocks (warehouse_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)`,
          [warehouseId, v.product_id, v.id, stockAfter]
        );
      }

      await connection.execute(
        `UPDATE product_variants SET stock = ? WHERE id = ?`,
        [stockAfter, v.id]
      );

      // Catat history perubahan stok (manual adjustment)
      await connection.execute(
        `INSERT INTO stock_mutations (branch_id, warehouse_id, product_id, variant_id, user_id, type, reference_type, qty, stock_before, stock_after, notes)
         VALUES (?, ?, ?, ?, NULL, 'adjustment', 'manual_setup', ?, ?, ?, ?)`,
        [branchId, warehouseId, v.product_id, v.id, stockAfter - stockBefore, stockBefore, stockAfter, `Auto-fill ${qtyPerModel} pcs per model`]
      );

      updated++;
    }

    // Sinkronkan stok produk agregat dari varian
    await connection.execute(
      `UPDATE products p
       SET p.stock = COALESCE((
         SELECT SUM(pv.stock)
         FROM product_variants pv
         WHERE pv.product_id = p.id AND pv.is_active = TRUE
       ), 0)
       WHERE p.branch_id = ?`,
      [branchId]
    );

    await connection.commit();
    console.log(`✅ Berhasil set ${qtyPerModel} pcs untuk ${updated} model di branch "${branchName}" (warehouse ${warehouseId}).`);
  } catch (err) {
    await connection.rollback();
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    await db.end();
  }
}

main();
