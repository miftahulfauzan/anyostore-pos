function createOpnameRows(rows) {
  return rows.map((row) => ({
    ...row,
    physical_stock: '',
    expected_stock: Number(row.quantity),
    expected_revision: row.stock_revision,
  }));
}

function countedOpnameItems(rows) {
  return rows.filter((row) => String(row.physical_stock ?? '').trim() !== '').map((row) => {
    const physical = Number(row.physical_stock);
    if (!Number.isSafeInteger(physical) || physical < 0) {
      throw new Error('Stok fisik harus berupa bilangan bulat minimal 0.');
    }
    if (!Number.isFinite(row.expected_stock) || row.expected_revision == null) {
      throw new Error('Snapshot stok tidak lengkap. Muat ulang stok sebelum menyimpan.');
    }
    return {
      product_id: row.product_id,
      variant_id: row.variant_id ?? null,
      physical_stock: physical,
      expected_stock: row.expected_stock,
      expected_revision: row.expected_revision,
    };
  });
}

module.exports = { createOpnameRows, countedOpnameItems };
