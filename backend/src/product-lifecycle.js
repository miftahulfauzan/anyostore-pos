const error = (status, message) => Object.assign(new Error(message), { status });
const writers = new Set(['owner', 'manager', 'admin', 'gudang']);

function productCapabilities(user, product) {
  const active = product.branch_active !== 0 && product.branch_active !== false;
  const own = Number(user.branch_id) === Number(product.branch_id);
  const write = active && writers.has(user.role) && (user.role === 'owner' || own);
  const grantedDelete = active && user.role === 'gudang' && product.branch_type === 'gudang'
    && Number(product.warehouse_catalog_delete_enabled) === 1;
  return { edit: write, copy: write, delete: write || grantedDelete };
}

async function deleteCatalogProduct({ pool, id, branchId, removeMedia }) {
  const connection = await pool.getConnection();
  let photos = [];
  let result;
  try {
    await connection.beginTransaction();
    const [products] = await connection.execute('SELECT id, name, stock FROM products WHERE id=? AND branch_id=? FOR UPDATE', [id, branchId]);
    if (!products[0]) throw error(404, 'Produk tidak ditemukan pada cabang yang dipilih');
    const [stocks] = await connection.execute(
      `SELECT (SELECT COUNT(*) FROM warehouse_stocks WHERE product_id=? AND (quantity<>0 OR reserved_quantity<>0)) +
              (SELECT COUNT(*) FROM product_variants WHERE product_id=? AND stock<>0) AS nonzero_count`, [id, id]);
    if (Number(products[0].stock) !== 0 || Number(stocks[0].nonzero_count) > 0) {
      throw error(409, 'Produk masih memiliki stok. Pindahkan atau sesuaikan stok melalui opname sebelum menghapus/menonaktifkan produk.');
    }
    const [history] = await connection.execute(
      `SELECT (SELECT COUNT(*) FROM stock_mutations WHERE product_id=?) +
              (SELECT COUNT(*) FROM transaction_items WHERE product_id=?) +
              (SELECT COUNT(*) FROM purchase_order_items WHERE product_id=?) +
              (SELECT COUNT(*) FROM stock_opname_items WHERE product_id=?) +
              (SELECT COUNT(*) FROM stock_transfer_items WHERE product_id=?) +
              (SELECT COUNT(*) FROM return_items WHERE product_id=?) +
              (SELECT COUNT(*) FROM supplier_products WHERE product_id=?) AS history_count`, Array(7).fill(id));
    if (Number(history[0].history_count) > 0) {
      await connection.execute('UPDATE products SET is_active=FALSE WHERE id=?', [id]);
      await connection.execute('UPDATE product_variants SET is_active=FALSE WHERE product_id=?', [id]);
      result = { soft: true, message: 'Produk dinonaktifkan; seluruh riwayat dan foto tetap tersimpan.' };
    } else {
      [photos] = await connection.execute('SELECT path FROM product_photos WHERE product_id=?', [id]);
      // Never delete mutations: historical products must go through the archive path.
      for (const table of ['warehouse_stocks', 'product_photos', 'wholesale_prices', 'product_variants', 'supplier_products']) {
        await connection.execute(`DELETE FROM ${table} WHERE product_id=?`, [id]);
      }
      await connection.execute('DELETE FROM products WHERE id=?', [id]);
      result = { soft: false, message: 'Produk kosong tanpa riwayat berhasil dihapus permanen.' };
    }
    await connection.commit();
  } catch (cause) {
    await connection.rollback();
    throw cause;
  } finally {
    connection.release();
  }
  // Files are never removed before commit, or while another record references them.
  for (const photo of photos) {
    try {
      const [refs] = await pool.execute(`SELECT (SELECT COUNT(*) FROM product_photos WHERE path=?) +
        (SELECT COUNT(*) FROM store_settings WHERE value=?) AS count`, [photo.path, photo.path]);
      if (Number(refs[0].count) === 0) await removeMedia(photo.path);
    }
    catch { result.media_cleanup_pending = true; }
  }
  return result;
}

module.exports = { deleteCatalogProduct, productCapabilities };
