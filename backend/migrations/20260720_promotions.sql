CREATE TABLE IF NOT EXISTS promotions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  discount_type ENUM('percentage','nominal') NOT NULL,
  discount_value DECIMAL(14,2) NOT NULL,
  min_purchase DECIMAL(14,2) NOT NULL DEFAULT 0,
  max_discount DECIMAL(14,2) NULL,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  usage_limit INT NULL,
  usage_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_promotion_branch_code (branch_id, code),
  CONSTRAINT fk_promotions_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);
