const express = require('express');
const db = require('../db');
const { authenticate } = require('../auth');
const { localDateString } = require('../local-date');

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
      'COALESCE(SUM(CASE WHEN DATE(t.created_at + INTERVAL 7 HOUR) = DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR) THEN t.grand_total - t.cancelled_amount ELSE 0 END), 0) AS today_sales, ' +
      'SUM(CASE WHEN DATE(t.created_at + INTERVAL 7 HOUR) = DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR) THEN 1 ELSE 0 END) AS today_transactions, ' +
      'COALESCE(SUM(CASE WHEN DATE(t.created_at + INTERVAL 7 HOUR) >= DATE_SUB(DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR), INTERVAL 6 DAY) THEN t.grand_total - t.cancelled_amount ELSE 0 END), 0) AS seven_day_sales, ' +
      'COALESCE(SUM(CASE WHEN YEAR(t.created_at + INTERVAL 7 HOUR) = YEAR(UTC_TIMESTAMP() + INTERVAL 7 HOUR) AND MONTH(t.created_at + INTERVAL 7 HOUR) = MONTH(UTC_TIMESTAMP() + INTERVAL 7 HOUR) THEN t.grand_total - t.cancelled_amount ELSE 0 END), 0) AS month_sales ' +
      'FROM transactions t WHERE t.status IN (\'completed\', \'partially_cancelled\')' + transactionScope;
    const expensesSql =
      'SELECT ' +
      'COALESCE(SUM(CASE WHEN e.expense_date = DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR) THEN e.amount ELSE 0 END), 0) AS today_expenses, ' +
      'COALESCE(SUM(CASE WHEN e.expense_date >= DATE_SUB(DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR), INTERVAL 6 DAY) THEN e.amount ELSE 0 END), 0) AS seven_day_expenses, ' +
      'COALESCE(SUM(CASE WHEN YEAR(e.expense_date) = YEAR(UTC_TIMESTAMP() + INTERVAL 7 HOUR) AND MONTH(e.expense_date) = MONTH(UTC_TIMESTAMP() + INTERVAL 7 HOUR) THEN e.amount ELSE 0 END), 0) AS month_expenses ' +
      'FROM expenses e WHERE e.status IN (\'pending\', \'approved\')' + expenseScope;
    const recentSql =
      'SELECT t.id, t.invoice_no, t.grand_total, t.payment_method, t.created_at, u.name AS cashier, b.name AS branch_name ' +
      'FROM transactions t JOIN users u ON u.id = t.user_id JOIN branches b ON b.id = t.branch_id ' +
      'WHERE 1 = 1' + transactionScope + ' ORDER BY t.created_at DESC LIMIT 6';
    const trendSql =
      'SELECT DATE(t.created_at + INTERVAL 7 HOUR) AS date, COALESCE(SUM(t.grand_total - t.cancelled_amount), 0) AS sales ' +
      'FROM transactions t WHERE t.status IN (\'completed\', \'partially_cancelled\') AND DATE(t.created_at + INTERVAL 7 HOUR) >= DATE_SUB(DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR), INTERVAL 6 DAY)' +
      transactionScope + ' GROUP BY DATE(t.created_at + INTERVAL 7 HOUR) ORDER BY date';
    const paymentSql =
      // Refund (cancelled_amount) dikurangi proporsional per metode pembayaran,
      // supaya breakdown = ringkasan penjualan.
      'SELECT tp.payment_method, COALESCE(SUM(tp.amount - (t.cancelled_amount * tp.amount / NULLIF(t.grand_total, 0))), 0) AS amount ' +
      'FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id ' +
      'WHERE t.status IN (\'completed\', \'partially_cancelled\') AND DATE(t.created_at + INTERVAL 7 HOUR) >= DATE_SUB(DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR), INTERVAL 30 DAY)' +
      transactionScope + ' GROUP BY tp.payment_method ORDER BY amount DESC';

    const [salesRows, expenseRows, recent, salesTrend, payments] = await Promise.all([
      db.execute(salesSql, transactionParams),
      db.execute(expensesSql, expenseParams),
      db.execute(recentSql, transactionParams),
      db.execute(trendSql, transactionParams),
      db.execute(paymentSql, transactionParams)
    ]);

    const salesByDate = new Map(salesTrend[0].map((row) => [
      row.date instanceof Date
        ? [row.date.getFullYear(), String(row.date.getMonth() + 1).padStart(2, '0'), String(row.date.getDate()).padStart(2, '0')].join('-')
        : String(row.date).slice(0, 10),
      Number(row.sales)
    ]));
    const sevenDayTrend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const key = localDateString(date);
      return {
        date: key,
        label: date.toLocaleDateString('id-ID', { weekday: 'short' }),
        sales: salesByDate.get(key) || 0
      };
    });

    const stores = owner ? (await db.execute(
      `SELECT b.id, b.name, b.address,
        COALESCE((SELECT SUM(t.grand_total - t.cancelled_amount) FROM transactions t WHERE t.branch_id = b.id AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at + INTERVAL 7 HOUR) = DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR)), 0) AS today_sales,
        COALESCE((SELECT SUM(t.grand_total - t.cancelled_amount) FROM transactions t WHERE t.branch_id = b.id AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at + INTERVAL 7 HOUR) >= DATE_SUB(DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR), INTERVAL 6 DAY)), 0) AS seven_day_sales,
        COALESCE((SELECT SUM(t.grand_total - t.cancelled_amount) FROM transactions t WHERE t.branch_id = b.id AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at + INTERVAL 7 HOUR) >= DATE_SUB(DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR), INTERVAL 29 DAY)), 0) AS month_sales,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = b.id AND e.status IN ('pending','approved') AND e.expense_date = DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR)), 0) AS today_expenses,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = b.id AND e.status IN ('pending','approved') AND e.expense_date >= DATE_SUB(DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR), INTERVAL 6 DAY)), 0) AS seven_day_expenses,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = b.id AND e.status IN ('pending','approved') AND YEAR(e.expense_date) = YEAR(UTC_TIMESTAMP() + INTERVAL 7 HOUR) AND MONTH(e.expense_date) = MONTH(UTC_TIMESTAMP() + INTERVAL 7 HOUR)), 0) AS month_expenses,
        COALESCE((SELECT COUNT(*) FROM transactions t WHERE t.branch_id = b.id AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at + INTERVAL 7 HOUR) = DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR)), 0) AS today_transactions,
        COALESCE((SELECT COUNT(*) FROM transactions t WHERE t.branch_id = b.id AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at + INTERVAL 7 HOUR) >= DATE_SUB(DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR), INTERVAL 6 DAY)), 0) AS seven_day_transactions,
        COALESCE((SELECT COUNT(*) FROM transactions t WHERE t.branch_id = b.id AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at + INTERVAL 7 HOUR) >= DATE_SUB(DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR), INTERVAL 29 DAY)), 0) AS month_transactions,
        (SELECT COUNT(*) FROM products p WHERE p.branch_id = b.id AND p.is_active = TRUE) AS products
       FROM branches b WHERE b.is_active = TRUE ORDER BY b.id`
    ))[0] : [];

    const summary = { ...salesRows[0][0], ...expenseRows[0][0] };

    // Admin Gudang: ringkasan stok gudang (semua cabang tipe gudang)
    let stockSummary = null;
    if (req.user.role === 'gudang') {
      const [stockRows] = await db.execute(
        `SELECT COUNT(DISTINCT ws.product_id) AS total_products,
                COALESCE(SUM(ws.quantity), 0) AS total_stock,
                COALESCE(SUM(ws.reserved_quantity), 0) AS reserved_stock,
                SUM(CASE WHEN ws.quantity = 0 THEN 1 ELSE 0 END) AS out_of_stock
         FROM warehouse_stocks ws
         JOIN warehouses w ON w.id = ws.warehouse_id
         JOIN branches b ON b.id = w.branch_id
         WHERE b.type = 'gudang' AND w.is_active = TRUE AND b.is_active = TRUE`
      );
      const [recentStock] = await db.execute(
        `SELECT sm.id, p.name AS product_name, p.sku, sm.qty, sm.channel, sm.created_at
         FROM stock_mutations sm
         JOIN products p ON p.id = sm.product_id
         JOIN warehouses w ON w.id = sm.warehouse_id
         JOIN branches b ON b.id = w.branch_id
         WHERE b.type = 'gudang'
         ORDER BY sm.created_at DESC LIMIT 6`
      );
      stockSummary = { ...stockRows[0], recent_mutations: recentStock };
    }

    res.json({
      success: true,
      data: {
        summary,
        owner_summary: owner ? summary : null,
        recent_transactions: recent[0],
        sales_trend: sevenDayTrend,
        payment_breakdown: payments[0],
        stores,
        stock_summary: stockSummary
      }
    });
  } catch (error) { next(error); }
});

module.exports = router;
