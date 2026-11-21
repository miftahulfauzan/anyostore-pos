const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const term = req.query.search?.trim() || '';
    // POS owner bisa berpindah toko: hormati branch_id pilihan, dengan validasi.
    // Role lain selalu memakai cabang akunnya.
    const requestedBranch = Number(req.query.branch_id);
    let branchId = req.user.branch_id;
    if (req.user.role === 'owner' && Number.isInteger(requestedBranch) && requestedBranch > 0) {
      const [branches] = await db.execute('SELECT id FROM branches WHERE id = ? AND is_active = TRUE', [requestedBranch]);
      if (!branches[0]) return res.status(400).json({ success: false, message: 'Cabang tidak ditemukan atau tidak aktif' });
      branchId = requestedBranch;
    }
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const [rows] = await db.execute(
      `SELECT id, name, phone, email, address, expedition, loyalty_points, membership_tier, price_tier, total_spent
       FROM customers WHERE branch_id = ? AND is_active = TRUE
       AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT ${limit}`,
      [branchId, `%${term}%`, `%${term}%`]
    );
    res.json({ success: true, data: rows, branch_id: branchId });
  } catch (error) { next(error); }
});

const validCustomerTier = new Set(['reguler', 'semi_grosir', 'grosir_seri']);

router.post('/', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  try {
    const { name, phone, email, address, expedition: rawExpedition, birth_date: birthDate, gender, price_tier: priceTier = 'reguler' } = req.body;
    const expedition = String(rawExpedition ?? '').trim().slice(0, 60) || null;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Nama pelanggan wajib diisi' });
    if (gender && !['male', 'female'].includes(gender)) return res.status(400).json({ success: false, message: 'Gender tidak valid' });
    if (!validCustomerTier.has(priceTier)) return res.status(400).json({ success: false, message: 'Tipe harga pelanggan tidak valid' });
    const [result] = await db.execute(
      'INSERT INTO customers (branch_id, name, phone, email, address, expedition, birth_date, gender, price_tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.branch_id, name.trim(), phone?.trim() || null, email?.trim() || null, address?.trim() || null, expedition, birthDate || null, gender || null, priceTier]
    );
    res.status(201).json({ success: true, data: { id: result.insertId, price_tier: priceTier } });
  } catch (error) { next(error); }
});

router.put('/:id', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  try {
    const { name, phone, email, address, expedition: rawExpedition, birth_date: birthDate, gender, price_tier: priceTier = 'reguler' } = req.body;
    const expedition = String(rawExpedition ?? '').trim().slice(0, 60) || null;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Nama pelanggan wajib diisi' });
    if (gender && !['male', 'female'].includes(gender)) return res.status(400).json({ success: false, message: 'Gender tidak valid' });
    if (!validCustomerTier.has(priceTier)) return res.status(400).json({ success: false, message: 'Tipe harga pelanggan tidak valid' });
    const [result] = await db.execute(
      'UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, expedition = ?, birth_date = ?, gender = ?, price_tier = ? WHERE id = ? AND branch_id = ? AND is_active = TRUE',
      [name.trim(), phone?.trim() || null, email?.trim() || null, address?.trim() || null, expedition, birthDate || null, gender || null, priceTier, req.params.id, req.user.branch_id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan' });
    res.json({ success: true, data: { id: req.params.id, price_tier: priceTier } });
  } catch (error) { next(error); }
});

router.delete('/:id', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  try {
    const [result] = await db.execute('UPDATE customers SET is_active = FALSE WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branch_id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan' });
    res.json({ success: true, data: { id: req.params.id } });
  } catch (error) { next(error); }
});

module.exports = router;
