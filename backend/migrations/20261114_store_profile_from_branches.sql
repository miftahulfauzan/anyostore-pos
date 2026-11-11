-- Identitas toko (nama, alamat, telepon, email, NPWP) hanya disimpan di
-- tabel branches. Baris lama di store_settings (dibuat saat seeding cabang)
-- tidak pernah diperbarui lagi sehingga bisa menampilkan alamat lama pada
-- invoice/landing. Hapus supaya semua pembaca memakai data branches.
DELETE FROM store_settings
WHERE `key` IN ('store_name', 'store_address', 'store_phone', 'store_email', 'store_tax_id');
