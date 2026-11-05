const crypto = require('node:crypto');
const ExcelJS = require('exceljs');

const START_DATE = '2024-01-01';
const END_DATE = '2026-10-20';
const MAX_FILES = 80;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_ROWS_PER_FILE = 50_000;

function cleanText(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('').trim();
    if ('result' in value) return cleanText(value.result);
    if ('text' in value) return cleanText(value.text);
    return '';
  }
  return String(value).trim();
}

function datePart(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = cleanText(value);
  const match = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (match) return match[1];
  const local = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if (local) return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  return '';
}

function timePart(value) {
  if (value instanceof Date) return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}:${String(value.getUTCSeconds()).padStart(2, '0')}`;
  const text = cleanText(value);
  return text.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/)?.[1] || '00:00:00';
}

function numberValue(value, label, { allowBlank = false } = {}) {
  if (value == null || cleanText(value) === '') {
    if (allowBlank) return 0;
    throw new Error(`Kolom ${label} kosong`);
  }
  const number = typeof value === 'number' ? value : Number(cleanText(value).replace(/[^\d,.-]/g, '').replace(/,(?=\d{3}(?:\D|$))/g, ''));
  if (!Number.isFinite(number)) throw new Error(`Nilai ${label} tidak valid`);
  return number;
}

function normalizedName(value) {
  return cleanText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function orderNo(value) {
  return cleanText(value).replace(/\s+/g, ' ').trim();
}

function rowSignature(values) {
  return JSON.stringify(values.map((value) => typeof value === 'number' ? Number(value.toFixed(4)) : cleanText(value)));
}

function filenamePeriod(filename) {
  const match = String(filename || '').match(/(\d{4}-\d{2}-\d{2})__(\d{4}-\d{2}-\d{2})/);
  return match ? `${match[1]}__${match[2]}` : String(filename || 'unknown');
}

function headerColumns(worksheet, type) {
  const headers = new Map();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const header = normalizedName(cell.value);
    if (header) headers.set(header, column);
  });
  const required = type === 'sales'
    ? ['order no', 'order date', 'subtotal', 'total amount', 'payment mode', 'paid']
    : ['order no', 'order date', 'item name', 'qty', 'price', 'amount', 'total cost'];
  const missing = required.filter((name) => !headers.has(name));
  if (missing.length) throw new Error(`Format laporan ${type === 'sales' ? 'Rincian Penjualan' : 'Item Penjualan'} tidak dikenali (${missing.join(', ')})`);
  return (row, name) => {
    const column = headers.get(normalizedName(name));
    return column ? row.getCell(column).value : null;
  };
}

function getPaymentMethod(value) {
  const method = normalizedName(value);
  if (!method) return null;
  if (method.includes('qris')) return 'qris';
  if (method.includes('cash') || method.includes('tunai')) return 'cash';
  if (method.includes('debit')) return 'debit';
  if (method.includes('transfer') || method.includes('bank')) return 'transfer';
  if (method.includes('kredit') || method.includes('credit')) return 'credit';
  return 'other';
}

function paidValue(value) {
  return ['1', '1.0', 'true', 'yes', 'paid'].includes(normalizedName(value));
}

function sourceDate(row, get, isReturn) {
  return datePart(isReturn ? get(row, 'return date') : null)
    || datePart(get(row, 'order date'))
    || datePart(row.getCell(1).value);
}

async function parseWorkbook(file) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer) || file.buffer.length < 4 || file.buffer.subarray(0, 2).toString() !== 'PK') {
    throw new Error(`${file?.originalname || 'File'} bukan workbook .xlsx yang valid`);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount > MAX_ROWS_PER_FILE) throw new Error(`${file.originalname} berisi sheet kosong atau terlalu banyak baris`);
  const firstHeaders = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell) => firstHeaders.push(normalizedName(cell.value)));
  const type = firstHeaders.includes('item name') && firstHeaders.includes('qty') ? 'items' : 'sales';
  const get = headerColumns(worksheet, type);
  const rows = [];

  for (let index = 2; index <= worksheet.rowCount; index += 1) {
    const row = worksheet.getRow(index);
    if (!row.hasValues) continue;
    const no = orderNo(get(row, 'order no'));
    if (!no) continue;
    const rawQuantity = type === 'items' ? numberValue(get(row, 'qty'), 'qty') : 0;
    const isReturn = type === 'items' ? rawQuantity < 0 : numberValue(get(row, 'total amount'), 'total amount', { allowBlank: true }) < 0;
    const date = sourceDate(row, get, isReturn);
    if (!date || date < START_DATE || date > END_DATE) continue;

    if (type === 'sales') {
      const total = numberValue(get(row, 'total amount'), 'total amount', { allowBlank: true });
      const paid = paidValue(get(row, 'paid'));
      if (!paid && total >= 0) continue;
      const subtotal = numberValue(get(row, 'subtotal'), 'subtotal', { allowBlank: true });
      const discount = numberValue(get(row, 'discount'), 'discount', { allowBlank: true }) + numberValue(get(row, 'Nilai Voucher'), 'Nilai Voucher', { allowBlank: true });
      const payment1 = getPaymentMethod(get(row, 'payment mode'));
      const payment2 = getPaymentMethod(get(row, 'payment mode #2'));
      const amount1 = numberValue(get(row, 'payment amount'), 'payment amount', { allowBlank: true });
      const amount2 = numberValue(get(row, 'payment amount #2'), 'payment amount #2', { allowBlank: true });
      const rawNo = no;
      const returnNo = [...rawNo.matchAll(/\(([^()]*)\)/g)].map((match) => orderNo(match[1])).at(-1) || '';
      const orderDate = datePart(get(row, 'order date')) || date;
      const timestamp = `${date} ${timePart(isReturn ? get(row, 'return date') : get(row, 'order time'))}`;
      const customerType = normalizedName(get(row, 'customer type'));
      rows.push({
        type: isReturn ? 'return-header' : 'sale', sourceOrderNo: rawNo, returnNo, date,
        createdAt: timestamp, subtotal: isReturn ? -Math.abs(subtotal) : subtotal,
        total: isReturn ? -Math.abs(total) : total, discount: isReturn ? 0 : Math.max(0, discount), paid,
        sourceCashier: cleanText(get(row, 'served by') || get(row, 'sales name')).slice(0, 100) || null,
        sourceCustomerName: cleanText(get(row, 'customer name')).trim().slice(0, 100) || null,
        sourceOrderSource: cleanText(get(row, 'order source')).slice(0, 50) || null,
        customerType,
        payments: [{ method: payment1, amount: amount1 }, { method: payment2, amount: amount2 }].filter((payment) => payment.method),
        headerPaymentMethod: payment1 || payment2,
        rowIndex: index,
        signature: rowSignature([rawNo, orderDate, total, subtotal, discount, payment1, amount1, payment2, amount2, paid]),
      });
    } else {
      const quantity = rawQuantity;
      const price = numberValue(get(row, 'price'), 'price', { allowBlank: true });
      const originalPrice = numberValue(get(row, 'basic_price'), 'basic_price', { allowBlank: true });
      const lineDiscount = numberValue(get(row, 'discount amount'), 'discount amount', { allowBlank: true });
      const amount = numberValue(get(row, 'amount'), 'amount', { allowBlank: true });
      const totalCost = numberValue(get(row, 'total cost'), 'total cost', { allowBlank: true });
      const unitCost = numberValue(get(row, 'cost perunit'), 'cost perunit', { allowBlank: true });
      const itemName = cleanText(get(row, 'item name')).slice(0, 200);
      const sku = cleanText(get(row, 'item sku')).slice(0, 50);
      const itemDate = sourceDate(row, get, isReturn);
      const raw = {
        sourceOrderNo: no, date: itemDate, createdAt: `${itemDate} ${timePart(isReturn ? get(row, 'return date') : get(row, 'order time'))}`,
        quantity, price: Math.abs(price), originalPrice: Math.abs(originalPrice), discount: Math.max(0, lineDiscount),
        amount, unitCost: unitCost ? Math.abs(unitCost) : (quantity ? Math.abs(totalCost / quantity) : 0),
        itemName, sku, sourceGroup: cleanText(get(row, 'item group')).slice(0, 100) || null,
        isReturn, rowIndex: index,
      };
      raw.signature = rowSignature([raw.sourceOrderNo, raw.date, raw.itemName, raw.sku, raw.quantity, raw.price, raw.originalPrice, raw.discount, raw.amount, raw.unitCost, raw.sourceGroup]);
      rows.push(raw);
    }
  }

  return { type, period: filenamePeriod(file.originalname), filename: file.originalname, rows };
}

function combineFiles(parsedFiles) {
  const salesFiles = parsedFiles.filter((file) => file.type === 'sales');
  const itemFiles = parsedFiles.filter((file) => file.type === 'items');
  if (!salesFiles.length || !itemFiles.length) throw new Error('Pilih laporan Rincian Penjualan dan Item Penjualan untuk semua periode.');
  const salesPeriods = new Set(salesFiles.map((file) => file.period));
  const itemPeriods = new Set(itemFiles.map((file) => file.period));
  const unmatchedPeriods = [...salesPeriods].filter((period) => !itemPeriods.has(period))
    .concat([...itemPeriods].filter((period) => !salesPeriods.has(period)));
  if (unmatchedPeriods.length) {
    throw new Error('Pasangan file Rincian Penjualan dan Item Penjualan harus memakai rentang tanggal yang sama. Periksa periode ekspor yang belum berpasangan.');
  }

  const headers = new Map();
  const conflicts = [];
  for (const file of salesFiles) {
    for (const row of file.rows) {
      const previous = headers.get(row.sourceOrderNo);
      if (previous && previous.signature !== row.signature) conflicts.push(row.sourceOrderNo);
      else if (!previous) headers.set(row.sourceOrderNo, row);
    }
  }

  const perPeriod = new Map();
  for (const file of itemFiles) {
    const period = perPeriod.get(file.period) || new Map();
    const local = new Map();
    for (const row of file.rows) {
      const occurrence = local.get(row.signature) || { row, count: 0 };
      occurrence.count += 1;
      local.set(row.signature, occurrence);
    }
    for (const [signature, occurrence] of local) {
      const existing = period.get(signature);
      if (!existing || occurrence.count > existing.count) period.set(signature, occurrence);
    }
    perPeriod.set(file.period, period);
  }
  const itemOccurrences = new Map();
  for (const period of perPeriod.values()) {
    for (const [signature, occurrence] of period) {
      const existing = itemOccurrences.get(signature);
      if (!existing || occurrence.count > existing.count) itemOccurrences.set(signature, occurrence);
    }
  }
  const items = [];
  for (const { row, count } of itemOccurrences.values()) {
    for (let index = 0; index < count; index += 1) items.push(row);
  }
  return { headers, items, conflicts, salesFiles, itemFiles };
}

function matchProducts(products, itemRows, productMappings = {}) {
  const byName = new Map();
  const bySku = new Map();
  const productsById = new Map();
  for (const row of products) {
    const id = Number(row.id);
    const product = productsById.get(id) || { id, name: row.name, sku: row.sku, variants: [] };
    if (row.variant_id && !product.variants.some((variant) => Number(variant.id) === Number(row.variant_id))) {
      product.variants.push({ id: Number(row.variant_id), sku: row.variant_sku, color: row.variant_color });
    }
    productsById.set(id, product);
  }
  const addSku = (sku, match) => {
    const key = normalizedName(sku);
    if (key) bySku.set(key, [...(bySku.get(key) || []), match]);
  };
  for (const product of productsById.values()) {
    const nameKey = normalizedName(product.name);
    const skuKey = normalizedName(product.sku);
    if (nameKey) byName.set(nameKey, [...(byName.get(nameKey) || []), product]);
    if (skuKey) addSku(skuKey, { product, variantId: null });
    for (const variant of product.variants) addSku(variant.sku, { product, variantId: variant.id });
  }
  const idsByRowName = new Map();
  const idsByItemKey = new Map();
  const variantIdsByItemKey = new Map();
  const unmatched = new Map();
  for (const item of itemRows) {
    const key = item.itemName;
    const itemKey = `${key}\u0000${item.sku || ''}`;
    const nameKey = normalizedName(key);
    const skuKey = normalizedName(item.sku);
    let productId = Number(productMappings[key]) || null;
    let variantId = null;
    if (productId && !productsById.has(productId)) throw new Error(`Pemetaan produk untuk “${key}” bukan produk di cabang yang dipilih`);
    if (skuKey && bySku.get(skuKey)?.length === 1) {
      const match = bySku.get(skuKey)[0];
      if (!productId || Number(match.product.id) === productId) {
        productId = Number(match.product.id);
        variantId = match.variantId;
      }
    }
    if (!productId && byName.get(nameKey)?.length === 1) productId = Number(byName.get(nameKey)[0].id);
    idsByRowName.set(key, productId || null);
    idsByItemKey.set(itemKey, productId || null);
    variantIdsByItemKey.set(itemKey, variantId || null);
    if (!productId) {
      const entry = unmatched.get(key) || { sourceName: key, sku: item.sku, quantity: 0, rows: 0, amount: 0, suggestions: [] };
      entry.quantity += item.quantity;
      entry.rows += 1;
      entry.amount += item.amount;
      const code = nameKey.match(/\b[a-z]{1,5}\d{1,4}(?:\s+[a-z0-9]+)?\b/)?.[0];
      if (code && !entry.suggestions.length) {
        entry.suggestions = products.filter((product) => normalizedName(product.name).includes(code) || normalizedName(product.sku).includes(code)).slice(0, 6).map(({ id, name, sku }) => ({ id, name, sku }));
      }
      unmatched.set(key, entry);
    }
  }
  return { idsByRowName, idsByItemKey, variantIdsByItemKey, unmatched: [...unmatched.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)) };
}

function prepareImport(parsedFiles, products, productMappings = {}) {
  const combined = combineFiles(parsedFiles);
  if (combined.conflicts.length) throw new Error(`Ada data header transaksi berbeda untuk ${combined.conflicts.length} nomor order. Periksa ulang file ekspor yang tumpang tindih.`);
  const headerByItemNo = new Map();
  for (const header of combined.headers.values()) {
    headerByItemNo.set(header.sourceOrderNo, header);
    if (header.returnNo) headerByItemNo.set(header.returnNo, header);
  }
  const grouped = new Map();
  const unmatchedItems = [];
  let orphanPositiveRows = 0;
  for (const item of combined.items) {
    const header = headerByItemNo.get(item.sourceOrderNo);
    if (header) {
      if (header.type === 'sale' && !header.paid) continue;
      const group = grouped.get(header.sourceOrderNo) || [];
      const isReturn = header.type === 'return-header' || item.isReturn;
      group.push(isReturn
        ? { ...item, isReturn: true, quantity: -Math.abs(item.quantity), amount: -Math.abs(item.amount) }
        : item);
      grouped.set(header.sourceOrderNo, group);
    } else if (item.isReturn) {
      const key = `orphan-return:${item.sourceOrderNo}`;
      const group = grouped.get(key) || [];
      group.push(item);
      grouped.set(key, group);
    } else {
      orphanPositiveRows += 1;
      unmatchedItems.push(item);
    }
  }

  const eligibleHeaders = [...combined.headers.values()].filter((header) => header.type === 'return-header' || header.paid);
  const transactions = eligibleHeaders.map((header) => ({ ...header, items: grouped.get(header.sourceOrderNo) || [], isSyntheticReturn: false }));
  for (const [key, items] of grouped) {
    if (!key.startsWith('orphan-return:')) continue;
    const date = items[0]?.date;
    const returnTotal = -items.reduce((sum, item) => sum + Math.abs(item.amount), 0);
    const returnSubtotal = returnTotal;
    transactions.push({
      type: 'return-header', sourceOrderNo: key.slice('orphan-return:'.length), returnNo: key.slice('orphan-return:'.length),
      date, createdAt: items[0]?.createdAt || `${date} 00:00:00`, subtotal: returnSubtotal, total: returnTotal,
      discount: 0, paid: false, sourceCashier: null, sourceCustomerName: null, sourceOrderSource: 'RETUR TANPA HEADER OLSERA',
      customerType: '', payments: [], headerPaymentMethod: 'other', items, isSyntheticReturn: true,
    });
  }

  const allItems = transactions.flatMap((transaction) => transaction.items);
  const { idsByRowName, idsByItemKey, variantIdsByItemKey, unmatched } = matchProducts(products, allItems, productMappings);
  const byDate = transactions.sort((a, b) => a.date.localeCompare(b.date) || a.sourceOrderNo.localeCompare(b.sourceOrderNo));
  const dateCounts = new Map();
  let returnCount = 0;
  let headerOnlyCount = 0;
  let netSales = 0;
  let returnAmount = 0;
  for (const transaction of byDate) {
    dateCounts.set(transaction.date.slice(0, 7), (dateCounts.get(transaction.date.slice(0, 7)) || 0) + 1);
    if (transaction.total < 0) { returnCount += 1; returnAmount += Math.abs(transaction.total); }
    if (!transaction.items.length) headerOnlyCount += 1;
    netSales += transaction.total;
  }
  return {
    ...combined,
    transactions: byDate,
    idsByRowName,
    idsByItemKey,
    variantIdsByItemKey,
    unmatched,
    orphanPositiveRows,
    returnCount,
    headerOnlyCount,
    netSales,
    returnAmount,
    dateCounts: Object.fromEntries(dateCounts),
    eligibleHeaderCount: eligibleHeaders.length,
    paidExcluded: [...combined.headers.values()].filter((header) => header.type === 'sale' && !header.paid).length,
  };
}

async function parseFiles(files, products, productMappings = {}) {
  if (!Array.isArray(files) || files.length < 2 || files.length > MAX_FILES) throw new Error(`Pilih 2–${MAX_FILES} file laporan .xlsx`);
  const totalBytes = files.reduce((sum, file) => sum + (file.size || file.buffer?.length || 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Ukuran seluruh file melebihi 20 MB');
  const parsed = [];
  for (const file of files) parsed.push(await parseWorkbook(file));
  return prepareImport(parsed, products, productMappings);
}

function previewPayload(prepared, existingOrders = new Set()) {
  const fresh = prepared.transactions.filter((transaction) => !existingOrders.has(transaction.sourceOrderNo));
  const allNew = new Set(fresh.map((transaction) => transaction.sourceOrderNo));
  return {
    files: { sales: prepared.salesFiles.length, items: prepared.itemFiles.length },
    date_from: prepared.transactions.length ? prepared.transactions.reduce((min, row) => row.date < min ? row.date : min, END_DATE) : null,
    date_to: prepared.transactions.length ? prepared.transactions.reduce((max, row) => row.date > max ? row.date : max, START_DATE) : null,
    transactions: prepared.transactions.length,
    new_transactions: fresh.length,
    already_imported: prepared.transactions.length - fresh.length,
    returns: prepared.returnCount,
    return_amount: prepared.returnAmount,
    net_sales: prepared.transactions.reduce((sum, row) => sum + row.total, 0),
    header_only: prepared.headerOnlyCount,
    unpaid_excluded: prepared.paidExcluded,
    orphan_positive_items: prepared.orphanPositiveRows,
    unmatched_products: prepared.unmatched.length,
    unmatched_rows: prepared.unmatched.reduce((sum, row) => sum + row.rows, 0),
    unmatched: prepared.unmatched.slice(0, 200),
    monthly_transactions: Object.fromEntries(Object.entries(prepared.dateCounts).map(([month, count]) => [month, count])),
    can_apply: allNew.size > 0,
  };
}

function paymentMethodFor(transaction) {
  if (transaction.total < 0 && transaction.isSyntheticReturn) return 'other';
  const unique = [...new Set(transaction.payments.map((payment) => payment.method).filter(Boolean))];
  if (unique.length > 1) return 'split';
  return unique[0] || transaction.headerPaymentMethod || 'other';
}

function normalizedPriceTier(customerType) {
  if (customerType.includes('semi')) return 'semi_grosir';
  if (customerType.includes('seri') || customerType.includes('wholesale')) return 'grosir_seri';
  return 'retail';
}

function stableInvoice(branchId, sourceOrderNo) {
  return `OL-${branchId}-${crypto.createHash('sha1').update(sourceOrderNo).digest('hex').slice(0, 16).toUpperCase()}`;
}

function invoiceCandidate(transaction) {
  const candidate = transaction.total < 0 ? (transaction.returnNo || transaction.sourceOrderNo) : transaction.sourceOrderNo;
  return /^[A-Za-z0-9._/-]{1,30}$/.test(candidate) ? candidate : '';
}

function paymentRows(transaction, method) {
  const total = transaction.total;
  if (total < 0) {
    const headerMethod = transaction.headerPaymentMethod || (transaction.isSyntheticReturn ? 'other' : method);
    return [{ method: headerMethod, amount: total }];
  }
  const rows = transaction.payments.filter((payment) => payment.amount > 0).map((payment) => ({ method: payment.method, amount: payment.amount }));
  if (rows.length) return rows;
  return total > 0 ? [{ method: method === 'split' ? 'other' : method, amount: total }] : [];
}

function importedItems(transaction, idsByRowName, idsByItemKey, variantIdsByItemKey, productsById) {
  return transaction.items.map((item) => {
    const quantity = Math.trunc(item.quantity);
    const itemKey = `${item.itemName}\u0000${item.sku || ''}`;
    const productId = idsByItemKey.get(itemKey) || idsByRowName.get(item.itemName) || null;
    const product = productId ? productsById.get(productId) : null;
    const subtotal = item.isReturn ? -Math.abs(item.amount) : Math.abs(item.amount);
    const unitCost = Number.isFinite(item.unitCost) ? item.unitCost : 0;
    return {
      productId,
      variantId: variantIdsByItemKey.get(itemKey) || null,
      productName: item.itemName || 'Produk Olsera',
      productSku: item.sku || product?.sku || null,
      variantDetail: product?.variants?.find((variant) => Number(variant.id) === Number(variantIdsByItemKey.get(itemKey)))?.color || null,
      quantity,
      price: Math.abs(item.price),
      originalPrice: Math.abs(item.originalPrice || item.price),
      discount: item.isReturn ? 0 : item.discount,
      subtotal,
      cost: unitCost,
    };
  });
}

function transactionPayload(transaction, branchId, userId, idsByRowName, idsByItemKey, variantIdsByItemKey, productsById, usedInvoices, existingInvoices) {
  const method = paymentMethodFor(transaction);
  const invoice = invoiceCandidate(transaction);
  const invoiceNo = invoice && !usedInvoices.has(invoice) && !existingInvoices.has(invoice) ? invoice : stableInvoice(branchId, transaction.sourceOrderNo);
  if (usedInvoices.has(invoiceNo) || existingInvoices.has(invoiceNo)) throw new Error(`Nomor invoice impor bentrok: ${transaction.sourceOrderNo}`);
  usedInvoices.add(invoiceNo);
  let payments = paymentRows(transaction, method);
  if (payments.length > 1 && new Set(payments.map((payment) => payment.method)).size === 1) {
    payments = [{ method: payments[0].method, amount: payments.reduce((sum, payment) => sum + payment.amount, 0) }];
  }
  const validMethod = ['cash', 'qris', 'debit', 'transfer', 'credit', 'other'];
  payments = payments.map((payment) => ({ method: validMethod.includes(payment.method) ? payment.method : 'other', amount: payment.amount }));
  const sumPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const amountPaid = transaction.total < 0 ? transaction.total : (payments.length ? sumPaid : transaction.total);
  const notes = transaction.isSyntheticReturn ? 'Retur impor Olsera tanpa header transaksi sumber.' : null;
  return {
    invoiceNo,
    offlineInvoiceNo: transaction.sourceOrderNo.slice(0, 50),
    sourceOrderNo: transaction.sourceOrderNo.slice(0, 100),
    transactionDate: transaction.date,
    createdAt: transaction.createdAt,
    subtotal: transaction.subtotal,
    discount: transaction.discount,
    total: transaction.total,
    discountType: transaction.discount > 0 ? 'nominal' : 'none',
    paymentMethod: method,
    amountPaid,
    change: transaction.total > 0 && method === 'cash' ? Math.max(0, amountPaid - transaction.total) : 0,
    status: transaction.total < 0 ? 'refunded' : 'completed',
    priceTier: normalizedPriceTier(transaction.customerType),
    sourceCashier: transaction.sourceCashier,
    sourceCustomerName: transaction.sourceCustomerName,
    sourceOrderSource: transaction.sourceOrderSource,
    notes,
    items: importedItems(transaction, idsByRowName, idsByItemKey, variantIdsByItemKey, productsById),
    payments,
  };
}

module.exports = {
  END_DATE,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  parseFiles,
  prepareImport,
  previewPayload,
  transactionPayload,
  stableInvoice,
};
