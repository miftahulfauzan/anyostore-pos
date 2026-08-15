#!/usr/bin/env node
// Sinkronkan katalog: HAPUS (soft) semua produk di cabang target, lalu SALIN
// katalog cabang sumber (termasuk foto produk+varian, stok, varian, harga
// grosir, warehouse_stocks) ke target.
//
// AMAN: default DRY-RUN (tidak mengubah apa pun). Jalankan dengan --apply
// untuk benar-benar mengeksekusi. Riwayat transaksi/mutasi lama TETAP aman
// karena produk lama hanya di-nonaktifkan (bukan dihapus hard).
//
//   node scripts/sync-catalog-to-branches.js --apply "Metro" "Blok B" "Gudang" "Gudang Reject"
//
// (Sumber = argumen pertama; sisanya target.)
const db = require('../src/db');
const { copyMediaFile } = require('../src/media-storage');

async function findBranch(name) {
  const [rows] = await db.execute('SELECT id, name, type FROM branches WHERE name = ? AND is_active = TRUE LIMIT 1', [name.trim()]);
  return rows[0] || null;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const names = args.filter((a) => a !== '--apply');
  if (names.length < 2) {
    console.log('Usage: node scripts/sync-catalog-to-branches.js [--apply] "<sumber>" "<target1>" ...');
    process.exit(1);
  }
  const sourceName = names[0];
  const targets = names.slice(1);

  const source = await findBranch(sourceName);
  if (!source) { console.error(`Cabang sumber tidak ditemukan: ${sourceName}`); process.exit(1); }
  const targetBranches = [];
  for (const t of targets) {
    const b = await findBranch(t);
    if (!b) { console.error(`Cabang target tidak ditemukan: ${t}`); process.exit(1); }
    targetBranches.push(b);
  }

  console.log(`Sumber : ${source.name} (id ${source.id}, ${source.type})`);
  console.log(`Target : ${targetBranches.map((b) => `${b.name} (${b.id})`).join(', ')}`);
  console.log(`Mode   : ${apply ? 'APPLY (data target akan dihapus & diganti)' : 'DRY-RUN (tidak ada perubahan)'}`);
  console.log('----------------------------------------');

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Katalog sumber
    const [srcProducts] = await connection.execute(
      `SELECT id, category_id, name, description, sku, barcode, price, cost, stock, min_stock, gender
       FROM products WHERE branch_id=? AND is_active=TRUE`, [source.id]
    );
    const [srcWarehouses] = await connection.execute(
      'SELECT id, name, type FROM warehouses WHERE branch_id=? AND is_active=TRUE', [source.id]
    );

    for (const target of targetBranches) {
      const [oldProducts] = await connection.execute('SELECT id FROM products WHERE branch_id=?', [target.id]);
      const oldCount = oldProducts.length;

      // DRY-RUN: hitung saja, tanpa insert / tanpa salin file.
      if (!apply) {
        console.log(`- ${target.name}: [DRY] akan hapus ${oldCount} produk lama, salin ${srcProducts.length} produk dari ${source.name}`);
        continue;
      }

      // 1) Hapus (soft) semua produk target + kosongkan stok warehouse.
      {
        await connection.execute('UPDATE products SET is_active=FALSE, stock=0 WHERE branch_id=?', [target.id]);
        await connection.execute('UPDATE product_variants SET stock=0 WHERE product_id IN (SELECT id FROM products WHERE branch_id=?)', [target.id]);
        await connection.execute(
          'DELETE ws FROM warehouse_stocks ws JOIN products p ON p.id=ws.product_id WHERE p.branch_id=?', [target.id]
        );
      }

      // 2) Warehouse target untuk penempatan stok salinan.
      const [tgtWarehouses] = await connection.execute(
        'SELECT id, name, type FROM warehouses WHERE branch_id=? AND is_active=TRUE', [target.id]
      );
      const mainTgt = tgtWarehouses.find((w) => w.type === 'utama') || tgtWarehouses[0];
      if (!mainTgt) { console.error(`Cabang ${target.name} tidak punya gudang aktif`); await connection.rollback(); process.exit(1); }
      const warehouseMap = new Map();
      for (const sw of srcWarehouses) {
        warehouseMap.set(sw.id, (tgtWarehouses.find((w) => w.type === sw.type) || mainTgt).id);
      }

      let cloned = 0;
      for (const p of srcProducts) {
        const newSku = (p.sku || '').trim() ? `B${target.id}-${String(p.sku).trim()}`.slice(0, 50) : null;
        if (newSku) {
          const [dup] = await connection.execute('SELECT id FROM products WHERE sku=? LIMIT 1', [newSku]);
          if (dup[0]) continue;
        }
        const newBarcode = null;
        const [res] = await connection.execute(
          `INSERT INTO products (branch_id, category_id, name, description, sku, barcode, price, cost, stock, min_stock, gender, is_active)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,TRUE)`,
          [target.id, p.category_id, p.name, p.description, newSku, newBarcode, p.price, p.cost || 0, p.stock || 0, p.min_stock, p.gender]
        );
        const newProductId = res.insertId;

        // Varian (stok ikut tersalin)
        const [variants] = await connection.execute(
          'SELECT id, size, color, sku, barcode, stock, price FROM product_variants WHERE product_id=? AND is_active=TRUE', [p.id]
        );
        const variantIdMap = new Map();
        for (const v of variants) {
          const [vr] = await connection.execute(
            'INSERT INTO product_variants (product_id, size, color, sku, barcode, stock, price, is_active) VALUES (?,?,?,?,?,?,?,TRUE)',
            [newProductId, v.size || null, v.color || null, null, null, v.stock || 0, v.price]
          );
          variantIdMap.set(v.id, vr.insertId);
        }

        // Foto produk + foto varian (salin file)
        const [photos] = await connection.execute(
          'SELECT filename, path, media_type, is_primary, sort_order, variant_id FROM product_photos WHERE product_id=?', [p.id]
        );
        for (const ph of photos) {
          const newPath = await copyMediaFile(ph.path, 'products');
          await connection.execute(
            'INSERT INTO product_photos (product_id, filename, path, media_type, is_primary, sort_order, variant_id) VALUES (?,?,?,?,?,?,?)',
            [newProductId, ph.filename, newPath, ph.media_type, ph.is_primary, ph.sort_order,
             ph.variant_id != null ? (variantIdMap.get(ph.variant_id) || null) : null]
          );
        }

        // Harga grosir
        const [wholesale] = await connection.execute(
          'SELECT min_qty, max_qty, price FROM wholesale_prices WHERE product_id=? AND is_active=TRUE', [p.id]
        );
        for (const w of wholesale) {
          await connection.execute(
            'INSERT INTO wholesale_prices (product_id, min_qty, max_qty, price, is_active) VALUES (?,?,?,?,TRUE)',
            [newProductId, w.min_qty, w.max_qty, w.price]
          );
        }

        // Stok per gudang (map utama->utama, reject->reject, dst)
        const [stocks] = await connection.execute(
          'SELECT warehouse_id, variant_id, quantity FROM warehouse_stocks WHERE product_id=?', [p.id]
        );
        for (const st of stocks) {
          const tw = warehouseMap.get(st.warehouse_id) || mainTgt.id;
          await connection.execute(
            'INSERT INTO warehouse_stocks (warehouse_id, product_id, variant_id, quantity) VALUES (?,?,?,?)',
            [tw, newProductId, st.variant_id != null ? (variantIdMap.get(st.variant_id) || null) : null, st.quantity || 0]
          );
        }

        cloned += 1;
      }

      console.log(`- ${target.name}: hapus ${oldCount} produk lama, salin ${cloned} produk dari ${source.name}`);
    }

    if (!apply) {
      await connection.rollback();
      console.log('----------------------------------------');
      console.log('DRY-RUN selesai. Jalankan ulang dengan --apply untuk mengeksekusi.');
      await db.end();
      return;
    }
    await connection.commit();
    console.log('----------------------------------------');
    console.log('SELESAI — katalog target diganti dengan salinan sumber.');
  } catch (e) {
    await connection.rollback();
    console.error('GAGAL (dibatalkan, tidak ada perubahan):', e.message);
    process.exit(1);
  } finally {
    connection.release();
    await db.end();
  }
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
