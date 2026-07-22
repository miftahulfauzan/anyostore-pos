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
    const [warehouses] = await db.execute('SELECT id, name, description FROM warehouses WHERE branch_id = ? AND is_active = TRUE ORDER BY name', [branchId]);
    res.json({ success: true, data: warehouses });
  } catch (error) { next(error); }
});

router.post('/warehouses', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Nama gudang wajib diisi' });
    const [result] = await db.execute('INSERT INTO warehouses (branch_id, name, description) VALUES (?, ?, ?)', [req.user.branch_id, name.trim(), description?.trim() || null]);
    res.status(201).json({ success: true, data: { id: result.insertId } });
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
      'SELECT sm.id, sm.type, sm.reference_type, sm.reference_id, sm.qty, sm.stock_before, sm.stock_after, sm.notes, sm.created_at, ' +
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
      [warehouseId, req.user.branch_id, req.user.branch_id, warehouseId]
    );
    res.json({ success: true, data: rows });
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
  try{const requestedBranch=Number(req.body.branch_id),branchId=req.user.role==='owner'&&Number.isInteger(requestedBranch)?requestedBranch:req.user.branch_id,items=req.body.items;if(!Array.isArray(items)||!items.length)return res.status(400).json({success:false,message:'Tambahkan minimal satu produk keluar'});await connection.beginTransaction();const[warehouses]=await connection.execute('SELECT id FROM warehouses WHERE branch_id=? AND is_active=TRUE ORDER BY id LIMIT 1 FOR UPDATE',[branchId]);if(!warehouses[0])throw Object.assign(new Error('Gudang aktif toko tidak ditemukan'),{status:404});for(const input of items){const productId=Number(input.product_id),quantity=Number(input.quantity);if(!Number.isInteger(productId)||!Number.isInteger(quantity)||quantity<=0)throw Object.assign(new Error('Data item produk keluar tidak valid'),{status:400});const[products]=await connection.execute('SELECT id,stock FROM products WHERE id=? AND branch_id=? AND is_active=TRUE FOR UPDATE',[productId,branchId]);if(!products[0])throw Object.assign(new Error('Produk tidak ditemukan di toko asal'),{status:404});const[balances]=await connection.execute('SELECT id,quantity FROM warehouse_stocks WHERE warehouse_id=? AND product_id=? AND variant_id IS NULL FOR UPDATE',[warehouses[0].id,productId]);const before=Number(balances[0]?.quantity||0),after=before-quantity;if(after<0)throw Object.assign(new Error('Stok produk tidak mencukupi'),{status:400});await connection.execute('UPDATE warehouse_stocks SET quantity=? WHERE id=?',[after,balances[0].id]);await connection.execute('UPDATE products SET stock=stock-? WHERE id=?',[quantity,productId]);await connection.execute(`INSERT INTO stock_mutations (branch_id,warehouse_id,product_id,user_id,type,reference_type,qty,stock_before,stock_after,notes) VALUES (?,?,?,?, 'adjustment','manual_outgoing',?,?,?,?)`,[branchId,warehouses[0].id,productId,req.user.id,-quantity,before,after,req.body.notes?.trim()||null]);}await connection.execute('INSERT INTO activity_logs (user_id,action,description,ip_address,user_agent) VALUES (?,?,?,?,?)',[req.user.id,'outgoing_stock','Produk keluar '+items.length+' item dari toko '+branchId,req.ip,req.get('user-agent')||null]);await connection.commit();res.status(201).json({success:true,data:{items:items.length,branch_id:branchId}});}catch(error){await connection.rollback();next(error);}finally{connection.release();}
});

module.exports = router;
