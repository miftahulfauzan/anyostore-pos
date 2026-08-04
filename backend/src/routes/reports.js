const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
router.use(authenticate, authorize('owner', 'manager', 'admin'));
const { money } = require('../money');
const { localDateString } = require('../local-date');

function dateRange(query) {
  const today = localDateString();
  const start = query.start || today.slice(0, 8) + '01';
  const end = query.end || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) throw Object.assign(new Error('Rentang tanggal tidak valid'), { status: 400 });
  return { start, end };
}

router.get('/sales', async (req, res, next) => {
  try {
    const { start, end } = dateRange(req.query);
    const branchId = req.user.role === 'owner' ? (Number(req.query.branch_id) || req.user.branch_id) : req.user.branch_id;
    const [summary] = await db.execute("SELECT COUNT(*) AS transactions, COALESCE(SUM(grand_total - cancelled_amount), 0) AS gross_sales, COALESCE(SUM(discount), 0) AS discounts FROM transactions WHERE branch_id = ? AND status IN ('completed','partially_cancelled') AND DATE(created_at) BETWEEN ? AND ?", [branchId, start, end]);
    const [payments] = await db.execute("SELECT tp.payment_method, COALESCE(SUM(tp.amount - (t.cancelled_amount * tp.amount / NULLIF(t.grand_total, 0))), 0) AS amount FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id WHERE t.branch_id = ? AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at) BETWEEN ? AND ? GROUP BY tp.payment_method", [branchId, start, end]);
    res.json({ success: true, data: { branch_id: branchId, start, end, ...summary[0], payments } });
  } catch (error) { next(error); }
});

// Penutupan Penjualan harian — data untuk dokumen cetak harian.
// Bentuk respons mengikuti contoh "Penutupan Penjualan":
// per metode pembayaran: sales, returns, cancellations, cash_in_out, total.
router.get('/daily-closing', async (req, res, next) => {
  try {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : localDateString();
    const branchId = req.user.role === 'owner' ? (Number(req.query.branch_id) || req.user.branch_id) : req.user.branch_id;
    const [[branchRows], [userRows]] = await Promise.all([
      db.execute('SELECT id, name, address, phone FROM branches WHERE id=?', [branchId]),
      db.execute('SELECT name FROM users WHERE id=?', [req.user.id]),
    ]);
    const branch = branchRows[0];
    if (!branch) return res.status(404).json({ success: false, message: 'Toko tidak ditemukan' });

    const [salesData] = await db.execute(
      `SELECT COUNT(*) AS receipt_count, COALESCE(SUM(grand_total - cancelled_amount), 0) AS total_sales
       FROM transactions WHERE branch_id=? AND status IN ('completed','partially_cancelled') AND DATE(created_at)=?`,
      [branchId, date]
    );
    const [returnsData] = await db.execute(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(refund_amount), 0) AS refund FROM returns WHERE branch_id=? AND DATE(created_at)=?`,
      [branchId, date]
    );
    const [payments] = await db.execute(
      `SELECT tp.payment_method,
              COALESCE(SUM(tp.amount), 0) AS sales,
              COALESCE(SUM(t.cancelled_amount * tp.amount / NULLIF(t.grand_total, 0)), 0) AS cancellations
       FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id
       WHERE t.branch_id=? AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at)=?
       GROUP BY tp.payment_method ORDER BY tp.payment_method`,
      [branchId, date]
    );
    const [movements] = await db.execute(
      `SELECT COALESCE(SUM(CASE WHEN cdm.type='cash_in' THEN cdm.amount ELSE -cdm.amount END), 0) AS net
       FROM cash_drawer_movements cdm JOIN cash_drawers cd ON cd.id = cdm.cash_drawer_id
       WHERE cd.branch_id=? AND DATE(cdm.created_at)=?`,
      [branchId, date]
    );

    const methods = {};
    let totalGross = 0;
    for (const p of payments) {
      methods[p.payment_method] = { sales: Number(p.sales), returns: 0, cancellations: Number(p.cancellations), cash_in_out: 0 };
      totalGross += Number(p.sales);
    }
    const refundTotal = Number(returnsData[0].refund || 0);
    if (refundTotal > 0 && totalGross > 0) {
      for (const m of Object.keys(methods)) {
        methods[m].returns = money(methods[m].sales / totalGross * refundTotal);
      }
    }
    if (methods.cash) methods.cash.cash_in_out = Number(movements[0].net || 0);
    for (const m of Object.keys(methods)) {
      const v = methods[m];
      v.total = money(v.sales - v.returns - v.cancellations + v.cash_in_out);
    }
    const expectedTotal = money(Object.values(methods).reduce((s, v) => s + v.total, 0));

    res.json({
      success: true,
      data: {
        document: 'Penutupan Penjualan',
        store: branch.name,
        store_address: branch.address || '',
        printed_at: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
        printed_by: userRows[0]?.name || req.user.id,
        date,
        receipt_count: Number(salesData[0].receipt_count),
        return_count: Number(returnsData[0].cnt),
        total_sales: money(salesData[0].total_sales),
        subtotal: money(salesData[0].total_sales),
        methods,
        expected_total: expectedTotal,
      },
    });
  } catch (error) { next(error); }
});

router.get('/overview', async (req, res, next) => {
  try {
    const { start, end } = dateRange(req.query);
    const branchId = req.user.role === 'owner' ? (Number(req.query.branch_id) || req.user.branch_id) : req.user.branch_id;
    const [[sales], [costs], [expenses], payments, products, cashiers, customers, lowStock, dailySales, priceTiers, transactions] = await Promise.all([
      db.execute("SELECT COUNT(*) AS transactions, COALESCE(SUM(grand_total - cancelled_amount), 0) AS revenue, COALESCE(SUM(discount), 0) AS discounts FROM transactions WHERE branch_id = ? AND status IN ('completed','partially_cancelled') AND DATE(created_at) BETWEEN ? AND ?", [branchId, start, end]),
      db.execute("SELECT COALESCE(SUM(ti.cost * (ti.quantity - ti.cancelled_qty)), 0) AS cost_of_goods, COALESCE(SUM(ti.subtotal * (ti.quantity - ti.cancelled_qty) / NULLIF(ti.quantity, 0) - ti.cost * (ti.quantity - ti.cancelled_qty)), 0) AS item_profit FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id WHERE t.branch_id = ? AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at) BETWEEN ? AND ?", [branchId, start, end]),
      db.execute("SELECT COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS amount, COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income FROM expenses WHERE branch_id = ? AND status = 'approved' AND expense_date BETWEEN ? AND ?", [branchId, start, end]),
      db.execute("SELECT tp.payment_method, COUNT(DISTINCT t.id) AS transactions, COALESCE(SUM(tp.amount - (t.cancelled_amount * tp.amount / NULLIF(t.grand_total, 0))), 0) AS amount FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id WHERE t.branch_id = ? AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at) BETWEEN ? AND ? GROUP BY tp.payment_method ORDER BY amount DESC", [branchId, start, end]),
      db.execute("SELECT ti.product_id, MAX(ti.product_name) AS name, MAX(ti.product_sku) AS sku, SUM(ti.quantity - ti.cancelled_qty) AS quantity_sold, COALESCE(SUM(ti.subtotal * (ti.quantity - ti.cancelled_qty) / NULLIF(ti.quantity, 0)), 0) AS revenue, COALESCE(SUM(ti.cost * (ti.quantity - ti.cancelled_qty)), 0) AS cost_of_goods, COALESCE(SUM(ti.subtotal * (ti.quantity - ti.cancelled_qty) / NULLIF(ti.quantity, 0) - ti.cost * (ti.quantity - ti.cancelled_qty)), 0) AS profit FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id WHERE t.branch_id = ? AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at) BETWEEN ? AND ? GROUP BY ti.product_id ORDER BY revenue DESC LIMIT 100", [branchId, start, end]),
      db.execute("SELECT u.id, u.name, u.role, COUNT(t.id) AS transactions, COALESCE(SUM(t.grand_total - t.cancelled_amount), 0) AS revenue, COALESCE(SUM(t.discount), 0) AS discounts FROM users u LEFT JOIN transactions t ON t.user_id = u.id AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at) BETWEEN ? AND ? WHERE u.branch_id = ? GROUP BY u.id, u.name, u.role ORDER BY revenue DESC", [start, end, branchId]),
      db.execute("SELECT c.id, c.name, c.phone, COUNT(t.id) AS transactions, COALESCE(SUM(t.grand_total - t.cancelled_amount), 0) AS revenue FROM customers c JOIN transactions t ON t.customer_id = c.id AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at) BETWEEN ? AND ? WHERE c.branch_id = ? GROUP BY c.id, c.name, c.phone ORDER BY revenue DESC LIMIT 50", [start, end, branchId]),
      db.execute('SELECT id, name, sku, stock, min_stock FROM products WHERE branch_id = ? AND is_active = TRUE AND stock <= min_stock ORDER BY stock ASC, name LIMIT 100', [branchId]),
      db.execute("SELECT DATE(created_at) AS date, COUNT(*) AS transactions, COALESCE(SUM(grand_total - cancelled_amount), 0) AS revenue FROM transactions WHERE branch_id = ? AND status IN ('completed','partially_cancelled') AND DATE(created_at) BETWEEN ? AND ? GROUP BY DATE(created_at) ORDER BY date", [branchId, start, end]),
      db.execute("SELECT t.price_tier, COUNT(DISTINCT t.id) AS transactions, COALESCE(SUM(ti.quantity - ti.cancelled_qty), 0) AS products_sold, COALESCE(SUM(ti.subtotal * (ti.quantity - ti.cancelled_qty) / NULLIF(ti.quantity, 0)), 0) AS revenue FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.id WHERE t.branch_id = ? AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at) BETWEEN ? AND ? GROUP BY t.price_tier", [branchId, start, end]),
      db.execute("SELECT t.id, t.invoice_no, t.grand_total, t.cancelled_amount, t.status, t.payment_method, t.price_tier, t.created_at, u.name AS cashier FROM transactions t JOIN users u ON u.id = t.user_id WHERE t.branch_id = ? AND DATE(t.created_at) BETWEEN ? AND ? ORDER BY t.created_at DESC LIMIT 200", [branchId, start, end])
    ]);
    const revenue = money(Number(sales[0].revenue) + Number(expenses[0].income));
    const costOfGoods = Number(costs[0].cost_of_goods);
    const approvedExpenses = Number(expenses[0].amount);
    const income = Number(expenses[0].income);
    const [branch] = await db.execute('SELECT name FROM branches WHERE id=?', [branchId]);
    const branchName = branch[0]?.name || '';
    res.json({ success: true, data: {
      start, end, branch_id: branchId, branch_name: branchName,
      summary: { transactions: sales[0].transactions, revenue, discounts: sales[0].discounts, cost_of_goods: costOfGoods, gross_profit: revenue - costOfGoods, expenses: approvedExpenses, income, net_profit: money(revenue - costOfGoods - approvedExpenses) },
      payment_methods: payments[0], products: products[0], cashiers: cashiers[0], customers: customers[0], low_stock: lowStock[0], daily_sales: dailySales[0], price_tiers: priceTiers[0], transactions: transactions[0]
    } });
  } catch (error) { next(error); }
});

module.exports = router;
