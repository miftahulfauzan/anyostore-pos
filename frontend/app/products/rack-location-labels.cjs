function formatRackLocationLabels(locations, { includeBranchName = false } = {}) {
  if (!Array.isArray(locations)) return [];
  return locations.flatMap((location) => {
    const rackPosition = String(location?.rack_position || '').trim();
    if (!rackPosition) return [];

    const warehouseName = String(location.warehouse_name || 'Gudang').trim();
    const branchName = includeBranchName ? String(location.branch_name || '').trim() : '';
    const context = [branchName, warehouseName].filter(Boolean).join(' · ');
    const variant = [location.variant_color, location.variant_size]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' / ');
    return [`${context}: ${variant ? `${variant} · ` : ''}${rackPosition}`];
  });
}

module.exports = { formatRackLocationLabels };
