const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');
const { findPromotion } = require('./promotions');

const router = express.Router();
router.use(authenticate);

const paymentMethods = new Set(['cash', 'qris', 'debit', 'transfer', 'credit']);
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function nextInvoice(connection, branchId) {
  const businessDate = new Date().toISOString().slice(0, 10);
  await connection.execute(
    `INSERT INTO invoice_sequences (branch_id, business_date, last_number) VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE last_number = last_number + 1`,
    [branchId, businessDate]
  );
  const [sequence] = await connection.execute(
    'SELECT last_number FROM invoice_sequences WHERE branch_id = ? AND business_date = ? FOR UPDATE',
    [branchId, businessDate]
  );
  const number = String(sequence[0].last_number).padStart(4, '0');
  return `INV-${businessDate.replaceAll('-', '')}-B${branchId}-${number}`;
}

function normalizePayments(body, grandTotal) {
  if (Array.isArray(body.payments) && body.payments.length) {
    const payments = body.payments.map((payment) => ({
      payment_method: payment.payment_method,
      amount: money(payment.amount),
      reference: payment.reference?.trim() || null
    }));
    if (payments.some((payment) => !paymentMethods.has(payment.payment_method) || payment.amount <= 0)) {
      throw httpError(400, 'Data split payment tidak valid');
    }
    if (money(payments.reduce((sum, payment) => sum + payment.amount, 0)) !== grandTotal) {
      throw httpError(400, 'Total split payment harus sama dengan total transaksi');
    }
    return { method: payments.length > 1 ? 'split' : payments[0].payment_method, paid: grandTotal, change: 0, payments };
  }
  const method = body.payment_method;
  const paid = money(body.amount_paid);
  if (!paymentMethods.has(method) || !Number.isFinite(paid) || paid < 0) throw httpError(400, 'Metode atau nominal pembayaran tidak valid');
  if (method === 'cash' && paid < grandTotal) throw httpError(400, 'Pembayaran tunai kurang');
  if (method !== 'cash' && paid !== grandTotal) throw httpError(400, 'Pembayaran non-tunai harus sesuai total transaksi');
  return { method, paid, change: method === 'cash' ? money(paid - grandTotal) : 0, payments: [{ payment_method: method, amount: grandTotal, reference: body.payment_reference?.trim() || null }] };
}

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const [rows] = await db.execute(
      `SELECT t.id, t.invoice_no, t.grand_total, t.payment_method, t.status, t.created_at, u.name AS cashier, c.name AS customer
       FROM transactions t JOIN users u ON u.id = t.user_id LEFT JOIN customers c ON c.id = t.customer_id
       WHERE t.branch_id = ? ORDER BY t.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      [req.user.branch_id]
    );
    res.json({ success: true, data: rows, page });
  } catch (error) { next(error); }
});

router.post('/hold', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  try {
    const { customer_id: customerId = null, items, subtotal = 0, discount_type: discountType = 'none', discount_value: discountValue = 0, notes } = req.body;
    if (!Array.isArray(items) || !items.length || !['none', 'percentage', 'nominal'].includes(discountType)) return res.status(400).json({ success: false, message: 'Data hold tidak valid' });
    const [result] = await db.execute(
      'INSERT INTO pending_transactions (branch_id, user_id, customer_id, items_json, subtotal, discount_type, discount_value, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.branch_id, req.user.id, customerId, JSON.stringify(items), money(subtotal), discountType, money(discountValue), notes?.trim() || null]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { next(error); }
});

router.get('/pending', async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT id, customer_id, items_json, subtotal, discount_type, discount_value, notes, held_at FROM pending_transactions WHERE branch_id = ? AND resumed_at IS NULL ORDER BY held_at DESC', [req.user.branch_id]);
    res.json({ success: true, data: rows.map((row) => ({ ...row, items: typeof row.items_json === 'string' ? JSON.parse(row.items_json) : row.items_json })) });
  } catch (error) { next(error); }
});

router.post('/pending/:id/resume', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT id, customer_id, items_json, subtotal, discount_type, discount_value, notes FROM pending_transactions WHERE id = ? AND branch_id = ? AND resumed_at IS NULL', [req.params.id, req.user.branch_id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Transaksi hold tidak ditemukan' });
    await db.execute('UPDATE pending_transactions SET resumed_at = NOW() WHERE id = ?', [rows[0].id]);
    res.json({ success: true, data: { ...rows[0], items: typeof rows[0].items_json === 'string' ? JSON.parse(rows[0].items_json) : rows[0].items_json } });
  } catch (error) { next(error); }
});

router.post('/', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { warehouse_id: warehouseId, customer_id: customerId = null, items, discount_type: discountType = 'none', discount_value: discountValue = 0, promo_code: promoCode, notes, client_transaction_id: clientTransactionId = null } = req.body;
    const requestedBranch = Number(req.body.branch_id);
    const branchId = req.user.role === 'owner' && Number.isInteger(requestedBranch) ? requestedBranch : req.user.branch_id;
    if (!Number.isInteger(Number(warehouseId)) || !Array.isArray(items) || !items.length || !['none', 'percentage', 'nominal'].includes(discountType)) {
      throw httpError(400, 'Data transaksi tidak valid');
    }
    if (clientTransactionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientTransactionId)) {
      throw httpError(400, 'client_transaction_id harus UUID');
    }
    await connection.beginTransaction();
    const [branches] = await connection.execute('SELECT id FROM branches WHERE id = ? AND is_active = TRUE FOR UPDATE', [branchId]);
    if (!branches[0]) throw httpError(404, 'Toko tidak ditemukan atau sudah tidak aktif');
    if (clientTransactionId) {
      const [existing] = await connection.execute('SELECT id, invoice_no, grand_total, status FROM transactions WHERE client_transaction_id = ? LIMIT 1', [clientTransactionId]);
      if (existing[0]) { await connection.commit(); return res.json({ success: true, data: existing[0], idempotent: true }); }
    }
    const [warehouses] = await connection.execute('SELECT id FROM warehouses WHERE id = ? AND branch_id = ? AND is_active = TRUE FOR UPDATE', [warehouseId, branchId]);
    if (!warehouses[0]) throw httpError(404, 'Gudang tidak ditemukan');
    if (customerId) {
      const [customers] = await connection.execute('SELECT id FROM customers WHERE id = ? AND branch_id = ? LIMIT 1', [customerId, branchId]);
      if (!customers[0]) throw httpError(404, 'Pelanggan tidak ditemukan');
    }
    const productIds = [...new Set(items.map((item) => Number(item.product_id)))];
    if (productIds.some((id) => !Number.isInteger(id))) throw httpError(400, 'Produk tidak valid');
    const placeholders = productIds.map(() => '?').join(',');
    const [products] = await connection.query(`SELECT id, name, sku, price, cost, stock FROM products WHERE branch_id = ? AND is_active = TRUE AND id IN (${placeholders}) FOR UPDATE`, [branchId, ...productIds]);
    if (products.length !== productIds.length) throw httpError(400, 'Satu atau lebih produk tidak ditemukan');
    const productById = new Map(products.map((product) => [product.id, product]));
    const lines = [];
    let subtotal = 0;
    for (const input of items) {
      const productId = Number(input.product_id);
      const quantity = Number(input.quantity);
      const variantId = input.variant_id ? Number(input.variant_id) : null;
      const itemDiscount = money(input.discount || 0);
      if (!Number.isInteger(quantity) || quantity <= 0 || itemDiscount < 0) throw httpError(400, 'Jumlah atau diskon item tidak valid');
      const product = productById.get(productId);
      const [balances] = await connection.execute('SELECT id, quantity FROM warehouse_stocks WHERE warehouse_id = ? AND product_id = ? AND variant_id <=> ? FOR UPDATE', [warehouseId, productId, variantId]);
      if (!balances[0] || balances[0].quantity < quantity) throw httpError(400, `Stok ${product.name} tidak mencukupi`);
      let variant = null;
      if (variantId) {
        const [variants] = await connection.execute('SELECT id, color, stock, price FROM product_variants WHERE id = ? AND product_id = ? AND is_active = TRUE FOR UPDATE', [variantId, productId]);
        if (!variants[0] || variants[0].stock < quantity) throw httpError(400, `Varian ${product.name} tidak mencukupi`);
        variant = variants[0];
      }
      const price = money(variant?.price == null ? product.price : variant.price);
      const lineSubtotal = money(price * quantity - itemDiscount);
      if (lineSubtotal < 0) throw httpError(400, 'Diskon item melebihi subtotal');
      subtotal = money(subtotal + lineSubtotal);
      lines.push({ product, productId, variantId, variant, quantity, itemDiscount, lineSubtotal, price, balance: balances[0] });
    }
    let requestedDiscount = money(discountValue);
    if (requestedDiscount < 0) throw httpError(400, 'Diskon transaksi tidak valid');
    let effectiveDiscountType = discountType;
    let discount = discountType === 'percentage' ? money(subtotal * requestedDiscount / 100) : discountType === 'nominal' ? requestedDiscount : 0;
    let promo = null;
    if (promoCode?.trim()) { const promotion = await findPromotion(connection, branchId, promoCode, subtotal); promo = promotion.promo; discount = promotion.discount; requestedDiscount = Number(promo.discount_value); effectiveDiscountType = promo.discount_type; }
    if (discount > subtotal) throw httpError(400, 'Diskon transaksi melebihi subtotal');
    const grandTotal = money(subtotal - discount);
    const payment = normalizePayments(req.body, grandTotal);
    const invoiceNo = await nextInvoice(connection, branchId);
    const [transactionResult] = await connection.execute(
      `INSERT INTO transactions (branch_id, invoice_no, client_transaction_id, user_id, customer_id, subtotal, discount_type, discount_value, discount, grand_total, payment_method, amount_paid, \`change\`, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branchId, invoiceNo, clientTransactionId, req.user.id, customerId, subtotal, effectiveDiscountType, requestedDiscount, discount, grandTotal, payment.method, payment.paid, payment.change, [notes?.trim(), promo ? `Promo ${promo.code}` : null].filter(Boolean).join(' · ') || null]
    );
    if (promo) await connection.execute('UPDATE promotions SET usage_count=usage_count+1 WHERE id=?', [promo.id]);
    for (const line of lines) {
      await connection.execute(
        `INSERT INTO transaction_items (transaction_id, product_id, variant_id, product_name, product_sku, variant_detail, quantity, price, discount, subtotal, cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [transactionResult.insertId, line.productId, line.variantId, line.product.name, line.product.sku, line.variant?.color || null, line.quantity, line.price, line.itemDiscount, line.lineSubtotal, line.product.cost]
      );
      const after = line.balance.quantity - line.quantity;
      await connection.execute('UPDATE warehouse_stocks SET quantity = ? WHERE id = ?', [after, line.balance.id]);
      await connection.execute('UPDATE products SET stock = stock - ? WHERE id = ?', [line.quantity, line.productId]);
      if (line.variantId) await connection.execute('UPDATE product_variants SET stock = stock - ? WHERE id = ?', [line.quantity, line.variantId]);
      await connection.execute(
        `INSERT INTO stock_mutations (branch_id, warehouse_id, product_id, variant_id, user_id, type, reference_type, reference_id, qty, stock_before, stock_after)
         VALUES (?, ?, ?, ?, ?, 'sale', 'transaction', ?, ?, ?, ?)`,
        [branchId, warehouseId, line.productId, line.variantId, req.user.id, transactionResult.insertId, -line.quantity, line.balance.quantity, after]
      );
    }
    for (const item of payment.payments) {
      await connection.execute('INSERT INTO transaction_payments (transaction_id, payment_method, amount, reference) VALUES (?, ?, ?, ?)', [transactionResult.insertId, item.payment_method, item.amount, item.reference]);
    }
    await connection.execute('INSERT INTO activity_logs (user_id, action, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)', [req.user.id, 'transaction_create', `Invoice ${invoiceNo}`, req.ip, req.get('user-agent') || null]);
    await connection.commit();
    res.status(201).json({ success: true, data: { id: transactionResult.insertId, invoice_no: invoiceNo, grand_total: grandTotal, amount_paid: payment.paid, change: payment.change } });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY' && req.body.client_transaction_id) return res.status(409).json({ success: false, message: 'Transaksi sedang diproses, ulangi permintaan' });
    next(error);
  } finally { connection.release(); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const [transactions] = await db.execute('SELECT id, invoice_no, grand_total, amount_paid, `change`, payment_method, status, created_at FROM transactions WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branch_id]);
    if (!transactions[0]) return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
    const [items] = await db.execute('SELECT id AS transaction_item_id, product_name, product_sku, variant_detail, quantity, price, discount, subtotal FROM transaction_items WHERE transaction_id = ?', [req.params.id]);
    res.json({ success: true, data: { ...transactions[0], items } });
  } catch (error) { next(error); }
});

module.exports = router;
