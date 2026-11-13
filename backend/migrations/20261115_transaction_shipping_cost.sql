-- Ongkir pesanan reseller ikut dicatat di transaksi POS (agar struk bisa
-- menampilkan baris Ongkir), tetapi DIKECUALIKAN dari omzet barang di laporan.
ALTER TABLE transactions ADD COLUMN shipping_cost DECIMAL(12,2) NOT NULL DEFAULT 0;