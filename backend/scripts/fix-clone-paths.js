/**
 * One-off migration script: copy shared media files to independent paths.
 *
 * Before the copyMediaFile fix, branch clones reused the same file path,
 * so deleting a photo in one branch would break another branch's photo.
 *
 * This script finds product_photos rows where the same `path` is used by
 * products in multiple branches, then copies the file to a new path for
 * all but the oldest row (by id), and updates `product_photos.path`.
 *
 * Safe to run multiple times (idempotent — skips paths already isolated).
 *
 * Usage:  node scripts/fix-clone-paths.js
 * Requires DB env vars (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.production') });
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const db = require('../src/db');
const { copyMediaFile } = require('../src/media-storage');

async function main() {
  console.log('[fix-clone-paths] Looking for shared media paths across branches…');

  // Find paths used by products in more than one distinct branch
  const [shared] = await db.execute(`
    SELECT pp.path, COUNT(DISTINCT p.branch_id) AS branch_count
    FROM product_photos pp
    JOIN products p ON p.id = pp.product_id
    WHERE pp.path IS NOT NULL AND pp.path <> ''
    GROUP BY pp.path
    HAVING branch_count > 1
  `);

  if (!shared.length) {
    console.log('[fix-clone-paths] No shared paths found. Everything is already independent.');
    process.exit(0);
  }

  console.log(`[fix-clone-paths] Found ${shared.length} shared path(s) to fix.`);

  let fixed = 0;
  let skipped = 0;

  for (const { path: srcPath } of shared) {
    // Get all rows using this path, ordered by id (oldest = "original" keeps the file)
    const [rows] = await db.execute(
      `SELECT pp.id, p.branch_id
       FROM product_photos pp
       JOIN products p ON p.id = pp.product_id
       WHERE pp.path = ?
       ORDER BY pp.id ASC`,
      [srcPath]
    );

    // Keep the first row's path unchanged (it's the original)
    const toFix = rows.slice(1);
    if (!toFix.length) { skipped++; continue; }

    for (const row of toFix) {
      try {
        const newPath = await copyMediaFile(srcPath, 'products');
        if (newPath === srcPath) {
          console.log(`  [skip] product_photo #${row.id} (branch ${row.branch_id}) — copyMediaFile returned same path (source missing?)`);
          skipped++;
          continue;
        }
        await db.execute('UPDATE product_photos SET path = ? WHERE id = ?', [newPath, row.id]);
        fixed++;
        console.log(`  [fixed] product_photo #${row.id} (branch ${row.branch_id}): ${srcPath} → ${newPath}`);
      } catch (err) {
        console.error(`  [error] product_photo #${row.id}: ${err.message}`);
        skipped++;
      }
    }
  }

  console.log(`[fix-clone-paths] Done. Fixed: ${fixed}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[fix-clone-paths] Fatal error:', err);
  process.exit(1);
});
