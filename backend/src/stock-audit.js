// Audit stok otomatis: bandingkan products.stock & product_variants.stock
// (cache) dengan jumlah warehouse_stocks (sumber kebenaran). Dipakai saat
// boot + harian 03.00 WIB supaya selisih tidak menumpuk (lihat AGENTS.md).
const db = require('./db');

async function auditStock({ fix = false } = {}) {
  const [products] = await db.execute(
    `SELECT p.id, p.sku, p.name, p.stock AS products_stock,
            (SELECT COALESCE(SUM(ws.quantity), 0) FROM warehouse_stocks ws WHERE ws.product_id = p.id) AS warehouse_total
     FROM products p WHERE p.is_active = TRUE ORDER BY p.branch_id, p.sku`
  );
  const [variants] = await db.execute(
    `SELECT pv.id, pv.product_id, pv.color, pv.stock AS variants_stock,
            (SELECT COALESCE(SUM(ws.quantity), 0) FROM warehouse_stocks ws WHERE ws.variant_id = pv.id) AS warehouse_total
     FROM product_variants pv WHERE pv.is_active = TRUE ORDER BY pv.product_id, pv.color`
  );
  const productMismatch = products.filter(
    (p) => Number(p.products_stock || 0) !== Number(p.warehouse_total || 0)
  );
  const variantMismatch = variants.filter(
    (v) => Number(v.variants_stock || 0) !== Number(v.warehouse_total || 0)
  );

  if (fix && (productMismatch.length || variantMismatch.length)) {
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
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  }
  return {
    products: products.length,
    variants: variants.length,
    productMismatch: productMismatch.length,
    variantMismatch: variantMismatch.length,
  };
}

let started = false;
function startStockAudit() {
  if (started) return;
  started = true;
  const log = (msg) => console.log(`[stock-audit] ${msg}`);
  const run = (fix) =>
    auditStock({ fix })
      .then((r) =>
        log(
          `produk ${r.products} · varian ${r.variants} · selisih produk ${r.productMismatch} · selisih varian ${r.variantMismatch}${fix ? ' (diperbaiki)' : ''}`
        )
      )
      .catch((e) => log(`gagal: ${e.message}`));
  // Sekali saat boot (perbaiki selisih supaya laporan akurat).
  run(true);
  // Harian 03.00 WIB.
  const timer = setInterval(() => {
    const now = new Date(Date.now() + 7 * 3600 * 1000);
    if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5) run(true);
  }, 60 * 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = { auditStock, startStockAudit };
