const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');
const router = express.Router();
router.use(authenticate);
const fail = (status, message) => Object.assign(new Error(message), { status });
const amount = (value) => Math.round(Number(value) * 100) / 100;

async function openDrawer(connection, user) {
  const [rows] = await connection.execute('SELECT * FROM cash_drawers WHERE branch_id = ? AND user_id = ? AND status = \'open\' FOR UPDATE', [user.branch_id, user.id]);
  return rows[0];
}

async function expectedCash(connection, drawer) {
  const [sales] = await connection.execute(
    `SELECT COALESCE(SUM(tp.amount), 0) AS amount FROM transaction_payments tp
     JOIN transactions t ON t.id = tp.transaction_id
     WHERE t.branch_id = ? AND t.status = 'completed' AND tp.payment_method = 'cash' AND t.created_at >= ?`,
    [drawer.branch_id, drawer.opened_at]
  );
  const [moves] = await connection.execute(
    `SELECT COALESCE(SUM(CASE WHEN type = 'cash_in' THEN amount ELSE -amount END), 0) AS amount
     FROM cash_drawer_movements WHERE cash_drawer_id = ?`, [drawer.id]
  );
  return amount(Number(drawer.opening_amount) + Number(sales[0].amount) + Number(moves[0].amount));
}

router.post('/open', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const opening = amount(req.body.opening_amount);
    if (!Number.isFinite(opening) || opening < 0) throw fail(400, 'Modal awal tidak valid');
    await connection.beginTransaction();
    if (await openDrawer(connection, req.user)) throw fail(409, 'Laci kas masih terbuka');
    const [result] = await connection.execute('INSERT INTO cash_drawers (branch_id, user_id, opening_amount) VALUES (?, ?, ?)', [req.user.branch_id, req.user.id, opening]);
    await connection.commit(); res.status(201).json({ success: true, data: { id: result.insertId, opening_amount: opening } });
  } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
});

router.post('/:type(cash-in|cash-out)', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const value = amount(req.body.amount); const reason = req.body.reason?.trim();
    if (!Number.isFinite(value) || value <= 0 || !reason) throw fail(400, 'Nominal dan alasan wajib diisi');
    await connection.beginTransaction(); const drawer = await openDrawer(connection, req.user);
    if (!drawer) throw fail(404, 'Tidak ada laci kas terbuka');
    await connection.execute('INSERT INTO cash_drawer_movements (cash_drawer_id, user_id, type, amount, reason) VALUES (?, ?, ?, ?, ?)', [drawer.id, req.user.id, req.params.type.replace('-', '_'), value, reason]);
    await connection.commit(); res.status(201).json({ success: true, data: { drawer_id: drawer.id, amount: value } });
  } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
});

router.get('/summary', async (req, res, next) => {
  const connection = await db.getConnection();
  try { const drawer = await openDrawer(connection, req.user); if (!drawer) throw fail(404, 'Tidak ada laci kas terbuka'); res.json({ success: true, data: { ...drawer, expected_cash: await expectedCash(connection, drawer) } }); }
  catch (error) { next(error); } finally { connection.release(); }
});

router.put('/close', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const actual = amount(req.body.actual_cash); if (!Number.isFinite(actual) || actual < 0) throw fail(400, 'Kas aktual tidak valid');
    await connection.beginTransaction(); const drawer = await openDrawer(connection, req.user); if (!drawer) throw fail(404, 'Tidak ada laci kas terbuka');
    const expected = await expectedCash(connection, drawer); const difference = amount(actual - expected);
    if (difference !== 0 && !req.body.notes?.trim()) throw fail(400, 'Alasan selisih kas wajib diisi');
    await connection.execute('UPDATE cash_drawers SET closed_at = NOW(), closing_amount = ?, expected_cash = ?, actual_cash = ?, difference = ?, notes = ?, status = \'closed\' WHERE id = ?', [actual, expected, actual, difference, req.body.notes?.trim() || null, drawer.id]);
    const [payments] = await connection.execute(
      `SELECT tp.payment_method, COUNT(*) AS transactions, COALESCE(SUM(tp.amount), 0) AS amount
       FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id
       WHERE t.branch_id = ? AND t.status = 'completed' AND tp.payment_method = 'cash' AND t.created_at >= ? AND t.created_at <= NOW()
       GROUP BY tp.payment_method`,
      [drawer.branch_id, drawer.opened_at]
    );
    const [movements] = await connection.execute(
      `SELECT type, amount, reason, created_at FROM cash_drawer_movements WHERE cash_drawer_id = ? ORDER BY created_at`,
      [drawer.id]
    );
    await connection.commit();
    res.json({ success: true, data: { id: drawer.id, opening_amount: drawer.opening_amount, expected_cash: expected, actual_cash: actual, difference, closed_at: new Date(), payments, movements } });
  } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
});

router.get('/closing/:id', async (req, res, next) => {
  try {
    const [drawers] = await db.execute(
      `SELECT cd.*, u.name AS cashier, b.name AS branch_name
       FROM cash_drawers cd
       JOIN users u ON u.id = cd.user_id
       JOIN branches b ON b.id = cd.branch_id
       WHERE cd.id = ? AND cd.branch_id = ?`,
      [req.params.id, req.user.branch_id]
    );
    if (!drawers[0]) throw fail(404, 'Penutupan tidak ditemukan');
    const drawer = drawers[0];
    const [payments] = await db.execute(
      `SELECT tp.payment_method, COUNT(*) AS transactions, COALESCE(SUM(tp.amount), 0) AS amount
       FROM transaction_payments tp JOIN transactions t ON t.id = tp.transaction_id
       WHERE t.branch_id = ? AND t.status = 'completed' AND tp.payment_method = 'cash' AND t.created_at >= ? AND t.created_at <= ?
       GROUP BY tp.payment_method`,
      [drawer.branch_id, drawer.opened_at, drawer.closed_at || new Date()]
    );
    const [movements] = await db.execute(
      `SELECT cdm.type, cdm.amount, cdm.reason, cdm.created_at, u.name AS user_name
       FROM cash_drawer_movements cdm
       LEFT JOIN users u ON u.id = cdm.user_id
       WHERE cdm.cash_drawer_id = ? ORDER BY cdm.created_at`,
      [drawer.id]
    );
    res.json({ success: true, data: { ...drawer, payments, movements } });
  } catch (error) { next(error); }
});
module.exports = router;
