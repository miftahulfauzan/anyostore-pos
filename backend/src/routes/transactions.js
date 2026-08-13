const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');
const { findPromotion } = require('./promotions');
const { money } = require('../money');
const { localDateString } = require('../local-date');
const { applyPriceTier } = require('../pricing');
const { adjustStock } = require('../stock');
const { normalizePayments, persistPayments } = require('../payments');

const router = express.Router();
router.use(authenticate);

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function nextInvoice(connection, branchId) {
  const businessDate = localDateString();
  // Prefix invoice dari Pengaturan (invoice_prefix), default INV.
  const [prefixRows] = await connection.execute("SELECT `value` FROM store_settings WHERE branch_id = ? AND `key` = 'invoice_prefix' LIMIT 1", [branchId]);
  const prefix = String(prefixRows[0]?.value || 'INV').trim().toUpperCase();
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
  return `${prefix}-${businessDate.replaceAll('-', '')}-B${branchId}-${number}`;
}

// Logika harga berjenjang ada di ../pricing.js (satu sumber kebenaran).

// Preview harga: dipakai POS supaya harga yang tampil = harga yang akan
// tersimpan saat checkout. Menjalankan logika tier/promo yang sama persis.
router.post('/preview', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  try {
    const { customer_id: customerId = null, items, promo_code: promoCode, discount_type: discountType = 'none', discount_value: discountValue = 0 } = req.body;
    const requestedBranch = Number(req.body.branch_id);
    const branchId = req.user.role === 'owner' && Number.isInteger(requestedBranch) ? requestedBranch : req.user.branch_id;
    if (!Array.isArray(items) || !items.length || !['none', 'percentage', 'nominal'].includes(discountType)) {
      return res.status(400).json({ success: false, message: 'Data preview tidak valid' });
    }
    const productIds = [...new Set(items.map((item) => Number(item.product_id)))];
    if (productIds.some((id) => !Number.isInteger(id))) return res.status(400).json({ success: false, message: 'Produk tidak valid' });
    const placeholders = productIds.map(() => '?').join(',');
    const [products] = await db.execute(
      `SELECT id, name, sku, price, cost, stock FROM products WHERE branch_id = ? AND is_active = TRUE AND id IN (${placeholders})`,
      [branchId, ...productIds]
    );
    if (products.length !== productIds.length) return res.status(400).json({ success: false, message: 'Satu atau lebih produk tidak ditemukan' });
    const productById = new Map(products.map((product) => [product.id, product]));

    let customerTier = 'reguler';
    if (customerId) {
      const [customers] = await db.execute('SELECT id, price_tier FROM customers WHERE id = ? AND branch_id = ? LIMIT 1', [customerId, branchId]);
      if (!customers[0]) return res.status(400).json({ success: false, message: 'Pelanggan tidak ditemukan' });
      customerTier = customers[0].price_tier || 'reguler';
    }

    const lines = [];
    let subtotal = 0;
    for (const input of items) {
      const productId = Number(input.product_id);
      const quantity = Number(input.quantity);
      const variantId = input.variant_id ? Number(input.variant_id) : null;
      const itemDiscount = money(input.discount || 0);
      if (!Number.isInteger(quantity) || quantity <= 0 || itemDiscount < 0) return res.status(400).json({ success: false, message: 'Jumlah atau diskon item tidak valid' });
      const product = productById.get(productId);
      let variant = null;
      if (variantId) {
        const [variants] = await db.execute('SELECT id, color, stock, price FROM product_variants WHERE id = ? AND product_id = ? AND is_active = TRUE', [variantId, productId]);
        if (!variants[0]) return res.status(400).json({ success: false, message: 'Varian tidak ditemukan' });
        variant = variants[0];
      }
      const basePrice = money(variant?.price == null ? product.price : variant.price);
      let price = basePrice;
      let priceOverride = 0;
      if (input.price_override != null && input.price_override !== '') {
        const overrideValue = Number(input.price_override);
        if (!Number.isFinite(overrideValue) || overrideValue < 0) return res.status(400).json({ success: false, message: 'Harga ubah manual tidak valid' });
        price = money(overrideValue);
        priceOverride = 1;
      }
      const lineSubtotal = money(price * quantity - itemDiscount);
      if (lineSubtotal < 0) return res.status(400).json({ success: false, message: 'Diskon item melebihi subtotal' });
      subtotal = money(subtotal + lineSubtotal);
      lines.push({ productId, variantId, variant, quantity, itemDiscount, lineSubtotal, price, priceOverride, basePrice });
    }

    const tierLines = lines.filter((line) => !line.priceOverride);
    const priceTier = await applyPriceTier(db, branchId, tierLines, customerTier);
    subtotal = money(lines.reduce((sum, line) => sum + line.lineSubtotal, 0));

    let requestedDiscount = money(discountValue);
    if (requestedDiscount < 0) return res.status(400).json({ success: false, message: 'Diskon transaksi tidak valid' });
    let effectiveDiscountType = discountType;
    let discount = discountType === 'percentage' ? money(subtotal * requestedDiscount / 100) : discountType === 'nominal' ? requestedDiscount : 0;
    let promo = null;
    if (promoCode?.trim()) {
      const promotion = await findPromotion(db, branchId, promoCode, subtotal);
      promo = promotion.promo;
      discount = promotion.discount;
      requestedDiscount = Number(promo.discount_value);
      effectiveDiscountType = promo.discount_type;
    }
    if (discount > subtotal) return res.status(400).json({ success: false, message: 'Diskon transaksi melebihi subtotal' });
    const grandTotal = money(subtotal - discount);

    res.json({
      success: true,
      data: {
        lines: lines.map((line) => ({ product_id: line.productId, variant_id: line.variantId, quantity: line.quantity, price: line.price, line_subtotal: line.lineSubtotal })),
        subtotal,
        price_tier: priceTier,
        discount_type: effectiveDiscountType,
        discount,
        grand_total: grandTotal,
        promo: promo ? { id: promo.id, code: promo.code, name: promo.name, discount } : null,
      },
    });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const dateFrom = req.query.date_from || req.query.start || null;
    const dateTo = req.query.date_to || req.query.end || null;
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();
    const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

    let where = 'WHERE t.branch_id = ?';
    const params = [req.user.branch_id];

    if (isDate(dateFrom)) { where += ' AND DATE(t.created_at) >= ?'; params.push(dateFrom); }
    if (isDate(dateTo)) { where += ' AND DATE(t.created_at) <= ?'; params.push(dateTo); }
    if (status && ['completed','cancelled','partially_cancelled','refunded'].includes(status)) { where += ' AND t.status = ?'; params.push(status); }
    if (search) {
      where += ' AND (t.invoice_no LIKE ? OR t.offline_invoice_no LIKE ? OR u.name LIKE ? OR c.name LIKE ? OR t.grand_total LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }

    const [countRows] = await db.execute(`SELECT COUNT(*) AS total FROM transactions t JOIN users u ON u.id=t.user_id LEFT JOIN customers c ON c.id=t.customer_id ${where}`, params);
    const total = Number(countRows[0].total || 0);

    const [rows] = await db.execute(
      `SELECT t.id, t.invoice_no, t.offline_invoice_no, t.grand_total, t.payment_method, t.status, t.price_tier, t.cancelled_amount, t.created_at, u.name AS cashier, c.name AS customer, c.price_tier AS customer_tier
       FROM transactions t JOIN users u ON u.id = t.user_id LEFT JOIN customers c ON c.id = t.customer_id
       ${where} ORDER BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    res.json({ success: true, data: rows, page, total, totalPages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});

router.post('/hold', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  try {
    const { customer_id: customerId = null, items, subtotal = 0, discount_type: discountType = 'none', discount_value: discountValue = 0, notes } = req.body;
    const requestedBranch = Number(req.body.branch_id);
    const branchId = req.user.role === 'owner' && Number.isInteger(requestedBranch) ? requestedBranch : req.user.branch_id;
    if (!Array.isArray(items) || !items.length || !['none', 'percentage', 'nominal'].includes(discountType)) return res.status(400).json({ success: false, message: 'Data hold tidak valid' });
    const [result] = await db.execute(
      'INSERT INTO pending_transactions (branch_id, user_id, customer_id, items_json, subtotal, discount_type, discount_value, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [branchId, req.user.id, customerId, JSON.stringify(items), money(subtotal), discountType, money(discountValue), notes?.trim() || null]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { next(error); }
});

router.get('/pending', async (req, res, next) => {
  try {
    const requestedBranch = Number(req.query.branch_id);
    const branchId = req.user.role === 'owner' && Number.isInteger(requestedBranch) ? requestedBranch : req.user.branch_id;
    const [rows] = await db.execute('SELECT id, customer_id, items_json, subtotal, discount_type, discount_value, notes, held_at FROM pending_transactions WHERE branch_id = ? AND resumed_at IS NULL ORDER BY held_at DESC', [branchId]);
    res.json({ success: true, data: rows.map((row) => ({ ...row, items: typeof row.items_json === 'string' ? JSON.parse(row.items_json) : row.items_json })) });
  } catch (error) { next(error); }
});

router.post('/pending/:id/resume', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  try {
    const requestedBranch = Number(req.query.branch_id);
    const branchId = req.user.role === 'owner' && Number.isInteger(requestedBranch) ? requestedBranch : req.user.branch_id;
    const [rows] = await db.execute('SELECT id, customer_id, items_json, subtotal, discount_type, discount_value, notes FROM pending_transactions WHERE id = ? AND branch_id = ? AND resumed_at IS NULL', [req.params.id, branchId]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Transaksi hold tidak ditemukan' });
    await db.execute('UPDATE pending_transactions SET resumed_at = NOW() WHERE id = ?', [rows[0].id]);
    res.json({ success: true, data: { ...rows[0], items: typeof rows[0].items_json === 'string' ? JSON.parse(rows[0].items_json) : rows[0].items_json } });
  } catch (error) { next(error); }
});

router.post('/', authorize('owner', 'manager', 'admin', 'kasir'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { warehouse_id: warehouseId, customer_id: customerId = null, items, discount_type: discountType = 'none', discount_value: discountValue = 0, promo_code: promoCode, notes, client_transaction_id: clientTransactionId = null, offline: isOffline = false, offline_invoice_no: offlineInvoiceNo = null } = req.body;
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
    let customerTier = 'reguler';
    if (customerId) {
      const [customers] = await connection.execute('SELECT id, price_tier FROM customers WHERE id = ? AND branch_id = ? LIMIT 1', [customerId, branchId]);
      if (!customers[0]) throw httpError(404, 'Pelanggan tidak ditemukan');
      customerTier = customers[0].price_tier || 'reguler';
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
      // Stok kurang/0 TETAP boleh dijual, tapi hanya jika klien mengirim
      // allow_negative_stock=true (setelah konfirmasi "Lanjutkan" di POS).
      const allowNegative = req.body.allow_negative_stock === true;
      const [balances] = await connection.execute('SELECT id, quantity FROM warehouse_stocks WHERE warehouse_id = ? AND product_id = ? AND variant_id <=> ? FOR UPDATE', [warehouseId, productId, variantId]);
      const available = Number(balances[0]?.quantity || 0);
      if (!allowNegative && available < quantity) throw httpError(400, `Stok ${product.name} tidak mencukupi (tersedia ${available})`);
      let variant = null;
      if (variantId) {
        const [variants] = await connection.execute('SELECT id, color, stock, price FROM product_variants WHERE id = ? AND product_id = ? AND is_active = TRUE FOR UPDATE', [variantId, productId]);
        if (!variants[0]) throw httpError(400, 'Varian tidak ditemukan');
        if (!allowNegative && Number(variants[0].stock) < quantity) throw httpError(400, `Stok varian ${product.name} tidak mencukupi`);
        variant = variants[0];
      }
      // Harga dasar dari produk/varian.
      const basePrice = money(variant?.price == null ? product.price : variant.price);
      // Ubah harga manual di keranjang (admin/kasir). Tanpa batas bawah, dicatat untuk audit.
      let price = basePrice;
      let priceOverride = 0;
      let originalPrice = null;
      let overriddenBy = null;
      if (isOffline) {
        // Mode offline: harga mengikuti yang dikirim HP.
        const clientPrice = Number(input.price != null && input.price !== '' ? input.price : input.price_override);
        if (!Number.isFinite(clientPrice) || clientPrice < 0) throw httpError(400, 'Harga item offline tidak valid');
        originalPrice = basePrice;
        price = money(clientPrice);
        priceOverride = 1;
        overriddenBy = req.user.id;
      } else if (input.price_override != null && input.price_override !== '') {
        const overrideValue = Number(input.price_override);
        if (!Number.isFinite(overrideValue) || overrideValue < 0) throw httpError(400, 'Harga ubah manual tidak valid');
        originalPrice = basePrice;
        price = money(overrideValue);
        priceOverride = 1;
        overriddenBy = req.user.id;
      }
      const lineSubtotal = money(price * quantity - itemDiscount);
      if (lineSubtotal < 0) throw httpError(400, 'Diskon item melebihi subtotal');
      subtotal = money(subtotal + lineSubtotal);
      lines.push({ product, productId, variantId, variant, quantity, itemDiscount, lineSubtotal, price, basePrice, priceOverride, originalPrice, overriddenBy });
    }
    const tierLines = lines.filter((line) => !line.priceOverride);
    const priceTier = isOffline ? 'retail' : await applyPriceTier(connection, branchId, tierLines, customerTier);
    let requestedDiscount;
    let effectiveDiscountType = discountType;
    let discount;
    let promo = null;
    if (isOffline) {
      // Mode offline: subtotal/diskon/total ikut yang dikirim HP.
      subtotal = money(Number(req.body.subtotal) || 0);
      discount = money(Number(req.body.discount) || 0);
      requestedDiscount = discount;
      if (subtotal < 0 || discount < 0 || discount > subtotal) throw httpError(400, 'Total transaksi offline tidak valid');
      const sumLines = money(lines.reduce((sum, line) => sum + line.lineSubtotal, 0));
      if (Math.abs(sumLines - subtotal) > 1) throw httpError(400, 'Subtotal item tidak cocok dengan total');
      effectiveDiscountType = discount > 0 ? 'nominal' : 'none';
    } else {
      subtotal = money(lines.reduce((sum, line) => sum + line.lineSubtotal, 0));
      requestedDiscount = money(discountValue);
      if (requestedDiscount < 0) throw httpError(400, 'Diskon transaksi tidak valid');
      discount = discountType === 'percentage' ? money(subtotal * requestedDiscount / 100) : discountType === 'nominal' ? requestedDiscount : 0;
      if (promoCode?.trim()) { const promotion = await findPromotion(connection, branchId, promoCode, subtotal); promo = promotion.promo; discount = promotion.discount; requestedDiscount = Number(promo.discount_value); effectiveDiscountType = promo.discount_type; }
      if (discount > subtotal) throw httpError(400, 'Diskon transaksi melebihi subtotal');
    }
    const grandTotal = money(subtotal - discount);
    const payment = normalizePayments(req.body, grandTotal);
    const invoiceNo = await nextInvoice(connection, branchId);
    const [transactionResult] = await connection.execute(
      `INSERT INTO transactions (branch_id, invoice_no, offline_invoice_no, client_transaction_id, user_id, customer_id, subtotal, discount_type, discount_value, discount, grand_total, payment_method, amount_paid, \`change\`, notes, price_tier)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branchId, invoiceNo, offlineInvoiceNo?.trim() || null, clientTransactionId, req.user.id, customerId, subtotal, effectiveDiscountType, requestedDiscount, discount, grandTotal, payment.method, payment.paid, payment.change, [notes?.trim(), promo ? `Promo ${promo.code}` : null].filter(Boolean).join(' · ') || null, priceTier]
    );
    if (promo) await connection.execute('UPDATE promotions SET usage_count=usage_count+1 WHERE id=?', [promo.id]);
    for (const line of lines) {
      await connection.execute(
        `INSERT INTO transaction_items (transaction_id, product_id, variant_id, product_name, product_sku, variant_detail, quantity, price, original_price, price_override, overridden_by, discount, subtotal, cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [transactionResult.insertId, line.productId, line.variantId, line.product.name, line.product.sku, line.variant?.color || null, line.quantity, line.price, line.originalPrice, line.priceOverride, line.overriddenBy, line.itemDiscount, line.lineSubtotal, line.product.cost]
      );
      await adjustStock(connection, {
        branchId,
        warehouseId,
        productId: line.productId,
        variantId: line.variantId,
        delta: -line.quantity,
        userId: req.user.id,
        type: 'sale',
        referenceType: 'transaction',
        referenceId: transactionResult.insertId,
      });
    }
    await persistPayments(connection, transactionResult.insertId, payment);
    await connection.execute('INSERT INTO activity_logs (user_id, action, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)', [req.user.id, 'transaction_create', `Invoice ${invoiceNo}`, req.ip, req.get('user-agent') || null]);
    await connection.commit();
    res.status(201).json({ success: true, data: { id: transactionResult.insertId, invoice_no: invoiceNo, grand_total: grandTotal, amount_paid: payment.paid, change: payment.change, price_tier: priceTier } });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY' && req.body.client_transaction_id) return res.status(409).json({ success: false, message: 'Transaksi sedang diproses, ulangi permintaan' });
    next(error);
  } finally { connection.release(); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const [transactions] = await db.execute('SELECT id, invoice_no, grand_total, amount_paid, `change`, cancelled_amount, cancel_reason, payment_method, status, price_tier, created_at FROM transactions WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branch_id]);
    if (!transactions[0]) return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
    const [items] = await db.execute('SELECT id AS transaction_item_id, product_name, product_sku, variant_detail, quantity, cancelled_qty, cancel_reason, price, original_price, price_override, discount, subtotal FROM transaction_items WHERE transaction_id = ?', [req.params.id]);
    res.json({ success: true, data: { ...transactions[0], items } });
  } catch (error) { next(error); }
});

// Partial / full cancellation of transaction items.
router.put('/:id/cancel', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { items: cancelItems, reason } = req.body;
    if (!Array.isArray(cancelItems) || !cancelItems.length) throw httpError(400, 'Item yang dibatalkan wajib diisi');
    await connection.beginTransaction();
    const [transactions] = await connection.execute('SELECT * FROM transactions WHERE id = ? AND branch_id = ? FOR UPDATE', [req.params.id, req.user.branch_id]);
    if (!transactions[0]) throw httpError(404, 'Transaksi tidak ditemukan');
    if (transactions[0].status === 'cancelled') throw httpError(400, 'Transaksi sudah dibatalkan seluruhnya');

    // Refund harus proporsional terhadap yang benar-benar dibayar. Diskon tingkat
    // transaksi (persen/nominal/promo) dicatat di transactions.discount, sehingga
    // refund per-item dihitung dari nilai item lalu dikali rasio grand_total/subtotal.
    const txSubtotal = Number(transactions[0].subtotal || 0);
    const txGrandTotal = Number(transactions[0].grand_total || 0);
    const paidRatio = txSubtotal > 0 ? txGrandTotal / txSubtotal : 1;

    let totalRefund = 0;
    for (const input of cancelItems) {
      const itemId = Number(input.transaction_item_id);
      const cancelQty = Number(input.qty);
      const itemReason = String(input.reason || reason || '').trim();
      if (!Number.isInteger(itemId) || !Number.isInteger(cancelQty) || cancelQty <= 0) throw httpError(400, 'Data pembatalan item tidak valid');

      const [items] = await connection.execute('SELECT * FROM transaction_items WHERE id = ? AND transaction_id = ? FOR UPDATE', [itemId, transactions[0].id]);
      if (!items[0]) throw httpError(404, 'Item transaksi tidak ditemukan');
      const item = items[0];
      const remaining = item.quantity - item.cancelled_qty;
      if (cancelQty > remaining) throw httpError(400, `Qty batal melebihi sisa item ${item.product_name}`);

      // Cari gudang asal penjualan dari stock_mutations.
      const [mutations] = await connection.execute(
        'SELECT warehouse_id, stock_before, stock_after FROM stock_mutations WHERE reference_type = ? AND reference_id = ? AND product_id = ? AND variant_id <=> ? ORDER BY id DESC LIMIT 1',
        ['transaction', transactions[0].id, item.product_id, item.variant_id]
      );
      const warehouseId = mutations[0]?.warehouse_id;
      if (!warehouseId) throw httpError(400, `Gudang asal item ${item.product_name} tidak ditemukan`);

      // Hitung refund: nilai item (qty * harga - proporsi diskon item) * rasio pembayaran.
      const itemValue = money(cancelQty * item.price - (item.discount / item.quantity) * cancelQty);
      const itemRefund = money(itemValue * paidRatio);
      totalRefund = money(totalRefund + itemRefund);

      // Restore stok (satu jalur penulisan stok).
      await adjustStock(connection, {
        branchId: transactions[0].branch_id,
        warehouseId,
        productId: item.product_id,
        variantId: item.variant_id,
        delta: cancelQty,
        userId: req.user.id,
        type: 'sale_return',
        referenceType: 'transaction',
        referenceId: transactions[0].id,
      });

      // Update item.
      const newCancelledQty = item.cancelled_qty + cancelQty;
      await connection.execute(
        'UPDATE transaction_items SET cancelled_qty = ?, cancel_reason = ? WHERE id = ?',
        [newCancelledQty, itemReason || null, item.id]
      );
    }

    // Update status transaksi.
    const [remainingItems] = await connection.execute(
      'SELECT SUM(quantity - cancelled_qty) AS remaining_qty FROM transaction_items WHERE transaction_id = ?',
      [transactions[0].id]
    );
    const remainingQty = Number(remainingItems[0].remaining_qty) || 0;
    const newStatus = remainingQty === 0 ? 'cancelled' : 'partially_cancelled';
    const newCancelledAmount = money(Number(transactions[0].cancelled_amount || 0) + totalRefund);
    const cancelReason = String(reason || '').trim();
    await connection.execute(
      'UPDATE transactions SET status = ?, cancelled_amount = ?, cancel_reason = ? WHERE id = ?',
      [newStatus, newCancelledAmount, cancelReason || null, transactions[0].id]
    );

    // Pencatatan refund tunai ke laci kas: petugas yang memproses cancel harus
    // punya laci terbuka. Porsi cash dihitung proporsional dari metode bayar
    // asli (cash_paid / grand_total) supaya expected cash berkurang sesuai.
    if (totalRefund > 0) {
      const [drawers] = await connection.execute('SELECT id FROM cash_drawers WHERE branch_id = ? AND user_id = ? AND status = \'open\' FOR UPDATE', [transactions[0].branch_id, req.user.id]);
      if (drawers[0]) {
        const [payments] = await connection.execute('SELECT payment_method, COALESCE(SUM(amount), 0) AS amount FROM transaction_payments WHERE transaction_id = ? GROUP BY payment_method', [transactions[0].id]);
        const cashPaid = Number(payments.find((payment) => payment.payment_method === 'cash')?.amount || 0);
        const txGrandTotal = Number(transactions[0].grand_total || 0);
        const cashRefund = txGrandTotal > 0 ? money(totalRefund * cashPaid / txGrandTotal) : 0;
        if (cashRefund > 0) {
          await connection.execute('INSERT INTO cash_drawer_movements (cash_drawer_id, user_id, type, amount, reason) VALUES (?, ?, ?, ?, ?)', [drawers[0].id, req.user.id, 'cash_out', cashRefund, `Refund ${transactions[0].invoice_no}`]);
        }
      }
    }

    await connection.execute('INSERT INTO activity_logs (user_id, action, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)', [req.user.id, 'transaction_cancel', `Invoice ${transactions[0].invoice_no} - refund ${totalRefund}`, req.ip, req.get('user-agent') || null]);
    await connection.commit();
    res.json({ success: true, data: { id: transactions[0].id, status: newStatus, cancelled_amount: newCancelledAmount, refund: totalRefund } });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally { connection.release(); }
});

module.exports = router;
