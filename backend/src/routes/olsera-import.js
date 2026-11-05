const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticate, authorize } = require('../auth');
const {
  IMPORT_PROFILES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  parseFiles,
  previewPayload,
  transactionPayload,
} = require('../olsera-import');

const router = express.Router();
router.use(authenticate, authorize('owner'));

const aggregateMemoryStorage = {
  _handleFile(req, file, callback) {
    const chunks = [];
    let size = 0;
    let finished = false;
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      callback(error, result);
    };
    file.stream.on('data', (chunk) => {
      if (finished) return;
      size += chunk.length;
      req.olseraUploadBytes = (req.olseraUploadBytes || 0) + chunk.length;
      if (req.olseraUploadBytes > MAX_TOTAL_BYTES) {
        chunks.length = 0;
        finish(Object.assign(new Error('Ukuran seluruh file melebihi 20 MB'), { status: 413 }));
        file.stream.resume();
        return;
      }
      chunks.push(chunk);
    });
    file.stream.once('limit', () => finish(Object.assign(new Error('Ukuran satu file melebihi 8 MB'), { status: 413 })));
    file.stream.once('error', (error) => finish(error));
    file.stream.once('end', () => {
      if (!finished) finish(null, { buffer: Buffer.concat(chunks, size), size });
    });
  },
  _removeFile(_req, file, callback) {
    delete file.buffer;
    callback(null);
  },
};

const upload = multer({
  storage: aggregateMemoryStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: MAX_FILES, fields: 2, parts: MAX_FILES + 2, fieldSize: 1024 * 1024 },
  fileFilter(_req, file, callback) {
    if (!String(file.originalname || '').toLowerCase().endsWith('.xlsx')) {
      callback(Object.assign(new Error('Pilih file laporan Excel .xlsx dari Olsera.'), { status: 400 }));
      return;
    }
    callback(null, true);
  },
});

function receiveFiles(req, res, next) {
  const length = Number(req.headers['content-length'] || 0);
  if (length > MAX_TOTAL_BYTES + 2 * 1024 * 1024) {
    return res.status(413).json({ success: false, message: 'Ukuran seluruh file melebihi 20 MB.' });
  }
  upload.array('files', MAX_FILES)(req, res, (error) => {
    if (!error) return next();
    const status = error.status || (error instanceof multer.MulterError ? 400 : 400);
    const message = error.status === 413 || error.code === 'LIMIT_FILE_SIZE'
      ? 'Ukuran file melebihi batas impor.'
      : error.status ? error.message : 'Unggahan laporan Olsera tidak valid.';
    return res.status(status).json({ success: false, message });
  });
}

function parseMappings(value) {
  if (!value) return {};
  try {
    const mappings = JSON.parse(value);
    if (!mappings || Array.isArray(mappings) || typeof mappings !== 'object') throw new Error();
    return mappings;
  } catch {
    throw Object.assign(new Error('Pemetaan produk tidak valid.'), { status: 400 });
  }
}

function getImportProfile(profileId) {
  const profile = IMPORT_PROFILES[String(profileId || 'blok_b')];
  if (!profile) throw Object.assign(new Error('Pilih sumber impor Olsera yang valid.'), { status: 400 });
  return profile;
}

async function getTargetBranch(profile, branchId) {
  const id = Number(branchId);
  const metro = profile.id === 'pgmta_metro';
  const expectedBranch = metro ? /^anyostore\s+metro$/i : /(?:blok\s*b|toko\s*b)\b/i;
  const requestedName = metro ? 'Anyostore Metro' : 'Blok B';
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error(`Pilih cabang ${requestedName}.`), { status: 400 });
  const [rows] = await db.execute('SELECT id, name, type FROM branches WHERE id = ? AND is_active = TRUE LIMIT 1', [id]);
  const branch = rows[0];
  if (!branch) throw Object.assign(new Error('Cabang tidak ditemukan atau nonaktif.'), { status: 404 });
  if (branch.type !== 'toko' || !expectedBranch.test(String(branch.name || '').trim())) {
    throw Object.assign(new Error(`Profil ${requestedName} hanya dapat diimpor ke cabang ${requestedName}.`), { status: 403 });
  }
  return branch;
}

async function getCatalog(branchId) {
  const [rows] = await db.execute(
    `SELECT p.id, p.name, p.sku, v.id AS variant_id, v.sku AS variant_sku, v.color AS variant_color
     FROM products p
     LEFT JOIN product_variants v ON v.product_id = p.id AND v.is_active = TRUE
     WHERE p.branch_id = ? AND p.is_active = TRUE
     ORDER BY p.name, p.id, v.id`,
    [branchId]
  );
  const productsById = new Map();
  for (const row of rows) {
    if (!productsById.has(Number(row.id))) productsById.set(Number(row.id), { id: Number(row.id), name: row.name, sku: row.sku, variants: [] });
    if (row.variant_id) productsById.get(Number(row.id)).variants.push({ id: Number(row.variant_id), sku: row.variant_sku, color: row.variant_color });
  }
  return { rows, productsById, options: [...productsById.values()].map(({ id, name, sku }) => ({ id, name, sku })) };
}

async function buildPreview(req) {
  const profile = getImportProfile(req.body.source_profile);
  const branch = await getTargetBranch(profile, req.body.branch_id);
  const mappings = parseMappings(req.body.product_mappings);
  const catalog = await getCatalog(branch.id);
  const prepared = await parseFiles(req.files, catalog.rows, mappings, profile);
  const [existing] = await db.execute(
    "SELECT source_order_no FROM transactions WHERE branch_id = ? AND source_system = 'olsera'",
    [branch.id]
  );
  const [manualRows] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM transactions
     WHERE branch_id = ? AND transaction_date BETWEEN ? AND ?
       AND (source_system IS NULL OR source_system <> 'olsera')`,
    [branch.id, profile.startDate, profile.endDate]
  );
  const existingOrders = new Set(existing.map((row) => row.source_order_no));
  return {
    branch,
    profile,
    catalog,
    prepared,
    mappings,
    preview: {
      ...previewPayload(prepared, existingOrders),
      source_profile: profile.id,
      source_label: profile.label,
      existing_manual_transactions: Number(manualRows[0]?.total || 0),
      start_date_limit: profile.startDate,
      end_date_limit: profile.endDate,
      branch_id: branch.id,
      branch_name: branch.name,
      product_options: catalog.options,
    },
  };
}

router.post('/preview', receiveFiles, async (req, res) => {
  try {
    const { preview } = await buildPreview(req);
    res.set('Cache-Control', 'no-store').json({ success: true, data: preview });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, message: error.status ? error.message : 'File laporan tidak dapat dibaca. Pastikan laporan Rincian Penjualan dan Item Penjualan lengkap.' });
  }
});

function invoiceCandidate(transaction) {
  const candidate = transaction.total < 0 ? (transaction.returnNo || transaction.sourceOrderNo) : transaction.sourceOrderNo;
  return /^[A-Za-z0-9._/-]{1,30}$/.test(candidate) ? candidate : '';
}

async function existingInvoiceNumbers(candidates) {
  const existing = new Set();
  const unique = [...new Set(candidates.filter(Boolean))];
  for (let offset = 0; offset < unique.length; offset += 500) {
    const batch = unique.slice(offset, offset + 500);
    if (!batch.length) continue;
    const marks = batch.map(() => '?').join(',');
    const [rows] = await db.execute(`SELECT invoice_no FROM transactions WHERE invoice_no IN (${marks})`, batch);
    for (const row of rows) existing.add(row.invoice_no);
  }
  return existing;
}

function paymentMethodForRow(method) {
  return ['cash', 'qris', 'debit', 'transfer', 'credit', 'other'].includes(method) ? method : 'other';
}

async function saveBatch(connection, branchId, userId, payloads, finalBatch, totalTransactions, totalReturns, profile) {
  const transactionColumns = [
    'branch_id', 'transaction_date', 'invoice_no', 'offline_invoice_no', 'client_transaction_id', 'user_id', 'customer_id',
    'subtotal', 'discount_type', 'discount_value', 'discount', 'grand_total', 'payment_method', 'amount_paid', 'change',
    'notes', 'status', 'created_at', 'price_tier', 'source_system', 'source_order_no', 'source_cashier', 'source_customer_name', 'source_order_source',
  ];
  const rows = payloads.map((item) => [
    branchId, item.transactionDate, item.invoiceNo, item.offlineInvoiceNo, null, userId, null,
    item.subtotal, item.discountType, item.discount, item.discount, item.total, item.paymentMethod, item.amountPaid, item.change,
    item.notes, item.status, item.createdAt, item.priceTier, 'olsera', item.sourceOrderNo,
    item.sourceCashier, item.sourceCustomerName, item.sourceOrderSource,
  ]);
  const columnsSql = transactionColumns.map((column) => column === 'change' ? '`change`' : `\`${column}\``).join(', ');
  await connection.query(`INSERT INTO transactions (${columnsSql}) VALUES ?`, [rows]);

  const sourceOrders = payloads.map((item) => item.sourceOrderNo);
  const marks = sourceOrders.map(() => '?').join(',');
  const [inserted] = await connection.execute(
    `SELECT id, source_order_no FROM transactions WHERE branch_id = ? AND source_system = 'olsera' AND source_order_no IN (${marks})`,
    [branchId, ...sourceOrders]
  );
  const idBySource = new Map(inserted.map((row) => [row.source_order_no, Number(row.id)]));
  const itemRows = [];
  const paymentRows = [];
  for (const transaction of payloads) {
    const transactionId = idBySource.get(transaction.sourceOrderNo);
    if (!transactionId) throw new Error('Transaksi impor tidak ditemukan setelah disimpan.');
    for (const item of transaction.items) {
      itemRows.push([
        transactionId, item.productId, item.variantId, item.productName, item.productSku, item.variantDetail,
        item.quantity, item.price, item.originalPrice, 0, item.discount, item.subtotal, item.cost,
      ]);
    }
    for (const payment of transaction.payments) {
      paymentRows.push([transactionId, paymentMethodForRow(payment.method), payment.amount, null]);
    }
  }
  if (itemRows.length) {
    await connection.query(
      `INSERT INTO transaction_items (transaction_id, product_id, variant_id, product_name, product_sku, variant_detail, quantity, price, original_price, price_override, discount, subtotal, cost) VALUES ?`,
      [itemRows]
    );
  }
  if (paymentRows.length) {
    await connection.query('INSERT INTO transaction_payments (transaction_id, payment_method, amount, reference) VALUES ?', [paymentRows]);
  }
  if (finalBatch) {
    await connection.execute(
      'INSERT INTO activity_logs (user_id, action, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
      [userId, 'olsera_history_import', `Impor ${profile.label} selesai: ${totalTransactions} transaksi, ${totalReturns} retur.`, 'import', 'Olsera history import']
    );
  }
}

router.post('/apply', receiveFiles, async (req, res) => {
  let imported = 0;
  try {
    const { branch, catalog, prepared, profile } = await buildPreview(req);
    const [existing] = await db.execute(
      "SELECT source_order_no FROM transactions WHERE branch_id = ? AND source_system = 'olsera'",
      [branch.id]
    );
    const existingOrders = new Set(existing.map((row) => row.source_order_no));
    const fresh = prepared.transactions.filter((transaction) => !existingOrders.has(transaction.sourceOrderNo));
    if (!fresh.length) return res.status(409).json({ success: false, message: 'Semua transaksi pada file ini sudah pernah diimpor.' });

    const existingInvoices = await existingInvoiceNumbers(fresh.map(invoiceCandidate));
    const usedInvoices = new Set();
    const payloads = fresh.map((transaction) => transactionPayload(
      transaction, branch.id, req.user.id, prepared.idsByRowName, prepared.idsByItemKey,
      prepared.variantIdsByItemKey, catalog.productsById, usedInvoices, existingInvoices
    ));

    const batchSize = 100;
    for (let offset = 0; offset < payloads.length; offset += batchSize) {
      const batch = payloads.slice(offset, offset + batchSize);
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        await saveBatch(
          connection, branch.id, req.user.id, batch,
          offset + batchSize >= payloads.length,
          payloads.length,
          payloads.filter((item) => item.total < 0).length,
          profile
        );
        await connection.commit();
        imported += batch.length;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }
    res.set('Cache-Control', 'no-store').json({
      success: true,
      data: {
        branch_name: branch.name,
        source_label: profile.label,
        imported_transactions: imported,
        imported_returns: payloads.filter((item) => item.total < 0).length,
        already_imported: prepared.transactions.length - fresh.length,
        stock_changed: false,
      },
    });
  } catch (error) {
    if (imported) {
      return res.status(500).json({
        success: false,
        imported_transactions: imported,
        message: `Impor berhenti setelah ${imported} transaksi tersimpan. Unggah file yang sama untuk melanjutkan; transaksi yang sudah masuk akan dilewati.`,
      });
    }
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Impor gagal. Periksa file lalu coba lagi.' });
  }
});

module.exports = router;
