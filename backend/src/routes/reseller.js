const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { localDateString } = require('../local-date');
const { money } = require('../money');
const {
  currentAccount,
  requireBuyer,
  normalizeEmail,
  isValidEmail,
  validatePassword,
  hashPassword,
  verifyPassword,
  startSession,
  endSession,
  recordFailure,
  isLocked,
  clearFailures,
} = require('../reseller-auth');

const router = express.Router();

// Endpoint publik pembeli: jangan pernah memakai cookie pegawai (pos_access).
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ success: false, message: 'Terlalu banyak percobaan, coba lagi beberapa menit lagi' }),
});

const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ success: false, message: 'Terlalu banyak pesanan dalam waktu singkat, coba lagi nanti' }),
});

const DEFAULT_BANK_ACCOUNTS = [
  { bank: 'BCA', number: '0042813603', holder: 'Miftahul Fauzan' },
  { bank: 'MANDIRI', number: '1640000929465', holder: 'Miftahul Fauzan' },
];

const httpError = (status, message) => Object.assign(new Error(message), { status });

async function resolveBranch(explicitId) {
  const id = Number(explicitId) || null;
  if (id) {
    const [rows] = await db.execute('SELECT id, name FROM branches WHERE id = ? AND is_active = TRUE LIMIT 1', [id]);
    if (rows[0]) return rows[0];
  }
  const [bySlug] = await db.execute("SELECT id, name FROM branches WHERE landing_slug = 'reseller' AND is_active = TRUE LIMIT 1");
  if (bySlug[0]) return bySlug[0];
  const [gudang] = await db.execute("SELECT id, name FROM branches WHERE LOWER(TRIM(name)) = 'gudang utama' AND is_active = TRUE ORDER BY id LIMIT 1");
  return gudang[0] || null;
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d+]/g, '').trim();
}

function publicOrder(row, items = []) {
  return {
    order_no: row.order_no,
    status: row.status,
    payment_status: row.payment_status,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    shipping_cost: Number(row.shipping_cost),
    total: Number(row.total),
    courier: row.courier || null,
    tracking_no: row.tracking_no || null,
    created_at: row.created_at,
    paid_at: row.paid_at || null,
    shipped_at: row.shipped_at || null,
    invoice_no: row.invoice_no || null,
    reject_reason: row.reject_reason || null,
    items: items.map((item) => ({
      name: item.product_name,
      sku: item.sku,
      variant: item.variant_label || null,
      price: Number(item.price),
      quantity: Number(item.quantity),
      subtotal: Number(item.subtotal),
    })),
  };
}

// ------------------------------------------------------------------ akun ----

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? '');
    const name = String(req.body?.name ?? '').trim();
    const phone = normalizePhone(req.body?.phone);
    if (!isValidEmail(email)) throw httpError(400, 'Email tidak valid');
    const passwordError = validatePassword(password);
    if (passwordError) throw httpError(400, passwordError);
    if (name.length < 2) throw httpError(400, 'Nama minimal 2 karakter');
    if (phone.length < 8) throw httpError(400, 'Nomor WhatsApp tidak valid');

    const [existing] = await db.execute('SELECT id FROM reseller_accounts WHERE email = ? LIMIT 1', [email]);
    if (existing[0]) throw httpError(409, 'Email sudah terdaftar');

    const branch = await resolveBranch(req.body?.branch_id);
    if (!branch) throw httpError(503, 'Katalog reseller belum tersedia');

    const [customers] = await db.execute('SELECT id FROM customers WHERE branch_id = ? AND phone = ? LIMIT 1', [branch.id, phone]);
    let customerId = customers[0]?.id || null;
    if (!customerId) {
      const [inserted] = await db.execute(
        'INSERT INTO customers (branch_id, name, phone, price_tier) VALUES (?, ?, ?, ?)',
        [branch.id, name, phone, 'reguler'],
      );
      customerId = inserted.insertId;
    }

    const passwordHash = await hashPassword(password);
    const [account] = await db.execute(
      'INSERT INTO reseller_accounts (branch_id, customer_id, email, password_hash, name, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [branch.id, customerId, email, passwordHash, name, phone],
    );

    // Tautkan pesanan guest sebelumnya yang memakai nomor HP yang sama.
    await db.execute(
      'UPDATE reseller_orders SET account_id = ?, customer_id = ? WHERE account_id IS NULL AND buyer_phone = ? AND branch_id = ?',
      [account.insertId, customerId, phone, branch.id],
    );

    const token = await startSession(res, { id: account.insertId }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json({
      success: true,
      data: { id: account.insertId, email, name, phone, session: Boolean(token) },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? '');
    if (isLocked(email)) throw httpError(429, 'Terlalu banyak percobaan. Coba lagi dalam 15 menit');
    const [rows] = await db.execute(
      'SELECT id, email, name, phone, password_hash, status FROM reseller_accounts WHERE email = ? LIMIT 1',
      [email],
    );
    const account = rows[0];
    const valid = account ? await verifyPassword(password, account.password_hash) : false;
    if (!valid) {
      recordFailure(email);
      throw httpError(401, 'Email atau password salah');
    }
    if (account.status !== 'active') throw httpError(403, 'Akun ini sedang tidak aktif. Hubungi admin');
    clearFailures(email);
    await startSession(res, account, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, data: { id: account.id, email: account.email, name: account.name, phone: account.phone } });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    await endSession(req, res);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const account = await currentAccount(req);
    if (!account) return res.json({ success: true, data: null });
    const [addresses] = await db.execute(
      'SELECT id, label, recipient, phone, address, city, postal_code, is_default FROM customer_addresses WHERE account_id = ? ORDER BY is_default DESC, id',
      [account.id],
    );
    res.json({ success: true, data: { ...account, addresses } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------- alamat ----

router.get('/addresses', requireBuyer, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, label, recipient, phone, address, city, postal_code, is_default FROM customer_addresses WHERE account_id = ? ORDER BY is_default DESC, id',
      [req.buyer.id],
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

router.post('/addresses', requireBuyer, async (req, res, next) => {
  try {
    const label = String(req.body?.label ?? '').trim().slice(0, 60) || null;
    const recipient = String(req.body?.recipient ?? '').trim();
    const phone = normalizePhone(req.body?.phone);
    const address = String(req.body?.address ?? '').trim();
    const city = String(req.body?.city ?? '').trim() || null;
    const postalCode = String(req.body?.postal_code ?? '').trim() || null;
    const isDefault = req.body?.is_default === true;
    if (recipient.length < 2) throw httpError(400, 'Nama penerima wajib diisi');
    if (phone.length < 8) throw httpError(400, 'Nomor HP penerima tidak valid');
    if (address.length < 8) throw httpError(400, 'Alamat terlalu pendek');

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      if (isDefault) {
        await connection.execute('UPDATE customer_addresses SET is_default = FALSE WHERE account_id = ?', [req.buyer.id]);
      }
      const [result] = await connection.execute(
        'INSERT INTO customer_addresses (account_id, label, recipient, phone, address, city, postal_code, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [req.buyer.id, label, recipient, phone, address, city, postalCode, isDefault],
      );
      await connection.commit();
      res.status(201).json({ success: true, data: { id: result.insertId } });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    next(error);
  }
});

router.put('/addresses/:id', requireBuyer, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw httpError(400, 'ID alamat tidak valid');
    const [rows] = await db.execute('SELECT id FROM customer_addresses WHERE id = ? AND account_id = ? LIMIT 1', [id, req.buyer.id]);
    if (!rows[0]) throw httpError(404, 'Alamat tidak ditemukan');

    const fields = [];
    const params = [];
    const map = {
      label: (v) => String(v ?? '').trim().slice(0, 60) || null,
      recipient: (v) => String(v ?? '').trim(),
      phone: (v) => normalizePhone(v),
      address: (v) => String(v ?? '').trim(),
      city: (v) => String(v ?? '').trim() || null,
      postal_code: (v) => String(v ?? '').trim() || null,
    };
    for (const [key, transform] of Object.entries(map)) {
      if (req.body?.[key] !== undefined) {
        fields.push(`\`${key}\` = ?`);
        params.push(transform(req.body[key]));
      }
    }
    if (!fields.length && req.body?.is_default === undefined) throw httpError(400, 'Tidak ada perubahan');
    if (req.body?.is_default === true) {
      await db.execute('UPDATE customer_addresses SET is_default = FALSE WHERE account_id = ?', [req.buyer.id]);
      fields.push('is_default = TRUE');
    } else if (req.body?.is_default === false) {
      fields.push('is_default = FALSE');
    }
    params.push(id, req.buyer.id);
    await db.execute(`UPDATE customer_addresses SET ${fields.join(', ')} WHERE id = ? AND account_id = ?`, params);
    res.json({ success: true, data: { id } });
  } catch (error) {
    next(error);
  }
});

router.delete('/addresses/:id', requireBuyer, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [result] = await db.execute('DELETE FROM customer_addresses WHERE id = ? AND account_id = ?', [id, req.buyer.id]);
    if (!result.affectedRows) throw httpError(404, 'Alamat tidak ditemukan');
    res.json({ success: true, data: { id } });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------- informasi bayar ----

router.get('/payment-info', async (req, res, next) => {
  try {
    const branch = await resolveBranch(req.query.branch_id);
    let banks = DEFAULT_BANK_ACCOUNTS;
    let qris = null;
    let note = 'Kirim bukti transfer ke WhatsApp admin agar pesanan segera diproses.';
    if (branch) {
      const [rows] = await db.execute(
        "SELECT `key`, `value` FROM store_settings WHERE branch_id = ? AND `key` IN ('payment_bank_accounts','payment_qris_image','payment_note')",
        [branch.id],
      );
      const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
      if (map.payment_bank_accounts) {
        try {
          const parsed = JSON.parse(map.payment_bank_accounts);
          if (Array.isArray(parsed) && parsed.length) {
            banks = parsed
              .filter((item) => item && item.bank && item.number)
              .map((item) => ({ bank: String(item.bank), number: String(item.number), holder: String(item.holder || '') }));
          }
        } catch { /* pakai default */ }
      }
      if (map.payment_qris_image) qris = map.payment_qris_image;
      if (map.payment_note) note = map.payment_note;
    }
    res.json({ success: true, data: { branch_id: branch?.id || null, bank_accounts: banks, qris_image: qris, note } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------- pesanan ----

async function nextOrderNo(connection, branchId, businessDate) {
  await connection.execute(
    `INSERT INTO reseller_sequences (branch_id, business_date, last_number) VALUES (?, ?, 0)
     ON DUPLICATE KEY UPDATE last_number = last_number`,
    [branchId, businessDate],
  );
  await connection.execute(
    'UPDATE reseller_sequences SET last_number = last_number + 1 WHERE branch_id = ? AND business_date = ?',
    [branchId, businessDate],
  );
  const [rows] = await connection.execute(
    'SELECT last_number FROM reseller_sequences WHERE branch_id = ? AND business_date = ? FOR UPDATE',
    [branchId, businessDate],
  );
  const number = Number(rows[0]?.last_number || 1);
  return `RS-${businessDate.replace(/-/g, '')}-B${branchId}-${String(number).padStart(4, '0')}`;
}

async function voucherDiscount(connection, branchId, code, subtotal, pcs) {
  const trimmed = String(code || '').trim();
  if (!trimmed) return { discount: 0, code: null };
  const [rows] = await connection.execute(
    `SELECT code, discount_type, discount_value, min_purchase, max_discount
       FROM promotions
      WHERE branch_id = ? AND UPPER(code) = UPPER(?) AND is_active = TRUE
        AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW())
      LIMIT 1`,
    [branchId, trimmed],
  );
  const promo = rows[0];
  if (!promo) throw httpError(400, 'Kode voucher tidak berlaku');
  if (subtotal < Number(promo.min_purchase)) throw httpError(400, 'Belanja minimum untuk voucher ini belum terpenuhi');
  let discount;
  if (promo.discount_type === 'per_pcs') discount = Number(promo.discount_value) * Math.max(0, pcs);
  else if (promo.discount_type === 'percentage') discount = subtotal * Number(promo.discount_value) / 100;
  else discount = Number(promo.discount_value);
  if (promo.max_discount !== null) discount = Math.min(discount, Number(promo.max_discount));
  return { discount: Math.min(Math.round(discount), subtotal), code: promo.code };
}

router.post('/orders', orderLimiter, async (req, res, next) => {
  const account = await currentAccount(req);
  const connection = await db.getConnection();
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) throw httpError(400, 'Keranjang belanja masih kosong');
    const buyerName = String(req.body?.buyer?.name ?? account?.name ?? '').trim();
    const buyerPhone = normalizePhone(req.body?.buyer?.phone ?? account?.phone ?? '');
    const buyerAddress = String(req.body?.buyer?.address ?? '').trim();
    if (buyerName.length < 2) throw httpError(400, 'Nama penerima wajib diisi');
    if (buyerPhone.length < 8) throw httpError(400, 'Nomor WhatsApp tidak valid');
    if (buyerAddress.length < 8) throw httpError(400, 'Alamat pengiriman wajib diisi');
    const clientOrderId = String(req.body?.client_order_id ?? '').trim() || null;
    if (clientOrderId && clientOrderId.length > 64) throw httpError(400, 'client_order_id terlalu panjang');

    if (clientOrderId) {
      const [existing] = await db.execute(
        'SELECT id, order_no, public_token, total, status, payment_status FROM reseller_orders WHERE client_order_id = ? LIMIT 1',
        [clientOrderId],
      );
      if (existing[0]) {
        return res.json({ success: true, idempotent: true, data: existing[0] });
      }
    }

    const branch = account ? await resolveBranch(account.branch_id) : await resolveBranch(req.body?.branch_id);
    if (!branch) throw httpError(503, 'Katalog reseller belum tersedia');

    await connection.beginTransaction();
    const productIds = [...new Set(items.map((item) => Number(item.product_id)))];
    if (productIds.some((id) => !Number.isInteger(id))) throw httpError(400, 'Produk tidak valid');
    const marks = productIds.map(() => '?').join(',');
    const [products] = await connection.execute(
      `SELECT id, name, sku, price FROM products WHERE branch_id = ? AND is_active = TRUE AND id IN (${marks}) FOR SHARE`,
      [branch.id, ...productIds],
    );
    if (products.length !== productIds.length) throw httpError(400, 'Satu atau lebih produk tidak ditemukan');
    const productById = new Map(products.map((product) => [Number(product.id), product]));

    const lines = [];
    let subtotal = 0;
    let pcs = 0;
    for (const input of items) {
      const productId = Number(input.product_id);
      const quantity = Number(input.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 999) throw httpError(400, 'Jumlah item tidak valid');
      const product = productById.get(productId);
      const variantId = input.variant_id ? Number(input.variant_id) : null;
      let variantLabel = null;
      let price = money(product.price);
      if (variantId) {
        const [variants] = await connection.execute(
          'SELECT id, color, size, price FROM product_variants WHERE id = ? AND product_id = ? AND is_active = TRUE LIMIT 1',
          [variantId, productId],
        );
        const variant = variants[0];
        if (!variant) throw httpError(400, `Varian ${product.name} tidak ditemukan`);
        if (Number(variant.price) > 0) price = money(variant.price);
        variantLabel = [variant.color, variant.size].filter(Boolean).join(' / ') || null;
      }
      const lineSubtotal = money(price * quantity);
      subtotal = money(subtotal + lineSubtotal);
      pcs += quantity;
      lines.push({ productId, variantId, variantLabel, product, price, quantity, lineSubtotal });
    }
    subtotal = money(lines.reduce((total, line) => total + line.lineSubtotal, 0));

    const { discount, code: promoCode } = await voucherDiscount(connection, branch.id, req.body?.voucher_code, subtotal, pcs);

    // Ongkir: kalau area cocok dengan tarif manual cabang, pakai tarif server.
    // Selain itu (mis. RajaOngkir) nilai dari klien dipakai apa adanya, admin
    // tetap mengonfirmasi sebelum transaksi dibuat.
    let shippingCost = 0;
    const shippingArea = String(req.body?.shipping_area ?? '').trim();
    if (shippingArea) {
      const [rates] = await connection.execute(
        'SELECT cost, cost_per_kg FROM shipping_rates WHERE branch_id = ? AND is_active = 1 AND LOWER(TRIM(area)) = LOWER(TRIM(?)) LIMIT 1',
        [branch.id, shippingArea],
      );
      if (rates[0]) shippingCost = money(rates[0].cost);
    }
    if (!shippingCost) {
      const provided = Number(req.body?.shipping_cost);
      if (Number.isFinite(provided) && provided > 0) shippingCost = money(Math.min(provided, 1_000_000));
    }

    const total = money(subtotal - discount + shippingCost);
    const businessDate = localDateString();
    const orderNo = await nextOrderNo(connection, branch.id, businessDate);
    const publicToken = crypto.randomBytes(16).toString('hex');

    let customerId = account?.customer_id || null;
    if (!customerId) {
      const [existingCustomer] = await connection.execute(
        'SELECT id FROM customers WHERE branch_id = ? AND phone = ? LIMIT 1',
        [branch.id, buyerPhone],
      );
      if (existingCustomer[0]) customerId = existingCustomer[0].id;
      else {
        const [created] = await connection.execute(
          'INSERT INTO customers (branch_id, name, phone, price_tier) VALUES (?, ?, ?, ?)',
          [branch.id, buyerName, buyerPhone, 'reguler'],
        );
        customerId = created.insertId;
      }
    }

    const [order] = await connection.execute(
      `INSERT INTO reseller_orders
        (order_no, public_token, branch_id, account_id, customer_id, buyer_name, buyer_phone,
         buyer_address, buyer_city, buyer_postal, notes, subtotal, discount, shipping_cost, total,
         client_order_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNo,
        publicToken,
        branch.id,
        account?.id || null,
        customerId,
        buyerName,
        buyerPhone,
        buyerAddress,
        String(req.body?.buyer?.city ?? '').trim() || null,
        String(req.body?.buyer?.postal_code ?? '').trim() || null,
        [String(req.body?.buyer?.note ?? '').trim(), promoCode ? `Voucher ${promoCode}` : null].filter(Boolean).join(' · ') || null,
        subtotal,
        discount,
        shippingCost,
        total,
        clientOrderId,
      ],
    );

    for (const line of lines) {
      await connection.execute(
        `INSERT INTO reseller_order_items
          (order_id, product_id, variant_id, product_name, sku, variant_label, price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [order.insertId, line.productId, line.variantId, line.product.name, line.product.sku, line.variantLabel, line.price, line.quantity, line.lineSubtotal],
      );
    }

    await connection.commit();
    res.status(201).json({
      success: true,
      data: {
        id: order.insertId,
        order_no: orderNo,
        public_token: publicToken,
        subtotal,
        discount,
        shipping_cost: shippingCost,
        total,
        status: 'new',
        payment_status: 'unpaid',
      },
    });
  } catch (error) {
    try { await connection.rollback(); } catch { /* transaksi mungkin belum mulai */ }
    next(error);
  } finally {
    connection.release();
  }
});

router.get('/orders', requireBuyer, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT o.order_no, o.public_token, o.status, o.payment_status, o.subtotal, o.discount,
              o.shipping_cost, o.total, o.courier, o.tracking_no, o.created_at, o.paid_at,
              o.shipped_at, o.reject_reason, t.invoice_no
         FROM reseller_orders o
         LEFT JOIN transactions t ON t.id = o.transaction_id
        WHERE o.account_id = ?
        ORDER BY o.created_at DESC
        LIMIT 100`,
      [req.buyer.id],
    );
    res.json({ success: true, data: rows.map((row) => publicOrder(row)) });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/lookup', async (req, res, next) => {
  try {
    const orderNo = String(req.query.order_no ?? '').trim();
    const phone = normalizePhone(req.query.phone);
    if (!orderNo || phone.length < 8) throw httpError(400, 'Nomor pesanan dan nomor WhatsApp wajib diisi');
    const [rows] = await db.execute(
      `SELECT o.*, t.invoice_no FROM reseller_orders o LEFT JOIN transactions t ON t.id = o.transaction_id
        WHERE o.order_no = ? LIMIT 1`,
      [orderNo],
    );
    const order = rows[0];
    if (!order || normalizePhone(order.buyer_phone) !== phone) {
      throw httpError(404, 'Pesanan tidak ditemukan untuk nomor tersebut');
    }
    const [items] = await db.execute(
      'SELECT product_name, sku, variant_label, price, quantity, subtotal FROM reseller_order_items WHERE order_id = ? ORDER BY id',
      [order.id],
    );
    res.json({ success: true, data: { ...publicOrder(order, items), public_token: order.public_token, buyer_name: order.buyer_name, buyer_phone: order.buyer_phone.slice(0, 4) + '••••' + order.buyer_phone.slice(-3) } });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/:token', async (req, res, next) => {
  try {
    const token = String(req.params.token ?? '').trim();
    if (!/^[0-9a-f]{32}$/i.test(token)) throw httpError(400, 'Tautan pesanan tidak valid');
    const [rows] = await db.execute(
      `SELECT o.*, t.invoice_no FROM reseller_orders o LEFT JOIN transactions t ON t.id = o.transaction_id
        WHERE o.public_token = ? LIMIT 1`,
      [token],
    );
    const order = rows[0];
    if (!order) throw httpError(404, 'Pesanan tidak ditemukan');
    const [items] = await db.execute(
      'SELECT product_name, sku, variant_label, price, quantity, subtotal FROM reseller_order_items WHERE order_id = ? ORDER BY id',
      [order.id],
    );
    res.json({ success: true, data: { ...publicOrder(order, items), buyer_name: order.buyer_name } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.resolveBranch = resolveBranch;
module.exports.__test = { nextOrderNo, voucherDiscount, publicOrder, normalizePhone };