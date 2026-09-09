ALTER TABLE warehouse_stocks
  ADD COLUMN revision BIGINT UNSIGNED NOT NULL DEFAULT 0;

CREATE TABLE inventory_requests (
  user_id INT NOT NULL,
  request_id CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  endpoint VARCHAR(80) NOT NULL,
  response_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, request_id),
  INDEX idx_inventory_requests_created (created_at),
  CONSTRAINT fk_inventory_requests_user FOREIGN KEY (user_id) REFERENCES users(id)
);
