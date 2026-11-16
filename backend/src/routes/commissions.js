const express = require('express');
const db = require('../db');
const { SALES_STATUSES_SQL } = require('../sales-status');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
const allowedTypes = new Set(['percentage_sales', 'percentage_profit', 'per_transaction', 'flat_monthly', 'per_pcs_customer_tier']);
const allowedTargets = new Set(['all', 'role', 'user']);
const allowedRoles = new Set(['owner', 'manager', 'admin', 'kasir', 'gudang']);
const asMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const customerTiers = new Set(['reguler', 'semi_grosir', 'grosir_seri']);

const allowedScopes = new Set(['self', 'team', 'branch', 'company']);
const ruleScope = (rule) => (allowedScopes.has(String(rule?.scope)) ? String(rule.scope) : 'self');

// Semi grosir sudah tidak dipakai: pcs pelanggan semi dihitung sebagai grosir
// seri agar transaksi lama tetap punya nilai komisi.
const TIER_EXPR = "CASE WHEN c.price_tier = 'semi_grosir' THEN 'grosir_seri' ELSE COALESCE(c.price_tier,'reguler') END";

function scopeWhere({ scope, branchId, userId }) {
  const where = [`t.status IN (${SALES_STATUSES_SQL})`, 't.transaction_date BETWEEN ? AND ?'];
  const params = [];
  if (scope !== 'company') { where.push('t.branch_id = ?'); }
  if (scope === 'self') where.push('t.user_id = ?');
  if (scope === 'team') where.push('t.user_id <> ?');
  return { where: where.join(' AND '), params };
}

function scopeParams({ scope, branchId, userId, start, end }) {
  const params = [start, end];
  if (scope !== 'company') params.push(branchId);
  if (scope === 'self' || scope === 'team') params.push(userId);
  return params;
}

async function tierAggregate(executor, opts) {
  const { start, end } = opts;
  const { scope, branchId, userId } = opts;
  const filter = scopeWhere(opts);
  const params = scopeParams({ scope, branchId, userId, start, end });
  const [rows] = await executor.execute(
    `SELECT ${TIER_EXPR} AS tier,
            COALESCE(SUM(ti.quantity - ti.cancelled_qty - ti.returned_qty),0) AS qty,
            COALESCE(SUM(t.grand_total - t.cancelled_amount - t.refunded_amount),0) AS sales
       FROM transactions t
       JOIN transaction_items ti ON ti.transaction_id = t.id
       LEFT JOIN customers c ON c.id = t.customer_id
      WHERE ${filter.where}
      GROUP BY tier`,
    params,
  );
  const [cntRows] = await executor.execute(
    `SELECT COUNT(DISTINCT t.id) AS cnt FROM transactions t WHERE ${filter.where}`,
    params,
  );
  const map = Object.fromEntries(rows.map((r) => [r.tier, r]));
  return {
    qty_reguler: Number(map.reguler?.qty || 0),
    qty_grosir: Number(map.grosir_seri?.qty || 0),
    sales: asMoney(rows.reduce((s, r) => s + Number(r.sales || 0), 0)),
    trx: Number(cntRows[0]?.cnt || 0),
  };
}

async function profitAggregate(executor, opts) {
  const filter = scopeWhere(opts);
  const params = scopeParams(opts);
  const [rows] = await executor.execute(
    `SELECT COALESCE(SUM((ti.price - ti.cost) * (ti.quantity - ti.cancelled_qty - ti.returned_qty)
        - ti.discount * (ti.quantity - ti.cancelled_qty - ti.returned_qty) / NULLIF(ti.quantity, 0)), 0) AS profit
       FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.id
      WHERE ${filter.where}`,
    params,
  );
  return asMoney(Number(rows[0]?.profit || 0));
}

async function scopeTransactions(executor, opts) {
  const filter = scopeWhere(opts);
  const params = scopeParams(opts);
  const [rows] = await executor.execute(
    `SELECT t.id, t.grand_total, t.cancelled_amount, t.refunded_amount,
            COALESCE(SUM((ti.price - ti.cost) * (ti.quantity - ti.cancelled_qty - ti.returned_qty)
              - ti.discount * (ti.quantity - ti.cancelled_qty - ti.returned_qty) / NULLIF(ti.quantity, 0)), 0) AS profit
       FROM transactions t LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
      WHERE ${filter.where}
      GROUP BY t.id`,
    params,
  );
  return rows;
}

/** Hitung komisi satu aturan dari agregat cakupannya. */
function ruleCommission(rule, agg, profit) {
  const type = rule.calculation_type;
  if (type === 'per_pcs_customer_tier') {
    return asMoney(agg.qty_reguler * Number(rule.commission_reguler_per_pcs || 0)
      + agg.qty_grosir * Number(rule.commission_grosir_seri_per_pcs || 0));
  }
  if (type === 'percentage_sales') return asMoney(agg.sales * Number(rule.percentage) / 100);
  if (type === 'percentage_profit') return asMoney(Number(profit || 0) * Number(rule.percentage) / 100);
  if (type === 'per_transaction') return asMoney(agg.trx * Number(rule.flat_amount));
  return asMoney(Number(rule.flat_amount));
}

function qualifies(rule, agg) {
  return agg.sales >= Number(rule.min_target) && agg.trx >= Number(rule.min_transactions);
}

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
    // Arsip boleh disaring per periode supaya tabel ikut berubah saat tanggal diganti.
    const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
    const start = isDate(req.query.start) ? req.query.start : null;
    const end = isDate(req.query.end) ? req.query.end : null;
    const recordWhere = ['r.branch_id = ?'];
    const recordParams = [branchId];
    if (start && end) {
      recordWhere.push('r.period_start <= ? AND r.period_end >= ?');
      recordParams.push(end, start);
    }
    const [branches] = await db.execute('SELECT id, name FROM branches WHERE is_active=TRUE ORDER BY id');
    const [rules, records] = await Promise.all([
      db.execute(`SELECT cr.*, u.name AS staff_name FROM commission_rules cr LEFT JOIN users u ON u.id = cr.user_id WHERE (cr.branch_id = ? OR cr.branch_id IS NULL) ORDER BY cr.is_active DESC, cr.created_at DESC`, [branchId]),
      db.execute(`SELECT r.*, u.name AS staff_name, u.role, cr.name AS rule_name FROM commission_records r JOIN users u ON u.id = r.user_id LEFT JOIN commission_rules cr ON cr.id = r.rule_id WHERE ${recordWhere.join(' AND ')} ORDER BY r.created_at DESC LIMIT 100`, recordParams)
    ]);
    res.json({ success: true, data: { branches, branch_id: branchId, period_start: start, period_end: end, rules: rules[0], records: records[0] } });
  } catch (error) { next(error); }
});

async function computeBranchReport(branchId, start, end) {
  const [rules] = await db.execute(`SELECT * FROM commission_rules WHERE (branch_id = ? OR branch_id IS NULL) AND (is_active=TRUE OR is_active=1) AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)`, [branchId, end, start]);
  const [users] = await db.execute('SELECT id, name, role FROM users WHERE branch_id=? AND is_active=TRUE ORDER BY role, name', [branchId]);
  const perAccount = [];
  for (const u of users) {
    const applicable = rules.filter((r) => r.applies_to === 'all' || (r.applies_to === 'role' && String(r.role).toLowerCase() === String(u.role).toLowerCase()) || (r.applies_to === 'user' && Number(r.user_id) === Number(u.id)));
    if (!applicable.length) continue;
    // Cakupan dihitung sekali per (scope) untuk user ini.
    const cache = new Map();
    const aggregate = async (scope) => {
      if (!cache.has(scope)) {
        cache.set(scope, await tierAggregate(db, { scope, branchId, userId: u.id, start, end }));
      }
      return cache.get(scope);
    };
    const own = await aggregate('self');
    let totalCommission = 0;
    const breakdown = [];
    for (const r of applicable) {
      const scope = ruleScope(r);
      const agg = await aggregate(scope);
      if (!qualifies(r, agg)) continue;
      const profit = r.calculation_type === 'percentage_profit'
        ? await profitAggregate(db, { scope, branchId, userId: u.id, start, end })
        : 0;
      const comm = ruleCommission(r, agg, profit);
      if (comm > 0) {
        totalCommission += comm;
        breakdown.push({ rule_id: r.id, name: r.name, type: r.calculation_type, scope, commission: comm });
      }
    }
    if (totalCommission > 0 || own.trx > 0) {
      perAccount.push({
        user_id: u.id,
        name: u.name,
        role: u.role,
        qty_reguler: own.qty_reguler,
        qty_semi: 0,
        qty_grosir: own.qty_grosir,
        total_qty: own.qty_reguler + own.qty_grosir,
        total_sales: own.sales,
        total_transactions: own.trx,
        commission: asMoney(totalCommission),
        breakdown,
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
      scope: scopeInput = 'self',
      commission_reguler_per_pcs: regulerPcs = 0,
      commission_grosir_seri_per_pcs: grosirPcs = 0,
    } = req.body;
    const targetBranchId = branchInput != null && branchInput !== '' ? Number(branchInput) : null;
    if (targetBranchId != null && !Number.isInteger(targetBranchId)) return res.status(400).json({ success: false, message: 'Toko tidak valid' });
    if (!allowedScopes.has(String(scopeInput))) return res.status(400).json({ success: false, message: 'Dasar perhitungan komisi tidak valid' });
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
      if (Number(regulerPcs) < 0 || Number(grosirPcs) < 0) return res.status(400).json({ success: false, message: 'Komisi per pcs tidak boleh negatif' });
    }
    const [result] = await db.execute(
      `INSERT INTO commission_rules (branch_id, name, description, applies_to, role, user_id, calculation_type, percentage, flat_amount, scope, commission_reguler_per_pcs, commission_grosir_seri_per_pcs, min_target, min_transactions, start_date, end_date)
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
        String(scopeInput),
        asMoney(regulerPcs),
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
    const { period_start: periodStart, period_end: periodEnd, branch_id: branchInput } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart || '') || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd || '') || periodStart > periodEnd) return res.status(400).json({ success: false, message: 'Periode komisi tidak valid' });
    // Owner boleh memilih cabang; role lain selalu cabang akunnya.
    const requestedBranch = Number(branchInput);
    const branchId = req.user.role === 'owner' && Number.isInteger(requestedBranch) && requestedBranch > 0
      ? requestedBranch
      : req.user.branch_id;
    await connection.beginTransaction();
    const [rules] = await connection.execute(`SELECT * FROM commission_rules WHERE (branch_id = ? OR branch_id IS NULL) AND is_active = TRUE AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)`, [branchId, periodEnd, periodStart]);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const rule of rules) {
      let staffSql = 'SELECT id, role FROM users WHERE branch_id = ? AND is_active = TRUE';
      const staffParams = [branchId];
      if (rule.applies_to === 'role') { staffSql += ' AND role = ?'; staffParams.push(rule.role); }
      if (rule.applies_to === 'user') { staffSql += ' AND id = ?'; staffParams.push(rule.user_id); }
      const [staff] = await connection.execute(staffSql, staffParams);
      for (const user of staff) {
        const scope = ruleScope(rule);
        const opts = { scope, branchId, userId: user.id, start: periodStart, end: periodEnd };
        const agg = await tierAggregate(connection, opts);
        if (!qualifies(rule, agg)) continue;
        const profit = rule.calculation_type === 'percentage_profit' ? await profitAggregate(connection, opts) : 0;
        const commission = ruleCommission(rule, agg, profit);
        const [existing] = await connection.execute('SELECT id, status FROM commission_records WHERE rule_id = ? AND user_id = ? AND period_start = ? AND period_end = ?', [rule.id, user.id, periodStart, periodEnd]);
        let recordId;
        if (existing[0]) {
          // Arsip yang sudah disetujui/dibayar tidak boleh berubah diam-diam.
          if (existing[0].status !== 'pending') {
            skipped += 1;
            continue;
          }
          recordId = existing[0].id;
          await connection.execute(
            `UPDATE commission_records
                SET total_sales = ?, total_profit = ?, total_transactions = ?, qty_reguler = ?, qty_semi_grosir = 0, qty_grosir_seri = ?, commission_amount = ?
              WHERE id = ?`,
            [agg.sales, profit, agg.trx, agg.qty_reguler, agg.qty_grosir, commission, recordId],
          );
          await connection.execute('DELETE FROM commission_items WHERE record_id = ?', [recordId]);
          updated += 1;
        } else {
          const [record] = await connection.execute(
            `INSERT INTO commission_records (branch_id, user_id, rule_id, period_start, period_end, total_sales, total_profit, total_transactions, qty_reguler, qty_semi_grosir, qty_grosir_seri, commission_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [branchId, user.id, rule.id, periodStart, periodEnd, agg.sales, profit, agg.trx, agg.qty_reguler, 0, agg.qty_grosir, commission],
          );
          recordId = record.insertId;
          created += 1;
        }
        if (commission) {
          const rows = await scopeTransactions(connection, opts);
          const basis = rule.calculation_type === 'percentage_profit' ? Number(profit) : agg.sales;
          for (const trx of rows) {
            const source = rule.calculation_type === 'percentage_profit'
              ? Number(trx.profit)
              : (Number(trx.grand_total) - Number(trx.cancelled_amount || 0) - Number(trx.refunded_amount || 0));
            const itemCommission = basis > 0 ? asMoney(commission * source / basis) : 0;
            await connection.execute('INSERT INTO commission_items (record_id, transaction_id, sale_amount, profit_amount, commission_amount) VALUES (?, ?, ?, ?, ?)', [recordId, trx.id, trx.grand_total, trx.profit, itemCommission]);
          }
        }
      }
    }
    await connection.commit();
    res.status(201).json({ success: true, data: { created, updated, skipped, branch_id: branchId } });
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

    const own = await tierAggregate(db, { scope: 'self', branchId, userId, start: monthStart, end: monthEnd });
    let estimated = 0;
    const ruleBreakdown = [];
    for (const rule of rules) {
      const scope = ruleScope(rule);
      const opts = { scope, branchId, userId, start: monthStart, end: monthEnd };
      const agg = await tierAggregate(db, opts);
      if (!qualifies(rule, agg)) continue;
      const profit = rule.calculation_type === 'percentage_profit' ? await profitAggregate(db, opts) : 0;
      const comm = ruleCommission(rule, agg, profit);
      if (comm >= 0) estimated += comm;
      ruleBreakdown.push({
        rule_id: rule.id,
        name: rule.name,
        type: rule.calculation_type,
        scope,
        percentage: rule.percentage,
        flat_amount: rule.flat_amount,
        commission_reguler_per_pcs: rule.commission_reguler_per_pcs,
        commission_grosir_seri_per_pcs: rule.commission_grosir_seri_per_pcs,
        commission: comm,
        qty_breakdown: { reguler: agg.qty_reguler, grosir_seri: agg.qty_grosir },
      });
    }

    res.json({
      success: true,
      data: {
        live: {
          total_sales: own.sales,
          total_transactions: own.trx,
          estimated: asMoney(estimated),
          period_start: monthStart,
          period_end: monthEnd,
          rules: ruleBreakdown,
          qty_reguler: own.qty_reguler,
          qty_semi_grosir: 0,
          qty_grosir_seri: own.qty_grosir,
        },
        applicable_rules: rules.map((r) => ({
          id: r.id,
          name: r.name,
          applies_to: r.applies_to,
          role: r.role,
          scope: ruleScope(r),
          type: r.calculation_type,
          percentage: r.percentage,
          flat_amount: r.flat_amount,
          commission_reguler_per_pcs: r.commission_reguler_per_pcs,
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
