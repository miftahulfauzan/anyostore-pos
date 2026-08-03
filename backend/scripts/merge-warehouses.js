/**
 * One-off cleanup: keep exactly one warehouse per branch.
 *
 * Business rule: every branch (toko / gudang) should have a single
 * warehouse. Extra warehouses (e.g. "Gudang Cadangan", "Gudang Utama 2")
 * are merged into the kept warehouse and then deleted.
 *
 * For each branch:
 *   1. keep = the warehouse whose type is 'utama' and whose name does NOT
 *      contain "cadangan"; fallback to the lowest-id warehouse.
 *   2. Merge warehouse_stocks of every other warehouse into `keep`
 *      (quantities added per product+variant).
 *   3. Re-point stock_mutations / stock_opnames / stock_transfers that
 *      reference a removed warehouse to `keep`.
 *   4. Delete the removed warehouse.
 *
 * Idempotent: branches already having a single warehouse are skipped.
 * Safe to re-run.
 *
 * Usage:  node scripts/merge-warehouses.js
 * Requires DB env vars (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.production') });
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const db = require('../src/db');

async function main() {
  console.log('[merge-warehouses] Checking warehouses per branch…');

  const [branches] = await db.execute('SELECT id FROM branches WHERE is_active = TRUE ORDER BY id');
  let merged = 0;
  let removed = 0;

  for (const branch of branches) {
    const [warehouses] = await db.execute(
      'SELECT id, name, type FROM warehouses WHERE branch_id = ? AND is_active = TRUE ORDER BY id',
      [branch.id]
    );
    if (warehouses.length <= 1) continue;

    const keep =
      warehouses.find((w) => w.type === 'utama' && !/cadangan/i.test(w.name)) ||
      warehouses[0];
    const removeList = warehouses.filter((w) => w.id !== keep.id);

    console.log(`[merge-warehouses] Branch ${branch.id}: keep #${keep.id} "${keep.name}" (${keep.type}), remove ${removeList.length} warehouse(s)`);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      for (const dup of removeList) {
        // 1. Merge stock into keep (alias tabel untuk hindari ambigu)
        await conn.execute(
          `INSERT INTO warehouse_stocks (warehouse_id, product_id, variant_id, quantity, reserved_quantity)
           SELECT ?, src.product_id, src.variant_id, src.quantity, src.reserved_quantity
           FROM warehouse_stocks src
           WHERE src.warehouse_id = ?
           ON DUPLICATE KEY UPDATE quantity = warehouse_stocks.quantity + VALUES(quantity),
                                  reserved_quantity = warehouse_stocks.reserved_quantity + VALUES(reserved_quantity)`,
          [keep.id, dup.id]
        );
        await conn.execute('DELETE FROM warehouse_stocks WHERE warehouse_id = ?', [dup.id]);

        // 2. Re-point references
        await conn.execute('UPDATE stock_mutations SET warehouse_id = ? WHERE warehouse_id = ?', [keep.id, dup.id]);
        await conn.execute('UPDATE stock_opnames SET warehouse_id = ? WHERE warehouse_id = ?', [keep.id, dup.id]);
        await conn.execute('UPDATE stock_transfers SET from_warehouse_id = ? WHERE from_warehouse_id = ?', [keep.id, dup.id]);
        await conn.execute('UPDATE stock_transfers SET to_warehouse_id = ? WHERE to_warehouse_id = ?', [keep.id, dup.id]);

        // 3. Delete the warehouse
        await conn.execute('DELETE FROM warehouses WHERE id = ?', [dup.id]);
        merged += 1;
        removed += 1;
        console.log(`[merge-warehouses]   removed #${dup.id} "${dup.name}" -> merged into #${keep.id}`);
      }
      // Toko = gudang: gudang yang dipertahankan dinamai persis nama toko.
      await conn.execute('UPDATE warehouses SET name = ?, type = \'utama\' WHERE id = ?', [branch.name.trim(), keep.id]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  console.log(`[merge-warehouses] Done. Merged ${merged} warehouse(s), removed ${removed} warehouse(s).`);
  await db.end();
}

main().catch((e) => { console.error('[merge-warehouses] FAILED', e); process.exit(1); });
