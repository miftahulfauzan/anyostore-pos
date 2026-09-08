function formatTransferLocationLabel(location = {}) {
  const branchName = String(location.branch_name || '').trim();
  const warehouseName = String(location.name || '').trim();
  const type = location.type
    ? ` (${String(location.type).charAt(0).toUpperCase()}${String(location.type).slice(1)})`
    : '';

  // Cabang bertipe gudang merepresentasikan satu lokasi operasional.
  // Nama cabang menjadi label kanonis agar tidak tampil seperti "X — X".
  if (location.branch_type === 'gudang') return branchName || warehouseName;
  if (!branchName || branchName === warehouseName) return branchName || warehouseName;
  return `${branchName} — ${warehouseName}${type}`;
}

function formatHistoryLocationLabel(location = {}) {
  const branchName = String(location.branch_name || '').trim();
  const warehouseName = String(location.warehouse_name || location.name || '').trim();
  if (location.branch_type === 'gudang' || !warehouseName || branchName === warehouseName) {
    return branchName || warehouseName || 'Lokasi tidak tersedia';
  }
  return `${branchName || 'Cabang tidak tersedia'} / ${warehouseName}`;
}

module.exports = { formatHistoryLocationLabel, formatTransferLocationLabel };
