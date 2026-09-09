const fail = (status, message) => Object.assign(new Error(message), { status });

function integer(value) {
  return Number.isSafeInteger(value) || (typeof value === 'string' && /^\d+$/.test(value) && value.length <= 20);
}
function positiveId(value) {
  return integer(value) && Number(value) > 0;
}
function normalized(value) {
  return String(value ?? '').trim().toLocaleUpperCase('id-ID');
}

function validateOpnameItems(items) {
  if (!Array.isArray(items) || !items.length) throw fail(400, 'Pilih minimal satu produk dan isi stok fisiknya.');
  const seen = new Set();
  for (const item of items) {
    if (!positiveId(item?.product_id) || (item.variant_id != null && !positiveId(item.variant_id))) {
      throw fail(400, 'Produk atau varian opname tidak valid.');
    }
    const key = `${Number(item.product_id)}:${item.variant_id == null ? 'null' : Number(item.variant_id)}`;
    if (seen.has(key)) throw fail(400, 'Produk yang sama tidak boleh dihitung dua kali.');
    seen.add(key);
    if (typeof item.physical_stock === 'boolean' || item.physical_stock === '' || item.physical_stock == null
        || !integer(item.physical_stock) || Number(item.physical_stock) < 0) {
      throw fail(400, 'Stok fisik wajib diisi dengan bilangan bulat 0 atau lebih.');
    }
    if (!integer(item.expected_stock) || Number(item.expected_stock) < 0
        || !integer(item.expected_revision) || Number(item.expected_revision) < 0) {
      throw fail(400, 'Data stok berubah. Muat ulang halaman opname sebelum menyimpan.');
    }
  }
  return items;
}

function assertStockSnapshot(expected, current) {
  if (!current) {
    if (Number(expected.expected_stock) === 0 && Number(expected.expected_revision) === 0) return;
    throw fail(409, 'Stok berubah atau produk tidak lagi tersedia. Muat ulang opname.');
  }
  const expectedRevision = BigInt(String(expected.expected_revision));
  const currentRevision = BigInt(String(current.revision ?? 0));
  if (Number(current.quantity) !== Number(expected.expected_stock) || currentRevision !== expectedRevision) {
    throw fail(409, 'Stok berubah sejak halaman opname dibuka. Muat ulang lalu hitung kembali.');
  }
}

function matchingVariant(rows, wanted) {
  const matches = (Array.isArray(rows) ? rows : []).filter((row) =>
    normalized(row.color) === normalized(wanted?.color)
    && normalized(row.size) === normalized(wanted?.size));
  if (matches.length > 1) throw fail(409, 'Varian tujuan ambigu. Periksa warna dan ukuran produk.');
  return matches[0] || null;
}

function validateTransferItems(items) {
  if (!Array.isArray(items) || !items.length) throw fail(400, 'Pilih minimal satu produk untuk ditransfer.');
  const seen = new Set();
  for (const item of items) {
    if (!positiveId(item?.product_id) || (item.variant_id != null && !positiveId(item.variant_id))
        || typeof item.quantity === 'boolean' || item.quantity === '' || !integer(item.quantity)
        || Number(item.quantity) <= 0) {
      throw fail(400, 'Produk, varian, dan jumlah transfer tidak valid.');
    }
    const key = `${Number(item.product_id)}:${item.variant_id == null ? 'null' : Number(item.variant_id)}`;
    if (seen.has(key)) throw fail(400, 'Produk/varian yang sama tidak boleh dimasukkan dua kali.');
    seen.add(key);
  }
  return items;
}

module.exports = { validateOpnameItems, assertStockSnapshot, matchingVariant, validateTransferItems };
