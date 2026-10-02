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

  const requestedId = Number(queryBranchId);
  const ownId = Number(branchId);
  const selectedBranchId = role === 'owner'
    ? (Number.isInteger(requestedId) && requestedId > 0 ? requestedId : null)
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

module.exports = { stockDashboardScope };
