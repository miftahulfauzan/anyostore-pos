const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
router.use(authenticate);

// GET /api/backup — snapshot JSON semua tabel (owner). Dipakai tombol "Backup Sekarang".
router.get('/', authorize('owner'), async (req, res, next) => {
  try {
    const [tables] = await db.execute("SHOW TABLES");
    const tableKey = Object.keys(tables[0] || {})[0] || 'Tables_in_' + db.pool?.config?.connectionConfig?.database;
    const dump = { generated_at: new Date().toISOString(), branch_id: req.user.branch_id, tables: {} };
    let totalRows = 0;
    for (const t of tables) {
      const name = String(t[tableKey]);
      try {
        const [rows] = await db.execute('SELECT * FROM `' + name.replace(/[^A-Za-z0-9_]/g, '') + '` LIMIT 10000');
        dump.tables[name] = rows;
        totalRows += rows.length;
      } catch (_) { /* tabel tanpa akses dilewati */ }
    }
    const payload = JSON.stringify(dump);
    res.json({
      success: true,
      data: {
        generated_at: dump.generated_at,
        tables: Object.keys(dump.tables).length,
        total_rows: totalRows,
        size_bytes: Buffer.byteLength(payload),
        download: payload,
      },
    });
  } catch (error) { next(error); }
});

module.exports = router;
