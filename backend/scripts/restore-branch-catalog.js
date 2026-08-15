#!/usr/bin/env node
// Pemulihan setelah sync-catalog yang keliru: produk lama cabang target hanya
// dinonaktifkan (is_active=FALSE) dan warehouse_stocks-nya dihapus. Script ini:
//  1) mengaktifkan kembali semua produk branch_id yang diberikan,
//  2) membangun ulang warehouse_stocks dari riwayat stock_mutations terakhir
//     per (warehouse, produk, varian) — pakai kolom stock_after,
//  3) menyinkronkan products.stock & product_variants.stock dari jumlah stok.
// DRY-RUN secara default; eksekusi dengan --apply.
//   node scripts/restore-branch-catalog.js --apply 2 4 5
const db = require('../src/db');

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const ids = args.filter((a) => a !== '--apply').map(Number).filter(Number.isInteger);
  if (!ids.length) { console.log('Usage: node scripts/restore-branch-catalog.js [--apply] <branchId> ...'); process.exit(1); }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    for (const id of ids) {
      const [products] = await connection.execute('SELECT id FROM products WHERE branch_id=?', [id]);
      console.log(`- Cabang ${id}: ${products.length} produk akan ${apply ? 'dipulihkan' : '[DRY] dipulihkan'}`);
      if (!apply) continue;
      await connection.execute('UPDATE products SET is_active=TRUE WHERE branch_id=?', [id]);
      // warehouse_stocks: bangun dari mutasi terakhir per (warehouse, product, variant)
      await connection.execute(
        `INSERT INTO warehouse_stocks (warehouse_id, product_id, variant_id, quantity)
         SELECT m.warehouse_id, m.product_id, m.variant_id, m.stock_after
         FROM stock_mutations m
         JOIN (
           SELECT warehouse_id, product_id, variant_id, MAX(id) AS mid
           FROM stock_mutations WHERE branch_id=? GROUP BY warehouse_id, product_id, variant_id
         ) x ON x.mid = m.id`,
        [id]
      );
      // Sinkronkan stok agregat (sama seperti stock-audit)
      await connection.execute(
        `UPDATE products p
         SET p.stock = COALESCE((SELECT SUM(ws.quantity) FROM warehouse_stocks ws WHERE ws.product_id=p.id), 0)
         WHERE p.branch_id=?`, [id]
      );
      await connection.execute(
        `UPDATE product_variants pv
         SET pv.stock = COALESCE((SELECT SUM(ws.quantity) FROM warehouse_stocks ws WHERE ws.variant_id=pv.id), 0)
         WHERE pv.product_id IN (SELECT id FROM products WHERE branch_id=?)`, [id]
      );
    }
    if (!apply) { await connection.rollback(); console.log('DRY-RUN selesai. Jalankan dengan --apply.'); await db.end(); return; }
    await connection.commit();
    console.log('SELESAI — produk & stok cabang dipulihkan.');
  } catch (e) {
    await connection.rollback();
    console.error('GAGAL (tidak ada perubahan):', e.message);
    process.exit(1);
  } finally {
    connection.release();
    await db.end();
  }
}
main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
