// Pengambilan data struk + penempelan baris siap cetak.
//
// Dipakai bersama oleh:
//   - GET  /api/printer/invoice/:id  (cetak/berbagi dari riwayat)
//   - POST /api/transactions         (cetak otomatis setelah bayar, hemat 1 request)
// Keduanya mengembalikan bentuk struk yang sama supaya Android dan web tidak
// pernah menyusun baris dengan aturan berbeda.
const { buildReceipt } = require('./receipt-lines');

const RECEIPT_SELECT =
  "SELECT t.id, t.branch_id, t.invoice_no, t.offline_invoice_no, t.created_at, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS transaction_date, t.subtotal, t.discount, t.grand_total, t.payment_method, t.amount_paid, t.`change`, t.notes, u.name AS cashier, c.name AS customer_name, " +
  'b.name AS store_name, b.address AS store_address, b.phone AS store_phone, b.email AS store_email, b.npwp AS store_tax_id ' +
  'FROM transactions t JOIN users u ON u.id = t.user_id JOIN branches b ON b.id = t.branch_id LEFT JOIN customers c ON c.id = t.customer_id ' +
  'WHERE t.id = ?';

function buildReceiptStore(transaction, settings) {
  // Identitas toko berasal dari tabel branches; nilai lama di store_settings
  // hanya pelengkap dan tidak boleh menimpa alamat/nama toko yang terbaru.
  return {
    ...Object.fromEntries((settings || []).map((setting) => [setting.key, setting.value])),
    store_name: transaction.store_name,
    store_address: transaction.store_address || '',
    store_phone: transaction.store_phone || '',
    store_email: transaction.store_email || '',
    store_tax_id: transaction.store_tax_id || '',
  };
}

/** Tempelkan baris struk (dan metadata kertas) ke payload transaksi. */
function attachReceiptLines(receipt) {
  const layout = buildReceipt(receipt);
  return {
    ...receipt,
    lines: layout.lines,
    receipt_meta: {
      width: layout.width,
      margin: layout.margin,
      font: layout.font,
      inner: layout.inner,
    },
  };
}

/**
 * Muat satu transaksi beserta item, pembayaran, setelan cabang, dan baris struk.
 * @param {{ execute: Function }} executor koneksi/pool mysql2
 * @param {number|string} transactionId
 */
async function loadReceiptPayload(executor, transactionId) {
  const [transactions] = await executor.execute(RECEIPT_SELECT, [transactionId]);
  if (!transactions[0]) return null;
  const [items] = await executor.execute(
    'SELECT product_name AS name, product_sku AS sku, variant_detail, quantity, price, discount, subtotal FROM transaction_items WHERE transaction_id = ? ORDER BY id',
    [transactionId]
  );
  const [payments] = await executor.execute(
    'SELECT payment_method, amount, reference FROM transaction_payments WHERE transaction_id = ? ORDER BY id',
    [transactionId]
  );
  // Semua setelan cabang dikirim (kecuali rahasia) supaya template struk dari
  // web (judul/label/toggle/gaya) ikut terbaca saat mencetak.
  const [settings] = await executor.execute(
    "SELECT `key`, `value` FROM store_settings WHERE branch_id = ? AND `key` NOT IN ('daily_email_api_key','rajaongkir_api_key','daily_email_last_sent_date')",
    [transactions[0].branch_id]
  );
  const store = buildReceiptStore(transactions[0], settings);
  return attachReceiptLines({ ...transactions[0], items, payments, store });
}

module.exports = { attachReceiptLines, buildReceiptStore, loadReceiptPayload };