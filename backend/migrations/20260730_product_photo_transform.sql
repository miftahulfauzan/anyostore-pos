-- Add transform column to product_photos for user-adjustable zoom/pan.
ALTER TABLE product_photos ADD COLUMN `transform` VARCHAR(100) DEFAULT NULL COMMENT 'scale,x,y — user-adjusted zoom and pan for thumbnail display';
