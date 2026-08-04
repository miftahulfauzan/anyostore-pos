-- Index pendukung laporan & audit.
-- Catatan: kolom FK tunggal sudah otomatis di-index oleh InnoDB; file ini
-- menambah index komposit yang sering dipakai query laporan/mutasi.
ALTER TABLE stock_mutations
  ADD INDEX idx_stock_mutations_branch_created (branch_id, created_at),
  ADD INDEX idx_stock_mutations_reference (reference_type, reference_id);

ALTER TABLE returns
  ADD INDEX idx_returns_branch_created (branch_id, created_at);

ALTER TABLE journal_entries
  ADD INDEX idx_journal_branch_date (branch_id, journal_date),
  ADD INDEX idx_journal_reference (reference_type, reference_id);

ALTER TABLE loyalty_points
  ADD INDEX idx_loyalty_reference (reference_type, reference_id);

ALTER TABLE transaction_items
  ADD INDEX idx_transaction_items_product_variant (product_id, variant_id);

ALTER TABLE activity_logs
  ADD INDEX idx_activity_logs_created (created_at);

ALTER TABLE refresh_tokens
  ADD INDEX idx_refresh_tokens_expires (expires_at);
