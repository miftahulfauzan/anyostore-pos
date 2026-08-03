const { money } = require('./money');

// Satu-satunya sumber logika harga berjenjang (tier pelanggan + harga grosir).
// Dipakai oleh checkout dan endpoint preview supaya harga tampilan = harga
// tersimpan. JANGAN duplikasi logika ini di frontend — pakai /transactions/preview.
const SEMI_GROSIR_DISCOUNT_PER_PCS = 10000;

// Cari harga grosir (Grosir Seri). Kalau force=true, abaikan min_qty tapi
// tetap cari tier yang paling sesuai qty.
async function findWholesalePrice(connection, productId, variantId, quantity, force = false) {
  if (force) {
    // Coba tier yang max_qty masih mencakup qty, pilih min_qty tertinggi.
    const [rows] = await connection.execute(
      `SELECT price FROM wholesale_prices
       WHERE product_id = ? AND (variant_id <=> ?) AND is_active = TRUE
         AND (max_qty IS NULL OR max_qty >= ?)
       ORDER BY min_qty DESC LIMIT 1`,
      [productId, variantId, quantity]
    );
    if (rows[0]) return money(rows[0].price);
    // Fallback ke tier dengan min_qty terendah.
    const [fallback] = await connection.execute(
      `SELECT price FROM wholesale_prices
       WHERE product_id = ? AND (variant_id <=> ?) AND is_active = TRUE
       ORDER BY min_qty ASC LIMIT 1`,
      [productId, variantId]
    );
    return fallback[0] ? money(fallback[0].price) : null;
  }
  const [rows] = await connection.execute(
    `SELECT price FROM wholesale_prices
     WHERE product_id = ? AND (variant_id <=> ?) AND is_active = TRUE
       AND min_qty <= ? AND (max_qty IS NULL OR max_qty >= ?)
     ORDER BY min_qty DESC LIMIT 1`,
    [productId, variantId, quantity, quantity]
  );
  return rows[0] ? money(rows[0].price) : null;
}

function applySemiGrosir(lines) {
  for (const line of lines) {
    const discounted = Math.max(0, line.price - SEMI_GROSIR_DISCOUNT_PER_PCS);
    line.price = money(discounted);
    line.lineSubtotal = money(line.price * line.quantity - line.itemDiscount);
    line.tierApplied = 'semi_grosir';
  }
  return 'semi_grosir';
}

async function applyGrosirSeri(connection, lines) {
  let hasGrosir = false;
  for (const line of lines) {
    const wholesale = await findWholesalePrice(connection, line.productId, line.variantId, line.quantity, true);
    if (wholesale != null && wholesale < line.price) {
      line.price = wholesale;
      line.lineSubtotal = money(line.price * line.quantity - line.itemDiscount);
      line.tierApplied = 'grosir_seri';
      hasGrosir = true;
    }
  }
  return hasGrosir ? 'grosir_seri' : 'retail';
}

async function applyAutoTier(connection, lines) {
  // 1) Grosir Seri: line dengan qty>=6 yang punya harga grosir.
  const grosirTier = await applyGrosirSeri(connection, lines);
  if (grosirTier === 'grosir_seri') return 'grosir_seri';

  // 2) Semi Grosir: total qty > 3 dan lebih dari 1 model berbeda.
  const totalQty = lines.reduce((sum, line) => sum + line.quantity, 0);
  const distinctModels = new Set(lines.map((line) => line.productId)).size;
  if (totalQty > 3 && distinctModels > 1) {
    applySemiGrosir(lines);
    return 'semi_grosir';
  }

  return 'retail';
}

// Tentukan tier transaksi + harga final per line.
// Hybrid: default dari tipe pelanggan; Reguler tetap auto-deteksi qty.
async function applyPriceTier(connection, branchId, lines, customerTier = 'reguler') {
  const [branchRows] = await connection.execute('SELECT pricing_tier_enabled FROM branches WHERE id = ?', [branchId]);
  const tiersEnabled = branchRows[0]?.pricing_tier_enabled ?? true;
  if (!tiersEnabled) return 'retail';
  if (customerTier === 'grosir_seri') return applyGrosirSeri(connection, lines);
  if (customerTier === 'semi_grosir') return applySemiGrosir(lines);
  return applyAutoTier(connection, lines);
}

module.exports = { SEMI_GROSIR_DISCOUNT_PER_PCS, findWholesalePrice, applyPriceTier };
