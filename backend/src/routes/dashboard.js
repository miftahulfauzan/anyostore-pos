const express = require('express');
const db = require('../db');
const { authenticate } = require('../auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const owner = req.user.role === 'owner';
    const transactionScope = owner ? '' : ' AND t.branch_id = ?';
    const expenseScope = owner ? '' : ' AND e.branch_id = ?';
    const transactionParams = owner ? [] : [req.user.branch_id];
    const expenseParams = owner ? [] : [req.user.branch_id];

    const salesSql =
      'SELECT ' +
      'COALESCE(SUM(CASE WHEN DATE(t.created_at) = CURDATE() THEN t.grand_total ELSE 0 END), 0) AS today_sales, ' +
      'SUM(CASE WHEN DATE(t.created_at) = CURDATE() THEN 1 ELSE 0 END) AS today_transactions, ' +
      'COALESCE(SUM(CASE WHEN DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN t.grand_total ELSE 0 END), 0) AS seven_day_sales, ' +
      'COALESCE(SUM(CASE WHEN YEAR(t.created_at) = YEAR(CURDATE()) AND MONTH(t.created_at) = MONTH(CURDATE()) THEN t.grand_total ELSE 0 END), 0) AS month_sales ' +
      'FROM transactions t WHERE t.status = \'completed\'' + transactionScope;
    const expensesSql =
      'SELECT ' +
      'COALESCE(SUM(CASE WHEN e.expense_date = CURDATE() THEN e.amount ELSE 0 END), 0) AS today_expenses, ' +
      'COALESCE(SUM(CASE WHEN e.expense_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN e.amount ELSE 0 END), 0) AS seven_day_expenses, ' +
      'COALESCE(SUM(CASE WHEN YEAR(e.expense_date) = YEAR(CURDATE()) AND MONTH(e.expense_date) = MONTH(CURDATE()) THEN e.amount ELSE 0 END), 0) AS month_expenses ' +
      'FROM expenses e WHERE e.status IN (\'pending\', \'approved\')' + expenseScope;
    const recentSql =
      'SELECT t.id, t.invoice_no, t.grand_total, t.payment_method, t.created_at, u.name AS cashier, b.name AS branch_name ' +
      'FROM transactions t JOIN users u ON u.id = t.user_id JOIN branches b ON b.id = t.branch_id ' +
      'WHERE 1 = 1' + transactionScope + ' ORDER BY t.created_at DESC LIMIT 6';
    const trendSql =
      'SELECT DATE(t.created_at) AS date, COALESCE(SUM(t.grand_total), 0) AS sales ' +
      'FROM transactions t WHERE t.status = \'completed\' AND DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)' +
      transactionScope + ' GROUP BY DATE(t.created_at) ORDER BY date';
    const paymentSql =
      'SELECT t.payment_method, COALESCE(SUM(t.grand_total), 0) AS amount ' +
      'FROM transactions t WHERE t.status = \'completed\' AND DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)' +
      transactionScope + ' GROUP BY t.payment_method ORDER BY amount DESC';

    const [salesRows, expenseRows, recent, salesTrend, payments] = await Promise.all([
      db.execute(salesSql, transactionParams),
      db.execute(expensesSql, expenseParams),
      db.execute(recentSql, transactionParams),
      db.execute(trendSql, transactionParams),
      db.execute(paymentSql, transactionParams)
    ]);

    const salesByDate = new Map(salesTrend[0].map((row) => [
      new Date(row.date).toISOString().slice(0, 10),
      Number(row.sales)
    ]));
    const sevenDayTrend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return {
        date: key,
        label: date.toLocaleDateString('id-ID', { weekday: 'short' }),
        sales: salesByDate.get(key) || 0
      };
    });

    const stores = owner ? (await db.execute(
      'SELECT b.id, b.name, b.address, ' +
      'COALESCE((SELECT SUM(t.grand_total) FROM transactions t WHERE t.branch_id = b.id AND t.status = \'completed\' AND DATE(t.created_at) = CURDATE()), 0) AS today_sales, ' +
      'COALESCE((SELECT SUM(t.grand_total) FROM transactions t WHERE t.branch_id = b.id AND t.status = \'completed\' AND DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)), 0) AS seven_day_sales, ' +
      'COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = b.id AND e.status IN (\'pending\',\'approved\') AND YEAR(e.expense_date) = YEAR(CURDATE()) AND MONTH(e.expense_date) = MONTH(CURDATE())), 0) AS month_expenses, ' +
      '(SELECT COUNT(*) FROM products p WHERE p.branch_id = b.id AND p.is_active = TRUE) AS products ' +
      'FROM branches b WHERE b.is_active = TRUE ORDER BY b.id'
    ))[0] : [];

    const summary = { ...salesRows[0][0], ...expenseRows[0][0] };
    res.json({
      success: true,
      data: {
        summary,
        owner_summary: owner ? summary : null,
        recent_transactions: recent[0],
        sales_trend: sevenDayTrend,
        payment_breakdown: payments[0],
        stores
      }
    });
  } catch (error) { next(error); }
});

module.exports = router;
