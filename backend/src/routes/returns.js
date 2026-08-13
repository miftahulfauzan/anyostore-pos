const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
router.use(authenticate);
const error = (status, message) => Object.assign(new Error(message), { status });
const { money } = require('../money');
const { adjustStock } = require('../stock');

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT r.id, r.return_no, r.refund_amount, r.reason, r.status, r.created_at, t.invoice_no, u.name AS created_by_name
       FROM returns r JOIN transactions t ON t.id = r.transaction_id JOIN users u ON u.id = r.created_by
       WHERE r.branch_id = ? ORDER BY r.created_at DESC LIMIT 100`,
      [req.user.branch_id]
    );
    res.json({ success: true, data: rows });
  } catch (cause) { next(cause); }
});

router.post('/', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { transaction_id: transactionId, items, reason, refund_method: refundMethod } = req.body;
    if (!Number.isInteger(Number(transactionId)) || !Array.isArray(items) || !items.length) throw error(400, 'Data retur tidak valid');
    if (refundMethod != null && !['cash', 'qris', 'transfer', 'debit'].includes(refundMethod)) throw error(400, 'Metode refund tidak valid');
    await connection.beginTransaction();
    const [transactions] = await connection.execute('SELECT id, customer_id FROM transactions WHERE id = ? AND branch_id = ? AND status = \'completed\' FOR UPDATE', [transactionId, req.user.branch_id]);
    if (!transactions[0]) throw error(404, 'Transaksi tidak ditemukan atau tidak dapat diretur');
    // Refund memakai rasio yang sama dengan pembatalan (cancel): nilai item
    // dikali paidRatio (grand_total/subtotal) supaya diskon tingkat transaksi
    // dan promo terbagi proporsional.
    const [txTotals] = await connection.execute('SELECT subtotal, grand_total FROM transactions WHERE id = ?', [transactionId]);
    const txSubtotal = Number(txTotals[0]?.subtotal || 0);
    const txGrandTotal = Number(txTotals[0]?.grand_total || 0);
    const paidRatio = txSubtotal > 0 ? txGrandTotal / txSubtotal : 1;
    let refund = 0;
    const prepared = [];
    for (const input of items) {
      const quantity = Number(input.quantity);
      if (!Number.isInteger(Number(input.transaction_item_id)) || !Number.isInteger(quantity) || quantity <= 0) throw error(400, 'Item retur tidak valid');
      const [sold] = await connection.execute('SELECT id, product_id, variant_id, quantity, price, discount, subtotal FROM transaction_items WHERE id = ? AND transaction_id = ? FOR UPDATE', [input.transaction_item_id, transactionId]);
      if (!sold[0]) throw error(400, 'Item bukan bagian dari transaksi');
      const [returned] = await connection.execute(
        `SELECT COALESCE(SUM(ri.quantity), 0) AS quantity FROM return_items ri
         JOIN returns r ON r.id = ri.return_id WHERE ri.transaction_item_id = ? AND r.status IN ('pending', 'approved')`,
        [sold[0].id]
      );
      // SUM() dari MySQL bisa kembali sebagai string (DECIMAL) -> wajib Number()
      // supaya 1 + "0" tidak jadi "10" (concat) yang memicu false-positive.
      if (Number(quantity) + Number(returned[0].quantity) >
          Number(sold[0].quantity)) {
        throw error(400, 'Jumlah retur melebihi item terjual');
      }
      const lineTotal = money(
          (Number(sold[0].subtotal) / Number(sold[0].quantity)) *
          quantity *
          paidRatio);
      refund = money(refund + lineTotal);
      prepared.push({ sold: sold[0], quantity, lineTotal, reason: input.reason?.trim() || null });
    }
    const returnNo = `RET-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const [result] = await connection.execute(
      'INSERT INTO returns (branch_id, transaction_id, return_no, customer_id, reason, refund_amount, refund_method, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.branch_id, transactionId, returnNo, transactions[0].customer_id, reason?.trim() || null, refund, refundMethod || null, req.user.id]
    );
    for (const item of prepared) {
      await connection.execute(
        'INSERT INTO return_items (return_id, transaction_item_id, product_id, variant_id, quantity, unit_price, subtotal, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [result.insertId, item.sold.id, item.sold.product_id, item.sold.variant_id, item.quantity, item.sold.price, item.lineTotal, item.reason]
      );
    }
    await connection.execute('INSERT INTO activity_logs (user_id, action, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)', [req.user.id, 'return_create', `Retur ${returnNo}`, req.ip, req.get('user-agent') || null]);
    await connection.commit();
    res.status(201).json({ success: true, data: { id: result.insertId, return_no: returnNo, refund_amount: refund, status: 'pending' } });
  } catch (cause) { await connection.rollback(); next(cause); } finally { connection.release(); }
});

router.put('/:id/approve', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const warehouseId = Number(req.body.warehouse_id);
    if (!Number.isInteger(warehouseId)) throw error(400, 'warehouse_id wajib diisi');
    await connection.beginTransaction();
    const [returns] = await connection.execute('SELECT id, return_no, transaction_id, refund_amount, refund_method FROM returns WHERE id = ? AND branch_id = ? AND status = \'pending\' FOR UPDATE', [req.params.id, req.user.branch_id]);
    if (!returns[0]) throw error(404, 'Retur pending tidak ditemukan');
    const [warehouses] = await connection.execute('SELECT id FROM warehouses WHERE id = ? AND branch_id = ? AND is_active = TRUE FOR UPDATE', [warehouseId, req.user.branch_id]);
    if (!warehouses[0]) throw error(404, 'Gudang tidak ditemukan');
    const [items] = await connection.execute('SELECT id, product_id, variant_id, quantity FROM return_items WHERE return_id = ?', [returns[0].id]);
    for (const item of items) {
      await adjustStock(connection, {
        branchId: req.user.branch_id,
        warehouseId,
        productId: item.product_id,
        variantId: item.variant_id,
        delta: item.quantity,
        userId: req.user.id,
        type: 'sale_return',
        referenceType: 'return',
        referenceId: returns[0].id,
      });
    }

    // Pencatatan refund tunai ke laci kas saat retur disetujui: hanya metode
    // cash (atau legacy NULL = proporsional dari metode bayar asli). Refund
    // QRIS/transfer/debit tidak menyentuh laci kas.
    const refundTotal = Number(returns[0].refund_amount || 0);
    const refundIsCash = returns[0].refund_method == null || returns[0].refund_method === 'cash';
    if (refundTotal > 0 && refundIsCash) {
      const [drawers] = await connection.execute('SELECT id FROM cash_drawers WHERE branch_id = ? AND user_id = ? AND status = \'open\' FOR UPDATE', [req.user.branch_id, req.user.id]);
      if (drawers[0]) {
        const [payments] = await connection.execute('SELECT payment_method, COALESCE(SUM(amount), 0) AS amount FROM transaction_payments WHERE transaction_id = ? GROUP BY payment_method', [returns[0].transaction_id]);
        const cashPaid = Number(payments.find((payment) => payment.payment_method === 'cash')?.amount || 0);
        const [txRows] = await connection.execute('SELECT grand_total FROM transactions WHERE id = ?', [returns[0].transaction_id]);
        const txGrandTotal = Number(txRows[0]?.grand_total || 0);
        const cashRefund = txGrandTotal > 0 ? money(refundTotal * cashPaid / txGrandTotal) : 0;
        if (cashRefund > 0) {
          await connection.execute('INSERT INTO cash_drawer_movements (cash_drawer_id, user_id, type, amount, reason) VALUES (?, ?, ?, ?, ?)', [drawers[0].id, req.user.id, 'cash_out', cashRefund, `Retur ${returns[0].return_no}`]);
        }
      }
    }

    await connection.execute('UPDATE returns SET status = \'approved\', approved_by = ? WHERE id = ?', [req.user.id, returns[0].id]);
    await connection.execute('INSERT INTO activity_logs (user_id, action, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)', [req.user.id, 'return_approve', `Retur ${returns[0].return_no}`, req.ip, req.get('user-agent') || null]);
    await connection.commit();
    res.json({ success: true, data: { id: returns[0].id, status: 'approved' } });
  } catch (cause) { await connection.rollback(); next(cause); } finally { connection.release(); }
});

module.exports = router;
