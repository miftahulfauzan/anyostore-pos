const bcrypt = require('bcryptjs');
const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
const ROLES = ['owner', 'manager', 'admin', 'kasir', 'gudang', 'host'];

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

// ===== Profil sendiri (semua role yang login) =====
// Edit nama & email diri sendiri.
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { name, email, username } = req.body;
    if (!name?.trim() || !email?.trim()) return badRequest(res, 'Nama dan email wajib diisi');
    const hasUsername = username != null && String(username).trim() !== '';
    let trimmedUsername = null;
    if (hasUsername) {
      trimmedUsername = String(username).trim();
      if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(trimmedUsername)) {
        return badRequest(res, 'Username 3-30 karakter (huruf, angka, titik, garis bawah, strip)');
      }
      const [dup] = await db.execute('SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1', [trimmedUsername, req.user.id]);
      if (dup[0]) return badRequest(res, 'Username sudah dipakai pengguna lain');
    }
    if (trimmedUsername != null) {
      await db.execute('UPDATE users SET name = ?, email = ?, username = ? WHERE id = ?',
        [name.trim(), email.trim().toLowerCase(), trimmedUsername, req.user.id]);
    } else {
      await db.execute('UPDATE users SET name = ?, email = ? WHERE id = ?',
        [name.trim(), email.trim().toLowerCase(), req.user.id]);
    }
    res.json({ success: true, data: { username: trimmedUsername } });
  } catch (e) { next(e); }
});

// Ganti password diri sendiri (verifikasi password lama).
router.put('/profile/password', authenticate, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (typeof new_password !== 'string' || new_password.length < 8) return badRequest(res, 'Password baru minimal 8 karakter');
    const [rows] = await db.execute('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    const match = await bcrypt.compare(String(current_password || ''), rows[0].password);
    if (!match) return badRequest(res, 'Password lama salah');
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(new_password, 12), req.user.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ===== Manajemen user (khusus owner) =====
router.get('/branches', authenticate, authorize('owner'), async (_req, res, next) => {
  try {
    const [r] = await db.execute('SELECT id,name,address,is_active FROM branches WHERE is_active=TRUE ORDER BY name');
    res.json({ success: true, data: r });
  } catch (e) { next(e); }
});

router.get('/', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const branchId = req.query.branch_id ? Number(req.query.branch_id) : req.user.branch_id;
    const [r] = await db.execute(
      'SELECT u.id,u.name,u.username,u.email,u.role,u.pin_hash IS NOT NULL AS has_pin,u.is_active,u.last_login,u.created_at,b.name AS branch_name,u.branch_id FROM users u JOIN branches b ON b.id=u.branch_id WHERE u.branch_id=? ORDER BY u.name',
      [branchId]
    );
    res.json({ success: true, data: r });
  } catch (e) { next(e); }
});

router.post('/', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const { name, email, password, role, pin, branch_id: branchInput, username: usernameInput } = req.body;
    const branchId = Number(branchInput || req.user.branch_id);
    if (!name?.trim() || !email?.trim() || typeof password !== 'string' || password.length < 8 || !ROLES.includes(role)) {
      return badRequest(res, 'Data pengguna tidak valid');
    }
    if (pin && !/^\d{6}$/.test(pin)) return badRequest(res, 'PIN harus enam digit');
    const username = String(usernameInput || '').trim().toLowerCase() || String(email).trim().split('@')[0].toLowerCase();
    if (!/^[a-z0-9._-]{3,50}$/.test(username)) return badRequest(res, 'Username 3-50 karakter (huruf/angka/titik/-/_ )');
    const [b] = await db.execute('SELECT id FROM branches WHERE id=? AND is_active=TRUE', [branchId]);
    if (!b[0]) return res.status(404).json({ success: false, message: 'Toko tidak ditemukan' });
    const [dup] = await db.execute('SELECT id FROM users WHERE username=?', [username]);
    if (dup[0]) return badRequest(res, 'Username sudah dipakai');
    const [r] = await db.execute(
      'INSERT INTO users (branch_id,name,username,email,password,role,pin_hash) VALUES (?,?,?,?,?,?,?)',
      [branchId, name.trim(), username, email.trim().toLowerCase(), await bcrypt.hash(password, 12), role, pin ? await bcrypt.hash(pin, 12) : null]
    );
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (e) { next(e); }
});

// Edit user (nama, email, role, PIN opsional).
router.put('/:id', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const { name, email, role, pin, username: usernameInput } = req.body;
    if (!name?.trim() || !email?.trim() || !ROLES.includes(role)) return badRequest(res, 'Data pengguna tidak valid');
    if (pin && !/^\d{6}$/.test(pin)) return badRequest(res, 'PIN harus enam digit');
    const username = String(usernameInput || '').trim().toLowerCase() || String(email).trim().split('@')[0].toLowerCase();
    if (!/^[a-z0-9._-]{3,50}$/.test(username)) return badRequest(res, 'Username 3-50 karakter (huruf/angka/titik/-/_ )');
    const [dup] = await db.execute('SELECT id FROM users WHERE username=? AND id<>?', [username, req.params.id]);
    if (dup[0]) return badRequest(res, 'Username sudah dipakai');
    // Cegah owner mengubah role dirinya sendiri menjadi non-owner (lock-out).
    if (Number(req.params.id) === req.user.id && role !== 'owner') return badRequest(res, 'Tidak dapat mengubah peran akun sendiri');
    const fields = ['name = ?', 'username = ?', 'email = ?', 'role = ?'];
    const values = [name.trim(), username, email.trim().toLowerCase(), role];
    if (pin) { fields.push('pin_hash = ?'); values.push(await bcrypt.hash(pin, 12)); }
    values.push(req.params.id);
    const [r] = await db.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Ganti password user lain (khusus owner, tanpa perlu password lama).
router.put('/:id/password', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const { new_password } = req.body;
    if (typeof new_password !== 'string' || new_password.length < 8) return badRequest(res, 'Password baru minimal 8 karakter');
    const [r] = await db.execute('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(new_password, 12), req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.put('/:id/pin', authenticate, authorize('owner', 'manager', 'admin', 'kasir', 'gudang'), async (req, res, next) => {
  try {
    const pin = req.body.pin;
    const currentPin = req.body.current_pin;
    if (!/^\d{6}$/.test(pin || '')) return badRequest(res, 'PIN harus enam digit');
    const targetId = Number(req.params.id);
    const isSelf = targetId === req.user.id;
    if (!isSelf && req.user.role !== 'owner') return res.status(403).json({ success: false, message: 'Hanya owner yang bisa mengubah PIN pengguna lain' });
    const [rows] = await db.execute('SELECT pin_hash FROM users WHERE id=?', [targetId]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    // Ubah PIN sendiri: verifikasi PIN lama kalau diisi (dan user memang sudah punya PIN).
    if (isSelf && rows[0].pin_hash && currentPin && !(await bcrypt.compare(String(currentPin), rows[0].pin_hash))) {
      return badRequest(res, 'PIN saat ini salah');
    }
    await db.execute('UPDATE users SET pin_hash=? WHERE id=?', [await bcrypt.hash(pin, 12), targetId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.put('/:id/toggle-active', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.user.id) return badRequest(res, 'Tidak dapat menonaktifkan akun sendiri');
    const [r] = await db.execute('UPDATE users SET is_active=NOT is_active WHERE id=?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Hapus user (owner, tidak boleh hapus diri sendiri). Soft-delete karena user punya relasi transaksi.
router.delete('/:id', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.user.id) return badRequest(res, 'Tidak dapat menghapus akun sendiri');
    const [rows] = await db.execute('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    const id = Number(req.params.id);
    // Hapus permanen HANYA kalau belum punya riwayat apa pun (transaksi,
    // mutasi, log, komisi, kas, dll). Kalau punya riwayat, nonaktifkan supaya
    // jejak audit (nama kasir di struk/laporan) tetap terjaga.
    const [trx] = await db.execute(
      `SELECT
        (SELECT COUNT(*) FROM transactions WHERE user_id=?) +
        (SELECT COUNT(*) FROM transaction_items WHERE overridden_by=?) +
        (SELECT COUNT(*) FROM stock_mutations WHERE user_id=?) +
        (SELECT COUNT(*) FROM activity_logs WHERE user_id=?) +
        (SELECT COUNT(*) FROM commission_records WHERE user_id=?) +
        (SELECT COUNT(*) FROM cash_drawers WHERE user_id=?) +
        (SELECT COUNT(*) FROM cash_drawer_movements WHERE user_id=?) +
        (SELECT COUNT(*) FROM pending_transactions WHERE user_id=?) +
        (SELECT COUNT(*) FROM returns WHERE created_by=? OR approved_by=?) +
        (SELECT COUNT(*) FROM expenses WHERE user_id=?) +
        (SELECT COUNT(*) FROM refresh_tokens WHERE user_id=?) +
        (SELECT COUNT(*) FROM purchase_orders WHERE created_by=?) +
        (SELECT COUNT(*) FROM stock_opnames WHERE created_by=?) +
        (SELECT COUNT(*) FROM stock_transfers WHERE created_by=? OR approved_by=?) +
        (SELECT COUNT(*) FROM journal_entries WHERE created_by=?) AS cnt`,
      [id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id]
    );
    if (Number(trx[0].cnt) > 0) {
      await db.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [id]);
      return res.json({ success: true, data: { soft: true, message: 'Pengguna memiliki riwayat transaksi/aktivitas — dinonaktifkan agar data tetap terjaga.' } });
    }
    await db.execute('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true, data: { soft: false, message: 'Pengguna dihapus permanen.' } });
  } catch (e) {
    if (e?.code === 'ER_ROW_IS_REFERENCED_2') {
      await db.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [req.params.id]).catch(() => {});
      return res.json({ success: true, data: { soft: true, message: 'Pengguna memiliki riwayat — dinonaktifkan agar data tetap terjaga.' } });
    }
    next(e);
  }
});

module.exports = router;
