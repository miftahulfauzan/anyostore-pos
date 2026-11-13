const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');
const { localDateString } = require('../local-date');
const { money } = require('../money');
const { adjustStock } = require('../stock');
const { hashPassword } = require('../reseller-auth');

const router = express.Router();
router.use(authenticate);

const httpError = (status, message) => Object.assign(new Error(message), { status });
const STATUSES = ['new', 'confirmed', 'paid', 'shipped', 'done', 'rejected', 'cancelled'];
const PAYMENT_METHODS = ['cash', 'qris', 'transfer', 'debit'];

function scopedBranch(req, requested) {
  const value = Number(requested);
  if (req.user.role === 'owner') return Number.isInteger(value) && value > 0 ? value : null;
  return req.user.branch_id;
}

function orderScope(req, alias = 'o') {
  const branchId = scopedBranch(req, req.query.branch_id || req.body?.branch_id);
  if (!branchId) return { sql: '', params: [] };
  return { sql: ` AND ${alias}.branch_id = ?`, params: [branchId] };
}

async function loadOrder(executor, id, branchId) {
  const params = [id];
  let sql = 'SELECT * FROM reseller_orders WHERE id = ?';
  if (branchId) { sql += ' AND branch_id = ?'; params.push(branchId); }
  const [rows] = await executor.execute(sql, params);
  return rows[0] || null;
}

async function orderItems(executor, orderId) {
  const [rows] = await executor.execute(
    `SELECT id, product_id, variant_id, product_name, sku, variant_label, price, quantity, subtotal
       FROM reseller_order_items WHERE order_id = ? ORDER BY id`,
    [orderId],
  );
  return rows;
}

// --------------------------------------------------------------- daftar -----

router.get('/summary', async (req, res, next) => {
  try {
    const scope = orderScope(req);
    const [rows] = await db.execute(
      `SELECT status, COUNT(*) AS total FROM reseller_orders o WHERE 1 = 1${scope.sql} GROUP BY status`,
      scope.params,
    );
    const counts = Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
    res.json({
      success: true,
      data: {
        counts,
        new_count: counts.new || 0,
        total_orders: Object.values(counts).reduce((sum, value) => sum + value, 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/orders', async (req, res, next) => {
  try {
    const scope = orderScope(req);
    const params = [...scope.params];
    let where = ` WHERE 1 = 1${scope.sql}`;
    const status = String(req.query.status || '').trim();
    if (status && STATUSES.includes(status)) { where += ' AND o.status = ?'; params.push(status); }
    const from = String(req.query.date_from || '').trim();
    const to = String(req.query.date_to || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { where += ' AND DATE(o.created_at) >= ?'; params.push(from); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { where += ' AND DATE(o.created_at) <= ?'; params.push(to); }
    const search = String(req.query.search || '').trim();
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
      where += ' AND (o.order_no LIKE ? ESCAPE ? OR o.buyer_name LIKE ? ESCAPE ? OR o.buyer_phone LIKE ? ESCAPE ?)';
      params.push(like, '\\', like, '\\', like, '\\');
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;

    const [countRows] = await db.execute(`SELECT COUNT(*) AS total FROM reseller_orders o${where}`, params);
    const [rows] = await db.execute(
      `SELECT o.*, t.invoice_no, a.email AS account_email
         FROM reseller_orders o
         LEFT JOIN transactions t ON t.id = o.transaction_id
         LEFT JOIN reseller_accounts a ON a.id = o.account_id
         ${where}
         ORDER BY o.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    res.json({ success: true, data: rows, total: Number(countRows[0]?.total || 0), page, totalPages: Math.ceil(Number(countRows[0]?.total || 0) / limit) });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw httpError(400, 'ID pesanan tidak valid');
    const order = await loadOrder(db, id, scopedBranch(req, req.query.branch_id));
    if (!order) throw httpError(404, 'Pesanan tidak ditemukan');
    const items = await orderItems(db, id);
    let invoice = null;
    if (order.transaction_id) {
      const [rows] = await db.execute('SELECT id, invoice_no, grand_total, transaction_date FROM transactions WHERE id = ? LIMIT 1', [order.transaction_id]);
      invoice = rows[0] || null;
    }
    res.json({ success: true, data: { ...order, items, invoice } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------- aksi ------

async function transition(req, id, { from, to, fields = [], params = [] }) {
  const branchId = scopedBranch(req, req.body?.branch_id);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const order = await loadOrder(connection, id, branchId);
    if (!order) throw httpError(404, 'Pesanan tidak ditemukan');
    const allowed = Array.isArray(from) ? from : [from];
    if (!allowed.includes(order.status)) {
      throw httpError(409, `Status pesanan ${order.status} tidak dapat diubah menjadi ${to}`);
    }
    const sets = ['status = ?', ...fields];
    await connection.execute(
      `UPDATE reseller_orders SET ${sets.join(', ')} WHERE id = ?`,
      [to, ...params, id],
    );
    await connection.commit();
    return order;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

router.post('/orders/:id/confirm', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const order = await transition(req, id, { from: ['new'], to: 'confirmed' });
    res.json({ success: true, data: { id, order_no: order.order_no, status: 'confirmed' } });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/reject', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason ?? '').trim().slice(0, 255);
    if (reason.length < 3) throw httpError(400, 'Alasan penolakan wajib diisi');
    const order = await transition(req, id, {
      from: ['new', 'confirmed'],
      to: 'rejected',
      fields: ['reject_reason = ?'],
      params: [reason],
    });
    res.json({ success: true, data: { id, order_no: order.order_no, status: 'rejected' } });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/mark-paid', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const order = await transition(req, id, {
      from: ['new', 'confirmed'],
      to: 'paid',
      fields: ['payment_status = ?', 'paid_at = NOW()'],
      params: ['paid'],
    });
    res.json({ success: true, data: { id, order_no: order.order_no, status: 'paid', payment_status: 'paid' } });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/ship', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const courier = String(req.body?.courier ?? '').trim().slice(0, 40);
    const trackingNo = String(req.body?.tracking_no ?? '').trim().slice(0, 80);
    if (!trackingNo) throw httpError(400, 'Nomor resi wajib diisi');
    const order = await transition(req, id, {
      from: ['paid'],
      to: 'shipped',
      fields: ['courier = ?', 'tracking_no = ?', 'shipped_at = NOW()'],
      params: [courier || null, trackingNo],
    });
    res.json({ success: true, data: { id, order_no: order.order_no, status: 'shipped', tracking_no: trackingNo } });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/done', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const order = await transition(req, id, { from: ['shipped'], to: 'done' });
    res.json({ success: true, data: { id, order_no: order.order_no, status: 'done' } });
  } catch (error) {
    next(error);
  }
});

async function nextInvoice(connection, branchId, businessDate) {
  await connection.execute(
    `INSERT INTO invoice_sequences (branch_id, business_date, last_number) VALUES (?, ?, 0)
     ON DUPLICATE KEY UPDATE last_number = last_number`,
    [branchId, businessDate],
  );
  await connection.execute(
    'UPDATE invoice_sequences SET last_number = last_number + 1 WHERE branch_id = ? AND business_date = ?',
    [branchId, businessDate],
  );
  const [rows] = await connection.execute(
    'SELECT last_number FROM invoice_sequences WHERE branch_id = ? AND business_date = ? FOR UPDATE',
    [branchId, businessDate],
  );
  const prefixRows = await connection.execute(
    "SELECT `value` FROM store_settings WHERE branch_id = ? AND `key` = 'invoice_prefix' LIMIT 1",
    [branchId],
  );
  const prefix = prefixRows[0]?.[0]?.value || 'INV';
  const number = Number(rows[0]?.last_number || 1);
  return `${prefix}-${businessDate.replace(/-/g, '')}-B${branchId}-${String(number).padStart(4, '0')}`;
}

// Konversi pesanan yang SUDAH DIBAYAR menjadi transaksi POS (stok berkurang,
// invoice resmi), lalu struk bisa dicetak lewat /api/printer/invoice/:id.
router.post('/orders/:id/convert', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  const id = Number(req.params.id);
  const branchId = scopedBranch(req, req.body?.branch_id);
  const paymentMethod = String(req.body?.payment_method || 'transfer');
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw httpError(400, 'Metode pembayaran tidak valid');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const order = await loadOrder(connection, id, branchId);
    if (!order) throw httpError(404, 'Pesanan tidak ditemukan');
    if (order.transaction_id) {
      const [existing] = await connection.execute('SELECT id, invoice_no FROM transactions WHERE id = ? LIMIT 1', [order.transaction_id]);
      await connection.commit();
      return res.json({ success: true, idempotent: true, data: { order_id: id, transaction_id: order.transaction_id, invoice_no: existing[0]?.invoice_no || null } });
    }
    if (order.payment_status !== 'paid') throw httpError(409, 'Tandai pesanan sudah dibayar sebelum membuat transaksi');

    const items = await orderItems(connection, id);
    if (!items.length) throw httpError(400, 'Pesanan tidak punya item');

    let warehouseId = Number(req.body?.warehouse_id) || null;
    if (warehouseId) {
      const [rows] = await connection.execute('SELECT id FROM warehouses WHERE id = ? AND branch_id = ? AND is_active = TRUE LIMIT 1', [warehouseId, order.branch_id]);
      if (!rows[0]) throw httpError(404, 'Gudang tidak ditemukan pada cabang pesanan');
    } else {
      const [rows] = await connection.execute(
        "SELECT id FROM warehouses WHERE branch_id = ? AND is_active = TRUE ORDER BY (type = 'utama') DESC, id LIMIT 1",
        [order.branch_id],
      );
      if (!rows[0]) throw httpError(400, 'Cabang pesanan belum punya gudang aktif');
      warehouseId = rows[0].id;
    }

    const productIds = [...new Set(items.map((item) => item.product_id).filter(Boolean))];
    let costById = new Map();
    if (productIds.length) {
      const marks = productIds.map(() => '?').join(',');
      const [rows] = await connection.execute(`SELECT id, cost FROM products WHERE id IN (${marks})`, productIds);
      costById = new Map(rows.map((row) => [Number(row.id), Number(row.cost || 0)]));
    }

    const businessDate = localDateString();
    const invoiceNo = await nextInvoice(connection, order.branch_id, businessDate);
    const subtotal = money(Number(order.subtotal));
    const discount = money(Number(order.discount));
    const shippingCost = money(Number(order.shipping_cost));
    const grandTotal = money(subtotal - discount + shippingCost);

    const [transaction] = await connection.execute(
      `INSERT INTO transactions
        (branch_id, transaction_date, invoice_no, user_id, customer_id, subtotal, discount_type, discount_value,
         discount, grand_total, shipping_cost, payment_method, amount_paid, \`change\`, notes, price_tier)
       VALUES (?, ?, ?, ?, ?, ?, 'nominal', ?, ?, ?, ?, ?, ?, 0, ?, 'retail')`,
      [
        order.branch_id,
        businessDate,
        invoiceNo,
        req.user.id,
        order.customer_id || null,
        subtotal,
        discount,
        discount,
        grandTotal,
        shippingCost,
        paymentMethod,
        grandTotal,
        `Pesanan reseller ${order.order_no}`,
      ],
    );

    for (const item of items) {
      const lineSubtotal = money(Number(item.subtotal));
      const quantity = Number(item.quantity);
      await connection.execute(
        `INSERT INTO transaction_items
          (transaction_id, product_id, variant_id, product_name, product_sku, variant_detail, quantity, price, discount, subtotal, cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          transaction.insertId,
          item.product_id,
          item.variant_id,
          item.product_name,
          item.sku,
          item.variant_label,
          quantity,
          Number(item.price),
          lineSubtotal,
          costById.get(Number(item.product_id)) || 0,
        ],
      );
      if (item.product_id) {
        await adjustStock(connection, {
          branchId: order.branch_id,
          warehouseId,
          productId: item.product_id,
          variantId: item.variant_id || null,
          delta: -quantity,
          userId: req.user.id,
          type: 'sale',
          referenceType: 'transaction',
          referenceId: transaction.insertId,
          channel: 'reseller',
          notes: `Pesanan ${order.order_no}`,
        });
      }
    }

    await connection.execute(
      'INSERT INTO transaction_payments (transaction_id, payment_method, amount) VALUES (?, ?, ?)',
      [transaction.insertId, paymentMethod, grandTotal],
    );
    await connection.execute(
      'UPDATE reseller_orders SET transaction_id = ? WHERE id = ?',
      [transaction.insertId, id],
    );
    await connection.commit();

    res.json({
      success: true,
      data: {
        order_id: id,
        order_no: order.order_no,
        transaction_id: transaction.insertId,
        invoice_no: invoiceNo,
        grand_total: grandTotal,
        shipping_cost: shippingCost,
      },
    });
  } catch (error) {
    try { await connection.rollback(); } catch { /* belum mulai */ }
    next(error);
  } finally {
    connection.release();
  }
});

// ---------------------------------------------------------------- akun ------

router.get('/accounts', async (req, res, next) => {
  try {
    const branchId = scopedBranch(req, req.query.branch_id);
    const params = [];
    let where = ' WHERE 1 = 1';
    if (branchId) { where += ' AND a.branch_id = ?'; params.push(branchId); }
    const search = String(req.query.search || '').trim();
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
      where += ' AND (a.email LIKE ? ESCAPE ? OR a.name LIKE ? ESCAPE ? OR a.phone LIKE ? ESCAPE ?)';
      params.push(like, '\\', like, '\\', like, '\\');
    }
    const [rows] = await db.execute(
      `SELECT a.id, a.email, a.name, a.phone, a.status, a.created_at, a.last_login_at,
              (SELECT COUNT(*) FROM reseller_orders o WHERE o.account_id = a.id) AS orders_count,
              (SELECT COALESCE(SUM(o.total), 0) FROM reseller_orders o WHERE o.account_id = a.id AND o.status IN ('paid','shipped','done')) AS total_spent
         FROM reseller_accounts a
         ${where}
         ORDER BY a.created_at DESC
         LIMIT 200`,
      params,
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

router.patch('/accounts/:id', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '').trim();
    if (!['active', 'suspended'].includes(status)) throw httpError(400, 'Status akun tidak valid');
    const branchId = scopedBranch(req, req.body?.branch_id);
    const params = [status, id];
    let sql = 'UPDATE reseller_accounts SET status = ? WHERE id = ?';
    if (branchId) { sql += ' AND branch_id = ?'; params.push(branchId); }
    const [result] = await db.execute(sql, params);
    if (!result.affectedRows) throw httpError(404, 'Akun tidak ditemukan');
    if (status === 'suspended') {
      await db.execute('DELETE FROM reseller_sessions WHERE account_id = ?', [id]);
    }
    res.json({ success: true, data: { id, status } });
  } catch (error) {
    next(error);
  }
});

router.post('/accounts/:id/reset-password', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const branchId = scopedBranch(req, req.body?.branch_id);
    const params = [id];
    let sql = 'SELECT id, email FROM reseller_accounts WHERE id = ?';
    if (branchId) { sql += ' AND branch_id = ?'; params.push(branchId); }
    const [rows] = await db.execute(sql, params);
    if (!rows[0]) throw httpError(404, 'Akun tidak ditemukan');

    // Password sementara: ditampilkan sekali ke admin untuk dikirim via WA.
    const temporary = crypto.randomBytes(5).toString('hex');
    const hash = await hashPassword(temporary);
    await db.execute('UPDATE reseller_accounts SET password_hash = ? WHERE id = ?', [hash, id]);
    await db.execute('DELETE FROM reseller_sessions WHERE account_id = ?', [id]);
    res.json({ success: true, data: { id, email: rows[0].email, temporary_password: temporary } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.__test = { scopedBranch, PAYMENT_METHODS, STATUSES };