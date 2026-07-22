const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const term = req.query.search?.trim() || '';
    const [rows] = await db.execute(
      `SELECT id, name, phone, email, loyalty_points, membership_tier, total_spent
       FROM customers WHERE branch_id = ? AND is_active = TRUE
       AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 100`,
      [req.user.branch_id, `%${term}%`, `%${term}%`]
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

router.post('/', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  try {
    const { name, phone, email, address, birth_date: birthDate, gender } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Nama pelanggan wajib diisi' });
    if (gender && !['male', 'female'].includes(gender)) return res.status(400).json({ success: false, message: 'Gender tidak valid' });
    const [result] = await db.execute(
      'INSERT INTO customers (branch_id, name, phone, email, address, birth_date, gender) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.branch_id, name.trim(), phone?.trim() || null, email?.trim() || null, address?.trim() || null, birthDate || null, gender || null]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { next(error); }
});

module.exports = router;
