ALTER TABLE stock_transfer_items
  ADD COLUMN destination_product_id INT NULL AFTER variant_id,
  ADD COLUMN destination_variant_id INT NULL AFTER destination_product_id;
