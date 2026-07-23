const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
router.use(authenticate, authorize('owner', 'manager', 'admin'));

function dateRange(query) {
  const today = new Date().toISOString().slice(0, 10);
  const start = query.start || today.slice(0, 8) + '01';
  const end = query.end || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) throw Object.assign(new Error('Rentang tanggal tidak valid'), { status: 400 });
  return { start, end };
}

router.get('/sales', async (req, res, next) => {
  try {
    const { start, end } = dateRange(req.query);
    const [summary] = await db.execute("SELECT COUNT(*) AS transactions, COALESCE(SUM(grand_total), 0) AS gross_sales, COALESCE(SUM(discount), 0) AS discounts FROM transactions WHERE branch_id = ? AND status = 'completed' AND DATE(created_at) BETWEEN ? AND ?", [req.user.branch_id, start, end]);
    const [payments] = await db.execute("SELECT tp.payment_method, COALESCE(SUM(tp.amount), 0) AS amount FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id WHERE t.branch_id = ? AND t.status = 'completed' AND DATE(t.created_at) BETWEEN ? AND ? GROUP BY tp.payment_method", [req.user.branch_id, start, end]);
    res.json({ success: true, data: { start, end, ...summary[0], payments } });
  } catch (error) { next(error); }
});

router.get('/overview', async (req, res, next) => {
  try {
    const { start, end } = dateRange(req.query);
    const branchId = req.user.branch_id;
    const [[sales], [costs], [expenses], payments, products, cashiers, customers, lowStock, dailySales, priceTiers] = await Promise.all([
      db.execute("SELECT COUNT(*) AS transactions, COALESCE(SUM(grand_total), 0) AS revenue, COALESCE(SUM(discount), 0) AS discounts FROM transactions WHERE branch_id = ? AND status = 'completed' AND DATE(created_at) BETWEEN ? AND ?", [branchId, start, end]),
      db.execute("SELECT COALESCE(SUM(ti.cost * ti.quantity), 0) AS cost_of_goods, COALESCE(SUM(ti.subtotal - (ti.cost * ti.quantity)), 0) AS item_profit FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id WHERE t.branch_id = ? AND t.status = 'completed' AND DATE(t.created_at) BETWEEN ? AND ?", [branchId, start, end]),
      db.execute("SELECT COALESCE(SUM(amount), 0) AS amount FROM expenses WHERE branch_id = ? AND status = 'approved' AND expense_date BETWEEN ? AND ?", [branchId, start, end]),
      db.execute("SELECT tp.payment_method, COUNT(DISTINCT t.id) AS transactions, COALESCE(SUM(tp.amount), 0) AS amount FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id WHERE t.branch_id = ? AND t.status = 'completed' AND DATE(t.created_at) BETWEEN ? AND ? GROUP BY tp.payment_method ORDER BY amount DESC", [branchId, start, end]),
      db.execute("SELECT ti.product_id, MAX(ti.product_name) AS name, MAX(ti.product_sku) AS sku, SUM(ti.quantity) AS quantity_sold, COALESCE(SUM(ti.subtotal), 0) AS revenue, COALESCE(SUM(ti.cost * ti.quantity), 0) AS cost_of_goods, COALESCE(SUM(ti.subtotal - ti.cost * ti.quantity), 0) AS profit FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id WHERE t.branch_id = ? AND t.status = 'completed' AND DATE(t.created_at) BETWEEN ? AND ? GROUP BY ti.product_id ORDER BY revenue DESC LIMIT 100", [branchId, start, end]),
      db.execute("SELECT u.id, u.name, u.role, COUNT(t.id) AS transactions, COALESCE(SUM(t.grand_total), 0) AS revenue, COALESCE(SUM(t.discount), 0) AS discounts FROM users u LEFT JOIN transactions t ON t.user_id = u.id AND t.status = 'completed' AND DATE(t.created_at) BETWEEN ? AND ? WHERE u.branch_id = ? GROUP BY u.id, u.name, u.role ORDER BY revenue DESC", [start, end, branchId]),
      db.execute("SELECT c.id, c.name, c.phone, COUNT(t.id) AS transactions, COALESCE(SUM(t.grand_total), 0) AS revenue FROM customers c JOIN transactions t ON t.customer_id = c.id AND t.status = 'completed' AND DATE(t.created_at) BETWEEN ? AND ? WHERE c.branch_id = ? GROUP BY c.id, c.name, c.phone ORDER BY revenue DESC LIMIT 50", [start, end, branchId]),
      db.execute('SELECT id, name, sku, stock, min_stock FROM products WHERE branch_id = ? AND is_active = TRUE AND stock <= min_stock ORDER BY stock ASC, name LIMIT 100', [branchId]),
      db.execute("SELECT DATE(created_at) AS date, COUNT(*) AS transactions, COALESCE(SUM(grand_total), 0) AS revenue FROM transactions WHERE branch_id = ? AND status = 'completed' AND DATE(created_at) BETWEEN ? AND ? GROUP BY DATE(created_at) ORDER BY date", [branchId, start, end]),
      db.execute("SELECT price_tier, COUNT(*) AS transactions, COALESCE(SUM(grand_total), 0) AS revenue FROM transactions WHERE branch_id = ? AND status = 'completed' AND DATE(created_at) BETWEEN ? AND ? GROUP BY price_tier", [branchId, start, end])
    ]);
    const revenue = Number(sales[0].revenue);
    const costOfGoods = Number(costs[0].cost_of_goods);
    const approvedExpenses = Number(expenses[0].amount);
    res.json({ success: true, data: {
      start, end,
      summary: { transactions: sales[0].transactions, revenue, discounts: sales[0].discounts, cost_of_goods: costOfGoods, gross_profit: revenue - costOfGoods, expenses: approvedExpenses, net_profit: revenue - costOfGoods - approvedExpenses },
      payment_methods: payments[0], products: products[0], cashiers: cashiers[0], customers: customers[0], low_stock: lowStock[0], daily_sales: dailySales[0], price_tiers: priceTiers[0]
    } });
  } catch (error) { next(error); }
});

module.exports = router;
