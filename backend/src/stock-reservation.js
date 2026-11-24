// Reservasi stok untuk pesanan reseller.
//
// Katalog publik menampilkan `available_stock = quantity - reserved_quantity`.
// Modul ini SATU-SATUNYA penulis `warehouse_stocks.reserved_quantity`: ia tidak
// mengubah `quantity` sama sekali (itu tetap tugas `adjustStock`), sehingga
// aturan "satu jalur tulis stok" tidak dilanggar. Reservasi hanya menahan barang
// agar tidak bisa dipesan dua pembeli, lalu dilepas (batal) atau dipakai saat
// convert menjadi transaksi.
//
// Alokasi dicatat per gudang di `reseller_stock_reservations` supaya pelepasan
// bisa tepat walau satu produk tersebar di beberapa gudang.

const RESERVATION_TTL_HOURS = 72;

// Gudang yang dihitung untuk ketersediaan: aktif dan bukan gudang reject,
// dengan gudang utama didahulukan — sama seperti urutan convert memilih gudang.
const AVAILABLE_WAREHOUSES_SQL = `
  SELECT ws.id AS stock_id, ws.warehouse_id, ws.quantity,
         COALESCE(ws.reserved_quantity, 0) AS reserved
    FROM warehouse_stocks ws
    JOIN warehouses w ON w.id = ws.warehouse_id
   WHERE w.branch_id = ? AND w.is_active = TRUE AND COALESCE(w.type, 'utama') <> 'reject'
     AND ws.variant_id IS NULL AND ws.product_id = ?
   ORDER BY (w.type = 'utama') DESC, w.id ASC, ws.id ASC
   FOR UPDATE`;

async function availableInBranch(connection, branchId, productId) {
  const [rows] = await connection.execute(AVAILABLE_WAREHOUSES_SQL, [branchId, productId]);
  return rows.reduce((total, row) => total + Math.max(0, Number(row.quantity) - Number(row.reserved)), 0);
}

// Menahan stok untuk sederet item pesanan. Melempar Error ber-kode
// STOCK_UNAVAILABLE bila ketersediaan tidak cukup; pemanggil wajib berada di
// dalam transaksi yang sama agar alokasi parsial tidak pernah tersimpan.
async function reserveStock(connection, { orderId, branchId, items }) {
  const needed = new Map();
  for (const item of items) {
    const productId = Number(item.product_id);
    const quantity = Number(item.quantity);
    if (!productId || !Number.isSafeInteger(quantity) || quantity <= 0) continue;
    needed.set(productId, (needed.get(productId) || 0) + quantity);
  }

  for (const [productId, quantity] of needed) {
    const [stocks] = await connection.execute(AVAILABLE_WAREHOUSES_SQL, [branchId, productId]);
    const available = stocks.reduce((total, row) => total + Math.max(0, Number(row.quantity) - Number(row.reserved)), 0);
    if (available < quantity) {
      const [products] = await connection.execute('SELECT name, sku FROM products WHERE id = ? LIMIT 1', [productId]);
      const label = products[0]?.name || products[0]?.sku || `#${productId}`;
      const error = new Error(`Stok ${label} tidak cukup: tersedia ${available}, diminta ${quantity}.`);
      error.status = 409;
      error.code = 'STOCK_UNAVAILABLE';
      error.product_id = productId;
      error.available = available;
      error.requested = quantity;
      throw error;
    }

    let remaining = quantity;
    for (const stock of stocks) {
      if (remaining <= 0) break;
      const free = Math.max(0, Number(stock.quantity) - Number(stock.reserved));
      if (free <= 0) continue;
      const take = Math.min(free, remaining);
      await connection.execute(
        'UPDATE warehouse_stocks SET reserved_quantity = COALESCE(reserved_quantity, 0) + ? WHERE id = ?',
        [take, stock.stock_id]
      );
      await connection.execute(
        `INSERT INTO reseller_stock_reservations (order_id, branch_id, warehouse_id, product_id, quantity)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, branchId, stock.warehouse_id, productId, take]
      );
      remaining -= take;
    }
  }
}

// Melepas seluruh reservasi pesanan yang masih terbuka (batal/tolak/expired).
// Idempoten: baris yang sudah dilepas tidak dihitung dua kali.
async function releaseOrderReservations(connection, orderId) {
  const [rows] = await connection.execute(
    `SELECT id, warehouse_id, product_id, quantity
       FROM reseller_stock_reservations
      WHERE order_id = ? AND released_at IS NULL
      FOR UPDATE`,
    [orderId]
  );
  for (const row of rows) {
    const [stocks] = await connection.execute(
      'SELECT id, COALESCE(reserved_quantity, 0) AS reserved FROM warehouse_stocks WHERE warehouse_id = ? AND product_id = ? AND variant_id IS NULL FOR UPDATE',
      [row.warehouse_id, row.product_id]
    );
    if (stocks[0]) {
      // Jangan pernah menyisakan reserved negatif bila data lama tidak konsisten.
      const next = Math.max(0, Number(stocks[0].reserved) - Number(row.quantity));
      await connection.execute('UPDATE warehouse_stocks SET reserved_quantity = ? WHERE id = ?', [next, stocks[0].id]);
    }
    await connection.execute('UPDATE reseller_stock_reservations SET released_at = NOW() WHERE id = ?', [row.id]);
  }
  return rows.length;
}

// Reservasi hanya berlaku sementara. Pesanan yang ditinggalkan tanpa keputusan
// tidak boleh menahan stok selamanya, jadi reservasi lebih tua dari TTL dilepas.
async function releaseStaleReservations(connection, { ttlHours = RESERVATION_TTL_HOURS } = {}) {
  const [rows] = await connection.execute(
    `SELECT DISTINCT order_id FROM reseller_stock_reservations
      WHERE released_at IS NULL AND created_at < (NOW() - INTERVAL ? HOUR)`,
    [ttlHours]
  );
  let released = 0;
  for (const row of rows) released += await releaseOrderReservations(connection, row.order_id);
  return released;
}

module.exports = {
  RESERVATION_TTL_HOURS,
  availableInBranch,
  reserveStock,
  releaseOrderReservations,
  releaseStaleReservations,
};