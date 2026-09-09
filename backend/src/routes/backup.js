const express = require('express');
const fs = require('node:fs');
const { pipeline } = require('node:stream/promises');
const db = require('../db');
const auth = require('../auth');
const { createBackup, streamLegacyResponse } = require('../backup');

function createBackupRouter({ create = createBackup, authenticate = auth.authenticate, authorize = auth.authorize } = {}) {
  const router = express.Router();
  router.use(authenticate, authorize('owner'));

  const download = direct => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const controller = new AbortController();
    // `close` may follow a normal streamed response before Express updates
    // writableFinished. Only abort when the client really disconnected early.
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', onClose);
    let backup;
    try {
      backup = await create({ db, branchId: req.user.branch_id, signal: controller.signal });
      if (controller.signal.aborted) return;
      res.type('application/json');
      if (direct) {
        res.set({
          'Content-Disposition': `attachment; filename="anyostore-backup-${backup.generatedAt.replace(/[:.]/g, '-')}.json"`,
          'Content-Length': String(backup.sizeBytes),
          'X-Backup-Complete': 'true',
          'X-Backup-Tables': String(backup.manifest.tables.length),
          'X-Backup-Rows': String(backup.manifest.total_rows),
          'X-Backup-Media-Files': String(backup.manifest.media.length),
          'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, X-Backup-Complete, X-Backup-Tables, X-Backup-Rows, X-Backup-Media-Files',
        });
        await pipeline(fs.createReadStream(backup.filePath), res, { signal: controller.signal });
      } else {
        // Existing mobile clients receive data.download as a JSON string. Escape
        // file chunks instead of allocating a second complete dump in memory.
        await pipeline(streamLegacyResponse(backup), res, { signal: controller.signal });
      }
    } catch (error) {
      if (!res.headersSent && !res.destroyed) res.status(500).json({ success: false,
        message: error.backupSafe ? error.message : 'Backup gagal dibuat. Tidak ada backup lengkap yang dihasilkan.' });
      else if (!res.destroyed) res.destroy();
    } finally {
      res.off('close', onClose);
      try { if (backup) await backup.cleanup(); }
      catch { console.error('[backup] temporary artifact cleanup failed'); }
    }
  };

  router.get('/download', download(true));
  router.get('/', download(false));
  return router;
}

module.exports = createBackupRouter();
module.exports.createBackupRouter = createBackupRouter;
