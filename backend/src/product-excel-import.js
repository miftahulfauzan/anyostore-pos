const { createProductSnapshot } = require('./product-excel');

const PRODUCT_FIELDS = [
  ['category_id', 'Kategori'], ['name', 'Nama Produk'], ['description', 'Deskripsi'],
  ['sku', 'SKU'], ['barcode', 'Barcode'], ['price', 'Harga Jual'], ['cost', 'Modal'],
  ['min_stock', 'Stok Minimum'], ['gender', 'Gender'], ['is_active', 'Aktif'],
];
const VARIANT_FIELDS = [
  ['color', 'Warna'], ['size', 'Ukuran'], ['sku', 'SKU Varian'],
  ['barcode', 'Barcode Varian'], ['price', 'Harga Varian'], ['is_active', 'Aktif'],
];
const WHOLESALE_FIELDS = [
  ['variant_id', 'ID Varian'], ['min_qty', 'Qty Minimum'], ['max_qty', 'Qty Maksimum'],
  ['price', 'Harga'], ['is_active', 'Aktif'],
];

function addError(errors, record, field, message, sheet) {
  errors.push({ sheet, row: record.row, field, message });
}

function placeholders(values) {
  return values.map(() => '?').join(',');
}

function normalizedText(value) {
  return String(value ?? '').trim();
}

function normalizedSku(value) {
  return normalizedText(value).toLocaleLowerCase('en-US');
}

function dbBoolean(value) {
  return value === true || Number(value) === 1;
}

function equalValue(left, right) {
  if (left == null || right == null) return left == null && right == null;
  if (typeof left === 'number' || typeof right === 'number') return Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Math.abs(Number(left) - Number(right)) < 0.000001;
  if (typeof left === 'boolean' || typeof right === 'boolean') return dbBoolean(left) === dbBoolean(right);
  return String(left) === String(right);
}

function fieldChanges(record, current, next, fields, sheet, label) {
  const changed = [];
  for (const [key, fieldName] of fields) {
    if (next[key] === undefined || equalValue(current[key], next[key])) continue;
    changed.push({ field: fieldName, before: current[key] ?? '', after: next[key] ?? '' });
  }
  return { ...record, current, next, changed, sheet, label };
}

function numericValue(value, { integer = false, min = -Infinity, max = Infinity } = {}) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) return Number.NaN;
  return value;
}

function textValue(value, current, { maxLength, nullable = false, allowEmpty = false } = {}) {
  if (value === undefined) return current;
  if (value === null) return nullable ? null : Number.NaN;
  const result = normalizedText(value);
  if ((!allowEmpty && !result) || result.length > maxLength) return Number.NaN;
  return result;
}

function mapCategoryName(value, categories, currentCategoryId) {
  if (value === undefined) return undefined;
  const matches = categories.get(normalizedText(value).toLocaleLowerCase('id-ID')) || [];
  if (matches.some((category) => Number(category.id) === Number(currentCategoryId))) return Number(currentCategoryId);
  const activeMatches = matches.filter((category) => dbBoolean(category.is_active));
  return activeMatches.length === 1 ? Number(activeMatches[0].id) : Number.NaN;
}

function asRangeKey(productId, variantId) {
  return `${Number(productId)}:${variantId == null ? '' : Number(variantId)}`;
}

async function selectRows(executor, sql, ids, lockRows) {
  if (!ids.length) return [];
  const suffix = lockRows ? ' FOR UPDATE' : '';
  const [rows] = await executor.execute(sql.replace('/*LOCK*/', suffix), ids);
  return rows;
}

async function findSkuConflicts(executor, table, candidates, excludedIds) {
  if (!candidates.length || !excludedIds.length) return [];
  const conflicts = [];
  for (let offset = 0; offset < candidates.length; offset += 200) {
    const batch = candidates.slice(offset, offset + 200);
    const [rows] = await executor.execute(
      `SELECT id, sku FROM ${table} WHERE sku IS NOT NULL AND LOWER(TRIM(sku)) IN (${placeholders(batch)}) AND id NOT IN (${placeholders(excludedIds)})`,
      [...batch, ...excludedIds],
    );
    conflicts.push(...rows);
  }
  return conflicts;
}

async function validateProductWorkbook({ data, branchId, executor, lockRows = false }) {
  const errors = [...data.errors];
  const productIdsSeen = new Set();
  const variantIdsSeen = new Set();
  const wholesaleIdsSeen = new Set();

  for (const [records, seen, sheet, idName] of [
    [data.products, productIdsSeen, 'Produk', 'ID Produk'],
    [data.variants, variantIdsSeen, 'Varian', 'ID Varian'],
    [data.wholesale, wholesaleIdsSeen, 'Harga Grosir', 'ID Harga'],
  ]) {
    for (const record of records) {
      if (seen.has(record.id)) addError(errors, record, idName, 'ID muncul lebih dari satu kali.', sheet);
      seen.add(record.id);
    }
  }

  if (!data.products.length) errors.push({ sheet: 'Produk', row: 2, field: 'ID Produk', message: 'Minimal satu produk harus tersedia di sheet Produk.' });

  const referencedIds = new Set(data.products.map((row) => row.id));
  for (const row of [...data.variants, ...data.wholesale]) {
    if (Number.isInteger(row.product_id) && row.product_id > 0) referencedIds.add(row.product_id);
  }
  const ids = [...referencedIds];
  const productSql = `SELECT id, branch_id, category_id, name, description, sku, barcode, price, cost, min_stock, gender, is_active, stock FROM products WHERE id IN (${placeholders(ids)})/*LOCK*/`;
  const productRows = await selectRows(executor, productSql, ids, lockRows);
  const productsById = new Map(productRows.map((row) => [Number(row.id), row]));

  const [categoryRows] = await executor.execute('SELECT id, name, is_active FROM categories');
  const categories = new Map();
  for (const category of categoryRows) {
    const key = normalizedText(category.name).toLocaleLowerCase('id-ID');
    if (!categories.has(key)) categories.set(key, []);
    categories.get(key).push(category);
  }

  const productPlans = [];
  for (const row of data.products) {
    const current = productsById.get(row.id);
    if (!current || Number(current.branch_id) !== Number(branchId)) {
      addError(errors, row, 'ID Produk', 'Produk tidak ditemukan pada cabang yang dipilih.', 'Produk');
      continue;
    }
    if (Number(row.branch_id) !== Number(branchId)) addError(errors, row, 'ID Cabang', 'File ini dibuat untuk cabang lain. Unduh ulang file dari cabang yang dipilih.', 'Produk');

    const next = {
      category_id: Number(current.category_id),
      name: current.name,
      description: current.description,
      sku: current.sku,
      barcode: current.barcode,
      price: Number(current.price),
      cost: Number(current.cost || 0),
      min_stock: Number(current.min_stock || 0),
      gender: current.gender,
      is_active: dbBoolean(current.is_active),
    };

    if (row.category !== undefined) {
      const categoryId = mapCategoryName(row.category, categories, current.category_id);
      if (!Number.isInteger(categoryId)) addError(errors, row, 'Kategori', 'Kategori aktif tidak ditemukan atau namanya tidak unik.', 'Produk');
      else next.category_id = categoryId;
    }
    if (row.name !== undefined) {
      const value = textValue(row.name, next.name, { maxLength: 200 });
      if (typeof value !== 'string') addError(errors, row, 'Nama Produk', 'Nama wajib diisi, maksimal 200 karakter.', 'Produk');
      else next.name = value;
    }
    for (const [key, header, limit] of [['sku', 'SKU', 50], ['barcode', 'Barcode', 50], ['description', 'Deskripsi', 65535]]) {
      if (row[key] === undefined) continue;
      const value = textValue(row[key], next[key], { maxLength: limit, nullable: true, allowEmpty: true });
      if (typeof value === 'number' && Number.isNaN(value)) addError(errors, row, header, `Maksimal ${limit} karakter.`, 'Produk');
      else if (key === 'description' && value && Buffer.byteLength(value, 'utf8') > 65535) addError(errors, row, header, 'Deskripsi melebihi kapasitas kolom database.', 'Produk');
      else next[key] = value || null;
    }
    for (const [key, header, options] of [
      ['price', 'Harga Jual', { min: 0, max: 9999999999.99 }],
      ['cost', 'Modal', { min: 0, max: 9999999999.99 }],
      ['min_stock', 'Stok Minimum', { min: 0, max: 2147483647, integer: true }],
    ]) {
      if (row[key] === undefined) continue;
      const value = numericValue(row[key], options);
      if (!Number.isFinite(value)) addError(errors, row, header, 'Angka tidak valid atau di luar batas.', 'Produk');
      else next[key] = value;
    }
    if (row.gender !== undefined) {
      if (!['male', 'female', 'unisex', 'kids'].includes(row.gender)) addError(errors, row, 'Gender', 'Isi Pria, Wanita, Unisex, atau Anak.', 'Produk');
      else next.gender = row.gender;
    }
    if (row.active !== undefined) {
      if (typeof row.active !== 'boolean') addError(errors, row, 'Aktif', 'Isi Ya atau Tidak.', 'Produk');
      else next.is_active = row.active;
    }

    const plan = fieldChanges(row, current, next, PRODUCT_FIELDS, 'Produk', current.name);
    plan.skuChanged = !equalValue(current.sku, next.sku);
    productPlans.push(plan);
  }

  const variantSql = `SELECT id, product_id, color, size, sku, barcode, price, stock, is_active FROM product_variants WHERE product_id IN (${placeholders(ids)})/*LOCK*/`;
  const variantRows = await selectRows(executor, variantSql, ids, lockRows);
  const variantsById = new Map(variantRows.map((row) => [Number(row.id), row]));
  const variantsByProduct = new Map();
  for (const row of variantRows) {
    const productId = Number(row.product_id);
    if (!variantsByProduct.has(productId)) variantsByProduct.set(productId, []);
    variantsByProduct.get(productId).push(row);
  }

  const variantPlans = [];
  for (const row of data.variants) {
    const parent = productsById.get(Number(row.product_id));
    const current = variantsById.get(row.id);
    if (!parent || Number(parent.branch_id) !== Number(branchId)) {
      addError(errors, row, 'ID Produk', 'Produk varian tidak ditemukan pada cabang yang dipilih.', 'Varian');
      continue;
    }
    if (!current || Number(current.product_id) !== Number(row.product_id)) {
      addError(errors, row, 'ID Varian', 'Varian tidak cocok dengan ID produk.', 'Varian');
      continue;
    }
    const next = {
      color: current.color,
      size: current.size,
      sku: current.sku,
      barcode: current.barcode,
      price: current.price == null ? null : Number(current.price),
      is_active: dbBoolean(current.is_active),
    };
    for (const [key, header, limit] of [['color', 'Warna', 50], ['size', 'Ukuran', 20], ['sku', 'SKU Varian', 50], ['barcode', 'Barcode Varian', 50]]) {
      if (row[key] === undefined) continue;
      const value = textValue(row[key], next[key], { maxLength: limit, nullable: true, allowEmpty: true });
      if (typeof value === 'number' && Number.isNaN(value)) addError(errors, row, header, `Maksimal ${limit} karakter.`, 'Varian');
      else next[key] = value || null;
    }
    if (row.price !== undefined) {
      const value = numericValue(row.price, { min: 0, max: 9999999999.99 });
      if (Number.isNaN(value)) addError(errors, row, 'Harga Varian', 'Harga varian harus angka 0 atau lebih.', 'Varian');
      else next.price = value;
    }
    if (row.active !== undefined) {
      if (typeof row.active !== 'boolean') addError(errors, row, 'Aktif', 'Isi Ya atau Tidak.', 'Varian');
      else next.is_active = row.active;
    }
    if (!next.color && !next.size) addError(errors, row, 'Warna / Ukuran', 'Varian harus memiliki warna atau ukuran.', 'Varian');

    const plan = fieldChanges(row, current, next, VARIANT_FIELDS, 'Varian', `${parent.name} · ${[current.color, current.size].filter(Boolean).join(' / ')}`);
    plan.product_id = Number(row.product_id);
    plan.skuChanged = !equalValue(current.sku, next.sku);
    variantPlans.push(plan);
  }

  const wholesaleSql = `SELECT id, product_id, variant_id, min_qty, max_qty, price, is_active FROM wholesale_prices WHERE product_id IN (${placeholders(ids)})/*LOCK*/`;
  const wholesaleRows = await selectRows(executor, wholesaleSql, ids, lockRows);
  const wholesaleById = new Map(wholesaleRows.map((row) => [Number(row.id), row]));
  for (const row of data.products) {
    const current = productsById.get(Number(row.id));
    if (!current || Number(current.branch_id) !== Number(branchId)) continue;
    const currentSnapshot = createProductSnapshot(
      current,
      variantsByProduct.get(Number(row.id)) || [],
      wholesaleRows.filter((tier) => Number(tier.product_id) === Number(row.id)),
    );
    if (row.snapshot !== currentSnapshot) {
      addError(errors, row, 'Snapshot', 'Data cabang berubah sejak file diunduh. Unduh ulang file lalu edit lagi.', 'Produk');
    }
  }
  const wholesalePlans = [];
  for (const row of data.wholesale) {
    const parent = productsById.get(Number(row.product_id));
    const current = wholesaleById.get(row.id);
    if (!parent || Number(parent.branch_id) !== Number(branchId)) {
      addError(errors, row, 'ID Produk', 'Produk harga grosir tidak ditemukan pada cabang yang dipilih.', 'Harga Grosir');
      continue;
    }
    if (!current || Number(current.product_id) !== Number(row.product_id)) {
      addError(errors, row, 'ID Harga', 'Baris harga tidak cocok dengan ID produk.', 'Harga Grosir');
      continue;
    }
    const next = {
      variant_id: current.variant_id == null ? null : Number(current.variant_id),
      min_qty: Number(current.min_qty),
      max_qty: current.max_qty == null ? null : Number(current.max_qty),
      price: Number(current.price),
      is_active: dbBoolean(current.is_active),
    };
    if (row.variant_id !== undefined) next.variant_id = row.variant_id;
    for (const [key, header, options] of [
      ['min_qty', 'Qty Minimum', { min: 1, max: 2147483647, integer: true }],
      ['max_qty', 'Qty Maksimum', { min: 1, max: 2147483647, integer: true }],
      ['price', 'Harga', { min: 0, max: 9999999999.99 }],
    ]) {
      if (row[key] === undefined) continue;
      const value = numericValue(row[key], options);
      if (key === 'max_qty' && value === null) next.max_qty = null;
      else if (!Number.isFinite(value)) addError(errors, row, header, 'Nilai tidak valid.', 'Harga Grosir');
      else next[key] = value;
    }
    if (row.active !== undefined) {
      if (typeof row.active !== 'boolean') addError(errors, row, 'Aktif', 'Isi Ya atau Tidak.', 'Harga Grosir');
      else next.is_active = row.active;
    }
    if (next.variant_id != null) {
      const variant = variantsById.get(Number(next.variant_id));
      if (!variant || Number(variant.product_id) !== Number(row.product_id)) addError(errors, row, 'ID Varian', 'Varian harus berasal dari produk yang sama.', 'Harga Grosir');
    }
    if (next.max_qty != null && next.max_qty < next.min_qty) addError(errors, row, 'Qty Maksimum', 'Qty maksimum harus sama atau lebih besar dari minimum.', 'Harga Grosir');

    const plan = fieldChanges(row, current, next, WHOLESALE_FIELDS, 'Harga Grosir', parent.name);
    plan.product_id = Number(row.product_id);
    wholesalePlans.push(plan);
  }

  for (const plan of variantPlans) {
    if (!plan.next.is_active || dbBoolean(plan.current.is_active) === false || plan.changed.length === 0) continue;
    const peers = variantsByProduct.get(plan.product_id) || [];
    const keys = new Map();
    for (const peer of peers) {
      const changedPeer = variantPlans.find((candidate) => Number(candidate.current.id) === Number(peer.id));
      const value = changedPeer?.next || peer;
      if (!dbBoolean(value.is_active)) continue;
      const key = `${normalizedText(value.color).toLocaleLowerCase('id-ID')}|${normalizedText(value.size).toLocaleLowerCase('id-ID')}`;
      if (keys.has(key)) addError(errors, plan, 'Warna / Ukuran', 'Kombinasi warna dan ukuran harus unik dalam produk.', 'Varian');
      else keys.set(key, Number(peer.id));
    }
  }

  for (const plan of productPlans) {
    if (!plan.skuChanged || !plan.next.sku) continue;
    const key = normalizedSku(plan.next.sku);
    if (productPlans.some((other) => other !== plan && other.skuChanged && other.next.sku && normalizedSku(other.next.sku) === key)) {
      addError(errors, plan, 'SKU', 'SKU yang sama dipakai lebih dari satu produk di file.', 'Produk');
    }
  }
  const changedProductSkuPlans = productPlans.filter((plan) => plan.skuChanged);
  const productConflicts = await findSkuConflicts(executor, 'products', changedProductSkuPlans.map((plan) => normalizedSku(plan.next.sku)).filter(Boolean), changedProductSkuPlans.map((plan) => Number(plan.current.id)));
  for (const conflict of productConflicts) {
    const plan = changedProductSkuPlans.find((row) => normalizedSku(row.next.sku) === normalizedSku(conflict.sku));
    if (plan) addError(errors, plan, 'SKU', `SKU sudah digunakan produk ID ${conflict.id}.`, 'Produk');
  }

  for (const plan of variantPlans) {
    if (!plan.skuChanged || !plan.next.sku) continue;
    const key = normalizedSku(plan.next.sku);
    if (variantPlans.some((other) => other !== plan && other.skuChanged && other.next.sku && normalizedSku(other.next.sku) === key)) {
      addError(errors, plan, 'SKU Varian', 'SKU varian yang sama dipakai lebih dari satu baris.', 'Varian');
    }
  }
  const changedVariantSkuPlans = variantPlans.filter((plan) => plan.skuChanged);
  const variantConflicts = await findSkuConflicts(executor, 'product_variants', changedVariantSkuPlans.map((plan) => normalizedSku(plan.next.sku)).filter(Boolean), changedVariantSkuPlans.map((plan) => Number(plan.current.id)));
  for (const conflict of variantConflicts) {
    const plan = changedVariantSkuPlans.find((row) => normalizedSku(row.next.sku) === normalizedSku(conflict.sku));
    if (plan) addError(errors, plan, 'SKU Varian', `SKU sudah digunakan varian ID ${conflict.id}.`, 'Varian');
  }

  const changedRangePlans = wholesalePlans.filter((plan) => plan.changed.some((field) => ['ID Varian', 'Qty Minimum', 'Qty Maksimum', 'Aktif'].includes(field.field)));
  const touchedRanges = new Set();
  for (const plan of changedRangePlans) {
    touchedRanges.add(asRangeKey(plan.product_id, plan.current.variant_id));
    touchedRanges.add(asRangeKey(plan.product_id, plan.next.variant_id));
  }
  for (const rangeKey of touchedRanges) {
    const [productId, variantPart] = rangeKey.split(':');
    const variantId = variantPart ? Number(variantPart) : null;
    const group = wholesaleRows.map((tier) => {
      const changedTier = wholesalePlans.find((candidate) => Number(candidate.current.id) === Number(tier.id));
      return changedTier?.next || tier;
    }).filter((tier) => Number(tier.product_id) === Number(productId) && (tier.variant_id == null ? null : Number(tier.variant_id)) === variantId && dbBoolean(tier.is_active));
    group.sort((left, right) => Number(left.min_qty) - Number(right.min_qty));
    for (let index = 1; index < group.length; index += 1) {
      const previous = group[index - 1];
      if (previous.max_qty == null || Number(previous.max_qty) >= Number(group[index].min_qty)) {
        const plan = changedRangePlans.find((candidate) => Number(candidate.product_id) === Number(productId));
        if (plan) addError(errors, plan, 'Qty Minimum / Maksimum', 'Rentang harga grosir aktif tidak boleh bertumpuk.', 'Harga Grosir');
        break;
      }
    }
  }

  const deactivatedProductIds = productPlans.filter((plan) => plan.current.is_active && !plan.next.is_active && plan.changed.length).map((plan) => Number(plan.current.id));
  const deactivatedVariantIds = variantPlans.filter((plan) => dbBoolean(plan.current.is_active) && !plan.next.is_active && plan.changed.length).map((plan) => Number(plan.current.id));
  if (deactivatedProductIds.length || deactivatedVariantIds.length) {
    const stockProductIds = [...new Set([...deactivatedProductIds, ...variantPlans.filter((plan) => deactivatedVariantIds.includes(Number(plan.current.id))).map((plan) => plan.product_id)])];
    const [warehouseRows] = stockProductIds.length
      ? await executor.execute(`SELECT product_id, variant_id, quantity, reserved_quantity FROM warehouse_stocks WHERE product_id IN (${placeholders(stockProductIds)})${lockRows ? ' FOR UPDATE' : ''}`, stockProductIds)
      : [[]];
    const warehouseByProduct = new Map();
    const warehouseByVariant = new Map();
    for (const stock of warehouseRows) {
      if (Number(stock.quantity) !== 0 || Number(stock.reserved_quantity) !== 0) {
        warehouseByProduct.set(Number(stock.product_id), true);
        if (stock.variant_id != null) warehouseByVariant.set(Number(stock.variant_id), true);
      }
    }
    for (const plan of productPlans.filter((row) => deactivatedProductIds.includes(Number(row.current.id)))) {
      const variantHasStock = (variantsByProduct.get(Number(plan.current.id)) || []).some((variant) => Number(variant.stock) !== 0);
      if (Number(plan.current.stock) !== 0 || warehouseByProduct.has(Number(plan.current.id)) || variantHasStock) {
        addError(errors, plan, 'Aktif', 'Produk masih memiliki stok. Pindahkan stok lebih dulu dari menu mutasi atau opname.', 'Produk');
      }
    }
    for (const plan of variantPlans.filter((row) => deactivatedVariantIds.includes(Number(row.current.id)))) {
      if (Number(plan.current.stock) !== 0 || warehouseByVariant.has(Number(plan.current.id))) {
        addError(errors, plan, 'Aktif', 'Varian masih memiliki stok. Sesuaikan stok lebih dulu dari menu mutasi atau opname.', 'Varian');
      }
    }
  }

  const counts = {
    products: { total: data.products.length, changed: productPlans.filter((row) => row.changed.length).length },
    variants: { total: data.variants.length, changed: variantPlans.filter((row) => row.changed.length).length },
    wholesale: { total: data.wholesale.length, changed: wholesalePlans.filter((row) => row.changed.length).length },
  };
  for (const value of Object.values(counts)) value.unchanged = value.total - value.changed;
  const changedRows = [
    ...productPlans.filter((row) => row.changed.length),
    ...variantPlans.filter((row) => row.changed.length),
    ...wholesalePlans.filter((row) => row.changed.length),
  ].map((row) => ({ sheet: row.sheet, row: row.row, name: row.label, fields: row.changed }));
  return {
    errors,
    counts,
    changedRows,
    products: productPlans,
    variants: variantPlans,
    wholesale: wholesalePlans,
    productRowsById: productsById,
    valid: errors.length === 0,
  };
}

async function applyProductWorkbook({ connection, plan, branchId, user, syncVariantColors }) {
  if (!plan.valid) throw Object.assign(new Error('File belum valid. Perbaiki error sebelum menerapkan perubahan.'), { status: 400 });
  for (const row of plan.products.filter((item) => item.skuChanged)) {
    await connection.execute('UPDATE products SET sku = NULL WHERE id = ? AND branch_id = ?', [row.current.id, branchId]);
  }
  for (const row of plan.variants.filter((item) => item.skuChanged)) {
    await connection.execute('UPDATE product_variants SET sku = NULL WHERE id = ? AND product_id = ?', [row.current.id, row.product_id]);
  }

  const activityByProduct = new Map();
  const addActivity = (productId, label, priceChanged = false) => {
    if (!activityByProduct.has(productId)) activityByProduct.set(productId, { labels: [], priceChanged: false });
    const activity = activityByProduct.get(productId);
    activity.labels.push(label);
    activity.priceChanged ||= priceChanged;
  };

  let productsUpdated = 0;
  for (const row of plan.products.filter((item) => item.changed.length)) {
    const { next, current } = row;
    await connection.execute(
      `UPDATE products SET category_id = ?, name = ?, description = ?, sku = ?, barcode = ?, price = ?, cost = ?, min_stock = ?, gender = ?, is_active = ? WHERE id = ? AND branch_id = ?`,
      [next.category_id, next.name, next.description, next.sku, next.barcode, next.price, next.cost, next.min_stock, next.gender, next.is_active, current.id, branchId],
    );
    productsUpdated += 1;
    addActivity(Number(current.id), row.changed.map((field) => field.field).join(', '), !equalValue(current.price, next.price));
  }

  let variantsUpdated = 0;
  for (const row of plan.variants.filter((item) => item.changed.length)) {
    const { next, current } = row;
    await connection.execute(
      'UPDATE product_variants SET size = ?, color = ?, sku = ?, barcode = ?, price = ?, is_active = ? WHERE id = ? AND product_id = ?',
      [next.size, next.color, next.sku, next.barcode, next.price, next.is_active, current.id, row.product_id],
    );
    variantsUpdated += 1;
    addActivity(row.product_id, `varian ${row.label}: ${row.changed.map((field) => field.field).join(', ')}`);
  }

  let wholesaleUpdated = 0;
  for (const row of plan.wholesale.filter((item) => item.changed.length)) {
    const { next, current } = row;
    await connection.execute(
      'UPDATE wholesale_prices SET variant_id = ?, min_qty = ?, max_qty = ?, price = ?, is_active = ? WHERE id = ? AND product_id = ?',
      [next.variant_id, next.min_qty, next.max_qty, next.price, next.is_active, current.id, row.product_id],
    );
    wholesaleUpdated += 1;
    addActivity(row.product_id, `harga grosir: ${row.changed.map((field) => field.field).join(', ')}`);
  }

  const affectedProductIds = [...activityByProduct.keys()];
  for (const productId of affectedProductIds) {
    if (!plan.products.some((row) => Number(row.current.id) === productId && row.changed.length)) {
      await connection.execute('UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND branch_id = ?', [productId, branchId]);
    }
  }
  const productsWithVariantChanges = [...new Set(plan.variants.filter((row) => row.changed.length).map((row) => row.product_id))];
  for (const productId of productsWithVariantChanges) await syncVariantColors(productId, branchId, connection);

  for (const [productId, activity] of activityByProduct) {
    const product = plan.productRowsById.get(productId);
    const action = activity.priceChanged ? 'product_price_update' : 'product_update';
    await connection.execute(
      'INSERT INTO activity_logs (user_id, action, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
      [user.id, action, `Produk ${product?.name || `#${productId}`} diperbarui lewat Excel: ${activity.labels.join('; ')}`, user.ip || null, user.userAgent || null],
    );
  }

  return { productsUpdated, variantsUpdated, wholesaleUpdated };
}

module.exports = { validateProductWorkbook, applyProductWorkbook };
