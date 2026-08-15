-- Backfill returned_qty per item dari return_items APPROVED.
-- Data retur lama (dibuat sebelum urutan approve diperbaiki) tidak mencatat
-- qty retur di transaction_items.returned_qty, sehingga biaya (cost) item yang
-- sudah diretur masih ikut terhitung di HPP sementara penjualannya sudah
-- dikurangi refund -> HPP bisa melebihi Penjualan. Idempoten.
UPDATE transaction_items ti
SET ti.returned_qty = COALESCE((
  SELECT SUM(ri.quantity)
  FROM return_items ri JOIN returns r ON r.id = ri.return_id
  WHERE ri.transaction_item_id = ti.id AND r.status = 'approved'
), 0)
WHERE EXISTS (
  SELECT 1 FROM return_items ri JOIN returns r ON r.id = ri.return_id
  WHERE ri.transaction_item_id = ti.id AND r.status = 'approved'
);
