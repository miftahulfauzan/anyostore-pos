const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
router.use(authenticate);

// GET /api/activity-logs — riwayat aktivitas (owner: semua cabang; manager/admin: cabang sendiri)
router.get('/', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const action = (req.query.action || '').trim();
    let where = 'WHERE 1 = 1';
    const params = [];
    if (req.user.role !== 'owner') {
      where += ' AND u.branch_id = ?';
      params.push(req.user.branch_id);
    }
    if (action) {
      where += ' AND al.action LIKE ?';
      params.push(action + '%');
    }
    if (search) {
      where += ' AND (al.description LIKE ? OR al.action LIKE ? OR u.name LIKE ?)';
      const s = '%' + search + '%';
      params.push(s, s, s);
    }
    const [rows] = await db.execute(
      'SELECT al.id, al.action, al.description, al.ip_address, al.created_at, u.name AS user_name, u.role AS user_role, b.name AS branch_name ' +
      'FROM activity_logs al JOIN users u ON u.id = al.user_id JOIN branches b ON b.id = u.branch_id ' +
      where + ' ORDER BY al.created_at DESC, al.id DESC LIMIT 200',
      params
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

module.exports = router;
