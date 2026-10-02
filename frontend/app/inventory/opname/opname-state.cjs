function createOpnameRows(rows) {
  return rows.map((row) => ({
    ...row,
    physical_stock: '',
    expected_stock: Number(row.quantity),
    // Revision berasal dari BIGINT database dan harus dipertahankan sebagai
    // string sampai dikirim kembali ke backend.
    expected_revision: row.stock_revision == null ? row.stock_revision : String(row.stock_revision),
  }));
}

function opnameRowKey(row) {
  return `${row.product_id}:${row.variant_id == null ? 'null' : row.variant_id}`;
}

function mergeOpnameRows(previousRows, freshRows) {
  const previousCounts = new Map(
    previousRows.map((row) => [opnameRowKey(row), row.physical_stock]),
  );
  return createOpnameRows(freshRows).map((row) => {
    const physical = previousCounts.get(opnameRowKey(row));
    return physical == null || String(physical).trim() === ''
      ? row
      : { ...row, physical_stock: physical };
  });
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

module.exports = { createOpnameRows, countedOpnameItems, mergeOpnameRows };
