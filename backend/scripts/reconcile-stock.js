#!/usr/bin/env node
// Rekonsiliasi stok: bandingkan products.stock (cache total) dengan
// jumlah warehouse_stocks per produk, dan product_variants.stock dengan
// jumlah warehouse_stocks per varian. Pakai --fix untuk memperbaiki selisih.
//
// Jalankan di dalam container backend:
//   node scripts/reconcile-stock.js            # audit saja
//   node scripts/reconcile-stock.js --fix      # audit + perbaiki

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
  const [variants] = await db.execute(
    `SELECT pv.id, pv.product_id, pv.color, pv.stock AS variants_stock,
            (SELECT COALESCE(SUM(ws.quantity), 0) FROM warehouse_stocks ws WHERE ws.variant_id = pv.id) AS warehouse_total
     FROM product_variants pv
     WHERE pv.is_active = TRUE
     ORDER BY pv.product_id, pv.color`
  );

  const productMismatch = products.filter((p) => Number(p.products_stock || 0) !== Number(p.warehouse_total || 0));
  const variantMismatch = variants.filter((v) => Number(v.variants_stock || 0) !== Number(v.warehouse_total || 0));

  console.log(`Produk dicek: ${products.length} · Varian dicek: ${variants.length}`);
  console.log(`Selisih produk: ${productMismatch.length} · Selisih varian: ${variantMismatch.length}`);

  for (const p of productMismatch) {
    console.log(`PRODUK  #${p.id} ${p.sku || p.name} — products.stock=${p.products_stock}, warehouse=${p.warehouse_total}`);
  }
  for (const v of variantMismatch) {
    console.log(`VARIAN  #${v.id} (produk ${v.product_id}) ${v.color || '-'} — variants.stock=${v.variants_stock}, warehouse=${v.warehouse_total}`);
  }

  if (!fix) {
    if (productMismatch.length || variantMismatch.length) {
      console.log('\nAda selisih. Jalankan dengan --fix untuk memperbaiki (atau periksa dulu penyebabnya).');
      await db.end();
      process.exit(1);
    }
    await db.end();
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    for (const p of productMismatch) {
      await connection.execute('UPDATE products SET stock = ? WHERE id = ?', [Number(p.warehouse_total || 0), p.id]);
    }
    for (const v of variantMismatch) {
      await connection.execute('UPDATE product_variants SET stock = ? WHERE id = ?', [Number(v.warehouse_total || 0), v.id]);
    }
    await connection.commit();
    console.log(`\nDiperbaiki: ${productMismatch.length} produk, ${variantMismatch.length} varian.`);
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
