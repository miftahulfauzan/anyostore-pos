-- Backfill existing colors to the matching product in every store.
-- Only the color catalogue is shared. New target variants always start at zero stock.
INSERT INTO product_variants (product_id, size, color, stock, is_active)
SELECT DISTINCT
  target.id,
  NULL,
  TRIM(source_variant.color),
  0,
  TRUE
FROM products source_product
JOIN product_variants source_variant
  ON source_variant.product_id = source_product.id
 AND source_variant.is_active = TRUE
 AND TRIM(COALESCE(source_variant.color, '')) <> ''
JOIN products target
  ON target.id <> source_product.id
 AND target.is_active = TRUE
 AND REPLACE(UPPER(TRIM(target.sku)), 'B-', '') = REPLACE(UPPER(TRIM(source_product.sku)), 'B-', '')
WHERE source_product.is_active = TRUE
  AND TRIM(COALESCE(source_product.sku, '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM product_variants target_variant
    WHERE target_variant.product_id = target.id
      AND target_variant.is_active = TRUE
      AND UPPER(TRIM(COALESCE(target_variant.color, ''))) = UPPER(TRIM(source_variant.color))
  );
