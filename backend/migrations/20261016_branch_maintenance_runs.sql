CREATE TABLE IF NOT EXISTS branch_maintenance_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  operation VARCHAR(64) NOT NULL,
  branch_key VARCHAR(128) NOT NULL UNIQUE,
  source_branch_id INT NOT NULL,
  target_branch_ids JSON NOT NULL,
  audit_fingerprint CHAR(64) NOT NULL,
  backup_location VARCHAR(512) NOT NULL,
  initiated_by VARCHAR(100) NOT NULL,
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_branch_maintenance_operation (operation, completed_at)
);
