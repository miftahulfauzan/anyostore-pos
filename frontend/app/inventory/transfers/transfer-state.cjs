function updateTransferQuantity(cart, key, value) {
  return cart.map((row) => row.key === key ? { ...row, quantity: String(value) } : row);
}

function transferItems(cart) {
  return cart.map((row) => {
    const quantity = Number(row.quantity);
    if (String(row.quantity ?? '').trim() === '' || !Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error('Jumlah transfer harus berupa bilangan bulat minimal 1 untuk setiap barang.');
    }
    return { product_id: Number(row.product_id), variant_id: row.variant_id ? Number(row.variant_id) : null, quantity };
  });
}

// Keep the same attempt after an ambiguous network failure. Edits and success
// invalidate it; merely refreshing the catalogue or changing tabs does not.
function createTransferAttempt(uuid = () => globalThis.crypto.randomUUID()) {
  let fingerprint;
  let id;
  return {
    forPayload(payload) {
      const next = JSON.stringify(payload);
      if (next !== fingerprint || !id) {
        id = uuid();
        fingerprint = next;
      }
      return id;
    },
    reset() { fingerprint = undefined; id = undefined; },
  };
}

module.exports = { updateTransferQuantity, transferItems, createTransferAttempt };
