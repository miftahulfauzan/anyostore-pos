const express = require('express');
const db = require('../db');
const { SALES_STATUSES_SQL } = require('../sales-status');
const { buildClosingMethods } = require('../closing-math');
const { authenticate, authorize } = require('../auth');
const { parseOwnerBranchId } = require('../dashboard-stock-scope');

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
    const [summary] = await db.execute(`SELECT COUNT(*) AS transactions, COALESCE(SUM(grand_total - cancelled_amount - refunded_amount), 0) AS gross_sales, COALESCE(SUM(discount), 0) AS discounts FROM transactions WHERE branch_id = ? AND status IN (${SALES_STATUSES_SQL}) AND transaction_date BETWEEN ? AND ?`, [branchId, start, end]);
    const [payments] = await db.execute(`SELECT tp.payment_method, COALESCE(SUM(tp.amount - ((t.cancelled_amount + t.refunded_amount) * tp.amount / NULLIF(t.grand_total, 0))), 0) AS amount FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id WHERE t.branch_id = ? AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ? GROUP BY tp.payment_method`, [branchId, start, end]);
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
      `SELECT COUNT(*) AS receipt_count, COALESCE(SUM(grand_total - cancelled_amount - refunded_amount), 0) AS total_sales
       FROM transactions WHERE branch_id=? AND status IN (${SALES_STATUSES_SQL}) AND transaction_date=?`,
      [branchId, date]
    );
    const [returnsData] = await db.execute(
      `SELECT refund_method, COUNT(*) AS cnt, COALESCE(SUM(refund_amount), 0) AS refund
       FROM returns WHERE branch_id=? AND DATE(created_at)=? GROUP BY refund_method`,
      [branchId, date]
    );
    const [payments] = await db.execute(
      `SELECT tp.payment_method,
              COALESCE(SUM(tp.amount), 0) AS sales,
              COALESCE(SUM(t.cancelled_amount * tp.amount / NULLIF(t.grand_total, 0)), 0) AS cancellations
       FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id
       WHERE t.branch_id=? AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date=?
       GROUP BY tp.payment_method ORDER BY tp.payment_method`,
      [branchId, date]
    );
    // Kas masuk/keluar hanya untuk catatan MANUAL. Refund pembatalan &
    // retur sudah dihitung via payments.cancellations / returns — kalau ikut
    // dihitung lagi di sini hasilnya minus dua kali (total kasir jadi negatif).
    const [movements] = await db.execute(
      `SELECT COALESCE(SUM(CASE WHEN cdm.type='cash_in' THEN cdm.amount ELSE -cdm.amount END), 0) AS net
       FROM cash_drawer_movements cdm JOIN cash_drawers cd ON cd.id = cdm.cash_drawer_id
       WHERE cd.branch_id=? AND DATE(cdm.created_at)=?
         AND (cdm.reason IS NULL OR (cdm.reason NOT LIKE 'Refund %' AND cdm.reason NOT LIKE 'Retur %'))`,
      [branchId, date]
    );
    const [expenseRows] = await db.execute(
      `SELECT COALESCE(SUM(CASE WHEN e.type='expense' THEN e.amount ELSE 0 END), 0) AS expense,
              COALESCE(SUM(CASE WHEN e.type='income' THEN e.amount ELSE 0 END), 0) AS income
       FROM expenses e WHERE e.branch_id=? AND e.status='approved' AND e.expense_date=?`,
      [branchId, date]
    );

    const returnCount = returnsData.reduce((sum, row) => sum + Number(row.cnt || 0), 0);
    const { methods, expected_total: expectedTotal } = buildClosingMethods({
      payments,
      returnsData,
      movementsNet: Number(movements[0].net || 0),
    });

    res.json({
      success: true,
      data: {
        document: 'Penutupan Penjualan',
        store: branch.name,
        store_address: branch.address || '',
        printed_at: new Date().toISOString(),
        printed_by: userRows[0]?.name || req.user.id,
        date,
        receipt_count: Number(salesData[0].receipt_count),
        return_count: returnCount,
        total_sales: money(salesData[0].total_sales),
        subtotal: money(salesData[0].total_sales),
        expenses: money(Number(expenseRows[0].expense)),
        income: money(Number(expenseRows[0].income)),
        methods,
        expected_total: expectedTotal,
      },
    });
  } catch (error) { next(error); }
});

router.get('/overview', async (req, res, next) => {
  try {
    const { start, end } = dateRange(req.query);
    const owner = req.user.role === 'owner';
    const selectedBranchId = owner ? parseOwnerBranchId(req.query.branch_id) : Number(req.user.branch_id);
    if (owner && selectedBranchId !== null) {
      const [activeBranches] = await db.execute('SELECT id FROM branches WHERE id = ? AND is_active = TRUE LIMIT 1', [selectedBranchId]);
      if (!activeBranches.length) return res.status(404).json({ success: false, message: 'Toko tidak ditemukan atau sudah tidak aktif.' });
    }
    const scope = owner && selectedBranchId === null
      ? 'IN (SELECT id FROM branches WHERE is_active = TRUE)'
      : '= ?';
    const branchParams = owner && selectedBranchId === null ? [] : [selectedBranchId];
    const periodParams = [...branchParams, start, end];
    const [[sales], [costs], [expenses], payments, products, categories, cashiers, customers, lowStock, dailySales, hourlySales, priceTiers, transactions, discountDetails, cancellations, cancellationRows, returnSummary, returns, branchComparison] = await Promise.all([
      db.execute(`SELECT COUNT(*) AS transactions, COALESCE(SUM(grand_total - cancelled_amount - refunded_amount), 0) AS revenue, COALESCE(SUM(discount), 0) AS discounts FROM transactions WHERE branch_id ${scope} AND status IN (${SALES_STATUSES_SQL}) AND transaction_date BETWEEN ? AND ?`, periodParams),
      db.execute(`SELECT COALESCE(SUM(ti.cost * (ti.quantity - ti.cancelled_qty - ti.returned_qty)), 0) AS cost_of_goods, COALESCE(SUM(ti.subtotal * (ti.quantity - ti.cancelled_qty - ti.returned_qty) / NULLIF(ti.quantity, 0) - ti.cost * (ti.quantity - ti.cancelled_qty - ti.returned_qty)), 0) AS item_profit FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id WHERE t.branch_id ${scope} AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ?`, periodParams),
      db.execute(`SELECT COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS amount, COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income FROM expenses WHERE branch_id ${scope} AND status = 'approved' AND expense_date BETWEEN ? AND ?`, periodParams),
      db.execute(`SELECT tp.payment_method, COUNT(DISTINCT t.id) AS transactions, COALESCE(SUM(tp.amount - ((t.cancelled_amount + t.refunded_amount) * tp.amount / NULLIF(t.grand_total, 0))), 0) AS amount FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id WHERE t.branch_id ${scope} AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ? GROUP BY tp.payment_method ORDER BY amount DESC`, periodParams),
      db.execute(`SELECT ti.product_id, ti.variant_detail, MAX(ti.product_name) AS name, MAX(ti.product_sku) AS sku, MAX(c.name) AS category_name, COALESCE(MAX(pv.barcode), MAX(p.barcode)) AS barcode, SUM(ti.quantity - ti.cancelled_qty - ti.returned_qty) AS quantity_sold, COALESCE(SUM(ti.subtotal * (ti.quantity - ti.cancelled_qty - ti.returned_qty) / NULLIF(ti.quantity, 0) * t.grand_total / NULLIF(t.subtotal, 0)), 0) AS revenue, COALESCE(SUM(ti.cost * (ti.quantity - ti.cancelled_qty - ti.returned_qty)), 0) AS cost_of_goods, COALESCE(SUM(ti.subtotal * (ti.quantity - ti.cancelled_qty - ti.returned_qty) / NULLIF(ti.quantity, 0) * t.grand_total / NULLIF(t.subtotal, 0) - ti.cost * (ti.quantity - ti.cancelled_qty - ti.returned_qty)), 0) AS profit FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id LEFT JOIN products p ON p.id = ti.product_id LEFT JOIN product_variants pv ON pv.id = ti.variant_id LEFT JOIN categories c ON c.id = p.category_id WHERE t.branch_id ${scope} AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ? GROUP BY ti.product_id, ti.variant_detail ORDER BY revenue DESC LIMIT 200`, periodParams),
      db.execute(`SELECT c.id AS category_id, c.name AS category_name, COALESCE(SUM(ti.quantity - ti.cancelled_qty - ti.returned_qty), 0) AS quantity_sold, COALESCE(SUM(ti.subtotal * (ti.quantity - ti.cancelled_qty - ti.returned_qty) / NULLIF(ti.quantity, 0) * t.grand_total / NULLIF(t.subtotal, 0)), 0) AS revenue, COALESCE(SUM(ti.cost * (ti.quantity - ti.cancelled_qty - ti.returned_qty)), 0) AS cost_of_goods, COALESCE(SUM(ti.subtotal * (ti.quantity - ti.cancelled_qty - ti.returned_qty) / NULLIF(ti.quantity, 0) * t.grand_total / NULLIF(t.subtotal, 0) - ti.cost * (ti.quantity - ti.cancelled_qty - ti.returned_qty)), 0) AS profit FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id LEFT JOIN products p ON p.id = ti.product_id LEFT JOIN categories c ON c.id = p.category_id WHERE t.branch_id ${scope} AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ? GROUP BY c.id, c.name ORDER BY revenue DESC`, periodParams),
      db.execute(`SELECT u.id, u.name, u.role, COUNT(t.id) AS transactions, COALESCE(SUM(t.grand_total - t.cancelled_amount - t.refunded_amount), 0) AS revenue, COALESCE(SUM(t.discount), 0) AS discounts FROM users u LEFT JOIN transactions t ON t.user_id = u.id AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ? WHERE u.branch_id ${scope} GROUP BY u.id, u.name, u.role ORDER BY revenue DESC`, [start, end, ...branchParams]),
      db.execute(`SELECT c.id, c.name, c.phone, COUNT(t.id) AS transactions, COALESCE(SUM(t.grand_total - t.cancelled_amount - t.refunded_amount), 0) AS revenue FROM customers c JOIN transactions t ON t.customer_id = c.id AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ? WHERE c.branch_id ${scope} GROUP BY c.id, c.name, c.phone ORDER BY revenue DESC LIMIT 50`, [start, end, ...branchParams]),
      db.execute(`SELECT p.id, p.name, p.sku, p.stock, p.min_stock, b.name AS branch_name FROM products p JOIN branches b ON b.id = p.branch_id WHERE p.branch_id ${scope} AND p.is_active = TRUE AND p.stock <= p.min_stock ORDER BY p.stock ASC, p.name LIMIT 100`, branchParams),
      db.execute(`SELECT DATE_FORMAT(transaction_date, '%Y-%m-%d') AS date, COUNT(*) AS transactions, COALESCE(SUM(grand_total - cancelled_amount - refunded_amount), 0) AS revenue FROM transactions WHERE branch_id ${scope} AND status IN (${SALES_STATUSES_SQL}) AND transaction_date BETWEEN ? AND ? GROUP BY transaction_date ORDER BY date`, periodParams),
      db.execute(`SELECT DATE_FORMAT(CONVERT_TZ(created_at, @@session.time_zone, '+07:00'), '%H:00') AS hour, COUNT(*) AS transactions, COALESCE(SUM(grand_total - cancelled_amount - refunded_amount), 0) AS revenue FROM transactions WHERE branch_id ${scope} AND status IN (${SALES_STATUSES_SQL}) AND transaction_date BETWEEN ? AND ? GROUP BY hour ORDER BY hour`, periodParams),
      db.execute(`SELECT t.price_tier, COUNT(DISTINCT t.id) AS transactions, COALESCE(SUM(ti.quantity - ti.cancelled_qty - ti.returned_qty), 0) AS products_sold, COALESCE(SUM(ti.subtotal * (ti.quantity - ti.cancelled_qty - ti.returned_qty) / NULLIF(ti.quantity, 0)), 0) AS revenue FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.id WHERE t.branch_id ${scope} AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ? GROUP BY t.price_tier`, periodParams),
      db.execute(`SELECT t.id, t.invoice_no, t.grand_total, t.cancelled_amount, t.refunded_amount, t.discount, t.status, t.payment_method, t.price_tier, t.created_at, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS transaction_date, u.name AS cashier, b.name AS branch_name FROM transactions t JOIN users u ON u.id = t.user_id JOIN branches b ON b.id = t.branch_id WHERE t.branch_id ${scope} AND t.transaction_date BETWEEN ? AND ? ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 200`, periodParams),
      db.execute(`SELECT COALESCE(SUM(t.discount), 0) AS transaction_discount, COALESCE((SELECT SUM(ti.discount * (ti.quantity - ti.cancelled_qty - ti.returned_qty) / NULLIF(ti.quantity, 0)) FROM transaction_items ti JOIN transactions tx ON tx.id = ti.transaction_id WHERE tx.branch_id ${scope} AND tx.status IN (${SALES_STATUSES_SQL}) AND tx.transaction_date BETWEEN ? AND ?), 0) AS item_discount FROM transactions t WHERE t.branch_id ${scope} AND t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ?`, [...periodParams, ...periodParams]),
      db.execute(`SELECT COUNT(*) AS transactions, COALESCE(SUM(cancelled_amount), 0) AS amount FROM transactions WHERE branch_id ${scope} AND transaction_date BETWEEN ? AND ? AND cancelled_amount > 0`, periodParams),
      db.execute(`SELECT t.id, t.invoice_no, t.cancelled_amount, t.cancel_reason, t.status, t.created_at, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS transaction_date, u.name AS cashier, COALESCE(items.cancelled_qty, 0) AS cancelled_qty FROM transactions t JOIN users u ON u.id = t.user_id LEFT JOIN (SELECT transaction_id, SUM(cancelled_qty) AS cancelled_qty FROM transaction_items GROUP BY transaction_id) items ON items.transaction_id = t.id WHERE t.branch_id ${scope} AND t.transaction_date BETWEEN ? AND ? AND t.cancelled_amount > 0 ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 200`, periodParams),
      db.execute(`SELECT r.status, COUNT(*) AS returns_count, COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.refund_amount ELSE 0 END), 0) AS refund_amount, COALESCE(SUM(ri.quantity_returned), 0) AS quantity_returned FROM returns r LEFT JOIN (SELECT return_id, SUM(quantity) AS quantity_returned FROM return_items GROUP BY return_id) ri ON ri.return_id = r.id WHERE r.branch_id ${scope} AND DATE(CONVERT_TZ(r.created_at, @@session.time_zone, '+07:00')) BETWEEN ? AND ? GROUP BY r.status ORDER BY r.status`, periodParams),
      db.execute(`SELECT r.id, r.return_no, r.refund_amount, r.reason, r.status, r.created_at, t.invoice_no, u.name AS created_by_name, COALESCE(items.quantity_returned, 0) AS quantity_returned FROM returns r JOIN transactions t ON t.id = r.transaction_id JOIN users u ON u.id = r.created_by LEFT JOIN (SELECT return_id, SUM(quantity) AS quantity_returned FROM return_items GROUP BY return_id) items ON items.return_id = r.id WHERE r.branch_id ${scope} AND DATE(CONVERT_TZ(r.created_at, @@session.time_zone, '+07:00')) BETWEEN ? AND ? ORDER BY r.created_at DESC LIMIT 200`, periodParams),
      owner && selectedBranchId === null
        ? db.execute(`SELECT b.id AS branch_id, b.name AS branch_name, COALESCE(s.transactions, 0) AS transactions, COALESCE(s.revenue, 0) AS revenue, COALESCE(c.cost_of_goods, 0) AS cost_of_goods, COALESCE(f.expenses, 0) AS expenses, COALESCE(f.income, 0) AS income FROM branches b LEFT JOIN (SELECT branch_id, COUNT(*) AS transactions, SUM(grand_total - cancelled_amount - refunded_amount) AS revenue FROM transactions WHERE status IN (${SALES_STATUSES_SQL}) AND transaction_date BETWEEN ? AND ? GROUP BY branch_id) s ON s.branch_id = b.id LEFT JOIN (SELECT t.branch_id, SUM(ti.cost * (ti.quantity - ti.cancelled_qty - ti.returned_qty)) AS cost_of_goods FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.id WHERE t.status IN (${SALES_STATUSES_SQL}) AND t.transaction_date BETWEEN ? AND ? GROUP BY t.branch_id) c ON c.branch_id = b.id LEFT JOIN (SELECT branch_id, SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expenses, SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income FROM expenses WHERE status = 'approved' AND expense_date BETWEEN ? AND ? GROUP BY branch_id) f ON f.branch_id = b.id WHERE b.is_active = TRUE AND b.type = 'toko' ORDER BY revenue DESC`, [start, end, start, end, start, end])
        : Promise.resolve([[]]),
    ]);
    const revenue = money(Number(sales[0].revenue) + Number(expenses[0].income));
    const costOfGoods = Number(costs[0].cost_of_goods);
    const approvedExpenses = Number(expenses[0].amount);
    const income = Number(expenses[0].income);
    const discounts = money(Number(discountDetails[0][0].transaction_discount) + Number(discountDetails[0][0].item_discount));
    const branchRows = branchComparison[0].map((row) => ({
      ...row,
      net_profit: money(Number(row.revenue) + Number(row.income) - Number(row.cost_of_goods) - Number(row.expenses)),
    }));
    const branchName = owner && selectedBranchId === null
      ? 'Semua Toko/Gudang'
      : (await db.execute('SELECT name FROM branches WHERE id=? AND is_active = TRUE', [selectedBranchId]))[0][0]?.name || '';
    res.json({ success: true, data: {
      start, end, branch_id: owner && selectedBranchId === null ? 'all' : selectedBranchId, branch_name: branchName,
      summary: { transactions: sales[0].transactions, revenue, gross_sales: Number(sales[0].revenue), discounts, transaction_discounts: Number(discountDetails[0][0].transaction_discount), item_discounts: Number(discountDetails[0][0].item_discount), cost_of_goods: costOfGoods, gross_profit: revenue - costOfGoods, expenses: approvedExpenses, income, net_profit: money(revenue - costOfGoods - approvedExpenses), cancelled_transactions: Number(cancellations[0][0].transactions), cancelled_amount: Number(cancellations[0][0].amount), returns: returnSummary[0].reduce((total, row) => total + Number(row.returns_count || 0), 0), returned_quantity: returnSummary[0].reduce((total, row) => total + Number(row.quantity_returned || 0), 0), refund_amount: returnSummary[0].reduce((total, row) => total + Number(row.refund_amount || 0), 0) },
      payment_methods: payments[0], products: products[0], categories: categories[0], cashiers: cashiers[0], customers: customers[0], low_stock: lowStock[0], daily_sales: dailySales[0], hourly_sales: hourlySales[0], price_tiers: priceTiers[0], transactions: transactions[0], cancellations: cancellationRows[0], return_summary: returnSummary[0], returns: returns[0], branch_comparison: branchRows
    } });
  } catch (error) { next(error); }
});

module.exports = router;
