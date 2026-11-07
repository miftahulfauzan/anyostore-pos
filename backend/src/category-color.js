const CATEGORY_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function normalizeCategoryColor(value) {
  if (value == null || String(value).trim() === '') return null;
  const color = String(value).trim();
  if (!CATEGORY_COLOR_RE.test(color)) {
    throw Object.assign(new Error('Warna kategori tidak valid'), { status: 400 });
  }
  return color.toUpperCase();
}

module.exports = { normalizeCategoryColor };
