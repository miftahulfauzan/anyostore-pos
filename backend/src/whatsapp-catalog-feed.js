const FEED_BASE_URL = 'https://grosir.anyostore.id';

const HEADERS = [
  'id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'link',
  'image_link',
  'additional_image_link',
  'brand',
  'google_product_category',
  'product_type',
  'origin_country',
  'visibility',
];

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function titleFor(row) {
  const name = String(row.name || '').trim();
  return name.replace(/^anyostore\b[\s:|—–-]*/i, '').trim() || name;
}

function imageUrl(path) {
  const relativePath = String(path || '').trim().replace(/^\/+/, '');
  if (!relativePath) return '';
  try {
    return new URL(relativePath, `${FEED_BASE_URL}/`).href;
  } catch {
    return '';
  }
}

function photoPathsFor(row) {
  const paths = Array.isArray(row.photo_paths)
    ? row.photo_paths
    : String(row.photo_paths || row.photo_path || '').split('||');
  return paths.map(imageUrl).filter(Boolean);
}

function priceFor(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? `${price.toFixed(2)} IDR` : '';
}

function descriptionFor(row, title) {
  const description = String(row.description || '').trim();
  if (description) return description;
  const category = String(row.category_name || '').trim();
  return category ? `Model ${title}. Kategori: ${category}.` : `Model ${title}.`;
}

function serializeWhatsAppCatalogCsv(rows) {
  const lines = [HEADERS.map(csvCell).join(',')];

  for (const row of rows) {
    const title = titleFor(row);
    const images = photoPathsFor(row);
    const price = priceFor(row.price);
    const availableStock = Number(row.available_stock) || 0;
    const values = [
      `ANYO-${row.id}`,
      title,
      descriptionFor(row, title),
      availableStock > 0 ? 'in stock' : 'out of stock',
      'new',
      price,
      `${FEED_BASE_URL}/produk/${encodeURIComponent(String(row.id))}`,
      images[0] || '',
      images.slice(1).join(','),
      'Basik',
      '',
      String(row.category_name || '').trim(),
      'ID',
      images.length > 0 && price ? 'published' : 'staging',
    ];
    lines.push(values.map(csvCell).join(','));
  }

  return lines.join('\n');
}

module.exports = { serializeWhatsAppCatalogCsv };
