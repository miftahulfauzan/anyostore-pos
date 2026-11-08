function defaultCartQuantity(storeName) {
  return /basik|metro/i.test(String(storeName || '')) ? 4 : 1;
}

module.exports = { defaultCartQuantity };
