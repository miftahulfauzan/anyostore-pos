const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/public/branches – list active branches for landing selector
router.get('/branches', async (_req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT id, name, address, phone FROM branches WHERE is_active=TRUE ORDER BY id');
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// GET /api/public/settings – store info + WA numbers (multi admin)
router.get('/settings', async (req, res, next) => {
  try {
    const branchId = Number(req.query.branch_id) || null;
    let effectiveBranchId = branchId;
    if (!effectiveBranchId) {
      const [gudang] = await db.execute("SELECT id FROM branches WHERE LOWER(TRIM(name)) = 'gudang utama' AND is_active=TRUE ORDER BY id LIMIT 1");
      if (gudang[0]) effectiveBranchId = gudang[0].id;
      else {
        const [gudangLike] = await db.execute("SELECT id FROM branches WHERE name LIKE '%gudang%utama%' AND is_active=TRUE ORDER BY id LIMIT 1");
        effectiveBranchId = gudangLike[0]?.id || null;
        if (!effectiveBranchId) {
          const [first] = await db.execute('SELECT id FROM branches WHERE is_active=TRUE ORDER BY id LIMIT 1');
          if (first[0]) effectiveBranchId = first[0].id;
        }
      }
    }
    if (!effectiveBranchId) return res.json({ success: true, data: { branch_id: null, store_name: 'Anyostore', whatsapp: '', whatsapp_numbers: [] } });

    const [branchRows] = await db.execute('SELECT id, name, address, phone FROM branches WHERE id=? LIMIT 1', [effectiveBranchId]);
    const [settingsRows] = await db.execute('SELECT `key`, `value` FROM store_settings WHERE branch_id=?', [effectiveBranchId]);
    const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const branch = branchRows[0];

    // collect multi WA: whatsapp_number, whatsapp_number_2, _3, whatsapp_numbers JSON
    let waList = [];
    try {
      if (settings.whatsapp_numbers) {
        const parsed = JSON.parse(settings.whatsapp_numbers);
        if (Array.isArray(parsed)) waList = parsed.filter(Boolean);
      }
    } catch {}
    // legacy keys
    ['whatsapp_number','whatsapp_number_2','whatsapp_number_3','whatsapp_admin_1','whatsapp_admin_2','whatsapp_admin_3'].forEach((k) => {
      if (settings[k] && !waList.includes(settings[k])) waList.push(settings[k]);
    });
    if (!waList.length) {
      const fallback = settings.store_phone || branch?.phone || '';
      if (fallback) waList = [fallback];
    }
    // dedup
    waList = [...new Set(waList.filter(Boolean))];

    res.json({
      success: true,
      data: {
        branch_id: effectiveBranchId,
        store_name: settings.store_name || branch?.name || 'Anyostore',
        store_address: settings.store_address || branch?.address || '',
        store_phone: settings.store_phone || branch?.phone || '',
        whatsapp: waList[0] || '',
        whatsapp_numbers: waList,
        receipt_header: settings.receipt_header || '',
        landing_page_size: [12, 24, 48].includes(Number(settings.landing_page_size)) ? Number(settings.landing_page_size) : 24,
      },
    });
  } catch (e) { next(e); }
});

// GET /api/public/categories
router.get('/categories', async (_req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT id, name, slug FROM categories WHERE is_active=TRUE ORDER BY sort_order, name');
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// GET /api/public/products – from Metro (or branch_id) – only active, no stock check (ready stock badge)
router.get('/products', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 24));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    const branchId = Number(req.query.branch_id) || null;
    const categoryId = Number(req.query.category_id) || null;
    const search = (req.query.search || '').trim();
    const sortMap = {
      newest: 'p.created_at DESC',
      price_asc: 'p.price ASC',
      price_desc: 'p.price DESC',
      name: 'p.name ASC',
    };
    const order = sortMap[req.query.sort] || sortMap.newest;

    // resolve default branch = Gudang Utama (bukan Metro)
    let effectiveBranchId = branchId;
    if (!effectiveBranchId) {
      const [gudang] = await db.execute("SELECT id FROM branches WHERE LOWER(TRIM(name)) = 'gudang utama' AND is_active=TRUE ORDER BY id LIMIT 1");
      effectiveBranchId = gudang[0]?.id || null;
      if (!effectiveBranchId) {
        const [gudangLike] = await db.execute("SELECT id FROM branches WHERE name LIKE '%gudang%utama%' AND is_active=TRUE ORDER BY id LIMIT 1");
        effectiveBranchId = gudangLike[0]?.id || null;
        if (!effectiveBranchId) {
          const [first] = await db.execute('SELECT id FROM branches WHERE is_active=TRUE ORDER BY id LIMIT 1');
          effectiveBranchId = first[0]?.id || null;
        }
      }
    }

    if (!effectiveBranchId) return res.json({ success: true, data: [], total: 0, page, totalPages: 0, branch_id: null });

    let where = 'WHERE p.branch_id=? AND p.is_active=TRUE';
    const params = [effectiveBranchId];
    if (categoryId) { where += ' AND p.category_id=?'; params.push(categoryId); }
    if (search) {
      // Escape user-provided '\', '%' and '_' so they are treated literally
      const esc = search.replace(/[\\%_]/g, (m) => '\\' + m);
      const like = `%${esc}%`;
      where += ' AND (p.name LIKE ? ESCAPE ? OR p.sku LIKE ? ESCAPE ?)';
      params.push(like, '\\', like, '\\');
    }

    const [countRows] = await db.execute(`SELECT COUNT(*) AS total FROM products p ${where}`, params);
    const total = Number(countRows[0].total);

    const [rows] = await db.execute(
      `SELECT p.id, p.name, p.sku, p.price, p.category_id, c.name AS category_name,
              (SELECT pp.path FROM product_photos pp WHERE pp.product_id=p.id AND pp.variant_id IS NULL ORDER BY pp.is_primary DESC, pp.sort_order ASC, pp.id DESC LIMIT 1) AS photo_path,
              (SELECT GROUP_CONCAT(pp.path ORDER BY pp.is_primary DESC, pp.sort_order ASC, pp.id DESC SEPARATOR '||') FROM product_photos pp WHERE pp.product_id=p.id AND pp.variant_id IS NULL AND pp.media_type='image') AS photo_paths,
              (SELECT pp.transform FROM product_photos pp WHERE pp.product_id=p.id AND pp.variant_id IS NULL ORDER BY pp.is_primary DESC, pp.sort_order ASC, pp.id DESC LIMIT 1) AS photo_transform,
              (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active=TRUE) AS variant_count,
              (SELECT GROUP_CONCAT(DISTINCT pv.color ORDER BY pv.color SEPARATOR '|') FROM product_variants pv WHERE pv.product_id=p.id AND pv.is_active=TRUE AND pv.color IS NOT NULL AND pv.color<>'') AS variant_colors,
              (SELECT COALESCE(SUM(ws.quantity),0) FROM warehouse_stocks ws JOIN warehouses w ON w.id=ws.warehouse_id WHERE ws.product_id=p.id AND w.branch_id=p.branch_id) AS total_stock
       FROM products p JOIN categories c ON c.id=p.category_id
        ${where}
        ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
        params
    );

    res.json({ success: true, data: rows, total, page, totalPages: Math.ceil(total / limit), branch_id: effectiveBranchId });
  } catch (e) {
    console.error('[public/products]', e);
    next(e);
  }
});

// GET /api/public/products/:id – detail with gallery (include variant photos as fallback)
router.get('/products/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID tidak valid' });
    const branchId = Number(req.query.branch_id) || null;

    let sql = `SELECT p.id, p.branch_id, p.name, p.description, p.sku, p.price, p.category_id, c.name AS category_name, b.name AS branch_name
               FROM products p JOIN categories c ON c.id=p.category_id JOIN branches b ON b.id=p.branch_id
               WHERE p.id=? AND p.is_active=TRUE`;
    const params = [id];
    if (branchId) { sql += ' AND p.branch_id=?'; params.push(branchId); }

    const [rows] = await db.execute(sql, params);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });

    const [media] = await db.execute(
      `SELECT id, path, media_type, is_primary, sort_order, \`transform\` FROM product_photos WHERE product_id=? ORDER BY is_primary DESC, sort_order ASC, id DESC`,
      [id]
    );
    const [variants] = await db.execute(`SELECT id, color, size, price, (SELECT path FROM product_photos WHERE variant_id=product_variants.id ORDER BY sort_order LIMIT 1) AS photo_path, (SELECT transform FROM product_photos WHERE variant_id=product_variants.id ORDER BY sort_order LIMIT 1) AS photo_transform FROM product_variants WHERE product_id=? AND is_active=TRUE ORDER BY color`, [id]);

    const colors = [...new Set(variants.map(v => v.color).filter(Boolean))];

    res.json({ success: true, data: { ...rows[0], media, variants, colors } });
  } catch (e) { next(e); }
});

module.exports = router;
