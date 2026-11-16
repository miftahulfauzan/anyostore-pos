-- Dasar perhitungan komisi per aturan:
--   self    = transaksi staf itu sendiri (perilaku lama)
--   team    = semua staf lain di cabang yang sama
--   branch  = semua staf di cabang (termasuk dirinya)
--   company = semua cabang (untuk owner/area manager)
ALTER TABLE commission_rules
  ADD COLUMN scope ENUM('self','team','branch','company') NOT NULL DEFAULT 'self' AFTER calculation_type;
