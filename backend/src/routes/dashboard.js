const express = require('express');
const db = require('../db');
const { SALES_STATUSES_SQL } = require('../sales-status');
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
      'COALESCE(SUM(CASE WHEN DATE(t.created_at) = CURDATE() THEN t.grand_total - t.cancelled_amount - t.refunded_amount ELSE 0 END), 0) AS today_sales, ' +
      'SUM(CASE WHEN DATE(t.created_at) = CURDATE() THEN 1 ELSE 0 END) AS today_transactions, ' +
      'COALESCE(SUM(CASE WHEN DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN t.grand_total - t.cancelled_amount - t.refunded_amount ELSE 0 END), 0) AS seven_day_sales, ' +
      'COALESCE(SUM(CASE WHEN YEAR(t.created_at) = YEAR(CURDATE()) AND MONTH(t.created_at) = MONTH(CURDATE()) THEN t.grand_total - t.cancelled_amount - t.refunded_amount ELSE 0 END), 0) AS month_sales ' +
      `FROM transactions t WHERE t.status IN (${SALES_STATUSES_SQL})` + transactionScope;
    const expensesSql =
      'SELECT ' +
      'COALESCE(SUM(CASE WHEN e.expense_date = CURDATE() THEN e.amount ELSE 0 END), 0) AS today_expenses, ' +
      'COALESCE(SUM(CASE WHEN e.expense_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN e.amount ELSE 0 END), 0) AS seven_day_expenses, ' +
      'COALESCE(SUM(CASE WHEN YEAR(e.expense_date) = YEAR(CURDATE()) AND MONTH(e.expense_date) = MONTH(CURDATE()) THEN e.amount ELSE 0 END), 0) AS month_expenses ' +
      "FROM expenses e WHERE e.status = 'approved'" + expenseScope;
    const recentSql =
      'SELECT t.id, t.invoice_no, t.grand_total, t.payment_method, t.created_at, u.name AS cashier, b.name AS branch_name ' +
      'FROM transactions t JOIN users u ON u.id = t.user_id JOIN branches b ON b.id = t.branch_id ' +
      'WHERE 1 = 1' + transactionScope + ' ORDER BY t.created_at DESC LIMIT 6';
    const trendSql =
      'SELECT DATE(t.created_at) AS date, COALESCE(SUM(t.grand_total - t.cancelled_amount - t.refunded_amount), 0) AS sales ' +
      `FROM transactions t WHERE t.status IN (${SALES_STATUSES_SQL}) AND DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)` +
      transactionScope + ' GROUP BY DATE(t.created_at) ORDER BY date';
    const paymentSql =
      // Refund (cancelled_amount) dikurangi proporsional per metode pembayaran,
      // supaya breakdown = ringkasan penjualan.
      'SELECT tp.payment_method, COALESCE(SUM(tp.amount - ((t.cancelled_amount + t.refunded_amount) * tp.amount / NULLIF(t.grand_total, 0))), 0) AS amount ' +
      'FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id ' +
      `WHERE t.status IN (${SALES_STATUSES_SQL}) AND DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)` +
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
        COALESCE((SELECT SUM(t.grand_total - t.cancelled_amount - t.refunded_amount) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND DATE(t.created_at) = CURDATE()), 0) AS today_sales,
        COALESCE((SELECT SUM(t.grand_total - t.cancelled_amount - t.refunded_amount) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)), 0) AS seven_day_sales,
        COALESCE((SELECT SUM(t.grand_total - t.cancelled_amount - t.refunded_amount) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)), 0) AS month_sales,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = b.id AND e.status = 'approved' AND e.expense_date = CURDATE()), 0) AS today_expenses,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = b.id AND e.status = 'approved' AND e.expense_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)), 0) AS seven_day_expenses,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = b.id AND e.status = 'approved' AND YEAR(e.expense_date) = YEAR(CURDATE()) AND MONTH(e.expense_date) = MONTH(CURDATE())), 0) AS month_expenses,
        COALESCE((SELECT COUNT(*) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND DATE(t.created_at) = CURDATE()), 0) AS today_transactions,
        COALESCE((SELECT COUNT(*) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)), 0) AS seven_day_transactions,
        COALESCE((SELECT COUNT(*) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)), 0) AS month_transactions,
        (SELECT COUNT(*) FROM products p WHERE p.branch_id = b.id AND p.is_active = TRUE) AS products
       FROM branches b WHERE b.is_active = TRUE ORDER BY b.id`
    ))[0] : [];

    const summary = { ...salesRows[0][0], ...expenseRows[0][0] };

    // Admin Gudang: ringkasan stok gudang (semua cabang tipe gudang)
    let stockSummary = null;
    let warehouseDashboard = null;
    if (req.user.role === 'gudang') {
      const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
      const dashboardEnd = validDate(req.query.end) ? req.query.end : localDateString();
      const defaultStartDate = new Date(`${dashboardEnd}T00:00:00+07:00`);
      defaultStartDate.setDate(defaultStartDate.getDate() - 6);
      const dashboardStart = validDate(req.query.start) ? req.query.start : localDateString(defaultStartDate);

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

      // Data Dashboard Gudang — seluruhnya dihitung dari stok/mutasi nyata.
      // Produk dikelompokkan satu kali agar varian tidak menggandakan SKU.
      const [warehouseProducts] = await db.execute(
        `SELECT p.id, p.name, p.sku, p.min_stock, c.name AS category_name,
                COALESCE(stock.total_stock, 0) AS total_stock,
                COALESCE(stock.reserved_stock, 0) AS reserved_stock
         FROM products p
         JOIN branches b ON b.id = p.branch_id AND b.type = 'gudang' AND b.is_active = TRUE
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN (
           SELECT ws.product_id,
                  SUM(ws.quantity) AS total_stock,
                  SUM(ws.reserved_quantity) AS reserved_stock
           FROM warehouse_stocks ws
           JOIN warehouses w ON w.id = ws.warehouse_id AND w.is_active = TRUE
           JOIN branches wb ON wb.id = w.branch_id AND wb.type = 'gudang' AND wb.is_active = TRUE
           GROUP BY ws.product_id
         ) stock ON stock.product_id = p.id
         WHERE p.is_active = TRUE
         ORDER BY p.name`
      );
      const productRows = warehouseProducts.map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        category_name: row.category_name || 'Tanpa kategori',
        min_stock: Number(row.min_stock || 0),
        total_stock: Number(row.total_stock || 0),
        reserved_stock: Number(row.reserved_stock || 0),
      }));
      const categoryTotals = new Map();
      for (const product of productRows) {
        categoryTotals.set(product.category_name, (categoryTotals.get(product.category_name) || 0) + product.total_stock);
      }
      const categories = [...categoryTotals.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);
      const lowStock = productRows
        .filter((product) => product.total_stock > 0 && product.total_stock <= product.min_stock)
        .sort((a, b) => a.total_stock - b.total_stock || a.name.localeCompare(b.name))
        .slice(0, 8);
      const outOfStock = productRows
        .filter((product) => product.total_stock <= 0)
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 8);
      const totalStock = productRows.reduce((sum, product) => sum + product.total_stock, 0);
      const reservedStock = productRows.reduce((sum, product) => sum + product.reserved_stock, 0);

      const [dailyRows] = await db.execute(
        `SELECT DATE(sm.created_at) AS date,
                COALESCE(SUM(CASE WHEN sm.qty > 0 THEN sm.qty ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN sm.qty < 0 THEN -sm.qty ELSE 0 END), 0) AS total_out
         FROM stock_mutations sm
         JOIN warehouses w ON w.id = sm.warehouse_id AND w.is_active = TRUE
         JOIN branches b ON b.id = w.branch_id AND b.type = 'gudang' AND b.is_active = TRUE
         WHERE DATE(sm.created_at) BETWEEN ? AND ?
         GROUP BY DATE(sm.created_at)
         ORDER BY date`,
        [dashboardStart, dashboardEnd]
      );
      const [topOutRows] = await db.execute(
        `SELECT p.name, p.sku, COALESCE(SUM(ABS(sm.qty)), 0) AS total
         FROM stock_mutations sm
         JOIN products p ON p.id = sm.product_id
         JOIN warehouses w ON w.id = sm.warehouse_id AND w.is_active = TRUE
         JOIN branches b ON b.id = w.branch_id AND b.type = 'gudang' AND b.is_active = TRUE
         WHERE sm.qty < 0 AND DATE(sm.created_at) BETWEEN ? AND ?
         GROUP BY p.id, p.name, p.sku
         ORDER BY total DESC, p.name
         LIMIT 6`,
        [dashboardStart, dashboardEnd]
      );
      const [incomingRows] = await db.execute(
        `SELECT p.name, p.sku, COALESCE(SUM(sm.qty), 0) AS quantity, MAX(sm.created_at) AS latest_at
         FROM stock_mutations sm
         JOIN products p ON p.id = sm.product_id
         JOIN warehouses w ON w.id = sm.warehouse_id AND w.is_active = TRUE
         JOIN branches b ON b.id = w.branch_id AND b.type = 'gudang' AND b.is_active = TRUE
         WHERE sm.qty > 0 AND DATE(sm.created_at) BETWEEN ? AND ?
         GROUP BY p.id, p.name, p.sku
         ORDER BY latest_at DESC, quantity DESC
         LIMIT 8`,
        [dashboardStart, dashboardEnd]
      );
      const lowCount = productRows.filter((product) => product.total_stock > 0 && product.total_stock <= product.min_stock).length;
      const emptyCount = productRows.filter((product) => product.total_stock <= 0).length;
      const safeCount = Math.max(0, productRows.length - lowCount - emptyCount);
      warehouseDashboard = {
        date_start: dashboardStart,
        date_end: dashboardEnd,
        summary: {
          total_sku: productRows.length,
          total_stock: totalStock,
          reserved_stock: reservedStock,
          low_stock: lowCount,
          out_of_stock: emptyCount,
          safe_stock: safeCount,
        },
        daily: dailyRows.map((row) => ({ date: row.date, in: Number(row.total_in || 0), out: Number(row.total_out || 0) })),
        categories,
        top_products_out: topOutRows.map((row) => ({ name: row.name, sku: row.sku, total: Number(row.total || 0) })),
        recent_incoming: incomingRows.map((row) => ({ name: row.name, sku: row.sku, quantity: Number(row.quantity || 0), latest_at: row.latest_at })),
        low_stock: lowStock.map((row) => ({ name: row.name, sku: row.sku, total_stock: row.total_stock, min_stock: row.min_stock })),
        out_of_stock: outOfStock.map((row) => ({ name: row.name, sku: row.sku, total_stock: row.total_stock, min_stock: row.min_stock })),
      };
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
        stock_summary: stockSummary,
        warehouse_dashboard: warehouseDashboard,
      }
    });
  } catch (error) { next(error); }
});

module.exports = router;
