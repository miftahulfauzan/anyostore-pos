const express = require('express');
const db = require('../db');
const { SALES_STATUSES_SQL } = require('../sales-status');
const { authenticate } = require('../auth');
const { localDateString } = require('../local-date');
const { parseOwnerBranchId, stockDashboardScope } = require('../dashboard-stock-scope');

const router = express.Router();
router.use(authenticate);

function buildDailyTrend(rows, start, end) {
  const byDate = new Map((rows || []).map((row) => [
    row.date instanceof Date
      ? localDateString(row.date)
      : String(row.date || '').slice(0, 10),
    { sales: Number(row.sales || 0), transactions: Number(row.transactions || 0) },
  ]));
  const startDate = new Date(`${start}T00:00:00+07:00`);
  const endDate = new Date(`${end}T00:00:00+07:00`);
  const days = Math.max(0, Math.floor((endDate - startDate) / 86400000) + 1);
  const pointCount = Math.min(days, 366);
  const bucketSize = pointCount ? Math.ceil(days / pointCount) : 1;
  return Array.from({ length: pointCount }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + index * bucketSize);
    const bucketEnd = Math.min(days, (index + 1) * bucketSize);
    let sales = 0;
    let transactions = 0;
    for (let offset = index * bucketSize; offset < bucketEnd; offset += 1) {
      const bucketDate = new Date(startDate);
      bucketDate.setDate(bucketDate.getDate() + offset);
      const value = byDate.get(localDateString(bucketDate));
      sales += value?.sales || 0;
      transactions += value?.transactions || 0;
    }
    return {
      date: localDateString(date),
      label: date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' }),
      sales,
      transactions,
      bucket_days: bucketSize,
    };
  });
}

router.get('/', async (req, res, next) => {
  try {
    const owner = req.user.role === 'owner';
    const selectedBranchId = owner ? parseOwnerBranchId(req.query.branch_id) : null;
    if (owner && selectedBranchId !== null) {
      const [activeBranches] = await db.execute('SELECT id FROM branches WHERE id = ? AND is_active = TRUE LIMIT 1', [selectedBranchId]);
      if (!activeBranches.length) return res.status(404).json({ success: false, message: 'Toko tidak ditemukan atau sudah tidak aktif.' });
    }
    const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
    const selectedEnd = validDate(req.query.end) ? req.query.end : localDateString();
    const defaultStartDate = new Date(`${selectedEnd}T00:00:00+07:00`);
    defaultStartDate.setDate(defaultStartDate.getDate() - 6);
    const selectedStart = validDate(req.query.start) ? req.query.start : localDateString(defaultStartDate);
    if (selectedStart > selectedEnd) {
      return res.status(400).json({ success: false, message: 'Rentang tanggal tidak valid.' });
    }
    const transactionScope = owner
      ? (selectedBranchId === null ? '' : ' AND t.branch_id = ?')
      : ' AND t.branch_id = ?';
    const expenseScope = owner
      ? (selectedBranchId === null ? '' : ' AND e.branch_id = ?')
      : ' AND e.branch_id = ?';
    const transactionParams = owner ? (selectedBranchId === null ? [] : [selectedBranchId]) : [req.user.branch_id];
    const expenseParams = owner ? (selectedBranchId === null ? [] : [selectedBranchId]) : [req.user.branch_id];

    const salesSql =
      'SELECT ' +
      'COALESCE(SUM(CASE WHEN t.transaction_date = CURDATE() THEN GREATEST(t.grand_total - t.cancelled_amount - t.refunded_amount - COALESCE(t.shipping_cost, 0), 0) ELSE 0 END), 0) AS today_sales, ' +
      'SUM(CASE WHEN t.transaction_date = CURDATE() THEN 1 ELSE 0 END) AS today_transactions, ' +
      'COALESCE(SUM(CASE WHEN t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN GREATEST(t.grand_total - t.cancelled_amount - t.refunded_amount - COALESCE(t.shipping_cost, 0), 0) ELSE 0 END), 0) AS seven_day_sales, ' +
      'COALESCE(SUM(CASE WHEN YEAR(t.transaction_date) = YEAR(CURDATE()) AND MONTH(t.transaction_date) = MONTH(CURDATE()) THEN GREATEST(t.grand_total - t.cancelled_amount - t.refunded_amount - COALESCE(t.shipping_cost, 0), 0) ELSE 0 END), 0) AS month_sales ' +
      `FROM transactions t WHERE t.status IN (${SALES_STATUSES_SQL})` + transactionScope;
    const productsSoldSql =
      'SELECT COALESCE(SUM(ti.quantity - ti.cancelled_qty - ti.returned_qty), 0) AS products_sold ' +
      'FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id ' +
      `WHERE t.status IN (${SALES_STATUSES_SQL})` + transactionScope;
    const expensesSql =
      'SELECT ' +
      'COALESCE(SUM(CASE WHEN e.expense_date = CURDATE() THEN e.amount ELSE 0 END), 0) AS today_expenses, ' +
      'COALESCE(SUM(CASE WHEN e.expense_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN e.amount ELSE 0 END), 0) AS seven_day_expenses, ' +
      'COALESCE(SUM(CASE WHEN YEAR(e.expense_date) = YEAR(CURDATE()) AND MONTH(e.expense_date) = MONTH(CURDATE()) THEN e.amount ELSE 0 END), 0) AS month_expenses ' +
      "FROM expenses e WHERE e.status = 'approved'" + expenseScope;
    const recentSql =
      "SELECT t.id, t.invoice_no, t.grand_total, t.payment_method, t.created_at, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS transaction_date, u.name AS cashier, b.name AS branch_name " +
      'FROM transactions t JOIN users u ON u.id = t.user_id JOIN branches b ON b.id = t.branch_id ' +
      'WHERE 1 = 1' + transactionScope + ' ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 6';
    const trendSql =
      "SELECT DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS date, COUNT(*) AS transactions, COALESCE(SUM(GREATEST(t.grand_total - t.cancelled_amount - t.refunded_amount - COALESCE(t.shipping_cost, 0), 0)), 0) AS sales " +
      `FROM transactions t WHERE t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)` +
      transactionScope + ' GROUP BY t.transaction_date ORDER BY date';
    const paymentSql =
      // Refund (cancelled_amount) dikurangi proporsional per metode pembayaran,
      // supaya breakdown = ringkasan penjualan.
      'SELECT tp.payment_method, COALESCE(SUM(tp.amount - ((t.cancelled_amount + t.refunded_amount) * tp.amount / NULLIF(t.grand_total, 0))), 0) AS amount ' +
      'FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id ' +
      `WHERE t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)` +
      transactionScope + ' GROUP BY tp.payment_method ORDER BY amount DESC';

    // Data dashboard yang mengikuti rentang pilihan user. Field legacy di atas
    // tetap dipertahankan untuk caller lama, tetapi web dan Android memakai
    // kontrak selected_* agar angka tidak kembali ke hari/bulan server.
    const selectedSalesSql =
      'SELECT COUNT(*) AS transactions, COALESCE(SUM(GREATEST(t.grand_total - t.cancelled_amount - t.refunded_amount - COALESCE(t.shipping_cost, 0), 0)), 0) AS sales ' +
      `FROM transactions t WHERE t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ?` + transactionScope;
    const selectedProductsSoldSql =
      'SELECT COALESCE(SUM(ti.quantity - ti.cancelled_qty - ti.returned_qty), 0) AS products_sold ' +
      'FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id ' +
      `WHERE t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ?` + transactionScope;
    const selectedExpensesSql =
      "SELECT COALESCE(SUM(e.amount), 0) AS expenses FROM expenses e WHERE e.status = 'approved' AND e.expense_date BETWEEN ? AND ?" + expenseScope;
    const selectedRecentSql =
      "SELECT t.id, t.invoice_no, t.grand_total, t.payment_method, t.created_at, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS transaction_date, u.name AS cashier, b.name AS branch_name " +
      'FROM transactions t JOIN users u ON u.id = t.user_id JOIN branches b ON b.id = t.branch_id ' +
      `WHERE t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ?` + transactionScope +
      ' ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 6';
    const selectedTrendSql =
      "SELECT DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS date, COUNT(*) AS transactions, COALESCE(SUM(GREATEST(t.grand_total - t.cancelled_amount - t.refunded_amount - COALESCE(t.shipping_cost, 0), 0)), 0) AS sales " +
      `FROM transactions t WHERE t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ?` +
      transactionScope + ' GROUP BY t.transaction_date ORDER BY date';
    const selectedPaymentSql =
      'SELECT tp.payment_method, COALESCE(SUM(tp.amount - ((t.cancelled_amount + t.refunded_amount) * tp.amount / NULLIF(t.grand_total, 0))), 0) AS amount ' +
      'FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id ' +
      `WHERE t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ?` +
      transactionScope + ' GROUP BY tp.payment_method ORDER BY amount DESC';

    let salesRows;
    let expenseRows;
    let recent;
    let salesTrend;
    let payments;
    let productsSold;
    let selectedSales;
    let selectedExpenses;
    let selectedRecent;
    let selectedTrend;
    let selectedPayments;
    let selectedProductsSold;
    const selectedTransactionParams = [selectedStart, selectedEnd, ...transactionParams];
    const selectedExpenseParams = [selectedStart, selectedEnd, ...expenseParams];
    if (req.user.role === 'gudang') {
      // Dashboard gudang hanya memakai data stok. Hindari query penjualan,
      // pembayaran, dan pengeluaran yang tidak dipakai oleh halaman ini.
      const emptyResult = (rows) => [rows, []];
      salesRows = emptyResult([{
        today_sales: 0,
        today_transactions: 0,
        seven_day_sales: 0,
        month_sales: 0,
      }]);
      expenseRows = emptyResult([{
        today_expenses: 0,
        seven_day_expenses: 0,
        month_expenses: 0,
      }]);
      recent = emptyResult([]);
      salesTrend = emptyResult([]);
      payments = emptyResult([]);
      productsSold = emptyResult([{ products_sold: 0 }]);
      selectedSales = emptyResult([{ transactions: 0, sales: 0 }]);
      selectedExpenses = emptyResult([{ expenses: 0 }]);
      selectedRecent = emptyResult([]);
      selectedTrend = emptyResult([]);
      selectedPayments = emptyResult([]);
      selectedProductsSold = emptyResult([{ products_sold: 0 }]);
    } else {
      [salesRows, expenseRows, recent, salesTrend, payments, productsSold, selectedSales, selectedExpenses, selectedRecent, selectedTrend, selectedPayments, selectedProductsSold] = await Promise.all([
        db.execute(salesSql, transactionParams),
        db.execute(expensesSql, expenseParams),
        db.execute(recentSql, transactionParams),
        db.execute(trendSql, transactionParams),
        db.execute(paymentSql, transactionParams),
        db.execute(productsSoldSql, transactionParams),
        db.execute(selectedSalesSql, selectedTransactionParams),
        db.execute(selectedExpensesSql, selectedExpenseParams),
        db.execute(selectedRecentSql, selectedTransactionParams),
        db.execute(selectedTrendSql, selectedTransactionParams),
        db.execute(selectedPaymentSql, selectedTransactionParams),
        db.execute(selectedProductsSoldSql, selectedTransactionParams)
      ]);
    }

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

    const storeScope = selectedBranchId === null ? '' : ' AND b.id = ?';
    const stores = owner ? (await db.execute(
      `SELECT b.id, b.name, b.address,
        COALESCE((SELECT SUM(GREATEST(t.grand_total - t.cancelled_amount - t.refunded_amount - COALESCE(t.shipping_cost, 0), 0)) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date = CURDATE()), 0) AS today_sales,
        COALESCE((SELECT SUM(GREATEST(t.grand_total - t.cancelled_amount - t.refunded_amount - COALESCE(t.shipping_cost, 0), 0)) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)), 0) AS seven_day_sales,
        COALESCE((SELECT SUM(GREATEST(t.grand_total - t.cancelled_amount - t.refunded_amount - COALESCE(t.shipping_cost, 0), 0)) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')), 0) AS month_sales,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = b.id AND e.status = 'approved' AND e.expense_date = CURDATE()), 0) AS today_expenses,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = b.id AND e.status = 'approved' AND e.expense_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)), 0) AS seven_day_expenses,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = b.id AND e.status = 'approved' AND YEAR(e.expense_date) = YEAR(CURDATE()) AND MONTH(e.expense_date) = MONTH(CURDATE())), 0) AS month_expenses,
        COALESCE((SELECT COUNT(*) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date = CURDATE()), 0) AS today_transactions,
        COALESCE((SELECT COUNT(*) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)), 0) AS seven_day_transactions,
        COALESCE((SELECT COUNT(*) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')), 0) AS month_transactions,
        (SELECT COUNT(*) FROM products p WHERE p.branch_id = b.id AND p.is_active = TRUE) AS products
       FROM branches b WHERE b.is_active = TRUE${storeScope} ORDER BY b.id`,
      selectedBranchId === null ? [] : [selectedBranchId]
    ))[0] : [];
    const selectedStores = owner ? (await db.execute(
      `SELECT b.id, b.name, b.address,
        COALESCE((SELECT SUM(GREATEST(t.grand_total - t.cancelled_amount - t.refunded_amount - COALESCE(t.shipping_cost, 0), 0)) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ?), 0) AS selected_sales,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = b.id AND e.status = 'approved' AND e.expense_date BETWEEN ? AND ?), 0) AS selected_expenses,
        COALESCE((SELECT COUNT(*) FROM transactions t WHERE t.branch_id = b.id AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ?), 0) AS selected_transactions,
        (SELECT COUNT(*) FROM products p WHERE p.branch_id = b.id AND p.is_active = TRUE) AS products
       FROM branches b WHERE b.is_active = TRUE${storeScope} ORDER BY b.id`,
      selectedBranchId === null
        ? [selectedStart, selectedEnd, selectedStart, selectedEnd, selectedStart, selectedEnd]
        : [selectedStart, selectedEnd, selectedStart, selectedEnd, selectedStart, selectedEnd, selectedBranchId]
    ))[0] : [];

    const summary = {
      ...salesRows[0][0],
      ...expenseRows[0][0],
      products_sold: Number(productsSold[0][0]?.products_sold || 0),
    };
    const selectedSummary = {
      sales: Number(selectedSales[0][0]?.sales || 0),
      transactions: Number(selectedSales[0][0]?.transactions || 0),
      expenses: Number(selectedExpenses[0][0]?.expenses || 0),
      products_sold: Number(selectedProductsSold[0][0]?.products_sold || 0),
    };

    // Ringkasan stok tersedia terpisah untuk Owner dan petugas toko/gudang.
    let stockSummary = null;
    let warehouseDashboard = null;
    let ownerStockDashboard = null;
    const includeStockDashboard = ['gudang', 'owner', 'manager', 'admin'].includes(req.user.role);
    if (includeStockDashboard) {
      const stockScope = stockDashboardScope({
        role: req.user.role,
        branchId: req.user.branch_id,
        queryBranchId: req.query.branch_id,
      });
      const stockBranchFilter = stockScope.branchFilter;
      const stockWarehouseBranchFilter = stockScope.warehouseBranchFilter;
      const dashboardStart = selectedStart;
      const dashboardEnd = selectedEnd;

      const [stockRows] = await db.execute(
        `SELECT COUNT(DISTINCT ws.product_id) AS total_products,
                COALESCE(SUM(ws.quantity), 0) AS total_stock,
                COALESCE(SUM(ws.reserved_quantity), 0) AS reserved_stock,
                SUM(CASE WHEN ws.quantity = 0 THEN 1 ELSE 0 END) AS out_of_stock
         FROM warehouse_stocks ws
         JOIN warehouses w ON w.id = ws.warehouse_id
         JOIN branches b ON b.id = w.branch_id
         WHERE w.is_active = TRUE AND b.is_active = TRUE${stockBranchFilter}`,
        stockScope.branchParams
      );
      const [recentStock] = await db.execute(
        `SELECT sm.id, p.name AS product_name, p.sku, sm.qty, sm.channel, sm.created_at
         FROM stock_mutations sm
         JOIN products p ON p.id = sm.product_id
         JOIN warehouses w ON w.id = sm.warehouse_id
         JOIN branches b ON b.id = w.branch_id
         WHERE b.is_active = TRUE${stockBranchFilter}
         ORDER BY sm.created_at DESC LIMIT 6`,
        stockScope.branchParams
      );
      stockSummary = { ...stockRows[0], recent_mutations: recentStock };

      // Data Dashboard Gudang — seluruhnya dihitung dari stok/mutasi nyata.
      // Produk dikelompokkan satu kali agar varian tidak menggandakan SKU.
      const [warehouseProducts] = await db.execute(
        `SELECT p.id, p.name, p.sku, p.min_stock, c.name AS category_name,
                COALESCE(stock.total_stock, 0) AS total_stock,
                COALESCE(stock.reserved_stock, 0) AS reserved_stock
         FROM products p
         JOIN branches b ON b.id = p.branch_id AND b.is_active = TRUE${stockBranchFilter}
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN (
           SELECT ws.product_id,
                  SUM(ws.quantity) AS total_stock,
                  SUM(ws.reserved_quantity) AS reserved_stock
           FROM warehouse_stocks ws
           JOIN warehouses w ON w.id = ws.warehouse_id AND w.is_active = TRUE
           JOIN branches wb ON wb.id = w.branch_id AND wb.is_active = TRUE${stockWarehouseBranchFilter}
           GROUP BY ws.product_id
         ) stock ON stock.product_id = p.id
         WHERE p.is_active = TRUE
         ORDER BY p.name`,
        [...stockScope.branchParams, ...stockScope.warehouseBranchParams]
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
         JOIN branches b ON b.id = w.branch_id AND b.is_active = TRUE${stockBranchFilter}
         WHERE DATE(sm.created_at) BETWEEN ? AND ?
         GROUP BY DATE(sm.created_at)
         ORDER BY date`,
        [...stockScope.branchParams, dashboardStart, dashboardEnd]
      );
      const [topOutRows] = await db.execute(
        `SELECT p.name, p.sku, COALESCE(SUM(ABS(sm.qty)), 0) AS total
         FROM stock_mutations sm
         JOIN products p ON p.id = sm.product_id
         JOIN warehouses w ON w.id = sm.warehouse_id AND w.is_active = TRUE
         JOIN branches b ON b.id = w.branch_id AND b.is_active = TRUE${stockBranchFilter}
         WHERE sm.qty < 0 AND DATE(sm.created_at) BETWEEN ? AND ?
         GROUP BY p.id, p.name, p.sku
         ORDER BY total DESC, p.name
         LIMIT 6`,
        [...stockScope.branchParams, dashboardStart, dashboardEnd]
      );
      const [incomingRows] = await db.execute(
        `SELECT p.name, p.sku, COALESCE(SUM(sm.qty), 0) AS quantity, MAX(sm.created_at) AS latest_at
         FROM stock_mutations sm
         JOIN products p ON p.id = sm.product_id
         JOIN warehouses w ON w.id = sm.warehouse_id AND w.is_active = TRUE
         JOIN branches b ON b.id = w.branch_id AND b.is_active = TRUE${stockBranchFilter}
         WHERE sm.qty > 0 AND DATE(sm.created_at) BETWEEN ? AND ?
         GROUP BY p.id, p.name, p.sku
         ORDER BY latest_at DESC, quantity DESC
         LIMIT 8`,
        [...stockScope.branchParams, dashboardStart, dashboardEnd]
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
        daily: dailyRows.map((row) => ({
          // MySQL DATE is midnight WIB; JSON would serialize it as the previous UTC day.
          date: row.date instanceof Date ? localDateString(row.date) : row.date,
          in: Number(row.total_in || 0),
          out: Number(row.total_out || 0),
        })),
        categories,
        top_products_out: topOutRows.map((row) => ({ name: row.name, sku: row.sku, total: Number(row.total || 0) })),
        recent_incoming: incomingRows.map((row) => ({ name: row.name, sku: row.sku, quantity: Number(row.quantity || 0), latest_at: row.latest_at })),
        low_stock: lowStock.map((row) => ({ name: row.name, sku: row.sku, total_stock: row.total_stock, min_stock: row.min_stock })),
        out_of_stock: outOfStock.map((row) => ({ name: row.name, sku: row.sku, total_stock: row.total_stock, min_stock: row.min_stock })),
      };
      if (owner) ownerStockDashboard = warehouseDashboard;
    }

    const selectedSalesTrend = buildDailyTrend(selectedTrend[0], selectedStart, selectedEnd);

    res.json({
      success: true,
      data: {
        summary,
        owner_summary: owner ? summary : null,
        recent_transactions: recent[0],
        sales_trend: sevenDayTrend,
        payment_breakdown: payments[0],
        stores,
        selected_period: { start: selectedStart, end: selectedEnd },
        selected_summary: selectedSummary,
        selected_sales_trend: selectedSalesTrend,
        selected_payment_breakdown: selectedPayments[0],
        selected_recent_transactions: selectedRecent[0],
        selected_stores: selectedStores,
        branch_context_id: owner ? (selectedBranchId === null ? 'all' : selectedBranchId) : req.user.branch_id,
        stock_summary: stockSummary,
        warehouse_dashboard: warehouseDashboard,
        owner_stock_dashboard: ownerStockDashboard,
      }
    });
  } catch (error) { next(error); }
});

module.exports = router;
