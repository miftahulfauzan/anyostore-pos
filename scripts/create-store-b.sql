-- Create a second store and copy the active catalog from branch 1.
-- Product inventory is deliberately initialized at zero per the new store.
START TRANSACTION;

INSERT INTO branches (name, address, phone, is_active)
SELECT 'Toko B', 'Alamat Toko B (ubah di Pengaturan)', '', TRUE
WHERE NOT EXISTS (SELECT 1 FROM branches WHERE name = 'Toko B');

SET @store_b := (SELECT id FROM branches WHERE name = 'Toko B' LIMIT 1);

INSERT INTO warehouses (branch_id, name, description, is_active)
SELECT @store_b, 'Gudang Toko B', 'Gudang utama Toko B', TRUE
WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE branch_id = @store_b AND name = 'Gudang Toko B');

SET @warehouse_b := (SELECT id FROM warehouses WHERE branch_id = @store_b AND name = 'Gudang Toko B' LIMIT 1);

INSERT INTO products (branch_id, category_id, name, description, sku, barcode, price, cost, stock, min_stock, gender, is_active)
SELECT @store_b, p.category_id, p.name, p.description, CONCAT('B-', p.sku), NULL, p.price, p.cost, 0, p.min_stock, p.gender, p.is_active
FROM products p
WHERE p.branch_id = 1 AND p.is_active = TRUE
  AND NOT EXISTS (SELECT 1 FROM products b WHERE b.branch_id = @store_b AND b.sku = CONCAT('B-', p.sku));

INSERT INTO warehouse_stocks (warehouse_id, product_id, variant_id, quantity, reserved_quantity)
SELECT @warehouse_b, p.id, NULL, 0, 0
FROM products p
WHERE p.branch_id = @store_b
  AND NOT EXISTS (SELECT 1 FROM warehouse_stocks ws WHERE ws.warehouse_id = @warehouse_b AND ws.product_id = p.id AND ws.variant_id IS NULL);

INSERT INTO product_photos (product_id, filename, path, is_primary, sort_order)
SELECT target.id, photo.filename, photo.path, photo.is_primary, photo.sort_order
FROM product_photos photo
JOIN products source ON source.id = photo.product_id AND source.branch_id = 1
JOIN products target ON target.branch_id = @store_b AND target.sku = CONCAT('B-', source.sku)
WHERE NOT EXISTS (SELECT 1 FROM product_photos existing WHERE existing.product_id = target.id AND existing.path = photo.path);

INSERT INTO wholesale_prices (product_id, min_qty, max_qty, price, is_active)
SELECT target.id, wp.min_qty, wp.max_qty, wp.price, wp.is_active
FROM wholesale_prices wp
JOIN products source ON source.id = wp.product_id AND source.branch_id = 1
JOIN products target ON target.branch_id = @store_b AND target.sku = CONCAT('B-', source.sku)
WHERE NOT EXISTS (SELECT 1 FROM wholesale_prices existing WHERE existing.product_id = target.id AND existing.min_qty = wp.min_qty AND existing.max_qty <=> wp.max_qty);

INSERT INTO store_settings (branch_id, `key`, `value`)
SELECT @store_b, `key`, CASE WHEN `key` = 'store_name' THEN 'Toko B' ELSE `value` END
FROM store_settings
WHERE branch_id = 1
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

COMMIT;
