function normalizeTransferSku(sku) {
  let key = String(sku || '').trim().toUpperCase();
  while (/^B\d+-/.test(key)) key = key.replace(/^B\d+-/, '');
  return key;
}

function makeTargetSku(branchId, sourceSku) {
  const key = normalizeTransferSku(sourceSku);
  return key ? `B${Number(branchId)}-${key}`.slice(0, 50) : null;
}

module.exports = { normalizeTransferSku, makeTargetSku };
