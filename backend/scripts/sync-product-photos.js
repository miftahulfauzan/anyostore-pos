#!/usr/bin/env node
// Sinkronkan FOTO PRODUK antar cabang. Murni foto:
//   - hanya menyentuh product_photos (variant_id NULL, media_type 'image')
//   - TIDAK menyentuh stok, harga, varian, warehouse_stocks, stock_mutations,
//     transaksi, ataupun foto varian/video.
//
// Pencocokan produk memakai NAMA (normalisasi ketat: huruf kecil + spasi
// dirapatkan). Nama ganda diselesaikan lewat SKU tanpa prefix cabang
// (mis. "B5-A104" -> "A104"); kalau tetap ambigu, produk dilewati.
//
//   Dry-run (default, tidak mengubah apa pun):
//     node scripts/sync-product-photos.js --from "Blok B" --to "Gudang Utama"
//   Terapkan:
//     node scripts/sync-product-photos.js --from "Blok B" --to "Gudang Utama" --apply
//
// Sumber = foto yang dipakai. Target = cabang yang fotonya diganti.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.production') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const db = require('../src/db');
const { copyMediaFile, removeMedia } = require('../src/media-storage');

const BATCH_SIZE = 50;
const PHOTO_FILTER = "variant_id IS NULL AND media_type = 'image'";

// Normalisasi KETAT: hanya huruf besar/kecil dan spasi berlebih yang diabaikan.
// Tanda hubung, tanda baca, dan akhiran " (Salinan)" tetap harus sama.
function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Buang prefix cabang hasil clone: "B5-A104" / "B-A104" -> "a104".
function stripBranchSkuPrefix(sku) {
  return String(sku ?? '').trim().replace(/^b\d*-/i, '').toLowerCase();
}

function parseArgs(argv) {
  const args = { apply: false, from: null, to: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--from') { args.from = argv[i + 1]; i += 1; }
    else if (arg === '--to') { args.to = argv[i + 1]; i += 1; }
  }
  return args;
}

function mapBySku(products) {
  const map = new Map();
  for (const product of products) {
    const key = stripBranchSkuPrefix(product.sku);
    if (!key || map.has(key)) return null; // SKU kosong/bentrok -> tidak bisa dipakai
    map.set(key, product);
  }
  return map;
}

// Pasangkan hanya kalau SKU tanpa prefix menutup semua produk di kedua sisi.
function pairBySku(sourceGroup, targetGroup) {
  const sourceMap = mapBySku(sourceGroup);
  const targetMap = mapBySku(targetGroup);
  if (!sourceMap || !targetMap) return null;
  if (sourceMap.size !== targetMap.size) return null;
  const pairs = [];
  for (const [sku, sourceProduct] of sourceMap) {
    const targetProduct = targetMap.get(sku);
    if (!targetProduct) return null;
    pairs.push({ source: sourceProduct, target: targetProduct });
  }
  return pairs;
}

// Kelompokkan per nama lalu pasangkan. Semua hasil dikembalikan apa adanya
// supaya script bisa melaporkan yang ambigu alih-alih menebak.
function pairProducts(sourceProducts, targetProducts) {
  const groups = new Map();
  const add = (products, side) => {
    for (const product of products) {
      const key = normalizeName(product.name);
      if (!groups.has(key)) groups.set(key, { name: key, source: [], target: [] });
      groups.get(key)[side].push(product);
    }
  };
  add(sourceProducts, 'source');
  add(targetProducts, 'target');

  const pairs = [];
  const ambiguous = [];
  const sourceOnly = [];
  const targetOnly = [];

  for (const group of groups.values()) {
    if (group.source.length === 0) {
      targetOnly.push(...group.target);
      continue;
    }
    if (group.target.length === 0) {
      sourceOnly.push(...group.source);
      continue;
    }
    if (group.source.length === 1 && group.target.length === 1) {
      pairs.push({ source: group.source[0], target: group.target[0], matchedBy: 'nama' });
      continue;
    }
    const bySku = pairBySku(group.source, group.target);
    if (bySku) {
      for (const pair of bySku) pairs.push({ ...pair, matchedBy: 'nama+sku' });
      continue;
    }
    ambiguous.push({
      name: group.name,
      source: group.source,
      target: group.target,
    });
  }

  return { pairs, ambiguous, sourceOnly, targetOnly };
}

async function findBranch(executor, input) {
  const q = String(input ?? '').trim();
  if (!q) return null;
  if (/^\d+$/.test(q)) {
    const [rows] = await executor.execute('SELECT id, name, type FROM branches WHERE id = ? LIMIT 1', [Number(q)]);
    if (rows[0]) return rows[0];
  }
  const [exact] = await executor.execute('SELECT id, name, type FROM branches WHERE name = ? LIMIT 1', [q]);
  if (exact[0]) return exact[0];
  const [like] = await executor.execute(
    'SELECT id, name, type FROM branches WHERE name LIKE ? ORDER BY is_active DESC, id LIMIT 1',
    [`%${q}%`],
  );
  return like[0] || null;
}

async function listBranchProducts(executor, branchId) {
  const [rows] = await executor.execute(
    'SELECT id, name, sku, barcode FROM products WHERE branch_id = ? AND is_active = TRUE ORDER BY name, id',
    [branchId],
  );
  return rows;
}

async function listProductPhotos(executor, productIds) {
  const result = new Map();
  if (!productIds.length) return result;
  for (let i = 0; i < productIds.length; i += 500) {
    const chunk = productIds.slice(i, i + 500);
    const marks = chunk.map(() => '?').join(',');
    const [rows] = await executor.execute(
      `SELECT id, product_id, filename, path, is_primary, sort_order, \`transform\`
       FROM product_photos
       WHERE product_id IN (${marks}) AND ${PHOTO_FILTER}
       ORDER BY product_id, is_primary DESC, sort_order, id`,
      chunk,
    );
    for (const row of rows) {
      const list = result.get(row.product_id) || [];
      list.push(row);
      result.set(row.product_id, list);
    }
  }
  return result;
}

// Snapshot pembanding: stok & harga harus identik sebelum dan sesudah apply.
async function inventorySnapshot(executor, branchId) {
  const [productRows] = await executor.execute(
    `SELECT COUNT(*) AS products, COALESCE(SUM(stock), 0) AS stock,
            COALESCE(SUM(cost), 0) AS cost, COALESCE(SUM(price), 0) AS price
     FROM products WHERE branch_id = ?`,
    [branchId],
  );
  const [variantRows] = await executor.execute(
    `SELECT COUNT(*) AS variants, COALESCE(SUM(v.stock), 0) AS stock
     FROM product_variants v JOIN products p ON p.id = v.product_id
     WHERE p.branch_id = ?`,
    [branchId],
  );
  const [warehouseRows] = await executor.execute(
    `SELECT COUNT(*) AS rows_count, COALESCE(SUM(ws.quantity), 0) AS quantity
     FROM warehouse_stocks ws JOIN warehouses w ON w.id = ws.warehouse_id
     WHERE w.branch_id = ?`,
    [branchId],
  );
  const product = productRows[0] || {};
  const variant = variantRows[0] || {};
  const warehouse = warehouseRows[0] || {};
  return {
    products: Number(product.products || 0),
    product_stock: Number(product.stock || 0),
    product_cost: Number(product.cost || 0),
    product_price: Number(product.price || 0),
    variants: Number(variant.variants || 0),
    variant_stock: Number(variant.stock || 0),
    warehouse_rows: Number(warehouse.rows_count || 0),
    warehouse_quantity: Number(warehouse.quantity || 0),
  };
}

function snapshotDiff(before, after) {
  const keys = Object.keys(before);
  return keys.filter((key) => Number(before[key]) !== Number(after[key]));
}

// Terapkan rencana. Semua tulis-menulis dibatasi ke product_photos; file
// media hanya disalin/dihapus lewat helper yang di-inject (memudahkan test).
async function applyPhotoSync({
  plan,
  connection,
  copyFile = copyMediaFile,
  removeFile = removeMedia,
  batchSize = BATCH_SIZE,
  log = () => {},
}) {
  const work = [];
  const skippedNoSource = [];
  for (const item of plan) {
    if (!item.sourcePhotos.length) {
      skippedNoSource.push(item);
      continue;
    }
    work.push(item);
  }

  const stats = {
    products_updated: 0,
    files_copied: 0,
    rows_deleted: 0,
    files_deleted: 0,
    copy_failed: [],
    skipped_no_source: skippedNoSource.length,
  };
  const stalePaths = [];

  for (let start = 0; start < work.length; start += batchSize) {
    const batch = work.slice(start, start + batchSize);
    const createdFiles = [];
    try {
      await connection.beginTransaction();
      for (const item of batch) {
        await connection.execute('SELECT id FROM products WHERE id = ? FOR UPDATE', [item.target.id]);

        const insertedIds = [];
        for (const photo of item.sourcePhotos) {
          const newPath = await copyFile(photo.path, 'products');
          if (!newPath || newPath === photo.path) {
            // copyMediaFile mengembalikan path asal kalau file tidak terbaca.
            // Jangan simpan path bersama — catat gagal dan lewati foto ini.
            stats.copy_failed.push({ product: item.target.name, path: photo.path });
            continue;
          }
          createdFiles.push(newPath);
          const [result] = await connection.execute(
            `INSERT INTO product_photos
               (product_id, filename, path, media_type, is_primary, sort_order, variant_id, \`transform\`)
             VALUES (?, ?, ?, 'image', ?, ?, NULL, ?)`,
            [
              item.target.id,
              path.basename(newPath),
              newPath,
              photo.is_primary ? 1 : 0,
              photo.sort_order ?? 0,
              photo.transform ?? null,
            ],
          );
          insertedIds.push(result.insertId);
        }

        if (!insertedIds.length) {
          // Tidak ada foto baru yang valid: foto lama dibiarkan utuh.
          continue;
        }

        const marks = insertedIds.map(() => '?').join(',');
        const [deleted] = await connection.execute(
          `DELETE FROM product_photos
           WHERE product_id = ? AND ${PHOTO_FILTER} AND id NOT IN (${marks})`,
          [item.target.id, ...insertedIds],
        );
        stats.rows_deleted += Number(deleted.affectedRows || 0);
        stalePaths.push(...(item.targetPhotos || []).map((photo) => photo.path).filter(Boolean));
        stats.products_updated += 1;
      }
      await connection.commit();
      stats.files_copied += createdFiles.length;
    } catch (error) {
      await connection.rollback();
      for (const file of createdFiles) {
        try { await removeFile(file); } catch { /* biarkan; file yatim lebih aman dari data hilang */ }
      }
      throw error;
    }
    log(`  batch ${Math.floor(start / batchSize) + 1}: ${batch.length} produk`);
  }

  // File lama hanya dihapus kalau sudah tidak dirujuk baris mana pun.
  for (const stalePath of new Set(stalePaths)) {
    const [rows] = await connection.execute(
      'SELECT COUNT(*) AS total FROM product_photos WHERE path = ?',
      [stalePath],
    );
    if (Number(rows[0]?.total || 0) > 0) continue;
    await removeFile(stalePath);
    stats.files_deleted += 1;
  }

  return stats;
}

function shortList(items, limit = 12) {
  const names = items.slice(0, limit).map((product) => product.name);
  const rest = items.length - names.length;
  return rest > 0 ? `${names.join(', ')} … (+${rest} lagi)` : names.join(', ');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.from || !args.to) {
    console.log('Usage: node scripts/sync-product-photos.js --from "<cabang sumber>" --to "<cabang target>" [--apply]');
    process.exit(1);
  }

  const connection = await db.getConnection();
  try {
    const source = await findBranch(connection, args.from);
    const target = await findBranch(connection, args.to);
    if (!source || !target) {
      console.error(`❌ Cabang tidak ditemukan: ${!source ? args.from : args.to}`);
      const [all] = await connection.execute('SELECT id, name, type, is_active FROM branches ORDER BY id');
      for (const branch of all) {
        console.log(`  ${branch.id}: ${branch.name} (${branch.type}, aktif=${Number(branch.is_active) === 1 ? 'ya' : 'tidak'})`);
      }
      process.exit(1);
    }
    if (source.id === target.id) throw new Error('Cabang sumber dan target sama');

    console.log(`Sumber foto : ${source.name} (id ${source.id})`);
    console.log(`Target      : ${target.name} (id ${target.id})`);
    console.log(`Mode        : ${args.apply ? 'APPLY (foto target diganti)' : 'DRY-RUN (tidak ada perubahan)'}`);
    console.log('Cakupan     : foto produk saja (variant_id NULL, media_type=image)');
    console.log('----------------------------------------');

    const [sourceProducts, targetProducts] = await Promise.all([
      listBranchProducts(connection, source.id),
      listBranchProducts(connection, target.id),
    ]);
    const pairing = pairProducts(sourceProducts, targetProducts);

    const [sourcePhotos, targetPhotos] = await Promise.all([
      listProductPhotos(connection, pairing.pairs.map((pair) => pair.source.id)),
      listProductPhotos(connection, pairing.pairs.map((pair) => pair.target.id)),
    ]);

    const plan = pairing.pairs.map((pair) => ({
      source: pair.source,
      target: pair.target,
      matchedBy: pair.matchedBy,
      sourcePhotos: sourcePhotos.get(pair.source.id) || [],
      targetPhotos: targetPhotos.get(pair.target.id) || [],
    }));

    const withPhotos = plan.filter((item) => item.sourcePhotos.length > 0);
    const withoutSource = plan.filter((item) => item.sourcePhotos.length === 0);
    const filesToCopy = withPhotos.reduce((total, item) => total + item.sourcePhotos.length, 0);
    const rowsToDelete = withPhotos.reduce((total, item) => total + item.targetPhotos.length, 0);

    console.log(`Produk aktif    : ${sourceProducts.length} di sumber, ${targetProducts.length} di target`);
    console.log(`Pasangan        : ${plan.length} (${plan.filter((p) => p.matchedBy === 'nama+sku').length} lewat SKU karena nama ganda)`);
    console.log(`Siap disalin    : ${withPhotos.length} produk · ${filesToCopy} file`);
    console.log(`Baris lama      : ${rowsToDelete} baris foto target akan dihapus`);
    console.log(`Tanpa foto sumber: ${withoutSource.length} produk (dibiarkan, tidak dikosongkan)`);
    console.log(`Tanpa pasangan  : ${pairing.sourceOnly.length} produk hanya di sumber, ${pairing.targetOnly.length} hanya di target`);
    console.log(`Nama ganda      : ${pairing.ambiguous.length} nama perlu dicek manual`);

    const [inactiveSource] = await connection.execute(
      'SELECT COUNT(*) AS total FROM products WHERE branch_id = ? AND is_active = FALSE',
      [source.id],
    );
    const [inactiveTarget] = await connection.execute(
      'SELECT COUNT(*) AS total FROM products WHERE branch_id = ? AND is_active = FALSE',
      [target.id],
    );
    if (Number(inactiveSource[0]?.total || 0) || Number(inactiveTarget[0]?.total || 0)) {
      console.log(`Produk nonaktif: ${Number(inactiveSource[0]?.total || 0)} di sumber, ${Number(inactiveTarget[0]?.total || 0)} di target (dilewati)`);
    }

    if (plan.length) {
      console.log('\nContoh pasangan (maks 20):');
      for (const item of plan.slice(0, 20)) {
        console.log(`   - ${item.target.name} [${item.matchedBy}] · foto sumber ${item.sourcePhotos.length}, foto target lama ${item.targetPhotos.length}`);
      }
      if (plan.length > 20) console.log(`   … (+${plan.length - 20} produk lain)`);
    }

    if (withoutSource.length) {
      console.log('\n⚠️  Produk tanpa foto di sumber (tidak diubah):');
      for (const item of withoutSource) console.log(`   - ${item.target.name}`);
    }
    if (pairing.ambiguous.length) {
      console.log('\n⚠️  Nama ganda yang dilewati (pasangkan manual bila perlu):');
      for (const item of pairing.ambiguous) {
        console.log(`   - "${item.name}" · sumber ${item.source.length} produk (id ${item.source.map((p) => p.id).join(',')}) · target ${item.target.length} produk (id ${item.target.map((p) => p.id).join(',')})`);
      }
    }
    if (pairing.sourceOnly.length) {
      console.log(`\nℹ️  Hanya ada di ${source.name}: ${shortList(pairing.sourceOnly)}`);
    }
    if (pairing.targetOnly.length) {
      console.log(`\nℹ️  Hanya ada di ${target.name}: ${shortList(pairing.targetOnly)}`);
    }

    if (args.apply) {
      const before = await inventorySnapshot(connection, target.id);
      const stats = await applyPhotoSync({
        plan,
        connection,
        log: (line) => console.log(line),
      });
      const after = await inventorySnapshot(connection, target.id);
      const diff = snapshotDiff(before, after);

      console.log('\n--- Hasil ---');
      console.log(`Produk diperbarui : ${stats.products_updated}`);
      console.log(`File disalin      : ${stats.files_copied}`);
      console.log(`Baris foto dihapus: ${stats.rows_deleted}`);
      console.log(`File lama dihapus : ${stats.files_deleted}`);
      console.log(`Tanpa foto sumber : ${stats.skipped_no_source} produk dibiarkan`);
      if (stats.copy_failed.length) {
        console.log(`⚠️  Gagal menyalin ${stats.copy_failed.length} file:`);
        for (const item of stats.copy_failed) console.log(`   - ${item.product}: ${item.path}`);
      }
      console.log(`Stok & harga      : ${diff.length === 0 ? 'tidak berubah ✅' : `BERUBAH ⚠️ (${diff.join(', ')})`}`);
      console.log(`  sebelum: ${JSON.stringify(before)}`);
      console.log(`  sesudah: ${JSON.stringify(after)}`);
      if (diff.length) process.exitCode = 2;
    } else {
      console.log('\n🔎 Dry-run selesai. Tidak ada data yang diubah.');
      console.log('   Jalankan ulang dengan --apply setelah daftar di atas cocok.');
    }
  } finally {
    if (typeof connection.release === 'function') connection.release();
    else if (typeof connection.end === 'function') await connection.end();
    await db.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  normalizeName,
  stripBranchSkuPrefix,
  parseArgs,
  pairProducts,
  pairBySku,
  applyPhotoSync,
  inventorySnapshot,
  snapshotDiff,
};