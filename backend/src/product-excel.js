const ExcelJS = require('exceljs');
const crypto = require('node:crypto');

const MAX_ROWS_PER_SHEET = 5000;
const CLEAR_TOKEN = '#KOSONGKAN';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const SHEET_COLUMNS = {
  products: [
    { header: 'ID Produk', key: 'id', width: 13 },
    { header: 'ID Cabang', key: 'branch_id', width: 12, hidden: true },
    { header: 'Snapshot', key: 'snapshot', width: 20, hidden: true, kind: 'text' },
    { header: 'SKU', key: 'sku', width: 20, kind: 'text', clearable: true },
    { header: 'Barcode', key: 'barcode', width: 20, kind: 'text', clearable: true },
    { header: 'Nama Produk', key: 'name', width: 30, kind: 'text' },
    { header: 'Kategori', key: 'category', width: 22, kind: 'text' },
    { header: 'Harga Jual', key: 'price', width: 16, kind: 'money' },
    { header: 'Modal', key: 'cost', width: 16, kind: 'money' },
    { header: 'Stok Minimum', key: 'min_stock', width: 15, kind: 'number' },
    { header: 'Gender', key: 'gender', width: 15, kind: 'gender' },
    { header: 'Aktif', key: 'active', width: 12, kind: 'boolean' },
    { header: 'Deskripsi', key: 'description', width: 38, kind: 'text', clearable: true },
  ],
  variants: [
    { header: 'ID Varian', key: 'id', width: 13 },
    { header: 'ID Produk', key: 'product_id', width: 13 },
    { header: 'SKU Produk', key: 'product_sku', width: 20 },
    { header: 'Nama Produk', key: 'product_name', width: 28 },
    { header: 'Warna', key: 'color', width: 18, kind: 'text', clearable: true },
    { header: 'Ukuran', key: 'size', width: 14, kind: 'text', clearable: true },
    { header: 'SKU Varian', key: 'sku', width: 20, kind: 'text', clearable: true },
    { header: 'Barcode Varian', key: 'barcode', width: 20, kind: 'text', clearable: true },
    { header: 'Harga Varian', key: 'price', width: 16, kind: 'money', clearable: true },
    { header: 'Aktif', key: 'active', width: 12, kind: 'boolean' },
  ],
  wholesale: [
    { header: 'ID Harga', key: 'id', width: 12 },
    { header: 'ID Produk', key: 'product_id', width: 13 },
    { header: 'ID Varian', key: 'variant_id', width: 13, kind: 'id', clearable: true },
    { header: 'SKU Produk', key: 'product_sku', width: 20 },
    { header: 'Varian', key: 'variant_label', width: 20 },
    { header: 'Qty Minimum', key: 'min_qty', width: 14, kind: 'number' },
    { header: 'Qty Maksimum', key: 'max_qty', width: 14, kind: 'number', clearable: true },
    { header: 'Harga', key: 'price', width: 16, kind: 'money' },
    { header: 'Aktif', key: 'active', width: 12, kind: 'boolean' },
  ],
};

function makeWorksheet(workbook, name, columns, rows) {
  const worksheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  worksheet.columns = columns.map(({ header, key, width, hidden }) => ({ header, key, width, hidden }));
  worksheet.addRows(rows);
  worksheet.autoFilter = { from: 'A1', to: `${worksheet.getColumn(columns.length).letter}${Math.max(1, worksheet.rowCount)}` };
  worksheet.getRow(1).height = 28;
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  for (const column of columns) {
    if (column.kind === 'money' || column.kind === 'number') worksheet.getColumn(column.key).numFmt = '#,##0.##';
    if (['sku', 'barcode', 'product_sku'].includes(column.key)) worksheet.getColumn(column.key).numFmt = '@';
    const choices = column.kind === 'boolean' ? '"Ya,Tidak"' : column.kind === 'gender' ? '"Pria,Wanita,Unisex,Anak"' : null;
    if (choices) {
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        worksheet.getCell(rowNumber, columns.indexOf(column) + 1).dataValidation = {
          type: 'list', allowBlank: true, formulae: [choices], showErrorMessage: true,
          errorTitle: 'Nilai tidak valid', error: 'Pilih salah satu nilai pada daftar.',
        };
      }
    }
  }
  return worksheet;
}

function createProductSnapshot(product, variants, wholesale) {
  const snapshot = {
    product: {
      id: Number(product.id),
      branch_id: Number(product.branch_id),
      category_id: Number(product.category_id),
      name: product.name,
      description: product.description || null,
      sku: product.sku || null,
      barcode: product.barcode || null,
      price: Number(product.price),
      cost: Number(product.cost || 0),
      min_stock: Number(product.min_stock || 0),
      gender: product.gender,
      is_active: product.is_active === true || Number(product.is_active) === 1,
    },
    variants: variants.map((variant) => ({
      id: Number(variant.id),
      color: variant.color || null,
      size: variant.size || null,
      sku: variant.sku || null,
      barcode: variant.barcode || null,
      price: variant.price == null ? null : Number(variant.price),
      is_active: variant.is_active === true || Number(variant.is_active) === 1,
    })).sort((left, right) => left.id - right.id),
    wholesale: wholesale.map((tier) => ({
      id: Number(tier.id),
      variant_id: tier.variant_id == null ? null : Number(tier.variant_id),
      min_qty: Number(tier.min_qty),
      max_qty: tier.max_qty == null ? null : Number(tier.max_qty),
      price: Number(tier.price),
      is_active: tier.is_active === true || Number(tier.is_active) === 1,
    })).sort((left, right) => left.id - right.id),
  };
  return crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

async function createProductWorkbook({ products, variants, wholesale, categories }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Anyostore POS';
  workbook.subject = 'Perubahan massal katalog produk';
  workbook.created = new Date();

  const categoryNames = new Map(categories.map((category) => [Number(category.id), category.name]));
  const variantsByProduct = new Map();
  const wholesaleByProduct = new Map();
  for (const variant of variants) {
    const productId = Number(variant.product_id);
    if (!variantsByProduct.has(productId)) variantsByProduct.set(productId, []);
    variantsByProduct.get(productId).push(variant);
  }
  for (const tier of wholesale) {
    const productId = Number(tier.product_id);
    if (!wholesaleByProduct.has(productId)) wholesaleByProduct.set(productId, []);
    wholesaleByProduct.get(productId).push(tier);
  }
  makeWorksheet(workbook, 'Produk', SHEET_COLUMNS.products, products.map((product) => ({
    id: Number(product.id),
    branch_id: Number(product.branch_id),
    snapshot: createProductSnapshot(product, variantsByProduct.get(Number(product.id)) || [], wholesaleByProduct.get(Number(product.id)) || []),
    sku: product.sku || '',
    barcode: product.barcode || '',
    name: product.name,
    category: categoryNames.get(Number(product.category_id)) || product.category_name || '',
    price: Number(product.price),
    cost: Number(product.cost || 0),
    min_stock: Number(product.min_stock ?? 0),
    gender: ({ male: 'Pria', female: 'Wanita', kids: 'Anak', unisex: 'Unisex' })[product.gender] || 'Unisex',
    active: product.is_active ? 'Ya' : 'Tidak',
    description: product.description || '',
  })));

  const productsById = new Map(products.map((product) => [Number(product.id), product]));
  const variantsById = new Map(variants.map((variant) => [Number(variant.id), variant]));
  makeWorksheet(workbook, 'Varian', SHEET_COLUMNS.variants, variants.map((variant) => {
    const product = productsById.get(Number(variant.product_id)) || {};
    return {
      id: Number(variant.id),
      product_id: Number(variant.product_id),
      product_sku: product.sku || '',
      product_name: product.name || '',
      color: variant.color || '',
      size: variant.size || '',
      sku: variant.sku || '',
      barcode: variant.barcode || '',
      price: variant.price == null ? '' : Number(variant.price),
      active: variant.is_active ? 'Ya' : 'Tidak',
    };
  }));

  makeWorksheet(workbook, 'Harga Grosir', SHEET_COLUMNS.wholesale, wholesale.map((tier) => {
    const product = productsById.get(Number(tier.product_id)) || {};
    const variant = tier.variant_id == null ? null : variantsById.get(Number(tier.variant_id));
    const variantLabel = variant ? [variant.color, variant.size].filter(Boolean).join(' / ') : '';
    return {
      id: Number(tier.id),
      product_id: Number(tier.product_id),
      variant_id: tier.variant_id == null ? '' : Number(tier.variant_id),
      product_sku: product.sku || '',
      variant_label: variantLabel,
      min_qty: Number(tier.min_qty),
      max_qty: tier.max_qty == null ? '' : Number(tier.max_qty),
      price: Number(tier.price),
      active: tier.is_active ? 'Ya' : 'Tidak',
    };
  }));

  const instructions = workbook.addWorksheet('Petunjuk');
  instructions.columns = [{ width: 105 }];
  [
    ['PANDUAN UBAH PRODUK MASSAL'],
    ['1. Ubah nilai pada sheet Produk, Varian, atau Harga Grosir. Kolom ID dan Snapshot adalah kunci data dan jangan diubah.'],
    ['2. Upload kembali file .xlsx ini dari halaman Produk > Excel Massal.'],
    ['3. Sel kosong berarti data tidak diubah. Isi #KOSONGKAN untuk mengosongkan field opsional yang mendukungnya.'],
    ['4. Menghapus baris tidak menghapus data. Untuk menonaktifkan produk, varian, atau harga, pilih Aktif = Tidak.'],
    ['5. SKU dan barcode disimpan sebagai teks. Pertahankan angka nol di awal. Kategori harus sama dengan nama kategori yang terdaftar.'],
    ['6. Stok dan foto tidak diubah lewat Excel. Stok dikelola dari menu mutasi stok.'],
    ['7. Produk baru, varian baru, dan baris harga baru tidak dibuat lewat impor ini.'],
    ['8. Semua baris diperiksa sebelum disimpan. Jika ada error, tidak ada perubahan yang diterapkan.'],
  ].forEach((row) => instructions.addRow(row));
  instructions.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };
  instructions.getColumn(1).alignment = { wrapText: true, vertical: 'middle' };
  instructions.eachRow((row, index) => { if (index > 1) row.height = 32; });
  instructions.views = [{ state: 'frozen', ySplit: 1 }];
  return workbook;
}

function cellPrimitive(cell) {
  const value = cell.value;
  if (value == null) return undefined;
  if (typeof value === 'object') {
    if (value.formula || value.sharedFormula) return { formula: true };
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
    if (value.text != null) return value.text;
    if (value.result != null) return value.result;
    return undefined;
  }
  return typeof value === 'string' ? value.trim() : value;
}

function parseValue(value, definition) {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === '#KOSONGKAN') return definition.clearable ? null : Number.NaN;
  if (definition.kind === 'text') return String(value).trim();
  if (definition.kind === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 1 || String(value).trim().toLowerCase() === '1') return true;
    if (value === 0 || String(value).trim().toLowerCase() === '0') return false;
    const normalized = String(value).trim().toLowerCase();
    if (['ya', 'yes', 'true', 'aktif'].includes(normalized)) return true;
    if (['tidak', 'no', 'false', 'nonaktif'].includes(normalized)) return false;
    return Number.NaN;
  }
  if (definition.kind === 'gender') {
    const normalized = String(value).trim().toLowerCase();
    const genders = { pria: 'male', male: 'male', wanita: 'female', perempuan: 'female', female: 'female', unisex: 'unisex', anak: 'kids', kids: 'kids' };
    return genders[normalized] || Number.NaN;
  }
  if (definition.kind === 'id' || definition.kind === 'number' || definition.kind === 'money') {
    if (typeof value === 'number') return value;
    let normalized = String(value).trim().replace(/^rp\s*/i, '').replace(/\s/g, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) normalized = normalized.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d+(,\d+)$/.test(normalized)) normalized = normalized.replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return value;
}

function parseSheet(workbook, sheetName, definitions, errors, optional = false) {
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) {
    if (!optional) errors.push({ sheet: sheetName, row: 1, field: '', message: 'Sheet wajib tidak ditemukan.' });
    return [];
  }
  if (worksheet.rowCount > MAX_ROWS_PER_SHEET + 1) {
    errors.push({ sheet: sheetName, row: MAX_ROWS_PER_SHEET + 2, field: '', message: `Maksimal ${MAX_ROWS_PER_SHEET} baris per sheet.` });
    return [];
  }
  const headers = new Map();
  worksheet.getRow(1).eachCell((cell, columnNumber) => {
    const header = String(cellPrimitive(cell) ?? '').trim().toLowerCase();
    if (header) headers.set(header, columnNumber);
  });
  const columns = new Map();
  for (const definition of definitions) {
    const column = headers.get(definition.header.toLowerCase());
    if (!column) errors.push({ sheet: sheetName, row: 1, field: definition.header, message: 'Kolom wajib tidak ditemukan.' });
    else columns.set(definition.key, { ...definition, column });
  }
  if (columns.size !== definitions.length) return [];

  const records = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const raw = {};
    let populated = false;
    for (const definition of definitions) {
      const column = columns.get(definition.key).column;
      const value = cellPrimitive(row.getCell(column));
      if (value?.formula) {
        errors.push({ sheet: sheetName, row: rowNumber, field: definition.header, message: 'Rumus tidak didukung. Tempel hasilnya sebagai nilai.' });
        continue;
      }
      if (value !== undefined && value !== null && value !== '') populated = true;
      raw[definition.key] = parseValue(value, definition);
      if (typeof raw[definition.key] === 'number' && !Number.isFinite(raw[definition.key])) {
        errors.push({ sheet: sheetName, row: rowNumber, field: definition.header, message: 'Nilai tidak valid.' });
      }
    }
    if (!populated) continue;
    const id = raw.id;
    if (!Number.isInteger(id) || id < 1) {
      errors.push({ sheet: sheetName, row: rowNumber, field: definitions[0].header, message: 'ID wajib berupa angka bulat positif.' });
      continue;
    }
    records.push({ ...raw, row: rowNumber });
  }
  return records;
}

async function parseProductWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw Object.assign(new Error('File Excel tidak dapat dibaca. Gunakan file .xlsx dari menu Ekspor Excel Produk.'), { status: 400 });
  }
  const errors = [];
  const products = parseSheet(workbook, 'Produk', SHEET_COLUMNS.products.map((column) => ({ ...column, kind: column.key === 'id' || column.key === 'branch_id' ? 'id' : column.kind })), errors);
  const variants = parseSheet(workbook, 'Varian', SHEET_COLUMNS.variants.map((column) => ({ ...column, kind: ['id', 'product_id'].includes(column.key) ? 'id' : column.kind })), errors, true);
  const wholesale = parseSheet(workbook, 'Harga Grosir', SHEET_COLUMNS.wholesale.map((column) => ({ ...column, kind: ['id', 'product_id', 'variant_id'].includes(column.key) ? 'id' : column.kind })), errors, true);
  return { products, variants, wholesale, errors };
}

module.exports = {
  CLEAR_TOKEN,
  MAX_ROWS_PER_SHEET,
  SHEET_COLUMNS,
  XLSX_MIME,
  createProductWorkbook,
  createProductSnapshot,
  parseProductWorkbook,
};
