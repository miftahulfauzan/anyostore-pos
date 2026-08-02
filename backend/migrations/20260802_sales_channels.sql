-- Sales channels (Keperluan/saluran) for stock-out records: add/edit/remove dynamically.
CREATE TABLE IF NOT EXISTS sales_channels (
  id INT PRIMARY KEY AUTO_INCREMENT,
  value VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO sales_channels (value, name, sort_order) VALUES
  ('toko', 'Toko / internal', 1),
  ('wa', 'Penjualan WhatsApp', 2),
  ('shopee', 'Shopee', 3),
  ('tiktok', 'TikTok', 4),
  ('reseller', 'Reseller', 5);
