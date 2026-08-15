const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
router.use(authenticate);
const error = (status, message) => Object.assign(new Error(message), { status });
const { money } = require('../money');
const { adjustStock } = require('../stock');

/// Auto-approve retur dalam transaksi yang sama (dipakai POST saat membuat
/// retur — tanpa perlu persetujuan lagi).
async function approveReturnInTx(connection, { returnId, transactionId, branchId, userId }) {
  const [returns] = await connection.execute(
    'SELECT id, return_no, transaction_id, refund_amount, refund_method FROM returns WHERE id = ? FOR UPDATE',
    [returnId]
  );
  const ret = returns[0];
  if (!ret) throw error(404, 'Retur tidak ditemukan');
  const [mainWarehouses] = await connection.execute(
    "SELECT id FROM warehouses WHERE branch_id=? AND is_active=TRUE AND type='utama' ORDER BY id LIMIT 1",
    [branchId]
  );
  const fallbackWarehouse = mainWarehouses[0]?.id;
  const [items] = await connection.execute('SELECT id, product_id, variant_id, quantity FROM return_items WHERE return_id = ?', [returnId]);
  for (const item of items) {
    const [mutations] = await connection.execute(
      'SELECT warehouse_id FROM stock_mutations WHERE reference_type=? AND reference_id=? AND product_id=? AND variant_id<=>? ORDER BY id DESC LIMIT 1',
      ['transaction', transactionId, item.product_id, item.variant_id]
    );
    const warehouseId = mutations[0]?.warehouse_id || fallbackWarehouse;
    if (!warehouseId) throw error(404, 'Gudang asal penjualan tidak ditemukan');
    await adjustStock(connection, {
      branchId,
      warehouseId,
      productId: item.product_id,
      variantId: item.variant_id,
      delta: item.quantity,
      userId,
      type: 'sale_return',
      referenceType: 'return',
      referenceId: returnId,
    });
  }
  const refundTotal = Number(ret.refund_amount || 0);
  const refundIsCash = ret.refund_method == null || ret.refund_method === 'cash';
  if (refundTotal > 0 && refundIsCash) {
    const [drawers] = await connection.execute('SELECT id FROM cash_drawers WHERE branch_id = ? AND user_id = ? AND status = \'open\' FOR UPDATE', [branchId, userId]);
    if (drawers[0]) {
      const [payments] = await connection.execute('SELECT payment_method, COALESCE(SUM(amount), 0) AS amount FROM transaction_payments WHERE transaction_id = ? GROUP BY payment_method', [transactionId]);
      const cashPaid = Number(payments.find((payment) => payment.payment_method === 'cash')?.amount || 0);
      const [txRows] = await connection.execute('SELECT grand_total FROM transactions WHERE id = ?', [transactionId]);
      const txGrandTotal = Number(txRows[0]?.grand_total || 0);
      const cashRefund = txGrandTotal > 0 ? money(refundTotal * cashPaid / txGrandTotal) : 0;
      if (cashRefund > 0) {
        await connection.execute('INSERT INTO cash_drawer_movements (cash_drawer_id, user_id, type, amount, reason) VALUES (?, ?, ?, ?, ?)', [drawers[0].id, userId, 'cash_out', cashRefund, `Retur ${ret.return_no}`]);
      }
    }
  }
  // Catat qty retur per item & perbarui status transaksi (retur sebagian/penuh).
  const [itemRows] = await connection.execute(
    'SELECT id, quantity FROM transaction_items WHERE transaction_id = ?',
    [transactionId]
  );
  const [returnedRows] = await connection.execute(
    `SELECT ri.transaction_item_id, COALESCE(SUM(ri.quantity), 0) AS qty
     FROM return_items ri JOIN returns r ON r.id = ri.return_id
     WHERE r.transaction_id = ? AND r.status = 'approved'
     GROUP BY ri.transaction_item_id`,
    [transactionId]
  );
  const returnedByItem = new Map(returnedRows.map((x) => [x.transaction_item_id, Number(x.qty)]));
  let allFullyReturned = itemRows.length > 0;
  for (const it of itemRows) {
    const returned = returnedByItem.get(it.id) || 0;
    await connection.execute('UPDATE transaction_items SET returned_qty = ? WHERE id = ?', [returned, it.id]);
    if (returned < Number(it.quantity)) allFullyReturned = false;
  }
  if (allFullyReturned) {
    await connection.execute(
      "UPDATE transactions SET status='refunded' WHERE id=? AND status IN ('completed','partially_refunded','partially_cancelled')",
      [transactionId]
    );
  } else {
    await connection.execute(
      "UPDATE transactions SET status='partially_refunded' WHERE id=? AND status IN ('completed','partially_refunded')",
      [transactionId]
    );
  }

  await connection.execute('UPDATE returns SET status = \'approved\', approved_by = ? WHERE id = ?', [userId, returnId]);
  await connection.execute('INSERT INTO activity_logs (user_id, action, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)', [userId, 'return_approve', `Retur ${ret.return_no}`, 'auto', null]);
}

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

// Detail retur + item (dipakai mobile untuk tampilan ala struk).
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT r.id, r.return_no, r.refund_amount, r.refund_method, r.reason, r.status, r.created_at, t.invoice_no, u.name AS created_by_name
       FROM returns r JOIN transactions t ON t.id = r.transaction_id JOIN users u ON u.id = r.created_by
       WHERE r.id = ? AND r.branch_id = ?`,
      [req.params.id, req.user.branch_id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Retur tidak ditemukan' });
    const [items] = await db.execute(
      `SELECT ri.product_id, ri.variant_id, ri.quantity, ri.unit_price, ri.subtotal, ti.product_name, ti.variant_detail
       FROM return_items ri JOIN transaction_items ti ON ti.id = ri.transaction_item_id
       WHERE ri.return_id = ? ORDER BY ri.id ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...rows[0], items } });
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
    // Auto-approve: retur langsung disetujui tanpa menunggu persetujuan.
    const approveNow = req.body.approve !== false;
    if (approveNow) {
      await approveReturnInTx(connection, {
        returnId: result.insertId,
        transactionId,
        branchId: req.user.branch_id,
        userId: req.user.id,
      });
    }
    await connection.commit();
    res.status(201).json({ success: true, data: { id: result.insertId, return_no: returnNo, refund_amount: refund, status: approveNow ? 'approved' : 'pending' } });
  } catch (cause) { await connection.rollback(); next(cause); } finally { connection.release(); }
});

router.put('/:id/approve', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [returns] = await connection.execute('SELECT id, return_no, transaction_id, refund_amount, refund_method FROM returns WHERE id = ? AND branch_id = ? AND status = \'pending\' FOR UPDATE', [req.params.id, req.user.branch_id]);
    if (!returns[0]) throw error(404, 'Retur pending tidak ditemukan');
    // Stok kembali ke gudang ASAL penjualan (dari stock_mutations transaksi);
    // fallback ke gudang utama cabang kalau asal tidak terlacak.
    const [mainWarehouses] = await connection.execute(
      "SELECT id FROM warehouses WHERE branch_id=? AND is_active=TRUE AND type='utama' ORDER BY id LIMIT 1",
      [req.user.branch_id]
    );
    const fallbackWarehouse = mainWarehouses[0]?.id;
    const [items] = await connection.execute('SELECT id, product_id, variant_id, quantity FROM return_items WHERE return_id = ?', [returns[0].id]);
    for (const item of items) {
      const [mutations] = await connection.execute(
        'SELECT warehouse_id FROM stock_mutations WHERE reference_type=? AND reference_id=? AND product_id=? AND variant_id<=>? ORDER BY id DESC LIMIT 1',
        ['transaction', returns[0].transaction_id, item.product_id, item.variant_id]
      );
      const warehouseId = mutations[0]?.warehouse_id || fallbackWarehouse;
      if (!warehouseId) throw error(404, 'Gudang asal penjualan tidak ditemukan');
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

    // Catat qty retur per item & perbarui status transaksi (retur sebagian/penuh).
    const [itemRows] = await connection.execute(
      'SELECT id, quantity FROM transaction_items WHERE transaction_id = ?',
      [returns[0].transaction_id]
    );
    const [returnedRows] = await connection.execute(
      `SELECT ri.transaction_item_id, COALESCE(SUM(ri.quantity), 0) AS qty
       FROM return_items ri JOIN returns r ON r.id = ri.return_id
       WHERE r.transaction_id = ? AND r.status = 'approved'
       GROUP BY ri.transaction_item_id`,
      [returns[0].transaction_id]
    );
    const returnedByItem = new Map(returnedRows.map((x) => [x.transaction_item_id, Number(x.qty)]));
    let allFullyReturned = itemRows.length > 0;
    for (const it of itemRows) {
      const returned = returnedByItem.get(it.id) || 0;
      await connection.execute('UPDATE transaction_items SET returned_qty = ? WHERE id = ?', [returned, it.id]);
      if (returned < Number(it.quantity)) allFullyReturned = false;
    }
    if (allFullyReturned) {
      await connection.execute(
        "UPDATE transactions SET status='refunded' WHERE id=? AND status IN ('completed','partially_refunded','partially_cancelled')",
        [returns[0].transaction_id]
      );
    } else {
      await connection.execute(
        "UPDATE transactions SET status='partially_refunded' WHERE id=? AND status IN ('completed','partially_refunded')",
        [returns[0].transaction_id]
      );
    }

    await connection.execute('UPDATE returns SET status = \'approved\', approved_by = ? WHERE id = ?', [req.user.id, returns[0].id]);
    await connection.execute('INSERT INTO activity_logs (user_id, action, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)', [req.user.id, 'return_approve', `Retur ${returns[0].return_no}`, req.ip, req.get('user-agent') || null]);
    await connection.commit();
    res.json({ success: true, data: { id: returns[0].id, status: 'approved' } });
  } catch (cause) { await connection.rollback(); next(cause); } finally { connection.release(); }
});

module.exports = router;
