function productsQuery({ branchId, search, sort, page }) {
  const params = new globalThis.URLSearchParams({ limit: '48', page: String(page), sort });
  if (search.trim()) params.set('search', search.trim());
  if (branchId) params.set('branch_id', branchId);
  return params;
}

function productBranchQuery(product) {
  return `?branch_id=${encodeURIComponent(product.branch_id)}`;
}

async function bulkDeleteProducts(products, ids, send) {
  const groups = new Map();
  const failures = new Map();
  let deleted = 0;
  let deactivated = 0;
  for (const id of ids) {
    const product = products.find((row) => row.id === id);
    if (!product?.capabilities?.delete || !Number(product.branch_id)) {
      failures.set(id, { id, message: 'Tidak memiliki izin hapus produk ini.', status: 403 });
      continue;
    }
    const branch = Number(product.branch_id);
    if (!groups.has(branch)) groups.set(branch, []);
    groups.get(branch).push(id);
  }
  for (const [branch_id, batch] of groups) {
    try {
      const result = await send({ branch_id, ids: batch });
      deleted += Number(result.deleted || 0);
      deactivated += Number(result.deactivated || 0);
      const details = result.failures || [];
      for (const id of new Set([...(result.failed || []).map(Number), ...details.map((row) => Number(row.id))])) {
        if (!batch.includes(id)) continue;
        const detail = details.find((row) => Number(row.id) === id);
        failures.set(id, { id, message: detail?.message || 'Produk gagal dihapus. Silakan coba lagi.', status: detail?.status });
      }
    } catch (error) {
      batch.forEach((id) => failures.set(id, { id, message: error.message || 'Gagal menghapus produk.', status: error.status }));
    }
  }
  return { deleted, deactivated, failedIds: [...failures.keys()], failures: [...failures.values()] };
}

module.exports = { productsQuery, productBranchQuery, bulkDeleteProducts };
