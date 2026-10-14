const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');
const { adjustStock } = require('../stock');

const router = express.Router();
router.use(authenticate);
const fail = (status, message) => Object.assign(new Error(message), { status });
const validId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT po.id, po.po_number, po.order_date, po.expected_date, po.status, po.total_amount, s.name AS supplier FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.branch_id = ? ORDER BY po.created_at DESC', [req.user.branch_id]);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

router.post('/', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  const connection = await db.getConnection();
  let started = false;
  try {
    const { supplier_id: supplierId, expected_date: expectedDate, notes, items } = req.body;
    if (!validId(supplierId) || !Array.isArray(items) || !items.length) throw fail(400, 'Data purchase order tidak valid');
    await connection.beginTransaction();
    started = true;
    const [suppliers] = await connection.execute('SELECT id FROM suppliers WHERE id = ? AND branch_id = ? AND is_active = TRUE', [supplierId, req.user.branch_id]);
    if (!suppliers[0]) throw fail(404, 'Supplier tidak ditemukan');
    let total = 0;
    for (const item of items) {
      if (!validId(item.product_id) || !validId(item.quantity) || !Number.isFinite(Number(item.unit_cost)) || Number(item.unit_cost) < 0 || (item.variant_id != null && !validId(item.variant_id))) throw fail(400, 'Item PO tidak valid');
      const [products] = await connection.execute('SELECT id FROM products WHERE id = ? AND branch_id = ? AND is_active = TRUE', [item.product_id, req.user.branch_id]);
      if (!products[0]) throw fail(400, 'Produk PO bukan milik cabang ini');
      if (item.variant_id != null) {
        const [variants] = await connection.execute('SELECT id FROM product_variants WHERE id = ? AND product_id = ? AND is_active = TRUE', [item.variant_id, item.product_id]);
        if (!variants[0]) throw fail(400, 'Varian PO tidak sesuai produk');
      }
      total += Number(item.quantity) * Number(item.unit_cost);
    }
    const [prefixRows] = await connection.execute("SELECT `value` FROM store_settings WHERE branch_id=? AND `key`='order_prefix' LIMIT 1", [req.user.branch_id]);
    const orderPrefix = String(prefixRows[0]?.value || 'PO').trim().toUpperCase();
    const poNumber = `${orderPrefix}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const [po] = await connection.execute(
      'INSERT INTO purchase_orders (branch_id, supplier_id, po_number, order_date, expected_date, total_amount, notes, created_by) VALUES (?, ?, ?, CURDATE(), ?, ?, ?, ?)',
      [req.user.branch_id, supplierId, poNumber, expectedDate || null, total, notes?.trim() || null, req.user.id]
    );
    for (const item of items) {
      await connection.execute('INSERT INTO purchase_order_items (po_id, product_id, variant_id, quantity, unit_cost, subtotal) VALUES (?, ?, ?, ?, ?, ?)', [po.insertId, item.product_id, item.variant_id || null, item.quantity, item.unit_cost, Number(item.quantity) * Number(item.unit_cost)]);
    }
    await connection.commit();
    started = false;
    res.status(201).json({ success: true, data: { id: po.insertId, po_number: poNumber, total_amount: total } });
  } catch (error) {
    if (started) await connection.rollback();
    next(error);
  } finally { connection.release(); }
});

router.put('/:id/receive', authorize('owner', 'manager', 'admin', 'gudang'), async (req, res, next) => {
  const connection = await db.getConnection();
  let started = false;
  try {
    const warehouseId = req.body.warehouse_id;
    const items = req.body.items;
    if (!validId(req.params.id) || !validId(warehouseId) || !Array.isArray(items) || !items.length) throw fail(400, 'Data penerimaan tidak valid');
    await connection.beginTransaction();
    started = true;
    const [pos] = await connection.execute("SELECT * FROM purchase_orders WHERE id = ? AND branch_id = ? AND status NOT IN ('cancelled','completed') FOR UPDATE", [req.params.id, req.user.branch_id]);
    if (!pos[0]) throw fail(404, 'PO tidak ditemukan');
    const [warehouses] = await connection.execute('SELECT id FROM warehouses WHERE id = ? AND branch_id = ? AND is_active = TRUE', [warehouseId, req.user.branch_id]);
    if (!warehouses[0]) throw fail(404, 'Gudang tidak ditemukan');
    for (const input of items) {
      if (!validId(input.po_item_id) || !validId(input.quantity)) throw fail(400, 'Item penerimaan tidak valid');
      const qty = Number(input.quantity);
      const [rows] = await connection.execute('SELECT * FROM purchase_order_items WHERE id = ? AND po_id = ? FOR UPDATE', [input.po_item_id, pos[0].id]);
      const item = rows[0];
      if (!item || Number(item.received_qty) + qty > Number(item.quantity)) throw fail(400, 'Jumlah penerimaan melebihi PO');
      await adjustStock(connection, {
        branchId: req.user.branch_id, warehouseId, productId: item.product_id, variantId: item.variant_id,
        delta: qty, userId: req.user.id, type: 'purchase', referenceType: 'purchase_order', referenceId: pos[0].id,
      });
      await connection.execute('UPDATE purchase_order_items SET received_qty = received_qty + ? WHERE id = ?', [qty, item.id]);
      await connection.execute('UPDATE products SET cost = ? WHERE id = ?', [item.unit_cost, item.product_id]);
    }
    const [remaining] = await connection.execute('SELECT COUNT(*) AS count FROM purchase_order_items WHERE po_id = ? AND received_qty < quantity', [pos[0].id]);
    const status = remaining[0].count ? 'received' : 'completed';
    await connection.execute('UPDATE purchase_orders SET status = ?, received_at = IFNULL(received_at, NOW()) WHERE id = ?', [status, pos[0].id]);
    await connection.commit();
    started = false;
    res.json({ success: true, data: { id: pos[0].id, status } });
  } catch (error) {
    if (started) await connection.rollback();
    next(error);
  } finally { connection.release(); }
});

module.exports = router;
