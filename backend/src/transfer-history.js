const { localDateString } = require('./local-date');

function toTransferNumber(createdAt, transferId) {
  const date = localDateString(createdAt).replaceAll('-', '');
  return `TRF-${date}-${String(transferId).padStart(4, '0')}`;
}

function groupTransferMovements(rows = []) {
  const grouped = new Map();

  for (const row of rows) {
    const transferId = String(row.transfer_id);
    if (!grouped.has(transferId)) grouped.set(transferId, { from: [], to: [] });

    const qty = Number(row.qty || 0);
    if (qty === 0) continue;

    const line = {
      id: row.product_id,
      variant_id: row.variant_id ?? null,
      name: row.product_name || 'Produk tidak ditemukan',
      sku: row.product_sku || '',
      variant_color: row.variant_color || null,
      qty: Math.abs(qty),
      stock_before: row.stock_before ?? null,
      stock_after: row.stock_after ?? null,
      branch_name: row.branch_name || '',
      warehouse_name: row.warehouse_name || '',
    };

    grouped.get(transferId)[qty < 0 ? 'from' : 'to'].push(line);
  }

  for (const [key, value] of grouped) {
    if (!value.from.length && !value.to.length) grouped.delete(key);
  }

  return grouped;
}

module.exports = { toTransferNumber, groupTransferMovements };
