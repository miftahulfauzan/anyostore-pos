const express = require('express');
const db = require('../db');
const { authenticate } = require('../auth');
const { buildReceiptStore, loadReceiptPayload } = require('../receipt-data');
const { buildReceipt } = require('../receipt-lines');

const router = express.Router();
router.use(authenticate);

router.get('/invoice/:id', async (req, res, next) => {
  try {
    // Baris struk disusun di server (src/receipt-lines.js) supaya cetak thermal,
    // halaman resi web, dan pratinjau template memakai aturan yang sama.
    const receipt = await loadReceiptPayload(db, req.params.id);
    const owner = req.user.role === 'owner';
    if (!receipt || (!owner && receipt.branch_id !== req.user.branch_id)) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
    }
    res.json({ success: true, data: receipt });
  } catch (error) { next(error); }
});

// Pratinjau template struk: setelan draft dari halaman Template Struk + data
// contoh, tanpa menyimpan apa pun. Dipakai web supaya pratinjau = hasil cetak.
router.post('/preview', async (req, res, next) => {
  try {
    const body = req.body || {};
    const store = body.store && typeof body.store === 'object'
      ? body.store
      : (body.settings && typeof body.settings === 'object' ? body.settings : {});
    const sample = body.sample && typeof body.sample === 'object' ? body.sample : {};
    const layout = buildReceipt({ ...sample, store });
    res.json({
      success: true,
      data: {
        width: layout.width,
        margin: layout.margin,
        font: layout.font,
        inner: layout.inner,
        lines: layout.lines,
      },
    });
  } catch (error) { next(error); }
});

module.exports = router;
module.exports.buildReceiptStore = buildReceiptStore;