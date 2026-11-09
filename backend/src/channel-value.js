function normalizeChannelValue(value, fallbackName = '') {
  const source = String(value ?? '').trim() || String(fallbackName ?? '').trim();
  return source
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)
    .replace(/_+$/g, '');
}

module.exports = { normalizeChannelValue };
