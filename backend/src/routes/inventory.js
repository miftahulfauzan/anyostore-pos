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
    const isOwner = req.user.role === 'owner';
    const [warehouses] = isOwner
      ? await db.execute('SELECT w.id, w.name, w.description, w.type, w.branch_id, b.name AS branch_name FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.is_active = TRUE AND b.is_active = TRUE ORDER BY b.name, w.name')
      : await db.execute('SELECT w.id, w.name, w.description, w.type, w.branch_id, b.name AS branch_name FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.branch_id = ? AND w.is_active = TRUE ORDER BY w.name', [req.user.branch_id]);
    res.json({ success: true, data: warehouses });
  } catch (error) { next(error); }
});

router.post('/warehouses', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const { name, description, type } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Nama gudang wajib diisi' });
    const whType = ['utama', 'cadangan', 'reject'].includes(type) ? type : 'utama';
    const [result] = await db.execute('INSERT INTO warehouses (branch_id, name, description, type) VALUES (?, ?, ?, ?)', [req.user.branch_id, name.trim(), description?.trim() || null, whType]);
    res.status(201).json({ success: true, data: { id: result.insertId, name: name.trim(), type: whType } });
  } catch (error) { next(error); }
});

// Rename / ubah tipe gudang (owner/manager/admin).
router.put('/warehouses/:id', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
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

// Hapus gudang (owner/manager/admin). Tolak jika masih ada stok.
router.delete('/warehouses/:id', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID gudang tidak valid' });
    const [wh] = await db.execute('SELECT id, branch_id FROM warehouses WHERE id = ? AND branch_id = ?', [id, req.user.branch_id]);
    if (!wh[0]) return res.status(404).json({ success: false, message: 'Gudang tidak ditemukan' });
    const [stk] = await db.execute('SELECT COALESCE(SUM(quantity),0) AS qty, COUNT(*) AS rows FROM warehouse_stocks WHERE warehouse_id = ?', [id]);
    if (Number(stk[0].qty) > 0 || Number(stk[0].rows) > 0) return res.status(400).json({ success: false, message: 'Gudang masih memiliki stok — pindahkan dulu stoknya sebelum dihapus' });
    await db.execute('DELETE FROM stock_transfers WHERE from_warehouse_id = ? OR to_warehouse_id = ?', [id, id]);
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

router.get('/incoming/targets', authorize('owner','manager','admin','gudang'), async (req,res,next)=>{try{const branchId=req.user.role==='owner'?null:req.user.branch_id;const [rows]=await db.execute(branchId?'SELECT id,name FROM branches WHERE id=? AND is_active=TRUE':'SELECT id,name FROM branches WHERE is_active=TRUE ORDER BY name',branchId?[branchId]:[]);res.json({success:true,data:rows});}catch(e){next(e);}});
router.get('/incoming/products', authorize('owner','manager','admin','gudang'), async (req,res,next)=>{try{const requested=Number(req.query.branch_id),branchId=req.user.role==='owner'&&Number.isInteger(requested)?requested:req.user.branch_id;const[rows]=await db.execute(`SELECT p.id,p.name,p.sku,p.cost,pv.id AS variant_id,pv.color FROM products p LEFT JOIN product_variants pv ON pv.product_id=p.id AND pv.is_active=TRUE WHERE p.branch_id=? AND p.is_active=TRUE ORDER BY p.name,pv.color`,[branchId]);const products=[];for(const row of rows){let product=products.find(item=>item.id===row.id);if(!product){product={id:row.id,name:row.name,sku:row.sku,cost:row.cost,variants:[]};products.push(product);}if(row.variant_id)product.variants.push({id:row.variant_id,color:row.color});}res.json({success:true,data:products});}catch(e){next(e);}});
router.post('/incoming', authorize('owner', 'manager', 'admin', 'gudang'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const requestedBranch=Number(req.body.branch_id), branchId=req.user.role==='owner'&&Number.isInteger(requestedBranch)?requestedBranch:req.user.branch_id, items=req.body.items;
    if(!Array.isArray(items)||!items.length) return res.status(400).json({success:false,message:'Tambahkan minimal satu produk masuk'});
    await connection.beginTransaction();
    const [warehouses]=await connection.execute('SELECT id FROM warehouses WHERE branch_id=? AND is_active=TRUE ORDER BY id LIMIT 1 FOR UPDATE',[branchId]); if(!warehouses[0]) throw Object.assign(new Error('Gudang aktif toko tujuan tidak ditemukan'),{status:404});
    for(const input of items){const productId=Number(input.product_id),variantId=input.variant_id?Number(input.variant_id):null,quantity=Number(input.quantity),cost=input.cost===''||input.cost===undefined?null:Number(input.cost);if(!Number.isInteger(productId)||!Number.isInteger(quantity)||quantity<=0||(cost!==null&&(!Number.isFinite(cost)||cost<0)))throw Object.assign(new Error('Data item produk masuk tidak valid'),{status:400});const[products]=await connection.execute('SELECT id FROM products WHERE id=? AND branch_id=? AND is_active=TRUE FOR UPDATE',[productId,branchId]);if(!products[0])throw Object.assign(new Error('Produk tidak ditemukan di toko tujuan'),{status:404});if(variantId){const[variants]=await connection.execute('SELECT id FROM product_variants WHERE id=? AND product_id=? AND is_active=TRUE FOR UPDATE',[variantId,productId]);if(!variants[0])throw Object.assign(new Error('Varian warna tidak ditemukan'),{status:404});}const[balances]=await connection.execute('SELECT id,quantity FROM warehouse_stocks WHERE warehouse_id=? AND product_id=? AND variant_id <=> ? FOR UPDATE',[warehouses[0].id,productId,variantId]);const before=Number(balances[0]?.quantity||0),after=before+quantity;if(balances[0])await connection.execute('UPDATE warehouse_stocks SET quantity=? WHERE id=?',[after,balances[0].id]);else await connection.execute('INSERT INTO warehouse_stocks (warehouse_id,product_id,variant_id,quantity) VALUES (?,?,?,?)',[warehouses[0].id,productId,variantId,after]);await connection.execute('UPDATE products SET stock=stock+?,cost=COALESCE(?,cost) WHERE id=?',[quantity,cost,productId]);if(variantId)await connection.execute('UPDATE product_variants SET stock=stock+? WHERE id=?',[quantity,variantId]);await connection.execute(`INSERT INTO stock_mutations (branch_id,warehouse_id,product_id,variant_id,user_id,type,reference_type,qty,stock_before,stock_after,notes) VALUES (?,?,?,?,?, 'purchase','manual_incoming',?,?,?,?)`,[branchId,warehouses[0].id,productId,variantId,req.user.id,quantity,before,after,req.body.notes?.trim()||null]);}
    await connection.execute('INSERT INTO activity_logs (user_id,action,description,ip_address,user_agent) VALUES (?,?,?,?,?)',[req.user.id,'incoming_stock','Produk masuk '+items.length+' item ke toko '+branchId,req.ip,req.get('user-agent')||null]);await connection.commit();res.status(201).json({success:true,data:{items:items.length,branch_id:branchId}});
  }catch(error){await connection.rollback();next(error);}finally{connection.release();}
});
router.post('/outgoing', authorize('owner','manager','admin','gudang'), async (req,res,next)=>{
  const connection=await db.getConnection();
  try{const requestedBranch=Number(req.body.branch_id),branchId=req.user.role==='owner'&&Number.isInteger(requestedBranch)?requestedBranch:req.user.branch_id,items=req.body.items,channel=(req.body.channel||'').trim()||'toko';if(!Array.isArray(items)||!items.length)return res.status(400).json({success:false,message:'Tambahkan minimal satu produk keluar'});await connection.beginTransaction();const[warehouses]=await connection.execute('SELECT id FROM warehouses WHERE branch_id=? AND is_active=TRUE ORDER BY id LIMIT 1 FOR UPDATE',[branchId]);if(!warehouses[0])throw Object.assign(new Error('Gudang aktif toko tidak ditemukan'),{status:404});for(const input of items){const productId=Number(input.product_id),variantId=input.variant_id?Number(input.variant_id):null,quantity=Number(input.quantity);if(!Number.isInteger(productId)||!Number.isInteger(quantity)||quantity<=0)throw Object.assign(new Error('Data item produk keluar tidak valid'),{status:400});const[products]=await connection.execute('SELECT id,stock FROM products WHERE id=? AND branch_id=? AND is_active=TRUE FOR UPDATE',[productId,branchId]);if(!products[0])throw Object.assign(new Error('Produk tidak ditemukan di toko asal'),{status:404});if(variantId){const[variants]=await connection.execute('SELECT id,stock FROM product_variants WHERE id=? AND product_id=? AND is_active=TRUE FOR UPDATE',[variantId,productId]);if(!variants[0])throw Object.assign(new Error('Varian warna tidak ditemukan'),{status:404});if(variants[0].stock<quantity)throw Object.assign(new Error('Stok varian warna tidak mencukupi'),{status:400});}const[balances]=await connection.execute('SELECT id,quantity FROM warehouse_stocks WHERE warehouse_id=? AND product_id=? AND variant_id <=> ? FOR UPDATE',[warehouses[0].id,productId,variantId]);const before=Number(balances[0]?.quantity||0),after=before-quantity;if(after<0)throw Object.assign(new Error('Stok produk tidak mencukupi'),{status:400});if(balances[0])await connection.execute('UPDATE warehouse_stocks SET quantity=? WHERE id=?',[after,balances[0].id]);else await connection.execute('INSERT INTO warehouse_stocks (warehouse_id,product_id,variant_id,quantity) VALUES (?,?,?,?)',[warehouses[0].id,productId,variantId,after]);await connection.execute('UPDATE products SET stock=stock-? WHERE id=?',[quantity,productId]);if(variantId)await connection.execute('UPDATE product_variants SET stock=stock-? WHERE id=?',[quantity,variantId]);await connection.execute(`INSERT INTO stock_mutations (branch_id,warehouse_id,product_id,variant_id,user_id,type,reference_type,channel,qty,stock_before,stock_after,notes) VALUES (?,?,?,?,?, 'adjustment','manual_outgoing',?,?,?,?,?)`,[branchId,warehouses[0].id,productId,variantId,req.user.id,channel,-quantity,before,after,req.body.notes?.trim()||null]);}await connection.execute('INSERT INTO activity_logs (user_id,action,description,ip_address,user_agent) VALUES (?,?,?,?,?)',[req.user.id,'outgoing_stock','Produk keluar '+items.length+' item dari toko '+branchId+' ('+channel+')',req.ip,req.get('user-agent')||null]);await connection.commit();res.status(201).json({success:true,data:{items:items.length,branch_id:branchId,channel}});}catch(error){await connection.rollback();next(error);}finally{connection.release();}
});

module.exports = router;
