ALTER TABLE warehouse_stocks
  ADD COLUMN rack_position VARCHAR(100) NULL AFTER reserved_quantity;
