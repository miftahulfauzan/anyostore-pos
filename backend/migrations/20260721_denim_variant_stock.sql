-- Move legacy product-level stock into the Denim color variant.
-- Product variants are shared by matching product SKU across stores; stock remains per store.
START TRANSACTION;

INSERT INTO product_variants (product_id, size, color, stock, is_active)
SELECT p.id, NULL, 'DENIM', 0, TRUE
FROM products p
WHERE p.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM product_variants pv
    WHERE pv.product_id = p.id
      AND pv.is_active = TRUE
      AND UPPER(TRIM(COALESCE(pv.color, ''))) = 'DENIM'
  );

INSERT INTO warehouse_stocks (
  warehouse_id,
  product_id,
  variant_id,
  quantity,
  reserved_quantity
)
SELECT
  ws.warehouse_id,
  ws.product_id,
  pv.id,
  ws.quantity,
  ws.reserved_quantity
FROM warehouse_stocks ws
JOIN product_variants pv
  ON pv.product_id = ws.product_id
 AND pv.is_active = TRUE
 AND UPPER(TRIM(COALESCE(pv.color, ''))) = 'DENIM'
WHERE ws.variant_id IS NULL
ON DUPLICATE KEY UPDATE
  quantity = warehouse_stocks.quantity + VALUES(quantity),
  reserved_quantity = warehouse_stocks.reserved_quantity + VALUES(reserved_quantity);

UPDATE warehouse_stocks
SET quantity = 0,
    reserved_quantity = 0
WHERE variant_id IS NULL;

UPDATE product_variants pv
SET stock = COALESCE((
  SELECT SUM(ws.quantity)
  FROM warehouse_stocks ws
  WHERE ws.product_id = pv.product_id
    AND ws.variant_id = pv.id
), 0)
WHERE pv.is_active = TRUE;

UPDATE products p
SET stock = COALESCE((
  SELECT SUM(pv.stock)
  FROM product_variants pv
  WHERE pv.product_id = p.id
    AND pv.is_active = TRUE
), 0)
WHERE p.is_active = TRUE;

COMMIT;
