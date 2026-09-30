const HISTORY_LABELS = {
  sale: 'Penjualan',
  purchase: 'Stok masuk',
  sale_return: 'Retur masuk',
  damage: 'Kerusakan',
  loss: 'Kehilangan',
  gift: 'Hadiah',
  adjustment: 'Penyesuaian',
  transfer_in: 'Transfer masuk',
  transfer_out: 'Transfer keluar',
};

function stockHistoryLabel(row) {
  if (row.reference_type === 'stock_opname') return 'Opname';
  if (row.reference_type === 'manual_incoming' || row.reference_type === 'legacy_stock_in') return 'Stok masuk';
  if (row.reference_type === 'manual_outgoing' || row.reference_type === 'legacy_stock_out') return 'Stok keluar';
  return HISTORY_LABELS[row.type] || 'Perubahan stok';
}

function stockHistoryQuery(productId, branchId, page = 1) {
  const params = new URLSearchParams({ product_id: String(productId), limit: '200' });
  if (branchId) params.set('branch_id', String(branchId));
  if (Number(page) > 1) params.set('page', String(page));
  return params;
}

module.exports = { HISTORY_LABELS, stockHistoryLabel, stockHistoryQuery };
