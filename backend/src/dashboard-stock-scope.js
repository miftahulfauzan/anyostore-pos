function parseOwnerBranchId(value) {
  if (value === undefined || value === null || value === '' || value === 'all') return null;
  const branchId = Number(value);
  if (!Number.isSafeInteger(branchId) || branchId <= 0) {
    throw Object.assign(new Error('Pilihan toko tidak valid.'), { status: 400 });
  }
  return branchId;
}

function stockDashboardScope({ role, branchId, queryBranchId }) {
  if (role === 'gudang') {
    return {
      branchFilter: " AND b.type = 'gudang'",
      warehouseBranchFilter: " AND wb.type = 'gudang'",
      branchParams: [],
      warehouseBranchParams: [],
      selectedBranchId: null,
    };
  }

  const requestedId = role === 'owner' ? parseOwnerBranchId(queryBranchId) : null;
  const ownId = Number(branchId);
  const selectedBranchId = role === 'owner'
    ? requestedId
    : (Number.isInteger(ownId) && ownId > 0 ? ownId : null);

  if (role !== 'owner' && selectedBranchId === null) {
    return {
      branchFilter: ' AND 1 = 0',
      warehouseBranchFilter: ' AND 1 = 0',
      branchParams: [],
      warehouseBranchParams: [],
      selectedBranchId: null,
    };
  }

  if (selectedBranchId === null) {
    return {
      branchFilter: '',
      warehouseBranchFilter: '',
      branchParams: [],
      warehouseBranchParams: [],
      selectedBranchId: null,
    };
  }

  return {
    branchFilter: ' AND b.id = ?',
    warehouseBranchFilter: ' AND wb.id = ?',
    branchParams: [selectedBranchId],
    warehouseBranchParams: [selectedBranchId],
    selectedBranchId,
  };
}

module.exports = { stockDashboardScope, parseOwnerBranchId };
