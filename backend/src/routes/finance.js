const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');
const router = express.Router();
router.use(authenticate);
const fail = (s, m) => Object.assign(new Error(m), { status: s });
const money = (v) => Math.round(Number(v) * 100) / 100;

router.get('/expense-categories', async (req, res, next) => {
  try {
    const [r] = await db.execute('SELECT id, name, account_code, type FROM expense_categories WHERE is_active=TRUE ORDER BY type, name');
    res.json({ success: true, data: r });
  } catch (e) { next(e); }
});

router.post('/expense-categories', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    if (!req.body.name?.trim()) throw fail(400, 'Nama kategori wajib diisi');
    const type = req.body.type === 'income' ? 'income' : 'expense';
    const [r] = await db.execute('INSERT INTO expense_categories (name, account_code, type, description) VALUES (?,?,?,?)', [req.body.name.trim(), req.body.account_code?.trim() || null, type, req.body.description?.trim() || null]);
    res.status(201).json({ success: true, data: { id: r.insertId, type } });
  } catch (e) { next(e); }
});

router.get('/expenses', async (req, res, next) => {
  try {
    const type = req.query.type === 'income' ? 'income' : 'expense';
    const [r] = await db.execute(
      `SELECT e.id, e.name, e.amount, e.type, e.payment_method, e.expense_date, e.status, c.name AS category, c.type AS category_type
       FROM expenses e JOIN expense_categories c ON c.id = e.category_id
       WHERE e.branch_id = ? AND e.type = ? ORDER BY e.expense_date DESC LIMIT 100`,
      [req.user.branch_id, type]
    );
    res.json({ success: true, data: r });
  } catch (e) { next(e); }
});

router.post('/expenses', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  try {
    const { category_id: categoryId, name, amount: raw, payment_method: method = 'cash', expense_date: date, notes, type = 'expense' } = req.body;
    const amount = money(raw);
    const entryType = type === 'income' ? 'income' : 'expense';
    if (!Number.isInteger(Number(categoryId)) || !name?.trim() || !Number.isFinite(amount) || amount <= 0 || !['cash', 'transfer', 'debit'].includes(method) || !date) {
      throw fail(400, 'Data pengeluaran/pemasukan tidak valid');
    }
    const [r] = await db.execute(
      'INSERT INTO expenses (branch_id, category_id, name, amount, type, payment_method, expense_date, notes, user_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [req.user.branch_id, categoryId, name.trim(), amount, entryType, method, date, notes?.trim() || null, req.user.id]
    );
    res.status(201).json({ success: true, data: { id: r.insertId, status: 'pending', type: entryType } });
  } catch (e) { next(e); }
});

router.put('/expenses/:id/approve', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const [r] = await c.execute("SELECT e.*, c.account_code, c.type AS category_type FROM expenses e JOIN expense_categories c ON c.id = e.category_id WHERE e.id = ? AND e.branch_id = ? AND e.status = 'pending' FOR UPDATE", [req.params.id, req.user.branch_id]);
    const ex = r[0];
    if (!ex) throw fail(404, 'Pengeluaran/pemasukan pending tidak ditemukan');
    const isIncome = ex.type === 'income';
    const [accounts] = await c.execute('SELECT id, code FROM chart_of_accounts WHERE code IN (?, ?)', [ex.account_code, ex.payment_method === 'cash' ? '1-1000' : '1-1100']);
    if (accounts.length !== 2) throw fail(400, 'Akun COA belum dikonfigurasi');
    const byCode = new Map(accounts.map((a) => [a.code, a.id]));
    const no = `JRN-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const [j] = await c.execute(
      'INSERT INTO journal_entries (branch_id, journal_no, journal_date, reference_type, reference_id, description, total_debit, total_credit, is_posted, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)',
      [req.user.branch_id, no, ex.expense_date, ex.type, ex.id, ex.name, ex.amount, ex.amount, req.user.id]
    );
    // Pengeluaran: debit beban, kredit kas/bank. Pemasukan: debit kas/bank, kredit pendapatan.
    if (isIncome) {
      await c.execute('INSERT INTO journal_entry_items (journal_id, account_id, debit, credit) VALUES (?, ?, ?, 0), (?, ?, 0, ?)', [j.insertId, byCode.get(ex.payment_method === 'cash' ? '1-1000' : '1-1100'), ex.amount, j.insertId, byCode.get(ex.account_code), ex.amount]);
    } else {
      await c.execute('INSERT INTO journal_entry_items (journal_id, account_id, debit, credit) VALUES (?, ?, ?, 0), (?, ?, 0, ?)', [j.insertId, byCode.get(ex.account_code), ex.amount, j.insertId, byCode.get(ex.payment_method === 'cash' ? '1-1000' : '1-1100'), ex.amount]);
    }
    await c.execute("UPDATE expenses SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?", [req.user.id, ex.id]);
    await c.commit();
    res.json({ success: true, data: { id: ex.id, journal_no: no, type: ex.type } });
  } catch (e) {
    await c.rollback();
    next(e);
  } finally {
    c.release();
  }
});

router.post('/journals', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  const c = await db.getConnection();
  try {
    const { journal_date: date, description, items } = req.body;
    if (!date || !Array.isArray(items) || items.length < 2) throw fail(400, 'Jurnal tidak valid');
    const debit = money(items.reduce((s, i) => s + Number(i.debit || 0), 0));
    const credit = money(items.reduce((s, i) => s + Number(i.credit || 0), 0));
    if (debit <= 0 || debit !== credit || items.some((i) => !Number.isInteger(Number(i.account_id)) || Number(i.debit || 0) < 0 || Number(i.credit || 0) < 0)) throw fail(400, 'Debit dan kredit harus seimbang');
    await c.beginTransaction();
    const no = `JRN-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const [j] = await c.execute('INSERT INTO journal_entries (branch_id, journal_no, journal_date, description, total_debit, total_credit, is_posted, created_by) VALUES (?,?,?,?,?,?,TRUE,?)', [req.user.branch_id, no, date, description?.trim() || null, debit, credit, req.user.id]);
    for (const i of items) await c.execute('INSERT INTO journal_entry_items (journal_id, account_id, debit, credit) VALUES (?,?,?,?)', [j.insertId, i.account_id, money(i.debit || 0), money(i.credit || 0)]);
    await c.commit();
    res.status(201).json({ success: true, data: { id: j.insertId, journal_no: no } });
  } catch (e) {
    await c.rollback();
    next(e);
  } finally {
    c.release();
  }
});

router.get('/profit-loss', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const start = req.query.start || new Date().toISOString().slice(0, 8) + '01';
    const end = req.query.end || new Date().toISOString().slice(0, 10);
    const [sales] = await db.execute("SELECT COALESCE(SUM(grand_total),0) AS amount FROM transactions WHERE branch_id = ? AND status = 'completed' AND DATE(created_at) BETWEEN ? AND ?", [req.user.branch_id, start, end]);
    const [expenses] = await db.execute("SELECT COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS amount, COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income FROM expenses WHERE branch_id = ? AND status = 'approved' AND expense_date BETWEEN ? AND ?", [req.user.branch_id, start, end]);
    const revenue = money(Number(sales[0].amount) + Number(expenses[0].income));
    res.json({ success: true, data: { start, end, revenue, expenses: expenses[0].amount, income: expenses[0].income, net_profit: money(revenue - expenses[0].amount) } });
  } catch (e) { next(e); }
});

module.exports = router;
