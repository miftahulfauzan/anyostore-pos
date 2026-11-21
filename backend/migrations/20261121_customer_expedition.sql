-- Ekspedisi langganan pelanggan (JNE, J&T, SiCepat, ...).
-- Dipakai blok PENGIRIMAN pada invoice gambar yang dibagikan dari POS/riwayat.
ALTER TABLE customers
  ADD COLUMN expedition VARCHAR(60) DEFAULT NULL AFTER address;
