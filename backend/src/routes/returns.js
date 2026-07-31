const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
router.use(authenticate);
const error = (status, message) => Object.assign(new Error(message), { status });
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

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
    const { transaction_id: transactionId, items, reason } = req.body;
    if (!Number.isInteger(Number(transactionId)) || !Array.isArray(items) || !items.length) throw error(400, 'Data retur tidak valid');
    await connection.beginTransaction();
    const [transactions] = await connection.execute('SELECT id, customer_id FROM transactions WHERE id = ? AND branch_id = ? AND status = \'completed\' FOR UPDATE', [transactionId, req.user.branch_id]);
    if (!transactions[0]) throw error(404, 'Transaksi tidak ditemukan atau tidak dapat diretur');
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
      if (quantity + returned[0].quantity > sold[0].quantity) throw error(400, 'Jumlah retur melebihi item terjual');
      const lineTotal = money((sold[0].subtotal / sold[0].quantity) * quantity);
      refund = money(refund + lineTotal);
      prepared.push({ sold: sold[0], quantity, lineTotal, reason: input.reason?.trim() || null });
    }
    const returnNo = `RET-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const [result] = await connection.execute(
      'INSERT INTO returns (branch_id, transaction_id, return_no, customer_id, reason, refund_amount, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.branch_id, transactionId, returnNo, transactions[0].customer_id, reason?.trim() || null, refund, req.user.id]
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
    const [returns] = await connection.execute('SELECT id, return_no FROM returns WHERE id = ? AND branch_id = ? AND status = \'pending\' FOR UPDATE', [req.params.id, req.user.branch_id]);
    if (!returns[0]) throw error(404, 'Retur pending tidak ditemukan');
    const [warehouses] = await connection.execute('SELECT id FROM warehouses WHERE id = ? AND branch_id = ? AND is_active = TRUE FOR UPDATE', [warehouseId, req.user.branch_id]);
    if (!warehouses[0]) throw error(404, 'Gudang tidak ditemukan');
    const [items] = await connection.execute('SELECT id, product_id, variant_id, quantity FROM return_items WHERE return_id = ?', [returns[0].id]);
    for (const item of items) {
      const [balances] = await connection.execute('SELECT id, quantity FROM warehouse_stocks WHERE warehouse_id = ? AND product_id = ? AND variant_id <=> ? FOR UPDATE', [warehouseId, item.product_id, item.variant_id]);
      const before = balances[0]?.quantity || 0; const after = before + item.quantity;
      if (balances[0]) await connection.execute('UPDATE warehouse_stocks SET quantity = ? WHERE id = ?', [after, balances[0].id]);
      else await connection.execute('INSERT INTO warehouse_stocks (warehouse_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)', [warehouseId, item.product_id, item.variant_id, after]);
      await connection.execute('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
      if (item.variant_id) await connection.execute('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [item.quantity, item.variant_id]);
      await connection.execute(`INSERT INTO stock_mutations (branch_id, warehouse_id, product_id, variant_id, user_id, type, reference_type, reference_id, qty, stock_before, stock_after) VALUES (?, ?, ?, ?, ?, 'sale_return', 'return', ?, ?, ?, ?)`, [req.user.branch_id, warehouseId, item.product_id, item.variant_id, req.user.id, returns[0].id, item.quantity, before, after]);
    }
    await connection.execute('UPDATE returns SET status = \'approved\', approved_by = ? WHERE id = ?', [req.user.id, returns[0].id]);
    await connection.execute('INSERT INTO activity_logs (user_id, action, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)', [req.user.id, 'return_approve', `Retur ${returns[0].return_no}`, req.ip, req.get('user-agent') || null]);
    await connection.commit();
    res.json({ success: true, data: { id: returns[0].id, status: 'approved' } });
  } catch (cause) { await connection.rollback(); next(cause); } finally { connection.release(); }
});

module.exports = router;
