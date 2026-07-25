const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
const allowedTypes = new Set(['percentage_sales', 'percentage_profit', 'per_transaction', 'flat_monthly']);
const allowedTargets = new Set(['all', 'role', 'user']);
const allowedRoles = new Set(['owner', 'manager', 'admin', 'kasir', 'gudang']);
const asMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

router.get('/staff', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT id, name, role FROM users WHERE branch_id = ? AND is_active = TRUE ORDER BY name', [req.user.branch_id]);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

router.get('/', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const [rules, records] = await Promise.all([
      db.execute(`SELECT cr.*, u.name AS staff_name FROM commission_rules cr LEFT JOIN users u ON u.id = cr.user_id WHERE (cr.branch_id = ? OR cr.branch_id IS NULL) ORDER BY cr.is_active DESC, cr.created_at DESC`, [req.user.branch_id]),
      db.execute(`SELECT r.*, u.name AS staff_name, cr.name AS rule_name FROM commission_records r JOIN users u ON u.id = r.user_id LEFT JOIN commission_rules cr ON cr.id = r.rule_id WHERE r.branch_id = ? ORDER BY r.created_at DESC LIMIT 50`, [req.user.branch_id])
    ]);
    res.json({ success: true, data: { rules: rules[0], records: records[0] } });
  } catch (error) { next(error); }
});

router.post('/rules', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const { name, description, applies_to: appliesTo = 'all', role = null, user_id: userId = null, calculation_type: calculationType, percentage = 0, flat_amount: flatAmount = 0, min_target: minTarget = 0, min_transactions: minTransactions = 0, start_date: startDate, end_date: endDate = null } = req.body;
    if (!name?.trim() || !allowedTargets.has(appliesTo) || !allowedTypes.has(calculationType) || !startDate || Number(percentage) < 0 || Number(flatAmount) < 0 || Number(minTarget) < 0 || Number(minTransactions) < 0) return res.status(400).json({ success: false, message: 'Data aturan komisi tidak valid' });
    if (appliesTo === 'role' && !allowedRoles.has(role)) return res.status(400).json({ success: false, message: 'Pilih peran staf yang valid' });
    if (appliesTo === 'user' && !Number.isInteger(Number(userId))) return res.status(400).json({ success: false, message: 'Pilih staf untuk aturan ini' });
    if (appliesTo === 'user') { const [staff] = await db.execute('SELECT id FROM users WHERE id = ? AND branch_id = ?', [userId, req.user.branch_id]); if (!staff[0]) return res.status(400).json({ success: false, message: 'Staf tidak ditemukan' }); }
    const [result] = await db.execute(
      `INSERT INTO commission_rules (branch_id, name, description, applies_to, role, user_id, calculation_type, percentage, flat_amount, min_target, min_transactions, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.branch_id, name.trim(), description?.trim() || null, appliesTo, appliesTo === 'role' ? role : null, appliesTo === 'user' ? Number(userId) : null, calculationType, asMoney(percentage), asMoney(flatAmount), asMoney(minTarget), Number(minTransactions), startDate, endDate || null]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { next(error); }
});

router.post('/generate', authenticate, authorize('owner'), async (req, res, next) => {
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
        const [transactions] = await connection.execute(`SELECT t.id, t.grand_total, COALESCE(SUM((ti.price - ti.cost) * ti.quantity - ti.discount), 0) AS profit FROM transactions t LEFT JOIN transaction_items ti ON ti.transaction_id = t.id WHERE t.branch_id = ? AND t.user_id = ? AND t.status = 'completed' AND DATE(t.created_at) BETWEEN ? AND ? GROUP BY t.id`, [req.user.branch_id, user.id, periodStart, periodEnd]);
        const totalSales = asMoney(transactions.reduce((sum, row) => sum + Number(row.grand_total), 0));
        const totalProfit = asMoney(transactions.reduce((sum, row) => sum + Number(row.profit), 0));
        const qualifies = totalSales >= Number(rule.min_target) && transactions.length >= Number(rule.min_transactions);
        let commission = 0;
        if (qualifies) {
          if (rule.calculation_type === 'percentage_sales') commission = totalSales * Number(rule.percentage) / 100;
          else if (rule.calculation_type === 'percentage_profit') commission = totalProfit * Number(rule.percentage) / 100;
          else if (rule.calculation_type === 'per_transaction') commission = transactions.length * Number(rule.flat_amount);
          else commission = Number(rule.flat_amount);
        }
        const [record] = await connection.execute(`INSERT INTO commission_records (branch_id, user_id, rule_id, period_start, period_end, total_sales, total_profit, total_transactions, commission_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [req.user.branch_id, user.id, rule.id, periodStart, periodEnd, totalSales, totalProfit, transactions.length, asMoney(commission)]);
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

router.put('/records/:id/status', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const status = req.body.status;
    if (!['approved', 'paid'].includes(status)) return res.status(400).json({ success: false, message: 'Status komisi tidak valid' });
    const [result] = await db.execute(`UPDATE commission_records SET status = ?, approved_by = IF(? = 'approved', ?, approved_by), paid_at = IF(? = 'paid', NOW(), paid_at) WHERE id = ? AND branch_id = ?`, [status, status, req.user.id, status, req.params.id, req.user.branch_id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Catatan komisi tidak ditemukan' });
    res.json({ success: true });
  } catch (error) { next(error); }
});

// Ringkasan komisi user yang sedang login (semua role) — live calc + stored records.
router.get('/mine', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const branchId = req.user.branch_id;
    const role = req.user.role;

    // Active rules that apply to this user — tolerant to branch cross + string status
    const [rules] = await db.execute(
      `SELECT * FROM commission_rules
       WHERE (branch_id = ? OR branch_id IS NULL OR branch_id = 0)
         AND (is_active = TRUE OR is_active = 1)
         AND (
           applies_to = 'all'
           OR (applies_to = 'role' AND LOWER(role) = LOWER(?))
           OR (applies_to = 'user' AND user_id = ?)
         )`,
      [branchId, role, userId]
    );

    // Current month live totals (so commission shows even before Generate)
    const firstDay = new Date();
    firstDay.setDate(1);
    const monthStart = firstDay.toISOString().slice(0, 10);
    const monthEnd = new Date().toISOString().slice(0, 10);

    let live = { total_sales: 0, total_transactions: 0, estimated: 0, rules: [] };
    if (rules.length) {
      const [txRows] = await db.execute(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(grand_total),0) AS sales
         FROM transactions WHERE branch_id=? AND user_id=? AND status='completed'
           AND DATE(created_at) BETWEEN ? AND ?`,
        [branchId, userId, monthStart, monthEnd]
      );
      const cnt = Number(txRows[0]?.cnt || 0);
      const sales = Number(txRows[0]?.sales || 0);
      let estimated = 0;
      const ruleBreakdown = [];
      for (const rule of rules) {
        if (sales < Number(rule.min_target) || cnt < Number(rule.min_transactions)) continue;
        let comm = 0;
        if (rule.calculation_type === 'percentage_sales') comm = sales * Number(rule.percentage) / 100;
        else if (rule.calculation_type === 'per_transaction') comm = cnt * Number(rule.flat_amount);
        else comm = Number(rule.flat_amount);
        // for profit we need join; simplify to 0 if no profit data for live
        if (rule.calculation_type === 'percentage_profit') {
          const [profitRows] = await db.execute(
            `SELECT COALESCE(SUM((ti.price - ti.cost) * ti.quantity - ti.discount),0) AS profit
             FROM transactions t JOIN transaction_items ti ON ti.transaction_id=t.id
             WHERE t.branch_id=? AND t.user_id=? AND t.status='completed' AND DATE(t.created_at) BETWEEN ? AND ?`,
            [branchId, userId, monthStart, monthEnd]
          );
          comm = Number(profitRows[0]?.profit || 0) * Number(rule.percentage) / 100;
        }
        estimated += comm;
        ruleBreakdown.push({ rule_id: rule.id, name: rule.name, type: rule.calculation_type, commission: asMoney(comm) });
      }
      live = { total_sales: asMoney(sales), total_transactions: cnt, estimated: asMoney(estimated), period_start: monthStart, period_end: monthEnd, rules: ruleBreakdown };
    }

    const [summary] = await db.execute(
      `SELECT COALESCE(SUM(commission_amount), 0) AS total,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) AS pending,
              COALESCE(SUM(CASE WHEN status = 'approved' THEN commission_amount ELSE 0 END), 0) AS approved,
              COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END), 0) AS paid,
              COUNT(*) AS records
       FROM commission_records WHERE user_id = ? AND branch_id = ?`,
      [userId, branchId]
    );
    const [records] = await db.execute(
      `SELECT cr.id, cr.period_start, cr.period_end, cr.total_sales, cr.total_transactions, cr.commission_amount, cr.status, cr.created_at, r.name AS rule_name
       FROM commission_records cr
       LEFT JOIN commission_rules r ON r.id = cr.rule_id
       WHERE cr.user_id = ? AND cr.branch_id = ?
       ORDER BY cr.created_at DESC LIMIT 20`,
      [userId, branchId]
    );
    res.json({ success: true, data: { summary: summary[0], records: records[0], live, applicable_rules: rules.map((r) => ({ id: r.id, name: r.name, applies_to: r.applies_to, role: r.role, type: r.calculation_type, percentage: r.percentage, flat_amount: r.flat_amount, min_target: r.min_target, min_transactions: r.min_transactions, start_date: r.start_date })) } });
  } catch (error) { next(error); }
});

module.exports = router;
