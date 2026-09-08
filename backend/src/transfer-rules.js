function canTransferAcrossBranches(role) {
  return role === 'owner' || role === 'gudang';
}

function normalizeProductName(name) {
  return String(name || '')
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('id-ID');
}

function canonicalSkuRank(product) {
  let key = String(product?.sku || '').trim().toLocaleUpperCase('id-ID');
  let branchPrefixCount = 0;
  while (/^B\d+-/.test(key)) {
    branchPrefixCount += 1;
    key = key.replace(/^B\d+-/, '');
  }
  return {
    branchPrefixCount,
    generatedSuffix: /-\d+$/.test(key) ? 1 : 0,
    id: Number(product?.id) || Number.MAX_SAFE_INTEGER,
  };
}

function compareCanonicalProducts(left, right) {
  const a = canonicalSkuRank(left);
  const b = canonicalSkuRank(right);
  return b.branchPrefixCount - a.branchPrefixCount
    || a.generatedSuffix - b.generatedSuffix
    || a.id - b.id;
}

function selectCanonicalProductByName(products, name) {
  const normalized = normalizeProductName(name);
  const matches = (Array.isArray(products) ? products : []).filter(
    (product) => normalizeProductName(product?.name) === normalized,
  );
  if (!matches.length) return { product: null, ambiguous: false, duplicates: [] };
  const [product, ...duplicates] = [...matches].sort(compareCanonicalProducts);
  return { product, ambiguous: false, duplicates };
}

module.exports = {
  canTransferAcrossBranches,
  normalizeProductName,
  selectCanonicalProductByName,
};
