-- Hapus baris product_photos yang produknya sudah tidak ada (produk dihapus
-- permanen). Baris yatim membuat path foto tampak "dipakai bersama" sehingga
-- penggantian foto bisa menghapus file untuk baris lain.
-- File di disk tidak disentuh: penghapusan file tetap lewat jalur refcount.
DELETE pp FROM product_photos pp
  LEFT JOIN products p ON p.id = pp.product_id
 WHERE p.id IS NULL;
