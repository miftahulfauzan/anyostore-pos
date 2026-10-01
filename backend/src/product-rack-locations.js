function mapRackLocationsByProduct(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const productId = Number(row.product_id);
    const rackPosition = String(row.rack_position ?? '').trim();
    if (!Number.isInteger(productId) || productId <= 0 || !rackPosition) continue;

    const location = {
      warehouse_id: Number(row.warehouse_id),
      warehouse_name: String(row.warehouse_name || '').trim(),
      branch_name: String(row.branch_name || '').trim() || null,
      variant_id: row.variant_id == null ? null : Number(row.variant_id),
      variant_color: String(row.variant_color || '').trim() || null,
      variant_size: String(row.variant_size || '').trim() || null,
      rack_position: rackPosition,
    };
    if (!grouped.has(productId)) grouped.set(productId, []);
    grouped.get(productId).push(location);
  }
  return grouped;
}

async function loadProductRackLocations(database, products) {
  if (!products.length) return new Map();

  const productIds = [...new Set(products.map((product) => Number(product.id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!productIds.length) return new Map();

  const placeholders = productIds.map(() => '?').join(', ');
  const [rows] = await database.execute(
    `SELECT ws.product_id, w.id AS warehouse_id, w.name AS warehouse_name,
            b.name AS branch_name, pv.id AS variant_id, pv.color AS variant_color,
            pv.size AS variant_size, ws.rack_position
     FROM warehouse_stocks ws
     JOIN warehouses w ON w.id = ws.warehouse_id AND w.is_active = TRUE
     JOIN products p ON p.id = ws.product_id AND p.branch_id = w.branch_id AND p.is_active = TRUE
     JOIN branches b ON b.id = p.branch_id
     LEFT JOIN product_variants pv ON pv.id = ws.variant_id AND pv.product_id = p.id AND pv.is_active = TRUE
     WHERE ws.product_id IN (${placeholders})
       AND (ws.variant_id IS NULL OR pv.id IS NOT NULL)
       AND ws.rack_position IS NOT NULL AND TRIM(ws.rack_position) <> ''
     ORDER BY b.name, w.name, pv.color, pv.size`,
    productIds,
  );
  return mapRackLocationsByProduct(rows);
}

module.exports = { mapRackLocationsByProduct, loadProductRackLocations };
