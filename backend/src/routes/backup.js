const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
router.use(authenticate);
const sensitiveSettingKeys = new Set(['daily_email_api_key']);

// GET /api/backup — snapshot JSON semua tabel (owner). Dipakai tombol "Backup Sekarang".
router.get('/', authorize('owner'), async (req, res, next) => {
  try {
    const [tables] = await db.execute("SHOW TABLES");
    const tableKey = Object.keys(tables[0] || {})[0] || 'Tables_in_' + db.pool?.config?.connectionConfig?.database;
    const dump = { generated_at: new Date().toISOString(), branch_id: req.user.branch_id, tables: {} };
    const ROW_LIMIT = 10000;
    const truncatedTables = [];
    let totalRows = 0;
    for (const t of tables) {
      const name = String(t[tableKey]);
      try {
        const [rows] = await db.execute('SELECT * FROM `' + name.replace(/[^A-Za-z0-9_]/g, '') + '` LIMIT ' + ROW_LIMIT);
        dump.tables[name] = name === 'store_settings'
          ? rows.map((row) => sensitiveSettingKeys.has(row.key) ? { ...row, value: '[REDACTED]' } : row)
          : rows;
        totalRows += rows.length;
        if (rows.length >= ROW_LIMIT) {
          const [counts] = await db.execute('SELECT COUNT(*) AS c FROM `' + name.replace(/[^A-Za-z0-9_]/g, '') + '`');
          const total = Number(counts[0]?.c || 0);
          if (total > ROW_LIMIT) truncatedTables.push({ table: name, total_rows: total });
        }
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
        truncated_tables: truncatedTables,
        download: payload,
      },
    });
  } catch (error) { next(error); }
});

module.exports = router;
