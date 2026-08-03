const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');
const { createMediaUpload, decodeDataUpload, discardUploadedFile, persistUploadedFile, removeMedia, copyMediaFile } = require('../media-storage');

const router = express.Router();
router.use(authenticate);
const allowed = new Set(['store_name','store_address','store_phone','store_email','store_tax_id','receipt_header','receipt_footer','receipt_note','printer_size','auto_print','theme','currency','tax_rate','prices_include_tax','loyalty_enabled','loyalty_points_rate','loyalty_points_value','show_logo','show_qr','show_cashier','show_barcode','low_stock_alert','low_stock_email','order_prefix','invoice_prefix','timezone','whatsapp_number','whatsapp_number_2','whatsapp_number_3','whatsapp_numbers']);
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
    let rows;
    if (req.user.role === 'owner') {
      [rows] = await db.execute(
        'SELECT b.id,b.name,b.address,b.phone,b.email,b.npwp,b.pricing_tier_enabled,b.is_active,b.type,(SELECT COUNT(*) FROM products WHERE branch_id=b.id) AS product_count,(SELECT COUNT(*) FROM users WHERE branch_id=b.id AND is_active=TRUE) AS user_count FROM branches b ORDER BY b.id'
      );
    } else if (req.user.role === 'gudang') {
      // Admin Gudang perlu melihat semua cabang tipe gudang (untuk Daftar Produk, Stok, dll).
      [rows] = await db.execute(
        'SELECT id,name,address,phone,email,npwp,pricing_tier_enabled,is_active,type FROM branches WHERE is_active=TRUE AND type=\'gudang\' ORDER BY name'
      );
    } else {
      [rows] = await db.execute('SELECT id,name,address,phone,email,npwp,pricing_tier_enabled,is_active,type FROM branches WHERE id=?', [req.user.branch_id]);
    }
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

// Ubah tipe cabang: toko / gudang
router.put('/branches/:id/type', authorize('owner'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const type = req.body.type;
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID tidak valid' });
    if (!['toko', 'gudang'].includes(type)) return res.status(400).json({ success: false, message: 'Tipe tidak valid' });
    if (id === req.user.branch_id) return res.status(400).json({ success: false, message: 'Tidak dapat mengubah tipe cabang yang sedang aktif' });
    const [r] = await db.execute('UPDATE branches SET type = ? WHERE id = ?', [type, id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Cabang tidak ditemukan' });
    res.json({ success: true, data: { id, type } });
  } catch (error) { next(error); }
});

router.delete('/branches/:id', authorize('owner'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID cabang tidak valid' });
    if (id === req.user.branch_id) return res.status(400).json({ success: false, message: 'Tidak dapat menghapus toko akun sendiri — pindah dulu' });
    const [branches] = await db.execute('SELECT id, is_active FROM branches WHERE id=?', [id]);
    if (!branches[0]) return res.status(404).json({ success: false, message: 'Toko tidak ditemukan' });
    const [activeBranches] = await db.execute('SELECT COUNT(*) AS cnt FROM branches WHERE is_active=TRUE');
    if (Number(activeBranches[0].cnt) <= 1) return res.status(400).json({ success: false, message: 'Tidak dapat menghapus toko terakhir' });
    const [checks] = await db.execute(
      `SELECT (SELECT COUNT(*) FROM transactions WHERE branch_id=?) AS trx, (SELECT COUNT(*) FROM users WHERE branch_id=? AND is_active=TRUE) AS users, (SELECT COUNT(*) FROM products WHERE branch_id=?) AS products`,
      [id, id, id]
    );
    if (Number(checks[0].trx) > 0) return res.status(400).json({ success: false, message: `Toko punya ${checks[0].trx} transaksi — tidak bisa dihapus. Nonaktifkan saja.` });

    // If branch is already inactive → hard delete (cascade all data)
    if (!branches[0].is_active) {
      await connection.beginTransaction();
      try {
        // Disable FK checks for this transaction so we can cascade freely
        await connection.execute('SET FOREIGN_KEY_CHECKS=0');

        // 1. Collect all product IDs and their media paths
        const [products] = await connection.execute('SELECT id FROM products WHERE branch_id=?', [id]);
        const productIds = products.map((p) => p.id);

        // 2. Remove media files (product_photos paths) before deleting rows
        if (productIds.length) {
          const ph = productIds.map(() => '?').join(',');
          const [photos] = await connection.execute(`SELECT DISTINCT path FROM product_photos WHERE product_id IN (${ph}) AND path IS NOT NULL AND path <> ''`, productIds);
          for (const row of photos) { try { await removeMedia(row.path); } catch {} }
        }

        // 3. Delete ALL tables that reference this branch (child tables first, then parent)
        const tables = [
          // product children (reference product_id / variant_id)
          'stock_mutations', 'warehouse_stocks', 'product_photos', 'transaction_items',
          'return_items', 'product_variants', 'wholesale_prices', 'products',
          // branch-level tables (reference branch_id directly)
          'commission_items', 'commission_records', 'commission_rules',
          'purchase_order_items', 'purchase_orders',
          'stock_transfer_items', 'stock_transfers',
          'stock_opname_items', 'stock_opnames',
          'cash_drawer_movements', 'cash_drawers',
          'transactions', 'pending_transactions', 'invoice_sequences',
          'journal_entry_items', 'journal_entries', 'periods',
          'loyalty_points', 'employee_schedules', 'shift_templates', 'shifts',
          'expense_budgets', 'expenses', 'activity_logs',
          'customers', 'suppliers', 'store_settings', 'warehouses',
        ];
        for (const t of tables) {
          await connection.execute(`DELETE FROM \`${t}\` WHERE branch_id=?`, [id]).catch(() => {});
        }

        // 4. Delete the branch itself
        await connection.execute('DELETE FROM branches WHERE id=?', [id]);

        // Re-enable FK checks
        await connection.execute('SET FOREIGN_KEY_CHECKS=1');

        await connection.commit();
        res.json({ success: true, data: { permanent: true, deleted_products: productIds.length } });
      } catch (err) {
        await connection.execute('SET FOREIGN_KEY_CHECKS=1').catch(() => {});
        await connection.rollback();
        throw err;
      }
      return;
    }

    // Otherwise → soft-delete (deactivate)
    await db.execute('UPDATE branches SET is_active=FALSE WHERE id=?', [id]);
    res.json({ success: true, data: { archived: { products: Number(checks[0].products), users: Number(checks[0].users) } } });
  } catch (error) { next(error); } finally { connection.release(); }
});

router.post('/branches', authorize('owner'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const {
      name,
      address,
      phone,
      email,
      npwp,
      pricing_tier_enabled: pricingEnabled = true,
      source_branch_id: sourceBranchId = null,
      price_multiplier: priceMultiplierRaw = 1,
      clone_photos: clonePhotos = true,
      type: branchType = 'toko',
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Nama toko wajib diisi' });
    const bType = ['toko', 'gudang'].includes(branchType) ? branchType : 'toko';
    const multiplier = priceMultiplierRaw === '' || priceMultiplierRaw == null ? 1 : Number(priceMultiplierRaw);
    if (!Number.isFinite(multiplier) || multiplier <= 0) return res.status(400).json({ success: false, message: 'Pengali harga tidak valid' });
    const sourceId = sourceBranchId ? Number(sourceBranchId) : null;
    if (sourceId != null && !Number.isInteger(sourceId)) return res.status(400).json({ success: false, message: 'Cabang sumber tidak valid' });

    await connection.beginTransaction();

    if (sourceId) {
      const [sb] = await connection.execute('SELECT id FROM branches WHERE id=? AND is_active=TRUE', [sourceId]);
      if (!sb[0]) throw Object.assign(new Error('Cabang sumber tidak ditemukan'), { status: 404 });
    }

    const [branchResult] = await connection.execute(
      'INSERT INTO branches (name, address, phone, email, npwp, pricing_tier_enabled, is_active, type) VALUES (?,?,?,?,?,?,TRUE,?)',
      [name.trim(), address?.trim() || null, phone?.trim() || null, email?.trim() || null, npwp?.trim() || null, pricingEnabled ? 1 : 0, bType]
    );
    const newBranchId = branchResult.insertId;

    // Create 2 warehouses per spec
    await connection.execute('INSERT INTO warehouses (branch_id, name, description) VALUES (?, ?, ?)', [newBranchId, 'Gudang Utama', 'Gudang utama']);
    await connection.execute('INSERT INTO warehouses (branch_id, name, description) VALUES (?, ?, ?)', [newBranchId, 'Gudang Cadangan', 'Stok cadangan']);
    const [warehouses] = await connection.execute('SELECT id FROM warehouses WHERE branch_id=? ORDER BY id LIMIT 1', [newBranchId]);
    const mainWarehouseId = warehouses[0]?.id;

    // seed default settings like migrasi 12
    const defaults = [
      ['store_name', name.trim()],
      ['store_address', address?.trim() || ''],
      ['store_phone', phone?.trim() || ''],
      ['store_email', email?.trim() || ''],
      ['currency', 'IDR'],
      ['printer_size', '80'],
      ['invoice_prefix', 'INV'],
    ];
    for (const [k, v] of defaults) {
      await connection.execute('INSERT INTO store_settings (branch_id, `key`, `value`) VALUES (?,?,?)', [newBranchId, k, v]);
    }

    let cloned = 0;
    if (sourceId) {
      const [products] = await connection.execute(
        `SELECT id, category_id, name, description, sku, barcode, price, cost, min_stock, gender
         FROM products WHERE branch_id=? AND is_active=TRUE`, [sourceId]
      );

      for (const p of products) {
        const newPrice = Math.round((Number(p.price) * multiplier + Number.EPSILON) * 100) / 100;
        // avoid duplicate SKU globally (unique) – prefix with B- + branchId
        const baseSku = (p.sku || '').trim();
        const newSku = baseSku ? `B${newBranchId}-${baseSku}`.slice(0, 50) : null;
        const newBarcode = null; // barcode must stay unique – null for cloned

        // check duplicate sku collision
        if (newSku) {
          const [dup] = await connection.execute('SELECT id FROM products WHERE sku=? LIMIT 1', [newSku]);
          if (dup[0]) continue;
        }

        const [res] = await connection.execute(
          `INSERT INTO products (branch_id, category_id, name, description, sku, barcode, price, cost, stock, min_stock, gender, is_active)
           VALUES (?,?,?,?,?,?,?,?,0,?,?,TRUE)`,
          [newBranchId, p.category_id, p.name, p.description, newSku, newBarcode, newPrice, p.cost || 0, p.min_stock, p.gender]
        );
        const newProductId = res.insertId;

        const [variants] = await connection.execute('SELECT color, size, sku, barcode, stock, price FROM product_variants WHERE product_id=? AND is_active=TRUE', [p.id]);
        for (const v of variants) {
          const vp = v.price != null ? Math.round((Number(v.price) * multiplier + Number.EPSILON) * 100) / 100 : null;
          await connection.execute(
            'INSERT INTO product_variants (product_id, size, color, sku, barcode, stock, price, is_active) VALUES (?,?,?,?,?,0,?,TRUE)',
            [newProductId, v.size || null, v.color || null, null, null, vp]
          );
        }

        const [wholesale] = await connection.execute('SELECT min_qty, max_qty, price FROM wholesale_prices WHERE product_id=? AND is_active=TRUE', [p.id]);
        for (const w of wholesale) {
          const wp = Math.round((Number(w.price) * multiplier + Number.EPSILON) * 100) / 100;
          await connection.execute('INSERT INTO wholesale_prices (product_id, min_qty, max_qty, price, is_active) VALUES (?,?,?,?,TRUE)', [newProductId, w.min_qty, w.max_qty, wp]);
        }

        if (clonePhotos) {
          const [photos] = await connection.execute('SELECT filename, path, media_type, is_primary, sort_order FROM product_photos WHERE product_id=? AND variant_id IS NULL', [p.id]);
          for (const ph of photos) {
            const newPath = await copyMediaFile(ph.path, 'products');
            await connection.execute(
              'INSERT INTO product_photos (product_id, filename, path, media_type, is_primary, sort_order) VALUES (?,?,?,?,?,?)',
              [newProductId, ph.filename, newPath, ph.media_type, ph.is_primary, ph.sort_order]
            );
          }
        }

        if (mainWarehouseId) {
          await connection.execute('INSERT INTO warehouse_stocks (warehouse_id, product_id, variant_id, quantity) VALUES (?,?,NULL,0)', [mainWarehouseId, newProductId]);
        }

        cloned += 1;
      }
    }

    await connection.commit();
    res.status(201).json({ success: true, data: { id: newBranchId, cloned_products: cloned } });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
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
