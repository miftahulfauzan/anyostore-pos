ALTER TABLE product_photos
  ADD COLUMN variant_id INT NULL AFTER product_id,
  ADD COLUMN media_type ENUM('image', 'video') NOT NULL DEFAULT 'image' AFTER path,
  ADD CONSTRAINT product_photos_variant_fk FOREIGN KEY (variant_id) REFERENCES product_variants(id);

CREATE INDEX idx_product_photos_variant ON product_photos (variant_id);
