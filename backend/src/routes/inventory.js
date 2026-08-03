const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');

const router = express.Router();
router.use(authenticate);
const mutationTypes = new Set(['purchase', 'adjustment', 'sale_return', 'damage', 'loss', 'gift']);
const historyMutationTypes = new Set(['sale', 'purchase', 'adjustment', 'transfer_in', 'transfer_out', 'sale_return', 'damage', 'loss', 'gift']);

router.get('/warehouses', async (req, res, next) => {
  try {
    const requestedBranch = Number(req.query.branch_id);
    const branchId = req.user.role === 'owner' && Number.isInteger(requestedBranch) ? requestedBranch : req.user.branch_id;
    const [warehouses] = await db.execute('SELECT id, name, description, type FROM warehouses WHERE branch_id = ? AND is_active = TRUE ORDER BY name', [branchId]);
    res.json({ success: true, data: warehouses });
  } catch (error) { next(error); }
});

// GET /api/inventory/warehouses/all — semua gudang flat lintas cabang (owner).
// Non-owner melihat gudang cabangnya sendiri.
router.get('/warehouses/all', async (req, res, next) => {
  try {
    const role = req.user.role;
    // Owner: semua gudang lintas cabang. Admin Gudang: semua gudang di cabang
    // bertipe 'gudang'. Lainnya: gudang cabangnya sendiri.
    let warehouses;
    if (role === 'owner') {
      [warehouses] = await db.execute('SELECT w.id, w.name, w.description, w.type, w.branch_id, b.name AS branch_name FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.is_active = TRUE AND b.is_active = TRUE ORDER BY b.name, w.name');
    } else if (role === 'gudang') {
      [warehouses] = await db.execute('SELECT w.id, w.name, w.description, w.type, w.branch_id, b.name AS branch_name FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.is_active = TRUE AND b.is_active = TRUE AND b.type = \'gudang\' ORDER BY b.name, w.name');
    } else {
      [warehouses] = await db.execute('SELECT w.id, w.name, w.description, w.type, w.branch_id, b.name AS branch_name FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.branch_id = ? AND w.is_active = TRUE ORDER BY w.name', [req.user.branch_id]);
    }
    res.json({ success: true, data: warehouses });
  } catch (error) { next(error); }
});

router.post('/warehouses', authorize('owner', 'manager', 'admin', 'gudang'), async (req, res, next) => {
  try {
    const { name, description, type } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Nama gudang wajib diisi' });
    const whType = ['utama', 'cadangan', 'reject'].includes(type) ? type : 'utama';
    const [result] = await db.execute('INSERT INTO warehouses (branch_id, name, description, type) VALUES (?, ?, ?, ?)', [req.user.branch_id, name.trim(), description?.trim() || null, whType]);
    res.status(201).json({ success: true, data: { id: result.insertId, name: name.trim(), type: whType } });
  } catch (error) { next(error); }
});

// Rename / ubah tipe gudang.
router.put('/warehouses/:id', authorize('owner', 'manager', 'admin', 'gudang'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, description, type } = req.body;
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID gudang tidak valid' });
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Nama gudang wajib diisi' });
    const whType = ['utama', 'cadangan', 'reject'].includes(type) ? type : 'utama';
    const [r] = await db.execute('UPDATE warehouses SET name = ?, description = ?, type = ? WHERE id = ? AND branch_id = ?', [name.trim(), description?.trim() || null, whType, id, req.user.branch_id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Gudang tidak ditemukan' });
    res.json({ success: true, data: { id, name: name.trim(), type: whType } });
  } catch (error) { next(error); }
});

// Hapus gudang. Tolak jika masih ada stok atau riwayat
// (mutasi/opname/transfer) karena itu jejak audit.
router.delete('/warehouses/:id', authorize('owner', 'manager', 'admin', 'gudang'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID gudang tidak valid' });
    const [wh] = await db.execute('SELECT id, branch_id FROM warehouses WHERE id = ? AND branch_id = ?', [id, req.user.branch_id]);
    if (!wh[0]) return res.status(404).json({ success: false, message: 'Gudang tidak ditemukan' });
    const [stk] = await db.execute('SELECT COALESCE(SUM(quantity),0) AS qty, COUNT(*) AS rows FROM warehouse_stocks WHERE warehouse_id = ?', [id]);
    if (Number(stk[0].qty) > 0 || Number(stk[0].rows) > 0) return res.status(400).json({ success: false, message: 'Gudang masih memiliki stok — pindahkan dulu stoknya sebelum dihapus' });
    const [hist] = await db.execute(
      `SELECT (SELECT COUNT(*) FROM stock_mutations WHERE warehouse_id=?) +
              (SELECT COUNT(*) FROM stock_opnames WHERE warehouse_id=?) +
              (SELECT COUNT(*) FROM stock_transfers WHERE from_warehouse_id=? OR to_warehouse_id=?) AS cnt`,
      [id, id, id, id]
    );
    if (Number(hist[0].cnt) > 0) return res.status(400).json({ success: false, message: 'Gudang pernah memiliki riwayat mutasi — tidak bisa dihapus. Nonaktifkan saja.' });
    await db.execute('DELETE FROM warehouses WHERE id = ?', [id]);
    res.json({ success: true, message: 'Gudang dihapus' });
  } catch (error) { next(error); }
});

router.get('/mutations', async (req, res, next) => {
  try {
    const requestedBranch = Number(req.query.branch_id);
    const branchId = req.user.role === 'owner' && Number.isInteger(requestedBranch) ? requestedBranch : req.user.branch_id;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(10, Number.parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const params = [branchId];
    let where = 'WHERE sm.branch_id = ?';

    if (req.query.product_id && Number.isInteger(Number(req.query.product_id))) {
      where += ' AND sm.product_id = ?';
      params.push(Number(req.query.product_id));
    }
    if (req.query.type && historyMutationTypes.has(req.query.type)) {
      where += ' AND sm.type = ?';
      params.push(req.query.type);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date_from || '')) {
      where += ' AND sm.created_at >= ?';
      params.push(req.query.date_from + ' 00:00:00');
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date_to || '')) {
      where += ' AND sm.created_at <= ?';
      params.push(req.query.date_to + ' 23:59:59');
    }

    const selectSql =
      'SELECT sm.id, sm.type, sm.reference_type, sm.reference_id, sm.channel, sm.qty, sm.stock_before, sm.stock_after, sm.notes, sm.created_at, ' +
      'p.name AS product_name, p.sku AS product_sku, pv.color AS variant_color, ' +
      'w.name AS warehouse_name, u.name AS user_name, b.name AS branch_name ' +
      'FROM stock_mutations sm ' +
      'JOIN products p ON p.id = sm.product_id ' +
      'JOIN branches b ON b.id = sm.branch_id ' +
      'LEFT JOIN product_variants pv ON pv.id = sm.variant_id ' +
      'LEFT JOIN warehouses w ON w.id = sm.warehouse_id ' +
      'LEFT JOIN users u ON u.id = sm.user_id ' +
      where + ` ORDER BY sm.created_at DESC, sm.id DESC LIMIT ${limit} OFFSET ${offset}`;
    const [rows] = await db.execute(selectSql, params);
    const [counts] = await db.execute('SELECT COUNT(*) AS total FROM stock_mutations sm ' + where, params);
    res.json({ success: true, data: rows, total: counts[0].total, page, totalPages: Math.ceil(counts[0].total / limit) });
  } catch (error) { next(error); }
});

router.get('/barcode-items', async (req, res, next) => {
  try {
    const requestedBranch = Number(req.query.branch_id);
    const branchId = req.user.role === 'owner' && Number.isInteger(requestedBranch) ? requestedBranch : req.user.branch_id;
    const term = String(req.query.search || '').trim();
    const params = [branchId];
    let where = 'WHERE p.branch_id = ? AND p.is_active = TRUE';
    if (term) {
      where += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR pv.sku LIKE ? OR pv.barcode LIKE ? OR pv.color LIKE ?)';
      const like = '%' + term + '%';
      params.push(like, like, like, like, like, like);
    }
    const sql =
      'SELECT p.id AS product_id, p.name, p.sku AS product_sku, p.barcode AS product_barcode, p.price, ' +
      'pv.id AS variant_id, pv.color AS variant_color, pv.sku AS variant_sku, pv.barcode AS variant_barcode, ' +
      'COALESCE(NULLIF(pv.barcode, \'\'), NULLIF(pv.sku, \'\'), NULLIF(p.barcode, \'\'), NULLIF(p.sku, \'\')) AS barcode_value ' +
      'FROM products p LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = TRUE ' +
      where + ' ORDER BY p.name, pv.color, pv.id LIMIT 500';
    const [rows] = await db.execute(sql, params);
    res.json({ success: true, data: rows.filter((row) => row.barcode_value) });
  } catch (error) { next(error); }
});

router.get('/stock', async (req, res, next) => {
  try {
    const warehouseId = Number(req.query.warehouse_id);
    if (!Number.isInteger(warehouseId)) return res.status(400).json({ success: false, message: 'warehouse_id wajib diisi' });
    const requestedBranch = Number(req.query.branch_id);
    const branchId = req.user.role === 'owner' && Number.isInteger(requestedBranch) ? requestedBranch : req.user.branch_id;
    const [rows] = await db.execute(
      `SELECT ws.product_id, ws.variant_id, ws.quantity, ws.reserved_quantity, p.name, p.sku, p.min_stock, pv.color AS variant_color
       FROM warehouse_stocks ws
       JOIN warehouses w ON w.id = ws.warehouse_id
       JOIN products p ON p.id = ws.product_id
       LEFT JOIN product_variants pv ON pv.id = ws.variant_id
       WHERE ws.warehouse_id = ? AND w.branch_id = ?
       UNION ALL
       SELECT p.id AS product_id, pv.id AS variant_id, 0 AS quantity, 0 AS reserved_quantity, p.name, p.sku, p.min_stock, pv.color AS variant_color
       FROM products p
       JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = TRUE
       WHERE p.branch_id = ? AND p.is_active = TRUE
         AND NOT EXISTS (SELECT 1 FROM warehouse_stocks ws2 WHERE ws2.warehouse_id = ? AND ws2.product_id = p.id AND ws2.variant_id = pv.id)
       ORDER BY name, variant_color`,
      [warehouseId, branchId, branchId, warehouseId]
    );
    res.json({ success: true, data: rows, branch_id: branchId });
  } catch (error) { next(error); }
});

// GET /api/inventory/stock-total — total stock per product across all warehouses
// Owner: ?branch_id=N for one branch, ?branch_id=all for all branches (default = own branch)
router.get('/stock-total', async (req, res, next) => {
  try {
    const showAll = req.user.role === 'owner' && req.query.branch_id === 'all';
    const branchId = showAll ? null : (req.user.role === 'owner' ? (Number(req.query.branch_id) || req.user.branch_id) : req.user.branch_id);
    const search = (req.query.search || '').trim();
    const categoryId = Number(req.query.category_id) || null;

    let where = 'WHERE p.is_active = TRUE';
    const params = [];
    if (!showAll) { where += ' AND p.branch_id = ?'; params.push(branchId); }
    if (search) { where += ' AND (p.name LIKE ? OR p.sku LIKE ?)'; const s = `%${search}%`; params.push(s, s); }
    if (categoryId) { where += ' AND p.category_id = ?'; params.push(categoryId); }

    const [rows] = await db.execute(
      `SELECT p.id, p.name, p.sku, p.stock AS product_stock, p.min_stock, c.name AS category_name, b.name AS branch_name,
              COALESCE(SUM(ws.quantity), 0) AS total_stock,
              COALESCE(SUM(ws.reserved_quantity), 0) AS reserved,
              (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = TRUE) AS variant_count,
              (SELECT GROUP_CONCAT(DISTINCT pv.color SEPARATOR '|') FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = TRUE AND pv.color IS NOT NULL AND pv.color <> '') AS colors
       FROM products p
       JOIN branches b ON b.id = p.branch_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN warehouse_stocks ws ON ws.product_id = p.id
       ${where}
       GROUP BY p.id, p.name, p.sku, p.stock, p.min_stock, c.name, b.name
       ORDER BY b.name, p.name ASC`,
      params
    );

    // Summary
    const totalProducts = rows.length;
    const totalStock = rows.reduce((sum, r) => sum + Number(r.total_stock || 0), 0);
    const lowStock = rows.filter((r) => Number(r.total_stock) <= Number(r.min_stock)).length;
    const outOfStock = rows.filter((r) => Number(r.total_stock) === 0).length;
    const totalBranches = showAll ? [...new Set(rows.map((r) => r.branch_name))].length : 1;

    res.json({
      success: true,
      data: {
        summary: { total_products: totalProducts, total_stock: totalStock, low_stock: lowStock, out_of_stock: outOfStock, total_branches: totalBranches },
        products: rows,
        branch_mode: showAll ? 'all' : 'single',
      },
    });
  } catch (error) { next(error); }
});

// GET /api/inventory/stock-by-warehouse — stok per gudang lintas cabang (owner: ?branch_id=all atau tanpa filter)
router.get('/stock-by-warehouse', async (req, res, next) => {
  try {
    const showAll = req.user.role === 'owner' && (req.query.branch_id === 'all' || !req.query.branch_id);
    const branchId = req.user.role === 'owner' && Number.isInteger(Number(req.query.branch_id)) ? Number(req.query.branch_id) : req.user.branch_id;
    const search = (req.query.search || '').trim();
    const categoryId = Number(req.query.category_id) || null;

    let where = 'WHERE w.is_active = TRUE AND p.is_active = TRUE';
    const params = [];
    if (!showAll) { where += ' AND w.branch_id = ?'; params.push(branchId); }
    if (search) { where += ' AND (p.name LIKE ? OR p.sku LIKE ?)'; const s = `%${search}%`; params.push(s, s); }
    if (categoryId) { where += ' AND p.category_id = ?'; params.push(categoryId); }

    const [rows] = await db.execute(
      `SELECT b.name AS branch_name, w.id AS warehouse_id, w.name AS warehouse_name,
              ws.product_id, p.name AS product_name, p.sku, pv.id AS variant_id, pv.color AS variant_color,
              COALESCE(ws.quantity, 0) AS quantity, COALESCE(ws.reserved_quantity, 0) AS reserved,
              p.min_stock
       FROM warehouse_stocks ws
       JOIN warehouses w ON w.id = ws.warehouse_id
       JOIN branches b ON b.id = w.branch_id
       JOIN products p ON p.id = ws.product_id
       LEFT JOIN product_variants pv ON pv.id = ws.variant_id
       ${where}
       ORDER BY b.name, w.name, p.name, pv.color`,
      params
    );

    res.json({ success: true, data: rows, branch_mode: showAll ? 'all' : 'single' });
  } catch (error) { next(error); }
});

// GET /api/inventory/channels — saluran penjualan (Keperluan/saluran)
router.get('/channels', async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT id, value, name, is_active FROM sales_channels ORDER BY sort_order, id');
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

// POST /api/inventory/channels — tambah saluran
router.post('/channels', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const { value, name } = req.body;
    const val = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!val || !name?.trim()) return res.status(400).json({ success: false, message: 'Nilai dan nama saluran wajib diisi' });
    const [exists] = await db.execute('SELECT id FROM sales_channels WHERE value=?', [val]);
    if (exists[0]) return res.status(400).json({ success: false, message: 'Nilai saluran sudah ada' });
    const [r] = await db.execute('INSERT INTO sales_channels (value, name, sort_order) VALUES (?,?,?)', [val, name.trim(), 99]);
    res.status(201).json({ success: true, data: { id: r.insertId, value: val, name: name.trim() } });
  } catch (error) { next(error); }
});

// PUT /api/inventory/channels/:id — edit saluran (nama / aktif)
router.put('/channels/:id', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, is_active: isActive } = req.body;
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID tidak valid' });
    if (name == null && isActive == null) return res.status(400).json({ success: false, message: 'Tidak ada perubahan' });
    if (name != null && !name?.trim()) return res.status(400).json({ success: false, message: 'Nama wajib diisi' });
    const sets = [];
    const values = [];
    if (name != null) { sets.push('name = ?'); values.push(name.trim()); }
    if (isActive != null) { sets.push('is_active = ?'); values.push(isActive ? 1 : 0); }
    values.push(id);
    const [r] = await db.execute(`UPDATE sales_channels SET ${sets.join(', ')} WHERE id = ?`, values);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Saluran tidak ditemukan' });
    res.json({ success: true });
  } catch (error) { next(error); }
});

// DELETE /api/inventory/channels/:id — hapus saluran
router.delete('/channels/:id', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID tidak valid' });
    const [r] = await db.execute('DELETE FROM sales_channels WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Saluran tidak ditemukan' });
    res.json({ success: true });
  } catch (error) { next(error); }
});


// GET /api/inventory/mutation-report — rekap riwayat barang masuk/keluar (per batch)
// type: in | out (default in). Filter: start, end, description, limit/offset.
router.get('/mutation-report', authorize('owner','manager','admin','gudang'), async (req,res,next)=>{
  try{
    const type = req.query.type === 'out' ? 'out' : 'in';
    const refType = type === 'out' ? 'manual_outgoing' : 'manual_incoming';
    const branchId = req.user.role === 'owner' ? null : req.user.branch_id;
    const start = /^\d{4}-\d{2}-\d{2}$/.test(req.query.start||'') ? req.query.start : null;
    const end = /^\d{4}-\d{2}-\d{2}$/.test(req.query.end||'') ? req.query.end : null;
    const desc = (req.query.description||'').trim();
    const limit = Math.min(500, Math.max(10, Number.parseInt(req.query.limit,10)||50));
    const offset = Math.max(0, Number.parseInt(req.query.offset,10)||0);

    let where = "WHERE sm.reference_type = ? AND sm.reference_id IS NOT NULL";
    const params = [refType];
    if (branchId) { where += ' AND sm.branch_id = ?'; params.push(branchId); }
    if (start) { where += ' AND DATE(sm.created_at) >= ?'; params.push(start); }
    if (end) { where += ' AND DATE(sm.created_at) <= ?'; params.push(end); }
    if (desc) { where += ' AND sm.notes LIKE ?'; params.push('%'+desc+'%'); }

    // Kelompokkan per batch (reference_id) lalu agregat produk
    const [rows] = await db.execute(
      `SELECT sm.reference_id AS batch_id,
              MIN(sm.created_at) AS created_at,
              MIN(w.name) AS warehouse_name,
              MIN(u.name) AS admin_name,
              MIN(COALESCE(sm.notes,'')) AS description,
              MIN(sm.channel) AS channel,
              COUNT(DISTINCT sm.product_id) AS product_count,
              SUM(ABS(sm.qty)) AS total_qty
       FROM stock_mutations sm
       JOIN warehouses w ON w.id = sm.warehouse_id
       JOIN users u ON u.id = sm.user_id
       ${where}
       GROUP BY sm.reference_id
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    // Ambil detail produk per batch (kode + qty)
    const batchIds = rows.map(r=>r.batch_id);
    let productsByBatch = {};
    if (batchIds.length) {
      const ph = batchIds.map(()=>'?').join(',');
      const [items] = await db.execute(
        `SELECT sm.reference_id AS batch_id, p.sku AS code, SUM(ABS(sm.qty)) AS qty
         FROM stock_mutations sm JOIN products p ON p.id = sm.product_id
         WHERE sm.reference_type = ? AND sm.reference_id IN (${ph})
         GROUP BY sm.reference_id, p.id ORDER BY p.sku`,
        [refType, ...batchIds]
      );
      for (const it of items) {
        if (!productsByBatch[it.batch_id]) productsByBatch[it.batch_id] = [];
        productsByBatch[it.batch_id].push({ code: it.code, qty: Number(it.qty) });
      }
    }

    const data = rows.map(r => ({
      id: r.batch_id,
      date: new Date(r.created_at).toISOString().slice(0,10),
      number: (type==='out'?'OUT':'IN') + '-' + new Date(r.created_at).toISOString().replace(/[-:T]/g,'').slice(0,14),
      warehouse: r.warehouse_name,
      products: productsByBatch[r.batch_id] || [],
      total_qty: Number(r.total_qty),
      product_count: Number(r.product_count),
      description: r.description || '',
      channel: r.channel || null,
      admin: r.admin_name
    }));

    // Summary: product count & total qty keseluruhan (tanpa pagination)
    let summary = { product_count: 0, total_qty: 0 };
    const [sumRows] = await db.execute(
      `SELECT COUNT(DISTINCT sm.product_id) AS product_count, COALESCE(SUM(ABS(sm.qty)),0) AS total_qty
       FROM stock_mutations sm
       ${where}`,
      params
    );
    summary = { product_count: Number(sumRows[0].product_count), total_qty: Number(sumRows[0].total_qty) };

    res.json({ success:true, data: data, summary, type, total: data.length });
  }catch(e){ next(e); }
});

// DELETE /api/inventory/mutation-report/:type/:batchId — hapus batch + balikin stok
router.delete('/mutation-report/:type/:batchId', authorize('owner','manager','admin'), async (req,res,next)=>{
  const conn = await db.getConnection();
  try{
    const batchId = Number(req.params.batchId);
    const type = req.params.type === 'out' ? 'out' : 'in';
    const refType = type === 'out' ? 'manual_outgoing' : 'manual_incoming';
    if (!Number.isInteger(batchId)) return res.status(400).json({success:false,message:'ID batch tidak valid'});
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      'SELECT id, warehouse_id, product_id, variant_id, qty FROM stock_mutations WHERE reference_type=? AND reference_id=?',
      [refType, batchId]
    );
    if (!rows.length) { await conn.rollback(); return res.status(404).json({success:false,message:'Batch tidak ditemukan'}); }
    for (const r of rows) {
      const sign = type === 'out' ? 1 : -1; // balikin stok: keluar -> tambah, masuk -> kurangi
      await conn.execute('UPDATE warehouse_stocks SET quantity = quantity + ? WHERE warehouse_id=? AND product_id=? AND variant_id <=> ?', [sign*r.qty, r.warehouse_id, r.product_id, r.variant_id]);
      await conn.execute('UPDATE products SET stock = stock + ? WHERE id=?', [sign*r.qty, r.product_id]);
      if (r.variant_id) await conn.execute('UPDATE product_variants SET stock = stock + ? WHERE id=?', [sign*r.qty, r.variant_id]);
      await conn.execute('DELETE FROM stock_mutations WHERE id=?', [r.id]);
    }
    await conn.commit();
    res.json({success:true,message:'Batch dihapus dan stok dikembalikan.'});
  }catch(e){await conn.rollback();next(e);}finally{conn.release();}
});

router.post('/mutations', authorize('owner', 'manager', 'admin', 'gudang'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { warehouse_id: warehouseId, product_id: productId, variant_id: variantId = null, qty, type, notes } = req.body;
    const quantity = Number(qty);
    if (!Number.isInteger(Number(warehouseId)) || !Number.isInteger(Number(productId)) || !Number.isInteger(quantity) || quantity === 0 || !mutationTypes.has(type)) {
      return res.status(400).json({ success: false, message: 'Data mutasi tidak valid' });
    }
    await connection.beginTransaction();
    const [warehouses] = await connection.execute('SELECT id FROM warehouses WHERE id = ? AND branch_id = ? AND is_active = TRUE FOR UPDATE', [warehouseId, req.user.branch_id]);
    const [products] = await connection.execute('SELECT id, stock FROM products WHERE id = ? AND branch_id = ? AND is_active = TRUE FOR UPDATE', [productId, req.user.branch_id]);
    if (!warehouses[0] || !products[0]) throw Object.assign(new Error('Gudang atau produk tidak ditemukan'), { status: 404 });
    const [balances] = await connection.execute('SELECT id, quantity FROM warehouse_stocks WHERE warehouse_id = ? AND product_id = ? AND variant_id <=> ? FOR UPDATE', [warehouseId, productId, variantId]);
    const before = balances[0]?.quantity || 0;
    const after = before + quantity;
    if (after < 0) throw Object.assign(new Error('Stok gudang tidak mencukupi'), { status: 400 });
    if (balances[0]) await connection.execute('UPDATE warehouse_stocks SET quantity = ? WHERE id = ?', [after, balances[0].id]);
    else await connection.execute('INSERT INTO warehouse_stocks (warehouse_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)', [warehouseId, productId, variantId, after]);
    const branchStock = products[0].stock + quantity;
    if (branchStock < 0) throw Object.assign(new Error('Stok cabang tidak mencukupi'), { status: 400 });
    await connection.execute('UPDATE products SET stock = ? WHERE id = ?', [branchStock, productId]);
    if (variantId) await connection.execute('UPDATE product_variants SET stock = stock + ? WHERE id = ? AND product_id = ?', [quantity, variantId, productId]);
    const [result] = await connection.execute(
      `INSERT INTO stock_mutations (branch_id, warehouse_id, product_id, variant_id, user_id, type, qty, stock_before, stock_after, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.branch_id, warehouseId, productId, variantId, req.user.id, type, quantity, before, after, notes?.trim() || null]
    );
    await connection.execute('INSERT INTO activity_logs (user_id, action, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)', [req.user.id, 'stock_mutation', `${type}: product ${productId}, qty ${quantity}`, req.ip, req.get('user-agent') || null]);
    await connection.commit();
    res.status(201).json({ success: true, data: { id: result.insertId, stock_before: before, stock_after: after } });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally { connection.release(); }
});

router.get('/incoming/targets', authorize('owner','manager','admin','gudang'), async (req,res,next)=>{try{let rows;if(req.user.role==='owner'){[rows]=await db.execute('SELECT id,name,type FROM branches WHERE is_active=TRUE ORDER BY name');}else if(req.user.role==='gudang'){[rows]=await db.execute('SELECT id,name,type FROM branches WHERE is_active=TRUE AND type=\'gudang\' ORDER BY name');}else{[rows]=await db.execute('SELECT id,name,type FROM branches WHERE id=? AND is_active=TRUE',[req.user.branch_id]);}res.json({success:true,data:rows});}catch(e){next(e);}});
router.get('/incoming/products', authorize('owner','manager','admin','gudang'), async (req,res,next)=>{try{const requested=Number(req.query.branch_id),branchId=req.user.role==='owner'&&Number.isInteger(requested)?requested:req.user.branch_id;const[rows]=await db.execute(`SELECT p.id,p.name,p.sku,p.cost,pv.id AS variant_id,pv.color FROM products p LEFT JOIN product_variants pv ON pv.product_id=p.id AND pv.is_active=TRUE WHERE p.branch_id=? AND p.is_active=TRUE ORDER BY p.name,pv.color`,[branchId]);const products=[];for(const row of rows){let product=products.find(item=>item.id===row.id);if(!product){product={id:row.id,name:row.name,sku:row.sku,cost:row.cost,variants:[]};products.push(product);}if(row.variant_id)product.variants.push({id:row.variant_id,color:row.color});}res.json({success:true,data:products});}catch(e){next(e);}});
router.post('/incoming', authorize('owner', 'manager', 'admin', 'gudang'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const requestedBranch=Number(req.body.branch_id), branchId=(req.user.role==='owner'||req.user.role==='gudang')&&Number.isInteger(requestedBranch)?requestedBranch:req.user.branch_id, items=req.body.items;
    if(!Array.isArray(items)||!items.length) return res.status(400).json({success:false,message:'Tambahkan minimal satu produk masuk'});
    if(req.user.role==='gudang'&&Number.isInteger(requestedBranch)){const[gb]=await connection.execute('SELECT id FROM branches WHERE id=? AND is_active=TRUE AND type=\'gudang\'',[requestedBranch]);if(!gb[0])return res.status(403).json({success:false,message:'Admin gudang hanya bisa input ke cabang tipe gudang'});}
    await connection.beginTransaction();
    const batchRef=Date.now();
    const [warehouses]=await connection.execute('SELECT id FROM warehouses WHERE branch_id=? AND is_active=TRUE ORDER BY id LIMIT 1 FOR UPDATE',[branchId]); if(!warehouses[0]) throw Object.assign(new Error('Gudang aktif toko tujuan tidak ditemukan'),{status:404});
    for(const input of items){const productId=Number(input.product_id),variantId=input.variant_id?Number(input.variant_id):null,quantity=Number(input.quantity),cost=input.cost===''||input.cost===undefined?null:Number(input.cost);if(!Number.isInteger(productId)||!Number.isInteger(quantity)||quantity<=0||(cost!==null&&(!Number.isFinite(cost)||cost<0)))throw Object.assign(new Error('Data item produk masuk tidak valid'),{status:400});const[products]=await connection.execute('SELECT id FROM products WHERE id=? AND branch_id=? AND is_active=TRUE FOR UPDATE',[productId,branchId]);if(!products[0])throw Object.assign(new Error('Produk tidak ditemukan di toko tujuan'),{status:404});if(variantId){const[variants]=await connection.execute('SELECT id FROM product_variants WHERE id=? AND product_id=? AND is_active=TRUE FOR UPDATE',[variantId,productId]);if(!variants[0])throw Object.assign(new Error('Varian warna tidak ditemukan'),{status:404});}const[balances]=await connection.execute('SELECT id,quantity FROM warehouse_stocks WHERE warehouse_id=? AND product_id=? AND variant_id <=> ? FOR UPDATE',[warehouses[0].id,productId,variantId]);const before=Number(balances[0]?.quantity||0),after=before+quantity;if(balances[0])await connection.execute('UPDATE warehouse_stocks SET quantity=? WHERE id=?',[after,balances[0].id]);else await connection.execute('INSERT INTO warehouse_stocks (warehouse_id,product_id,variant_id,quantity) VALUES (?,?,?,?)',[warehouses[0].id,productId,variantId,after]);await connection.execute('UPDATE products SET stock=stock+?,cost=COALESCE(?,cost) WHERE id=?',[quantity,cost,productId]);if(variantId)await connection.execute('UPDATE product_variants SET stock=stock+? WHERE id=?',[quantity,variantId]);await connection.execute(`INSERT INTO stock_mutations (branch_id,warehouse_id,product_id,variant_id,user_id,type,reference_type,reference_id,qty,stock_before,stock_after,notes) VALUES (?,?,?,?,?, 'purchase','manual_incoming',?,?,?,?,?)`,[branchId,warehouses[0].id,productId,variantId,req.user.id,batchRef,quantity,before,after,req.body.notes?.trim()||null]);}
    await connection.execute('INSERT INTO activity_logs (user_id,action,description,ip_address,user_agent) VALUES (?,?,?,?,?)',[req.user.id,'incoming_stock','Produk masuk '+items.length+' item ke toko '+branchId,req.ip,req.get('user-agent')||null]);await connection.commit();res.status(201).json({success:true,data:{items:items.length,branch_id:branchId}});
  }catch(error){await connection.rollback();next(error);}finally{connection.release();}
});
router.post('/outgoing', authorize('owner','manager','admin','gudang'), async (req,res,next)=>{
  const connection=await db.getConnection();
  try{const requestedBranch=Number(req.body.branch_id),branchId=(req.user.role==='owner'||req.user.role==='gudang')&&Number.isInteger(requestedBranch)?requestedBranch:req.user.branch_id,items=req.body.items,channel=(req.body.channel||'').trim()||'toko';if(!Array.isArray(items)||!items.length)return res.status(400).json({success:false,message:'Tambahkan minimal satu produk keluar'});if(req.user.role==='gudang'&&Number.isInteger(requestedBranch)){const[gb]=await connection.execute('SELECT id FROM branches WHERE id=? AND is_active=TRUE AND type=\'gudang\'',[requestedBranch]);if(!gb[0])return res.status(403).json({success:false,message:'Admin gudang hanya bisa input ke cabang tipe gudang'});}await connection.beginTransaction();const batchRef=Date.now();const[warehouses]=await connection.execute('SELECT id FROM warehouses WHERE branch_id=? AND is_active=TRUE ORDER BY id LIMIT 1 FOR UPDATE',[branchId]);if(!warehouses[0])throw Object.assign(new Error('Gudang aktif toko tidak ditemukan'),{status:404});for(const input of items){const productId=Number(input.product_id),variantId=input.variant_id?Number(input.variant_id):null,quantity=Number(input.quantity);if(!Number.isInteger(productId)||!Number.isInteger(quantity)||quantity<=0)throw Object.assign(new Error('Data item produk keluar tidak valid'),{status:400});const[products]=await connection.execute('SELECT id,stock FROM products WHERE id=? AND branch_id=? AND is_active=TRUE FOR UPDATE',[productId,branchId]);if(!products[0])throw Object.assign(new Error('Produk tidak ditemukan di toko asal'),{status:404});if(variantId){const[variants]=await connection.execute('SELECT id,stock FROM product_variants WHERE id=? AND product_id=? AND is_active=TRUE FOR UPDATE',[variantId,productId]);if(!variants[0])throw Object.assign(new Error('Varian warna tidak ditemukan'),{status:404});if(variants[0].stock<quantity)throw Object.assign(new Error('Stok varian warna tidak mencukupi'),{status:400});}const[balances]=await connection.execute('SELECT id,quantity FROM warehouse_stocks WHERE warehouse_id=? AND product_id=? AND variant_id <=> ? FOR UPDATE',[warehouses[0].id,productId,variantId]);const before=Number(balances[0]?.quantity||0),after=before-quantity;if(after<0)throw Object.assign(new Error('Stok produk tidak mencukupi'),{status:400});if(balances[0])await connection.execute('UPDATE warehouse_stocks SET quantity=? WHERE id=?',[after,balances[0].id]);else await connection.execute('INSERT INTO warehouse_stocks (warehouse_id,product_id,variant_id,quantity) VALUES (?,?,?,?)',[warehouses[0].id,productId,variantId,after]);await connection.execute('UPDATE products SET stock=stock-? WHERE id=?',[quantity,productId]);if(variantId)await connection.execute('UPDATE product_variants SET stock=stock-? WHERE id=?',[quantity,variantId]);await connection.execute(`INSERT INTO stock_mutations (branch_id,warehouse_id,product_id,variant_id,user_id,type,reference_type,reference_id,channel,qty,stock_before,stock_after,notes) VALUES (?,?,?,?,?, 'adjustment','manual_outgoing',?,?,?,?,?,?)`,[branchId,warehouses[0].id,productId,variantId,req.user.id,batchRef,channel,-quantity,before,after,req.body.notes?.trim()||null]);}await connection.execute('INSERT INTO activity_logs (user_id,action,description,ip_address,user_agent) VALUES (?,?,?,?,?)',[req.user.id,'outgoing_stock','Produk keluar '+items.length+' item dari toko '+branchId+' ('+channel+')',req.ip,req.get('user-agent')||null]);await connection.commit();res.status(201).json({success:true,data:{items:items.length,branch_id:branchId,channel}});}catch(error){await connection.rollback();next(error);}finally{connection.release();}
});

module.exports = router;
