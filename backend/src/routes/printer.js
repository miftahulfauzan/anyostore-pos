const express = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const router = express.Router();
router.use(authenticate);

function buildReceiptStore(transaction, settings) {
  return {
    store_name: transaction.store_name,
    store_address: transaction.store_address || '',
    store_phone: transaction.store_phone || '',
    store_email: transaction.store_email || '',
    store_tax_id: transaction.store_tax_id || '',
    ...Object.fromEntries(settings.map((setting) => [setting.key, setting.value])),
  };
}

router.get('/invoice/:id', async (req, res, next) => {
  try {
    const owner = req.user.role === 'owner';
    const [transactions] = await db.execute(
      "SELECT t.id, t.branch_id, t.invoice_no, t.created_at, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS transaction_date, t.subtotal, t.discount, t.grand_total, t.payment_method, t.amount_paid, t.`change`, t.notes, u.name AS cashier, c.name AS customer_name, " +
      'b.name AS store_name, b.address AS store_address, b.phone AS store_phone, b.email AS store_email, b.npwp AS store_tax_id ' +
      'FROM transactions t JOIN users u ON u.id = t.user_id JOIN branches b ON b.id = t.branch_id LEFT JOIN customers c ON c.id = t.customer_id ' +
      `WHERE t.id = ?${owner ? '' : ' AND t.branch_id = ?'}`,
      owner ? [req.params.id] : [req.params.id, req.user.branch_id]
    );
    if (!transactions[0]) return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
    const [items] = await db.execute('SELECT product_name AS name, product_sku AS sku, variant_detail, quantity, price, discount, subtotal FROM transaction_items WHERE transaction_id = ? ORDER BY id', [req.params.id]);
    const [payments] = await db.execute('SELECT payment_method, amount, reference FROM transaction_payments WHERE transaction_id = ? ORDER BY id', [req.params.id]);
    const [settings] = await db.execute(
      'SELECT `key`, `value` FROM store_settings WHERE branch_id = ? AND `key` IN (\'receipt_header\', \'receipt_contacts\', \'receipt_footer\', \'receipt_note\', \'store_logo\', \'invoice_logo\', \'show_logo\', \'printer_size\', \'store_name\', \'store_address\', \'store_phone\', \'whatsapp_number\', \'whatsapp_number_2\', \'whatsapp_number_3\', \'whatsapp_numbers\')',
      [transactions[0].branch_id]
    );
    const store = buildReceiptStore(transactions[0], settings);
    res.json({ success: true, data: { ...transactions[0], items, payments, store } });
  } catch (error) { next(error); }
});

module.exports = router;
module.exports.buildReceiptStore = buildReceiptStore;
