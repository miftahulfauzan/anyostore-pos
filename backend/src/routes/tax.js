const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
router.use(authenticate, authorize('owner', 'manager', 'admin'));

const money = (v) => Math.round(Number(v || 0) * 100) / 100;

// GET /api/tax/report?start=YYYY-MM-DD&end=YYYY-MM-DD&branch_id=N
// PPN keluaran (sales), PPN masukan (purchases), net PPN, monthly breakdown
router.get('/report', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const start = req.query.start || today.slice(0, 8) + '01';
    const end = req.query.end || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
      return res.status(400).json({ success: false, message: 'Rentang tanggal tidak valid' });
    }

    const branchId = req.user.role === 'owner' ? (Number(req.query.branch_id) || req.user.branch_id) : req.user.branch_id;

    // Get tax settings
    const [settings] = await db.execute('SELECT `key`, `value` FROM store_settings WHERE branch_id=? AND `key` IN ("tax_rate","prices_include_tax","store_name")', [branchId]);
    const cfg = Object.fromEntries(settings.map((r) => [r.key, r.value]));
    const taxRate = Number(cfg.tax_rate || 0);
    const pricesIncludeTax = cfg.prices_include_tax === 'true';
    const storeName = cfg.store_name || 'Toko';

    // PPN Keluaran (from completed sales)
    const [salesData] = await db.execute(
      `SELECT COUNT(*) AS transactions, COALESCE(SUM(grand_total - cancelled_amount), 0) AS gross_sales
       FROM transactions WHERE branch_id=? AND status IN ('completed','partially_cancelled') AND DATE(created_at) BETWEEN ? AND ?`,
      [branchId, start, end]
    );
    const grossSales = Number(salesData[0].gross_sales);
    // PPN base = omset sebelum PPN; if prices_include_tax, PPN is included
    const ppnKeluaranBase = pricesIncludeTax ? grossSales / (1 + taxRate / 100) : grossSales;
    const ppnKeluaran = money(ppnKeluaranBase * taxRate / 100);

    // PPN Masukan (from purchase orders received)
    const [purchaseData] = await db.execute(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_cost), 0) AS total_purchase
       FROM purchase_orders WHERE branch_id=? AND status='received' AND DATE(received_at) BETWEEN ? AND ?`,
      [branchId, start, end]
    ).catch(() => [{ orders: 0, total_purchase: 0 }]);
    const totalPurchase = Number(purchaseData[0].total_purchase || 0);
    const ppnMasukan = money(totalPurchase * taxRate / 100);

    const netPpn = money(ppnKeluaran - ppnMasukan);

    // Monthly breakdown
    const [monthly] = await db.execute(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
              COUNT(*) AS transactions,
              COALESCE(SUM(grand_total - cancelled_amount), 0) AS gross_sales
       FROM transactions WHERE branch_id=? AND status IN ('completed','partially_cancelled') AND DATE(created_at) BETWEEN ? AND ?
       GROUP BY month ORDER BY month`,
      [branchId, start, end]
    );
    const monthlyBreakdown = monthly.map((r) => {
      const base = pricesIncludeTax ? Number(r.gross_sales) / (1 + taxRate / 100) : Number(r.gross_sales);
      return {
        month: r.month,
        transactions: r.transactions,
        gross_sales: money(r.gross_sales),
        ppn_base: money(base),
        ppn_keluaran: money(base * taxRate / 100),
      };
    });

    res.json({
      success: true,
      data: {
        period: { start, end },
        store_name: storeName,
        tax_rate: taxRate,
        prices_include_tax: pricesIncludeTax,
        ppn_keluaran: {
          transactions: salesData[0].transactions,
          gross_sales: money(grossSales),
          ppn_base: money(ppnKeluaranBase),
          ppn_amount: ppnKeluaran,
        },
        ppn_masukan: {
          orders: purchaseData[0].orders,
          total_purchase: money(totalPurchase),
          ppn_amount: ppnMasukan,
        },
        net_ppn: netPpn,
        monthly: monthlyBreakdown,
      },
    });
  } catch (error) { next(error); }
});

// GET /api/tax/faktur-pajak?start=&end=&branch_id=
// Generate faktur pajak data from transactions
router.get('/faktur-pajak', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const start = req.query.start || today.slice(0, 8) + '01';
    const end = req.query.end || today;
    const branchId = req.user.role === 'owner' ? (Number(req.query.branch_id) || req.user.branch_id) : req.user.branch_id;

    const [settings] = await db.execute('SELECT `key`, `value` FROM store_settings WHERE branch_id=? AND `key` IN ("tax_rate","prices_include_tax","store_name","store_address")', [branchId]);
    const cfg = Object.fromEntries(settings.map((r) => [r.key, r.value]));
    const taxRate = Number(cfg.tax_rate || 0);
    const pricesIncludeTax = cfg.prices_include_tax === 'true';

    // Get branch identity for NPWP
    const [branch] = await db.execute('SELECT id, name, address, npwp FROM branches WHERE id=?', [branchId]);

    const [invoices] = await db.execute(
      `SELECT t.id, t.invoice_no, t.grand_total, t.cancelled_amount, t.status, t.price_tier, t.created_at,
              u.name AS cashier, c.name AS customer_name, c.phone AS customer_phone
       FROM transactions t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN customers c ON c.id = t.customer_id
       WHERE t.branch_id=? AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at) BETWEEN ? AND ?
       ORDER BY t.created_at ASC`,
      [branchId, start, end]
    );

    const faktur = invoices.map((t, idx) => {
      const taxable = Number(t.grand_total) - Number(t.cancelled_amount || 0);
      const base = pricesIncludeTax ? taxable / (1 + taxRate / 100) : taxable;
      const ppn = money(base * taxRate / 100);
      return {
        no: idx + 1,
        faktur_no: `FP-${t.invoice_no}`,
        invoice_no: t.invoice_no,
        date: t.created_at,
        customer: t.customer_name || '-',
        customer_phone: t.customer_phone || '-',
        status: t.status,
        gross_amount: money(taxable),
        ppn_base: money(base),
        ppn_rate: taxRate,
        ppn_amount: ppn,
        net_amount: money(taxable + (pricesIncludeTax ? 0 : ppn)),
        cashier: t.cashier,
      };
    });

    const totalPpn = faktur.reduce((sum, f) => sum + f.ppn_amount, 0);

    res.json({
      success: true,
      data: {
        period: { start, end },
        store: branch[0] ? { name: branch[0].name, address: branch[0].address, npwp: branch[0].npwp } : {},
        tax_rate: taxRate,
        prices_include_tax: pricesIncludeTax,
        total_faktur: faktur.length,
        total_ppn: money(totalPpn),
        faktur,
      },
    });
  } catch (error) { next(error); }
});

// GET /api/tax/pph23?start=&end=&branch_id=
// PPh 23 report (withholding tax on services, 2%)
router.get('/pph23', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const start = req.query.start || today.slice(0, 8) + '01';
    const end = req.query.end || today;
    const branchId = req.user.role === 'owner' ? (Number(req.query.branch_id) || req.user.branch_id) : req.user.branch_id;

    // PPh 23 is 2% of service payments (expenses type=expense with PPh 23 category)
    // For now, show approved expenses that could be subject to PPh 23
    const [expenses] = await db.execute(
      `SELECT e.id, e.description, e.amount, e.expense_date, e.status, ec.name AS category_name
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.branch_id=? AND (e.type IS NULL OR e.type='expense') AND e.status='approved' AND DATE(e.expense_date) BETWEEN ? AND ?
       ORDER BY e.expense_date ASC`,
      [branchId, start, end]
    );

    const pph23Rate = 2; // 2% PPh 23
    const items = expenses.map((e, idx) => ({
      no: idx + 1,
      date: e.expense_date,
      description: e.description || e.category_name || '-',
      amount: money(e.amount),
      pph23_base: money(e.amount),
      pph23_rate: pph23Rate,
      pph23_amount: money(e.amount * pph23Rate / 100),
    }));

    const totalPph23 = items.reduce((sum, i) => sum + i.pph23_amount, 0);

    res.json({
      success: true,
      data: {
        period: { start, end },
        pph23_rate: pph23Rate,
        total_expenses: items.length,
        total_pph23: money(totalPph23),
        items,
      },
    });
  } catch (error) { next(error); }
});

module.exports = router;
