const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');
const { createMediaUpload, decodeDataUpload, discardUploadedFile, persistUploadedFile, removeMedia } = require('../media-storage');

const router = express.Router();
router.use(authenticate);

const upload = createMediaUpload('products', {
  fileSize: 30 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'],
});
const dataUploadOptions = {
  fileSize: 3 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'],
};

const positiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;
function readableBranchId(req) {
  const requested = Number(req.query.branch_id);
  return req.user.role === 'owner' && Number.isInteger(requested) ? requested : req.user.branch_id;
}
function normalizeWholesalePrices(input) {
  if (input == null) return [];
  if (!Array.isArray(input)) throw Object.assign(new Error('Data harga grosir tidak valid'), { status: 400 });
  const tiers = input.map((tier) => ({ min_qty: Number(tier.min_qty), max_qty: tier.max_qty === '' || tier.max_qty == null ? null : Number(tier.max_qty), price: Number(tier.price) }));
  if (tiers.some((tier) => !Number.isInteger(tier.min_qty) || tier.min_qty < 1 || (tier.max_qty != null && (!Number.isInteger(tier.max_qty) || tier.max_qty < tier.min_qty)) || !positiveNumber(tier.price))) throw Object.assign(new Error('Rentang atau harga grosir tidak valid'), { status: 400 });
  tiers.sort((a, b) => a.min_qty - b.min_qty);
  if (tiers.some((tier, index) => index > 0 && tiers[index - 1].max_qty != null && tiers[index - 1].max_qty >= tier.min_qty)) throw Object.assign(new Error('Rentang harga grosir tidak boleh bertumpuk'), { status: 400 });
  return tiers;
}
function normalizeVariants(input) {
  if (input == null) return [];
  if (!Array.isArray(input)) throw Object.assign(new Error('Data varian tidak valid'), { status: 400 });
  const variants = input.map((variant) => ({
    id: Number.isInteger(Number(variant.id)) ? Number(variant.id) : null,
    color: String(variant.color || '').trim(),
    size: '',
    sku: String(variant.sku || '').trim() || null,
    barcode: String(variant.barcode || '').trim() || null,
    price: variant.price === '' || variant.price == null ? null : Number(variant.price),
  }));
  if (variants.some((variant) => (!variant.color && !variant.size) || (variant.price != null && !positiveNumber(variant.price)))) {
    throw Object.assign(new Error('Setiap varian wajib memiliki warna atau ukuran; harga varian harus valid'), { status: 400 });
  }
  const keys = variants.map((variant) => `${variant.color.toLowerCase()}|${variant.size.toLowerCase()}`);
  if (new Set(keys).size !== keys.length) throw Object.assign(new Error('Kombinasi warna dan ukuran varian tidak boleh sama'), { status: 400 });
  return variants;
}

// Stores use separate product and stock records. Matching SKUs (e.g. A100 and
// B-A100) represent the same catalogue item, so a new color is copied to the
// matching store with zero stock. Quantities are never shared or transferred.
async function syncVariantColorsAcrossStores(productId, branchId) {
  const [sourceRows] = await db.execute(
    'SELECT id, sku FROM products WHERE id = ? AND branch_id = ? AND is_active = TRUE',
    [productId, branchId]
  );
  const source = sourceRows[0];
  if (!source?.sku?.trim()) return;

  const catalogueSku = source.sku.trim().replace(/^B-/i, '');
  const [sourceVariants] = await db.execute(
    `SELECT DISTINCT TRIM(color) AS color
     FROM product_variants
     WHERE product_id = ? AND is_active = TRUE AND TRIM(COALESCE(color, '')) <> ''`,
    [source.id]
  );
  if (!sourceVariants.length) return;

  const [targetProducts] = await db.execute(
    `SELECT id
     FROM products
     WHERE id <> ? AND is_active = TRUE
       AND REPLACE(UPPER(TRIM(sku)), 'B-', '') = ?`,
    [source.id, catalogueSku.toUpperCase()]
  );

  for (const target of targetProducts) {
    const [existingVariants] = await db.execute(
      `SELECT UPPER(TRIM(color)) AS color
       FROM product_variants
       WHERE product_id = ? AND is_active = TRUE AND TRIM(COALESCE(color, '')) <> ''`,
      [target.id]
    );
    const existingColors = new Set(existingVariants.map((variant) => variant.color));
    for (const variant of sourceVariants) {
      const color = variant.color.trim();
      if (!existingColors.has(color.toUpperCase())) {
        await db.execute(
          'INSERT INTO product_variants (product_id, size, color, stock) VALUES (?, NULL, ?, 0)',
          [target.id, color]
        );
        existingColors.add(color.toUpperCase());
      }
    }
  }
}

router.get('/categories', async (_req, res, next) => {
  try {
    const [categories] = await db.execute('SELECT id, name, slug, sku_prefix FROM categories WHERE is_active = TRUE ORDER BY name');
    res.json({ success: true, data: categories });
  } catch (error) { next(error); }
});

router.post('/categories', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const { name, slug, sku_prefix: skuPrefix, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Nama kategori wajib diisi' });
    const [result] = await db.execute(
      'INSERT INTO categories (name, slug, sku_prefix, description) VALUES (?, ?, ?, ?)',
      [name.trim(), slug?.trim() || null, skuPrefix?.trim() || null, description?.trim() || null]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const params = [readableBranchId(req)];
    let where = 'WHERE p.branch_id = ? AND p.is_active = TRUE';
    if (req.query.search?.trim()) {
      where += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)';
      const term = `%${req.query.search.trim()}%`;
      params.push(term, term, term);
    }
    if (req.query.category) { where += ' AND p.category_id = ?'; params.push(Number(req.query.category)); }
    const [rows] = await db.execute(
      `SELECT p.id, p.name, p.sku, p.barcode, p.price, p.cost, p.stock, p.min_stock, p.gender,
              c.name AS category_name,
              (SELECT pp.path FROM product_photos pp WHERE pp.product_id = p.id AND pp.variant_id IS NULL AND pp.media_type = 'image' ORDER BY pp.is_primary DESC, pp.sort_order ASC, pp.id DESC LIMIT 1) AS photo_path,
              (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = TRUE) AS variant_count,
              (SELECT COALESCE(SUM(pv.stock), 0) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = TRUE) AS variant_stock_total,
              (SELECT GROUP_CONCAT(DISTINCT pv.color ORDER BY pv.color SEPARATOR '|') FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = TRUE AND pv.color IS NOT NULL AND pv.color <> '') AS variant_colors
       FROM products p JOIN categories c ON c.id = p.category_id
       ${where} ORDER BY p.name LIMIT ${limit} OFFSET ${offset}`, params
    );
    const [counts] = await db.execute(`SELECT COUNT(*) AS total FROM products p ${where}`, params);
    res.json({ success: true, data: rows, total: counts[0].total, page, totalPages: Math.ceil(counts[0].total / limit) });
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT p.id, p.name, p.description, p.category_id, p.sku, p.barcode, p.price, p.cost, p.stock, p.min_stock, p.gender,
              c.name AS category_name,
              (SELECT pp.path FROM product_photos pp WHERE pp.product_id = p.id AND pp.variant_id IS NULL AND pp.media_type = 'image' ORDER BY pp.is_primary DESC, pp.sort_order ASC, pp.id DESC LIMIT 1) AS photo_path
       FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ? AND p.branch_id = ?`,
      [req.params.id, readableBranchId(req)]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    const [wholesalePrices] = await db.execute('SELECT id, min_qty, max_qty, price FROM wholesale_prices WHERE product_id = ? AND is_active = TRUE ORDER BY min_qty', [rows[0].id]);
    const [media] = await db.execute('SELECT id, variant_id, path, media_type, is_primary, sort_order FROM product_photos WHERE product_id = ? AND variant_id IS NULL ORDER BY media_type, is_primary DESC, sort_order, id', [rows[0].id]);
    const [variants] = await db.execute(`SELECT pv.id, pv.color, pv.size, pv.sku, pv.barcode, pv.price, pv.stock,
      (SELECT pp.path FROM product_photos pp WHERE pp.variant_id = pv.id AND pp.media_type = 'image' ORDER BY pp.sort_order, pp.id DESC LIMIT 1) AS photo_path
      FROM product_variants pv WHERE pv.product_id = ? AND pv.is_active = TRUE ORDER BY pv.color, pv.size, pv.id`, [rows[0].id]);
    res.json({ success: true, data: { ...rows[0], wholesale_prices: wholesalePrices, media, variants } });
  } catch (error) { next(error); }
});

router.post('/:id/photo', authorize('owner', 'manager', 'admin'), upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file || !req.file.mimetype.startsWith('image/')) return res.status(400).json({ success: false, message: 'Pilih gambar JPG, PNG, atau WebP (maks. 30 MB)' });
    const [products] = await db.execute('SELECT id FROM products WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branch_id]);
    if (!products[0]) {
      await discardUploadedFile(req.file);
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    }
    const [existing] = await db.execute(`SELECT COUNT(*) AS total FROM product_photos WHERE product_id = ? AND variant_id IS NULL AND media_type = 'image'`, [products[0].id]);
    if (existing[0].total >= 10) {
      await discardUploadedFile(req.file);
      return res.status(400).json({ success: false, message: 'Maksimal 10 foto produk' });
    }
    const publicPath = await persistUploadedFile(req.file, 'products');
    await db.execute('UPDATE product_photos SET is_primary = FALSE WHERE product_id = ? AND variant_id IS NULL AND media_type = \'image\'', [products[0].id]);
    const [result] = await db.execute(
      'INSERT INTO product_photos (product_id, filename, path, media_type, is_primary, sort_order) VALUES (?, ?, ?, \'image\', TRUE, 0)',
      [products[0].id, req.file.filename, publicPath]
    );
    res.status(201).json({ success: true, data: { id: result.insertId, path: publicPath } });
  } catch (error) { next(error); }
});

router.post('/:id/media', authorize('owner', 'manager', 'admin'), upload.array('media', 11), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, message: 'Pilih foto atau video untuk diunggah' });
    const [products] = await db.execute('SELECT id FROM products WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branch_id]);
    if (!products[0]) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    const imageFiles = files.filter((file) => file.mimetype.startsWith('image/'));
    const videoFiles = files.filter((file) => file.mimetype.startsWith('video/'));
    if (videoFiles.length > 1) throw Object.assign(new Error('Unggah maksimal 1 video dalam satu produk'), { status: 400 });
    const [counts] = await db.execute(`SELECT SUM(media_type = 'image') AS images, SUM(media_type = 'video') AS videos FROM product_photos WHERE product_id = ? AND variant_id IS NULL`, [products[0].id]);
    if (Number(counts[0].images || 0) + imageFiles.length > 10 || Number(counts[0].videos || 0) + videoFiles.length > 1) throw Object.assign(new Error('Produk maksimal memiliki 10 foto dan 1 video'), { status: 400 });
    let imageOrder = Number(counts[0].images || 0);
    for (const file of files) {
      const mediaType = file.mimetype.startsWith('video/') ? 'video' : 'image';
      const publicPath = await persistUploadedFile(file, 'products');
      const isPrimary = mediaType === 'image' && Number(counts[0].images || 0) === 0 ? 1 : 0;
      if (mediaType === 'image') imageOrder += 1;
      await db.execute('INSERT INTO product_photos (product_id, filename, path, media_type, is_primary, sort_order) VALUES (?, ?, ?, ?, ?, ?)', [products[0].id, file.filename, publicPath, mediaType, isPrimary, mediaType === 'image' ? imageOrder : 0]);
    }
    res.status(201).json({ success: true });
  } catch (error) {
    for (const file of req.files || []) await discardUploadedFile(file);
    next(error);
  }
});

router.post('/:id/media-data', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const file = decodeDataUpload(req.body, dataUploadOptions);
    const [products] = await db.execute('SELECT id FROM products WHERE id = ? AND branch_id = ?', [req.params.id, req.user.branch_id]);
    if (!products[0]) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    const mediaType = file.mimetype.startsWith('video/') ? 'video' : 'image';
    const [counts] = await db.execute(`SELECT SUM(media_type = 'image') AS images, SUM(media_type = 'video') AS videos FROM product_photos WHERE product_id = ? AND variant_id IS NULL`, [products[0].id]);
    if ((mediaType === 'image' && Number(counts[0].images || 0) >= 10) || (mediaType === 'video' && Number(counts[0].videos || 0) >= 1)) {
      return res.status(400).json({ success: false, message: 'Produk maksimal memiliki 10 foto dan 1 video' });
    }
    const publicPath = await persistUploadedFile(file, 'products');
    const isPrimary = mediaType === 'image' ? 1 : 0;
    const sortOrder = mediaType === 'image' ? Number(counts[0].images || 0) + 1 : 0;
    if (isPrimary) await db.execute('UPDATE product_photos SET is_primary = FALSE WHERE product_id = ? AND variant_id IS NULL AND media_type = \'image\'', [products[0].id]);
    const [result] = await db.execute('INSERT INTO product_photos (product_id, filename, path, media_type, is_primary, sort_order) VALUES (?, ?, ?, ?, ?, ?)', [products[0].id, file.filename, publicPath, mediaType, isPrimary, sortOrder]);
    res.status(201).json({ success: true, data: { id: result.insertId, path: publicPath, media_type: mediaType } });
  } catch (error) { next(error); }
});

router.delete('/:id/media/:mediaId', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT pp.id, pp.path, pp.media_type, pp.is_primary
       FROM product_photos pp JOIN products p ON p.id = pp.product_id
       WHERE pp.id = ? AND pp.product_id = ? AND pp.variant_id IS NULL AND p.branch_id = ?`,
      [req.params.mediaId, req.params.id, req.user.branch_id]
    );
    const media = rows[0];
    if (!media) return res.status(404).json({ success: false, message: 'Media produk tidak ditemukan' });
    await db.execute('DELETE FROM product_photos WHERE id = ?', [media.id]);
    await removeMedia(media.path);
    if (media.media_type === 'image' && media.is_primary) {
      await db.execute(`UPDATE product_photos SET is_primary = TRUE WHERE id = (
        SELECT id FROM (SELECT id FROM product_photos WHERE product_id = ? AND variant_id IS NULL AND media_type = 'image' ORDER BY sort_order, id LIMIT 1) AS next_photo
      )`, [req.params.id]);
    }
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.post('/:id/variants/:variantId/photo', authorize('owner', 'manager', 'admin'), upload.single('media'), async (req, res, next) => {
  try {
    if (!req.file || !req.file.mimetype.startsWith('image/')) return res.status(400).json({ success: false, message: 'Foto varian harus JPG, PNG, atau WebP' });
    const [variants] = await db.execute('SELECT pv.id FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ? AND pv.product_id = ? AND p.branch_id = ?', [req.params.variantId, req.params.id, req.user.branch_id]);
    if (!variants[0]) return res.status(404).json({ success: false, message: 'Varian produk tidak ditemukan' });
    const [previous] = await db.execute('SELECT path FROM product_photos WHERE variant_id = ?', [variants[0].id]);
    await db.execute('DELETE FROM product_photos WHERE variant_id = ?', [variants[0].id]);
    const publicPath = await persistUploadedFile(req.file, 'products');
    await db.execute('INSERT INTO product_photos (product_id, variant_id, filename, path, media_type, is_primary, sort_order) VALUES (?, ?, ?, ?, \'image\', FALSE, 0)', [req.params.id, variants[0].id, req.file.filename, publicPath]);
    for (const item of previous) await removeMedia(item.path);
    res.status(201).json({ success: true, data: { path: publicPath } });
  } catch (error) { next(error); }
});

router.post('/:id/variants/:variantId/photo-data', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const file = decodeDataUpload(req.body, { ...dataUploadOptions, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] });
    const [variants] = await db.execute('SELECT pv.id FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ? AND pv.product_id = ? AND p.branch_id = ?', [req.params.variantId, req.params.id, req.user.branch_id]);
    if (!variants[0]) return res.status(404).json({ success: false, message: 'Varian produk tidak ditemukan' });
    const [previous] = await db.execute('SELECT path FROM product_photos WHERE variant_id = ?', [variants[0].id]);
    const publicPath = await persistUploadedFile(file, 'products');
    await db.execute('DELETE FROM product_photos WHERE variant_id = ?', [variants[0].id]);
    await db.execute('INSERT INTO product_photos (product_id, variant_id, filename, path, media_type, is_primary, sort_order) VALUES (?, ?, ?, ?, \'image\', FALSE, 0)', [req.params.id, variants[0].id, file.filename, publicPath]);
    for (const item of previous) await removeMedia(item.path);
    res.status(201).json({ success: true, data: { path: publicPath } });
  } catch (error) { next(error); }
});

router.post('/', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const { name, category_id: categoryId, sku, barcode, price, cost = 0, min_stock: minStock = 5, gender = 'unisex', description, wholesale_prices: wholesalePrices, variants: inputVariants } = req.body;
    if (!name?.trim() || !Number.isInteger(Number(categoryId)) || !positiveNumber(price) || !positiveNumber(cost) || !positiveNumber(minStock)) {
      return res.status(400).json({ success: false, message: 'Nama, kategori, harga, biaya, dan stok minimum tidak valid' });
    }
    if (!['male', 'female', 'unisex', 'kids'].includes(gender)) return res.status(400).json({ success: false, message: 'Gender tidak valid' });
    const [categories] = await db.execute('SELECT id FROM categories WHERE id = ? AND is_active = TRUE', [categoryId]);
    if (!categories[0]) return res.status(400).json({ success: false, message: 'Kategori tidak ditemukan' });
    const tiers = normalizeWholesalePrices(wholesalePrices);
    const variants = normalizeVariants(inputVariants);
    const [result] = await db.execute(
      `INSERT INTO products (branch_id, category_id, name, description, sku, barcode, price, cost, min_stock, gender)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.branch_id, categoryId, name.trim(), description?.trim() || null, sku?.trim() || null, barcode?.trim() || null, Number(price), Number(cost), Number(minStock), gender]
    );
    for (const tier of tiers) await db.execute('INSERT INTO wholesale_prices (product_id, min_qty, max_qty, price) VALUES (?, ?, ?, ?)', [result.insertId, tier.min_qty, tier.max_qty, tier.price]);
    for (const variant of variants) await db.execute('INSERT INTO product_variants (product_id, size, color, sku, barcode, stock, price) VALUES (?, ?, ?, ?, ?, 0, ?)', [result.insertId, variant.size || null, variant.color || null, variant.sku, variant.barcode, variant.price]);
    await syncVariantColorsAcrossStores(result.insertId, req.user.branch_id);
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) { next(error); }
});

router.put('/:id', authorize('owner', 'manager', 'admin'), async (req, res, next) => {
  try {
    const { name, category_id: categoryId, sku, barcode, price, cost = 0, min_stock: minStock = 5, gender = 'unisex', description, wholesale_prices: wholesalePrices, variants: inputVariants } = req.body;
    if (!name?.trim() || !Number.isInteger(Number(categoryId)) || !positiveNumber(price) || !positiveNumber(cost) || !positiveNumber(minStock)) return res.status(400).json({ success: false, message: 'Nama, kategori, harga, biaya, dan stok minimum tidak valid' });
    if (!['male', 'female', 'unisex', 'kids'].includes(gender)) return res.status(400).json({ success: false, message: 'Target pengguna tidak valid' });
    const [categories] = await db.execute('SELECT id FROM categories WHERE id = ? AND is_active = TRUE', [categoryId]);
    if (!categories[0]) return res.status(400).json({ success: false, message: 'Kategori tidak ditemukan' });
    const tiers = normalizeWholesalePrices(wholesalePrices);
    const variants = normalizeVariants(inputVariants);
    const [result] = await db.execute(
      `UPDATE products SET category_id = ?, name = ?, description = ?, sku = ?, barcode = ?, price = ?, cost = ?, min_stock = ?, gender = ?
       WHERE id = ? AND branch_id = ?`,
      [Number(categoryId), name.trim(), description?.trim() || null, sku?.trim() || null, barcode?.trim() || null, Number(price), Number(cost), Number(minStock), gender, req.params.id, req.user.branch_id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    await db.execute('UPDATE wholesale_prices SET is_active = FALSE WHERE product_id = ?', [req.params.id]);
    for (const tier of tiers) await db.execute('INSERT INTO wholesale_prices (product_id, min_qty, max_qty, price) VALUES (?, ?, ?, ?)', [req.params.id, tier.min_qty, tier.max_qty, tier.price]);
    const keptIds = variants.filter((variant) => variant.id).map((variant) => variant.id);
    if (keptIds.length) {
      const placeholders = keptIds.map(() => '?').join(',');
      await db.execute(`UPDATE product_variants SET is_active = FALSE WHERE product_id = ? AND id NOT IN (${placeholders}) AND stock = 0`, [req.params.id, ...keptIds]);
    } else {
      await db.execute('UPDATE product_variants SET is_active = FALSE WHERE product_id = ? AND stock = 0', [req.params.id]);
    }
    for (const variant of variants) {
      if (variant.id) {
        const [updated] = await db.execute('UPDATE product_variants SET size = ?, color = ?, sku = ?, barcode = ?, price = ?, is_active = TRUE WHERE id = ? AND product_id = ?', [variant.size || null, variant.color || null, variant.sku, variant.barcode, variant.price, variant.id, req.params.id]);
        if (!updated.affectedRows) throw Object.assign(new Error('Varian produk tidak ditemukan'), { status: 404 });
      } else {
        await db.execute('INSERT INTO product_variants (product_id, size, color, sku, barcode, stock, price) VALUES (?, ?, ?, ?, ?, 0, ?)', [req.params.id, variant.size || null, variant.color || null, variant.sku, variant.barcode, variant.price]);
      }
    }
    await syncVariantColorsAcrossStores(Number(req.params.id), req.user.branch_id);
    res.json({ success: true, data: { id: Number(req.params.id) } });
  } catch (error) { next(error); }
});

module.exports = router;
