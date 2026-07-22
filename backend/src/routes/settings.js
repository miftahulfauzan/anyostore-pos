const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');
const { createMediaUpload, decodeDataUpload, discardUploadedFile, persistUploadedFile, removeMedia } = require('../media-storage');

const router = express.Router();
router.use(authenticate);
const allowed = new Set(['store_name','store_address','store_phone','store_email','store_tax_id','receipt_header','receipt_footer','receipt_note','printer_size','auto_print','theme','currency','tax_rate','prices_include_tax','loyalty_enabled','loyalty_points_rate','loyalty_points_value','show_logo','show_qr','show_cashier','show_barcode','low_stock_alert','low_stock_email','order_prefix','invoice_prefix','timezone']);
const profileKeys = new Set(['store_name', 'store_address', 'store_phone', 'store_email', 'store_tax_id']);
const logoUpload = createMediaUpload('logos', {
  fileSize: 5 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
});

function branchId(req) {
  const requested = Number(req.query.branch_id || req.body.branch_id || req.user.branch_id);
  if (req.user.role !== 'owner' && requested !== req.user.branch_id) throw Object.assign(new Error('Anda hanya dapat mengatur toko sendiri'), { status: 403 });
  return requested;
}

router.get('/branches', async (req, res, next) => {
  try {
    const sql = req.user.role === 'owner'
      ? 'SELECT id,name,address,phone,email,npwp FROM branches WHERE is_active=TRUE ORDER BY id'
      : 'SELECT id,name,address,phone,email,npwp FROM branches WHERE id=?';
    const [rows] = await db.execute(sql, req.user.role === 'owner' ? [] : [req.user.branch_id]);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

router.post('/logo', authorize('owner','manager','admin'), logoUpload.single('logo'), async (req, res, next) => {
  try {
    const id = branchId(req);
    if (!req.file) return res.status(400).json({ success: false, message: 'Pilih logo JPG, PNG, atau WebP maksimal 5 MB' });
    const [branches] = await db.execute('SELECT id FROM branches WHERE id = ? AND is_active = TRUE', [id]);
    if (!branches[0]) {
      await discardUploadedFile(req.file);
      return res.status(404).json({ success: false, message: 'Toko tidak ditemukan' });
    }
    const [previous] = await db.execute('SELECT `value` FROM store_settings WHERE branch_id = ? AND `key` = \'store_logo\' LIMIT 1', [id]);
    const publicPath = await persistUploadedFile(req.file, 'logos');
    await db.execute(
      'INSERT INTO store_settings (branch_id,`key`,`value`) VALUES (?,\'store_logo\',?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)',
      [id, publicPath]
    );
    const oldPath = previous[0]?.value;
    if (oldPath?.startsWith('/uploads/logos/') && oldPath !== publicPath) {
      await removeMedia(oldPath);
    }
    res.status(201).json({ success: true, data: { store_logo: publicPath } });
  } catch (error) {
    await discardUploadedFile(req.file);
    next(error);
  }
});

router.post('/logo-data', authorize('owner','manager','admin'), async (req, res, next) => {
  try {
    const id = branchId(req);
    const file = decodeDataUpload(req.body, { fileSize: 3 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] });
    const [branches] = await db.execute('SELECT id FROM branches WHERE id = ? AND is_active = TRUE', [id]);
    if (!branches[0]) return res.status(404).json({ success: false, message: 'Toko tidak ditemukan' });
    const [previous] = await db.execute('SELECT `value` FROM store_settings WHERE branch_id = ? AND `key` = \'store_logo\' LIMIT 1', [id]);
    const publicPath = await persistUploadedFile(file, 'logos');
    await db.execute('INSERT INTO store_settings (branch_id,`key`,`value`) VALUES (?,\'store_logo\',?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)', [id, publicPath]);
    const oldPath = previous[0]?.value;
    if (oldPath?.startsWith('/uploads/logos/') && oldPath !== publicPath) await removeMedia(oldPath);
    res.status(201).json({ success: true, data: { store_logo: publicPath } });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const id = branchId(req);
    const [branchResult, settingsResult] = await Promise.all([
      db.execute('SELECT id,name,address,phone,email,npwp FROM branches WHERE id=? AND is_active=TRUE', [id]),
      db.execute('SELECT `key`,`value` FROM store_settings WHERE branch_id=?', [id]),
    ]);
    const branch = branchResult[0][0];
    if (!branch) return res.status(404).json({ success: false, message: 'Toko tidak ditemukan' });
    // Store identity belongs to branches. Ignore legacy copies in store_settings
    // so an old sample value can never overwrite the saved branch profile.
    const settings = Object.fromEntries(
      settingsResult[0]
        .filter((row) => !profileKeys.has(row.key))
        .map((row) => [row.key, row.value])
    );
    res.json({ success: true, data: { store_name: branch.name, store_address: branch.address || '', store_phone: branch.phone || '', store_email: branch.email || '', store_tax_id: branch.npwp || '', ...settings } });
  } catch (error) { next(error); }
});

router.put('/', authorize('owner','manager','admin'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const id = branchId(req);
    const entries = Object.entries(req.body).filter(([key]) => allowed.has(key));
    if (!entries.length) return res.status(400).json({ success: false, message: 'Tidak ada pengaturan valid' });
    await connection.beginTransaction();
    const profile = Object.fromEntries(entries.filter(([key]) => profileKeys.has(key)));
    if (Object.keys(profile).length) {
      await connection.execute(
        'UPDATE branches SET name=COALESCE(?,name), address=COALESCE(?,address), phone=COALESCE(?,phone), email=COALESCE(?,email), npwp=COALESCE(?,npwp) WHERE id=?',
        [profile.store_name || null, profile.store_address || null, profile.store_phone || null, profile.store_email || null, profile.store_tax_id || null, id],
      );
      await connection.execute(
        'DELETE FROM store_settings WHERE branch_id = ? AND `key` IN (\'store_name\', \'store_address\', \'store_phone\', \'store_email\', \'store_tax_id\')',
        [id]
      );
    }
    for (const [key, value] of entries.filter(([key]) => !profileKeys.has(key))) {
      await connection.execute('INSERT INTO store_settings (branch_id,`key`,`value`) VALUES (?,?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)', [id, key, String(value)]);
    }
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally { connection.release(); }
});

module.exports = router;
