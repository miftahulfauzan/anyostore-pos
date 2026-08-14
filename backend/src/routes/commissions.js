const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
const allowedTypes = new Set(['percentage_sales', 'percentage_profit', 'per_transaction', 'flat_monthly', 'per_pcs_customer_tier']);
const allowedTargets = new Set(['all', 'role', 'user']);
const allowedRoles = new Set(['owner', 'manager', 'admin', 'kasir', 'gudang']);
const asMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const customerTiers = new Set(['reguler', 'semi_grosir', 'grosir_seri']);
const { localDateString, localMonthStartString } = require('../local-date');

router.get('/staff', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const requestedBranch = Number(req.query.branch_id);
    const branchId = Number.isInteger(requestedBranch) ? requestedBranch : req.user.branch_id;
    const [rows] = await db.execute('SELECT id, name, role, branch_id FROM users WHERE branch_id = ? AND is_active = TRUE ORDER BY name', [branchId]);
    res.json({ success: true, data: rows, branch_id: branchId });
  } catch (error) { next(error); }
});

router.get('/', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const requestedBranch = Number(req.query.branch_id);
    const branchId = Number.isInteger(requestedBranch) ? requestedBranch : req.user.branch_id;
    const [branches] = await db.execute('SELECT id, name FROM branches WHERE is_active=TRUE ORDER BY id');
    const [rules, records] = await Promise.all([
      db.execute(`SELECT cr.*, u.name AS staff_name FROM commission_rules cr LEFT JOIN users u ON u.id = cr.user_id WHERE (cr.branch_id = ? OR cr.branch_id IS NULL) ORDER BY cr.is_active DESC, cr.created_at DESC`, [branchId]),
      db.execute(`SELECT r.*, u.name AS staff_name, u.role, cr.name AS rule_name FROM commission_records r JOIN users u ON u.id = r.user_id LEFT JOIN commission_rules cr ON cr.id = r.rule_id WHERE r.branch_id = ? ORDER BY r.created_at DESC LIMIT 100`, [branchId])
    ]);
    res.json({ success: true, data: { branches, branch_id: branchId, rules: rules[0], records: records[0] } });
  } catch (error) { next(error); }
});

async function computeBranchReport(branchId, start, end) {
  const [rules] = await db.execute(`SELECT * FROM commission_rules WHERE (branch_id = ? OR branch_id IS NULL) AND (is_active=TRUE OR is_active=1)`, [branchId]);
  const [users] = await db.execute('SELECT id, name, role FROM users WHERE branch_id=? AND is_active=TRUE ORDER BY role, name', [branchId]);
  const perAccount = [];
  for (const u of users) {
    const applicable = rules.filter((r) => r.applies_to === 'all' || (r.applies_to === 'role' && String(r.role).toLowerCase() === String(u.role).toLowerCase()) || (r.applies_to === 'user' && Number(r.user_id) === Number(u.id)));
    if (!applicable.length) continue;
    const [rows] = await db.execute(
      `SELECT COALESCE(c.price_tier, 'reguler') AS tier, COALESCE(SUM(ti.quantity - ti.cancelled_qty),0) AS qty, COUNT(DISTINCT t.id) AS trx, COALESCE(SUM(t.grand_total - t.cancelled_amount),0) AS sales
       FROM transactions t
       JOIN transaction_items ti ON ti.transaction_id=t.id
       LEFT JOIN customers c ON c.id=t.customer_id
       WHERE t.branch_id=? AND t.user_id=? AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at) BETWEEN ? AND ?
       GROUP BY tier`,
      [branchId, u.id, start, end]
    );
    const tierMap = Object.fromEntries(rows.map((r) => [r.tier, r]));
    const getQty = (tier) => Number(tierMap[tier]?.qty || 0);
    const getSales = () => rows.reduce((sum, r) => sum + Number(r.sales || 0), 0);
    let totalCommission = 0;
    const breakdown = [];
    for (const r of applicable) {
      let comm = 0;
      if (r.calculation_type === 'per_pcs_customer_tier') {
        comm += getQty('reguler') * Number(r.commission_reguler_per_pcs || 0);
        comm += getQty('semi_grosir') * Number(r.commission_semi_grosir_per_pcs || 0);
        comm += getQty('grosir_seri') * Number(r.commission_grosir_seri_per_pcs || 0);
      } else if (r.calculation_type === 'percentage_sales') {
        comm = getSales() * Number(r.percentage) / 100;
      } else if (r.calculation_type === 'per_transaction') {
        const [cntRow] = await db.execute('SELECT COUNT(*) AS cnt FROM transactions WHERE branch_id=? AND user_id=? AND status IN ("completed","partially_cancelled") AND DATE(created_at) BETWEEN ? AND ?', [branchId, u.id, start, end]);
        comm = Number(cntRow[0].cnt) * Number(r.flat_amount);
      } else {
        comm = Number(r.flat_amount);
      }
      comm = asMoney(comm);
      if (comm > 0) {
        totalCommission += comm;
        breakdown.push({ rule_id: r.id, name: r.name, type: r.calculation_type, commission: comm });
      }
    }
    if (totalCommission > 0 || rows.length) {
      perAccount.push({
        user_id: u.id,
        name: u.name,
        role: u.role,
        qty_reguler: getQty('reguler'),
        qty_semi: getQty('semi_grosir'),
        qty_grosir: getQty('grosir_seri'),
        total_qty: getQty('reguler') + getQty('semi_grosir') + getQty('grosir_seri'),
        total_sales: asMoney(getSales()),
        total_transactions: rows.reduce((a, r) => a + Number(r.trx || 0), 0),
        commission: asMoney(totalCommission),
        breakdown,
        tiers: rows,
      });
    }
  }
  perAccount.sort((a, b) => b.commission - a.commission);
  const total = perAccount.reduce((sum, r) => sum + Number(r.commission), 0);
  return { per_account: perAccount, total_commission: asMoney(total) };
}

router.get('/report', authenticate, authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const requestedBranch = Number(req.query.branch_id);
    const branchId = req.user.role === 'owner'
      ? (Number.isInteger(requestedBranch) ? requestedBranch : req.user.branch_id)
      : req.user.branch_id;
    const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
    const today = new Date();
    const first = localMonthStartString(today);
    const todayStr = localDateString(today);
    const start = isDate(req.query.start) ? req.query.start : first;
    const end = isDate(req.query.end) ? req.query.end : todayStr;
    if (start > end) return res.status(400).json({ success: false, message: 'Rentang tanggal tidak valid' });

    const [branches] = await db.execute('SELECT id, name FROM branches WHERE is_active=TRUE ORDER BY id');
    const report = await computeBranchReport(branchId, start, end);
    res.json({ success: true, data: { period_start: start, period_end: end, branch_id: branchId, branches, ...report } });
  } catch (error) { next(error); }
});

// Ringkasan komisi per cabang (owner) — buat dashboard "Semua Toko".
router.get('/all-branches', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
    const today = new Date();
    const first = localMonthStartString(today);
    const todayStr = localDateString(today);
    const start = isDate(req.query.start) ? req.query.start : first;
    const end = isDate(req.query.end) ? req.query.end : todayStr;
    if (start > end) return res.status(400).json({ success: false, message: 'Rentang tanggal tidak valid' });
    const [branches] = await db.execute('SELECT id, name FROM branches WHERE is_active=TRUE ORDER BY id');
    const perBranch = [];
    for (const b of branches) {
      const report = await computeBranchReport(b.id, start, end);
      perBranch.push({ branch_id: b.id, branch_name: b.name, ...report });
    }
    const grandTotal = perBranch.reduce((sum, b) => sum + Number(b.total_commission), 0);
    res.json({ success: true, data: { period_start: start, period_end: end, per_branch: perBranch, total_commission: asMoney(grandTotal) } });
  } catch (error) { next(error); }
});

router.post('/rules', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const {
      name,
      description,
      branch_id: branchInput = null,
      applies_to: appliesTo = 'all',
      role = null,
      user_id: userId = null,
      calculation_type: calculationType,
      percentage = 0,
      flat_amount: flatAmount = 0,
      min_target: minTarget = 0,
      min_transactions: minTransactions = 0,
      start_date: startDate,
      end_date: endDate = null,
      commission_reguler_per_pcs: regulerPcs = 0,
      commission_semi_grosir_per_pcs: semiPcs = 0,
      commission_grosir_seri_per_pcs: grosirPcs = 0,
    } = req.body;
    const targetBranchId = branchInput != null && branchInput !== '' ? Number(branchInput) : null;
    if (targetBranchId != null && !Number.isInteger(targetBranchId)) return res.status(400).json({ success: false, message: 'Toko tidak valid' });
    if (!name?.trim() || !allowedTargets.has(appliesTo) || !allowedTypes.has(calculationType) || !startDate || Number(percentage) < 0 || Number(flatAmount) < 0 || Number(minTarget) < 0 || Number(minTransactions) < 0) return res.status(400).json({ success: false, message: 'Data aturan komisi tidak valid' });
    if (appliesTo === 'role' && !allowedRoles.has(role)) return res.status(400).json({ success: false, message: 'Pilih peran staf yang valid' });
    if (appliesTo === 'user' && !Number.isInteger(Number(userId))) return res.status(400).json({ success: false, message: 'Pilih staf untuk aturan ini' });
    const effectiveBranchId = targetBranchId != null ? targetBranchId : req.user.branch_id;
    if (appliesTo === 'user') {
      const [staff] = await db.execute('SELECT id, branch_id FROM users WHERE id = ?', [userId]);
      if (!staff[0]) return res.status(400).json({ success: false, message: 'Staf tidak ditemukan' });
      if (targetBranchId != null && Number(staff[0].branch_id) !== Number(targetBranchId)) {
        return res.status(400).json({ success: false, message: `Staf cabang ${staff[0].branch_id} tidak cocok dengan toko terpilih ${targetBranchId}` });
      }
    }
    if (calculationType === 'per_pcs_customer_tier') {
      if (Number(regulerPcs) < 0 || Number(semiPcs) < 0 || Number(grosirPcs) < 0) return res.status(400).json({ success: false, message: 'Komisi per pcs tidak boleh negatif' });
    }
    const [result] = await db.execute(
      `INSERT INTO commission_rules (branch_id, name, description, applies_to, role, user_id, calculation_type, percentage, flat_amount, commission_reguler_per_pcs, commission_semi_grosir_per_pcs, commission_grosir_seri_per_pcs, min_target, min_transactions, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        targetBranchId != null ? targetBranchId : req.user.branch_id,
        name.trim(),
        description?.trim() || null,
        appliesTo,
        appliesTo === 'role' ? role : null,
        appliesTo === 'user' ? Number(userId) : null,
        calculationType,
        asMoney(percentage),
        asMoney(flatAmount),
        asMoney(regulerPcs),
        asMoney(semiPcs),
        asMoney(grosirPcs),
        asMoney(minTarget),
        Number(minTransactions),
        startDate,
        endDate || null,
      ]
    );
    // if branch_id explicitly null from UI (global), override to NULL
    if (branchInput === null || branchInput === '') {
      await db.execute('UPDATE commission_rules SET branch_id=NULL WHERE id=?', [result.insertId]);
    }
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { next(error); }
});

router.post('/generate', authenticate, authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { period_start: periodStart, period_end: periodEnd } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart || '') || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd || '') || periodStart > periodEnd) return res.status(400).json({ success: false, message: 'Periode komisi tidak valid' });
    await connection.beginTransaction();
    const [rules] = await connection.execute(`SELECT * FROM commission_rules WHERE (branch_id = ? OR branch_id IS NULL) AND is_active = TRUE AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)`, [req.user.branch_id, periodEnd, periodStart]);
    let created = 0;
    for (const rule of rules) {
      let staffSql = 'SELECT id, role FROM users WHERE branch_id = ? AND is_active = TRUE';
      const staffParams = [req.user.branch_id];
      if (rule.applies_to === 'role') { staffSql += ' AND role = ?'; staffParams.push(rule.role); }
      if (rule.applies_to === 'user') { staffSql += ' AND id = ?'; staffParams.push(rule.user_id); }
      const [staff] = await connection.execute(staffSql, staffParams);
      for (const user of staff) {
        const [existing] = await connection.execute('SELECT id FROM commission_records WHERE rule_id = ? AND user_id = ? AND period_start = ? AND period_end = ?', [rule.id, user.id, periodStart, periodEnd]);
        if (existing[0]) continue;

        // qty per customer tier
        const [tierRows] = await connection.execute(
          `SELECT COALESCE(c.price_tier, 'reguler') AS tier, COALESCE(SUM(ti.quantity - ti.cancelled_qty),0) AS qty
           FROM transactions t
           JOIN transaction_items ti ON ti.transaction_id=t.id
           LEFT JOIN customers c ON c.id=t.customer_id
           WHERE t.branch_id=? AND t.user_id=? AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at) BETWEEN ? AND ?
           GROUP BY tier`,
          [req.user.branch_id, user.id, periodStart, periodEnd]
        );
        const tierQty = Object.fromEntries(tierRows.map((r) => [r.tier, Number(r.qty)]));
        const qtyReg = tierQty['reguler'] || 0;
        const qtySemi = tierQty['semi_grosir'] || 0;
        const qtyGrosir = tierQty['grosir_seri'] || 0;

        const [transactions] = await connection.execute(
          `SELECT t.id, t.grand_total, COALESCE(SUM((ti.price - ti.cost) * (ti.quantity - ti.cancelled_qty) - ti.discount * (ti.quantity - ti.cancelled_qty) / NULLIF(ti.quantity, 0)), 0) AS profit
           FROM transactions t LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
           WHERE t.branch_id = ? AND t.user_id = ? AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at) BETWEEN ? AND ? GROUP BY t.id`,
          [req.user.branch_id, user.id, periodStart, periodEnd]
        );
        const totalSales = asMoney(transactions.reduce((sum, row) => sum + Number(row.grand_total), 0));
        const totalProfit = asMoney(transactions.reduce((sum, row) => sum + Number(row.profit), 0));
        const qualifies = totalSales >= Number(rule.min_target) && transactions.length >= Number(rule.min_transactions);
        let commission = 0;
        if (qualifies) {
          if (rule.calculation_type === 'percentage_sales') commission = totalSales * Number(rule.percentage) / 100;
          else if (rule.calculation_type === 'percentage_profit') commission = totalProfit * Number(rule.percentage) / 100;
          else if (rule.calculation_type === 'per_transaction') commission = transactions.length * Number(rule.flat_amount);
          else if (rule.calculation_type === 'per_pcs_customer_tier') {
            commission = qtyReg * Number(rule.commission_reguler_per_pcs || 0) + qtySemi * Number(rule.commission_semi_grosir_per_pcs || 0) + qtyGrosir * Number(rule.commission_grosir_seri_per_pcs || 0);
          } else commission = Number(rule.flat_amount);
        }
        const [record] = await connection.execute(
          `INSERT INTO commission_records (branch_id, user_id, rule_id, period_start, period_end, total_sales, total_profit, total_transactions, qty_reguler, qty_semi_grosir, qty_grosir_seri, commission_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.user.branch_id, user.id, rule.id, periodStart, periodEnd, totalSales, totalProfit, transactions.length, qtyReg, qtySemi, qtyGrosir, asMoney(commission)]
        );
        if (transactions.length && commission) {
          const basis = rule.calculation_type === 'percentage_profit' ? totalProfit : totalSales;
          for (const transaction of transactions) {
            const source = rule.calculation_type === 'percentage_profit' ? Number(transaction.profit) : Number(transaction.grand_total);
            const itemCommission = basis > 0 ? asMoney(commission * source / basis) : 0;
            await connection.execute('INSERT INTO commission_items (record_id, transaction_id, sale_amount, profit_amount, commission_amount) VALUES (?, ?, ?, ?, ?)', [record.insertId, transaction.id, transaction.grand_total, transaction.profit, itemCommission]);
          }
        }
        created += 1;
      }
    }
    await connection.commit();
    res.status(201).json({ success: true, data: { created } });
  } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
});

router.delete('/rules/:id', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID tidak valid' });
    const [rows] = await db.execute('SELECT id, branch_id FROM commission_rules WHERE id=?', [id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Aturan tidak ditemukan' });
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM commission_items WHERE record_id IN (SELECT id FROM commission_records WHERE rule_id=?)', [id]);
      await conn.execute('DELETE FROM commission_records WHERE rule_id=?', [id]);
      await conn.execute('DELETE FROM commission_rules WHERE id=?', [id]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.put('/records/:id/status', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const status = req.body.status;
    if (!['approved', 'paid'].includes(status)) return res.status(400).json({ success: false, message: 'Status komisi tidak valid' });
    const [result] = await db.execute(`UPDATE commission_records SET status = ?, approved_by = IF(? = 'approved', ?, approved_by), paid_at = IF(? = 'paid', NOW(), paid_at) WHERE id = ? AND branch_id = ?`, [status, status, req.user.id, status, req.params.id, req.user.branch_id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Catatan komisi tidak ditemukan' });
    res.json({ success: true });
  } catch (error) { next(error); }
});

// Ringkasan komisi user yang sedang login (semua role) — live calc with date range + customer tier breakdown.
router.get('/mine', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const branchId = req.user.branch_id;
    const role = req.user.role;

    const today = new Date();
    const firstOfMonth = localMonthStartString(today);
    const todayStr = localDateString(today);
    const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
    const monthStart = isDate(req.query.start) ? req.query.start : firstOfMonth;
    const monthEnd = isDate(req.query.end) ? req.query.end : todayStr;
    if (monthStart > monthEnd) return res.status(400).json({ success: false, message: 'Rentang tanggal tidak valid' });

    const [rules] = await db.execute(
      `SELECT * FROM commission_rules
       WHERE (branch_id = ? OR branch_id IS NULL OR branch_id = 0)
         AND (is_active = TRUE OR is_active = 1)
         AND (start_date <= ? AND (end_date IS NULL OR end_date >= ?))
         AND (
           applies_to = 'all'
           OR (applies_to = 'role' AND LOWER(role) = LOWER(?))
           OR (applies_to = 'user' AND user_id = ?)
         )`,
      [branchId, monthEnd, monthStart, role, userId]
    );

    let live = { period_start: monthStart, period_end: monthEnd, total_sales: 0, total_transactions: 0, estimated: 0, rules: [], qty_reguler: 0, qty_semi_grosir: 0, qty_grosir_seri: 0 };

    if (rules.length) {
      const [tierRows] = await db.execute(
        `SELECT COALESCE(c.price_tier, 'reguler') AS tier, COALESCE(SUM(ti.quantity - ti.cancelled_qty),0) AS qty, COUNT(DISTINCT t.id) AS cnt, COALESCE(SUM(t.grand_total - t.cancelled_amount),0) AS sales
         FROM transactions t
         JOIN transaction_items ti ON ti.transaction_id=t.id
         LEFT JOIN customers c ON c.id=t.customer_id
         WHERE t.branch_id=? AND t.user_id=? AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at) BETWEEN ? AND ?
         GROUP BY tier`,
        [branchId, userId, monthStart, monthEnd]
      );
      const tierMap = Object.fromEntries(tierRows.map((r) => [r.tier, r]));
      const qtyReg = Number(tierMap['reguler']?.qty || 0);
      const qtySemi = Number(tierMap['semi_grosir']?.qty || 0);
      const qtyGrosir = Number(tierMap['grosir_seri']?.qty || 0);
      const sales = tierRows.reduce((s, r) => s + Number(r.sales || 0), 0);
      const cnt = tierRows.reduce((s, r) => s + Number(r.cnt || 0), 0);
      // distinct transactions
      const [cntRow] = await db.execute('SELECT COUNT(*) AS cnt FROM transactions WHERE branch_id=? AND user_id=? AND status IN ("completed","partially_cancelled") AND DATE(created_at) BETWEEN ? AND ?', [branchId, userId, monthStart, monthEnd]);
      const totalTrx = Number(cntRow[0].cnt);

      let estimated = 0;
      const ruleBreakdown = [];
      for (const rule of rules) {
        if (sales < Number(rule.min_target) || totalTrx < Number(rule.min_transactions)) continue;
        let comm = 0;
        if (rule.calculation_type === 'percentage_sales') comm = sales * Number(rule.percentage) / 100;
        else if (rule.calculation_type === 'per_transaction') comm = totalTrx * Number(rule.flat_amount);
        else if (rule.calculation_type === 'per_pcs_customer_tier') {
          comm = qtyReg * Number(rule.commission_reguler_per_pcs || 0) + qtySemi * Number(rule.commission_semi_grosir_per_pcs || 0) + qtyGrosir * Number(rule.commission_grosir_seri_per_pcs || 0);
        } else if (rule.calculation_type === 'percentage_profit') {
          const [profitRows] = await db.execute(
            `SELECT COALESCE(SUM((ti.price - ti.cost) * (ti.quantity - ti.cancelled_qty) - ti.discount * (ti.quantity - ti.cancelled_qty) / NULLIF(ti.quantity, 0)),0) AS profit
             FROM transactions t JOIN transaction_items ti ON ti.transaction_id=t.id
             WHERE t.branch_id=? AND t.user_id=? AND t.status IN ('completed','partially_cancelled') AND DATE(t.created_at) BETWEEN ? AND ?`,
            [branchId, userId, monthStart, monthEnd]
          );
          comm = Number(profitRows[0]?.profit || 0) * Number(rule.percentage) / 100;
        } else comm = Number(rule.flat_amount);
        comm = asMoney(comm);
        if (comm >= 0) estimated += comm;
        ruleBreakdown.push({
          rule_id: rule.id,
          name: rule.name,
          type: rule.calculation_type,
          percentage: rule.percentage,
          flat_amount: rule.flat_amount,
          commission_reguler_per_pcs: rule.commission_reguler_per_pcs,
          commission_semi_grosir_per_pcs: rule.commission_semi_grosir_per_pcs,
          commission_grosir_seri_per_pcs: rule.commission_grosir_seri_per_pcs,
          commission: comm,
          qty_breakdown: { reguler: qtyReg, semi_grosir: qtySemi, grosir_seri: qtyGrosir },
        });
      }
      live = {
        total_sales: asMoney(sales),
        total_transactions: totalTrx,
        estimated: asMoney(estimated),
        period_start: monthStart,
        period_end: monthEnd,
        rules: ruleBreakdown,
        qty_reguler: qtyReg,
        qty_semi_grosir: qtySemi,
        qty_grosir_seri: qtyGrosir,
      };
    }

    res.json({
      success: true,
      data: {
        live,
        applicable_rules: rules.map((r) => ({
          id: r.id,
          name: r.name,
          applies_to: r.applies_to,
          role: r.role,
          type: r.calculation_type,
          percentage: r.percentage,
          flat_amount: r.flat_amount,
          commission_reguler_per_pcs: r.commission_reguler_per_pcs,
          commission_semi_grosir_per_pcs: r.commission_semi_grosir_per_pcs,
          commission_grosir_seri_per_pcs: r.commission_grosir_seri_per_pcs,
          min_target: r.min_target,
          min_transactions: r.min_transactions,
          start_date: r.start_date,
        })),
      },
    });
  } catch (error) { next(error); }
});

module.exports = router;
