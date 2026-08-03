// Satu-satunya jalur penulisan stok: warehouse_stocks (per gudang),
// products.stock (total), product_variants.stock (jika varian), dan
// stock_mutations (jejak audit) diubah BERSAMA-SAMA di sini supaya angka
// stok tidak melenceng antar tabel.
async function adjustStock(connection, {
  branchId,
  warehouseId,
  productId,
  variantId,
  delta,
  userId,
  type,
  referenceType,
  referenceId,
  channel = null,
  notes = null,
  batchNumber = null,
  createdAt = null,
}) {
  const [balances] = await connection.execute(
    'SELECT id, quantity FROM warehouse_stocks WHERE warehouse_id = ? AND product_id = ? AND variant_id <=> ? FOR UPDATE',
    [warehouseId, productId, variantId]
  );
  const before = Number(balances[0]?.quantity || 0);
  const after = before + delta;
  if (balances[0]) {
    await connection.execute('UPDATE warehouse_stocks SET quantity = ? WHERE id = ?', [after, balances[0].id]);
  } else {
    await connection.execute('INSERT INTO warehouse_stocks (warehouse_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)', [warehouseId, productId, variantId, after]);
  }
  await connection.execute('UPDATE products SET stock = stock + ? WHERE id = ?', [delta, productId]);
  if (variantId) {
    await connection.execute('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [delta, variantId]);
  }
  const mutationSql = createdAt
    ? `INSERT INTO stock_mutations (branch_id, warehouse_id, product_id, variant_id, user_id, type, reference_type, reference_id, batch_number, channel, qty, stock_before, stock_after, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    : `INSERT INTO stock_mutations (branch_id, warehouse_id, product_id, variant_id, user_id, type, reference_type, reference_id, batch_number, channel, qty, stock_before, stock_after, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const mutationParams = [branchId, warehouseId, productId, variantId, userId, type, referenceType, referenceId, batchNumber, channel, delta, before, after, notes];
  if (createdAt) mutationParams.push(createdAt);
  const [mutationResult] = await connection.execute(mutationSql, mutationParams);
  return { before, after, mutationId: mutationResult.insertId };
}

module.exports = { adjustStock };
