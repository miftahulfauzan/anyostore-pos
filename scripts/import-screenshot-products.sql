-- Import produk dari Screenshot 2026-07-19 at 21.51.54.png
-- Harga beli dan harga jual sengaja diset 0 karena tidak terlihat pada screenshot.
START TRANSACTION;

INSERT INTO categories (name, slug, sku_prefix)
SELECT v.name, v.slug, v.prefix FROM (
  SELECT 'Kemeja' AS name, 'kemeja' AS slug, 'KMJ' AS prefix UNION ALL
  SELECT 'Tunik', 'tunik', 'TNK' UNION ALL SELECT 'Celana', 'celana', 'CLN' UNION ALL
  SELECT 'Gamis', 'gamis', 'GMS' UNION ALL SELECT 'Rok', 'rok', 'ROK' UNION ALL
  SELECT 'One Set', 'one-set', 'SET' UNION ALL SELECT 'Vest', 'vest', 'VST'
) v WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.name = v.name);

INSERT INTO warehouses (branch_id, name, description)
SELECT 1, 'Gudang Utara', 'Stok awal hasil import screenshot'
WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE branch_id = 1 AND name = 'Gudang Utara');

CREATE TEMPORARY TABLE screenshot_products (
  sku VARCHAR(50) PRIMARY KEY, name VARCHAR(200), category_name VARCHAR(100), stock INT NOT NULL
);

INSERT INTO screenshot_products (sku, name, category_name, stock) VALUES
('A100','A100','Kemeja',255),('A101','A101','Kemeja',119),('A102','A102','Kemeja',44),('A102-BORDIR','A102 Bordir','Kemeja',6),('A103','A103','Tunik',12),('A104-BORDIR','A104 Bordir','Kemeja',0),('A105','A105','Kemeja',344),('A106','A106','Kemeja',84),('AB07','AB07','Kemeja',397),('AB07-BORDIR','AB07 Bordir','Kemeja',549),('AB07-BLAZE','AB07 Blaze','Kemeja',66),('AB09','AB09','Kemeja',12),('AB12','AB12','Kemeja',1651),('AB12-BORDIR','AB12 Bordir','Kemeja',4),('AB12-ON-MODEL','AB12 On Model','Kemeja',911),
('AB12-SHANGHAI','AB12 Shanghai','Kemeja',41),('AB16','AB16','Kemeja',10),('AB28','AB28','Kemeja',170),('AB70','AB70','Kemeja',184),('AB70-BLAZE','AB70 Blaze','Kemeja',38),('AB70-BORDIR','AB70 Bordir','Kemeja',436),('AB71','AB71','Kemeja',0),('AB83','AB83','Kemeja',137),('AB83-BORDIR','AB83 Bordir','Kemeja',148),('AB85','AB85','Kemeja',3),('AB89','AB89','Kemeja',0),('AB94','AB94','Kemeja',620),('AB97','AB97','Kemeja',15),('AB98','AB98','Kemeja',48),('AC03','AC03','Celana',0),
('AC05','AC05','Celana',0),('AC07','AC07','Celana',123),('AG01','AG01','Gamis',100),('AG02','AG02','Gamis',125),('AT36','AT36','Tunik',22),('AT64','AT64','Tunik',0),('AT65','AT65','Tunik',7),('AT66','AT66','Tunik',5),('AT67','AT67','Tunik',502),('AT68','AT68','Tunik',7),('AT75','AT75','Tunik',13),('AT77','AT77','Tunik',389),('AT77-BORDIR','AT77 Bordir','Tunik',3),('AT77-BLAZE','AT77 Blaze','Tunik',6),('AT79','AT79','Tunik',12),
('AT90','AT90','Tunik',90),('AT92','AT92','Tunik',404),('CELANA-KATUN','Celana Katun','Celana',210),('OB','Salur Kotak','Kemeja',302),('REJECT-PERBAIKAN','Reject Perbaikan','Kemeja',145),('ROK-01','Rok 01','Rok',0),('ROK-02','Rok 02','Rok',2),('ROK-03','Rok 03','Rok',8),('ST01','ST01','One Set',104),('ST02','ST02','One Set',197),('V01','V01','Vest',88),('V03','V03','Vest',191),('V04','V04','Vest',309);

INSERT INTO products (branch_id, category_id, name, sku, price, cost, stock, min_stock)
SELECT 1, c.id, p.name, p.sku, 0, 0, p.stock, 5
FROM screenshot_products p JOIN categories c ON c.name = p.category_name;

INSERT INTO warehouse_stocks (warehouse_id, product_id, quantity)
SELECT w.id, p.id, s.stock FROM screenshot_products s
JOIN products p ON p.sku = s.sku AND p.branch_id = 1
JOIN warehouses w ON w.branch_id = 1 AND w.name = 'Gudang Utara';

COMMIT;
