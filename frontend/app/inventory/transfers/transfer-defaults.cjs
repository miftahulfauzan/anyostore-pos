function selectTransferDefaults({ role, branchId, warehouses }) {
  const list = Array.isArray(warehouses) ? warehouses : [];
  const ownWarehouses = branchId == null
    ? []
    : list.filter((warehouse) => String(warehouse.branch_id) === String(branchId));
  const sourceCandidates = role === 'gudang' ? ownWarehouses : list;
  const source = sourceCandidates.find((warehouse) => warehouse.type === 'utama')
    || sourceCandidates[0]
    || null;
  const target = list.find((warehouse) => source && String(warehouse.id) !== String(source.id)) || null;

  return {
    sourceId: source ? String(source.id) : '',
    targetId: target ? String(target.id) : '',
  };
}

function selectTransferSourceWarehouses({ role, activeBranchId, warehouses }) {
  const list = Array.isArray(warehouses) ? warehouses : [];
  if (role === 'owner' && activeBranchId && activeBranchId !== 'all') {
    return list.filter((warehouse) => String(warehouse.branch_id) === String(activeBranchId));
  }
  return list;
}

module.exports = { selectTransferDefaults, selectTransferSourceWarehouses };
