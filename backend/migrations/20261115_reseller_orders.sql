-- Pesanan dari situs reseller. Disimpan terpisah dari transactions supaya stok
-- dan laporan hanya terpengaruh setelah admin mengonversi pesanan.
CREATE TABLE IF NOT EXISTS reseller_sequences (
    branch_id INT NOT NULL,
    business_date DATE NOT NULL,
    last_number INT NOT NULL DEFAULT 0,
    PRIMARY KEY (branch_id, business_date),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS reseller_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_no VARCHAR(30) NOT NULL,
    public_token CHAR(32) NOT NULL,
    branch_id INT NOT NULL,
    account_id INT DEFAULT NULL,
    customer_id INT DEFAULT NULL,
    buyer_name VARCHAR(120) NOT NULL,
    buyer_phone VARCHAR(30) NOT NULL,
    buyer_address TEXT NOT NULL,
    buyer_city VARCHAR(120) DEFAULT NULL,
    buyer_postal VARCHAR(12) DEFAULT NULL,
    notes TEXT,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount DECIMAL(12,2) NOT NULL DEFAULT 0,
    shipping_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    status ENUM('new','confirmed','paid','shipped','done','rejected','cancelled') NOT NULL DEFAULT 'new',
    payment_status ENUM('unpaid','waiting_verification','paid') NOT NULL DEFAULT 'unpaid',
    paid_at TIMESTAMP NULL,
    courier VARCHAR(40) DEFAULT NULL,
    tracking_no VARCHAR(80) DEFAULT NULL,
    shipped_at TIMESTAMP NULL,
    reject_reason VARCHAR(255) DEFAULT NULL,
    transaction_id INT DEFAULT NULL,
    client_order_id VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reseller_orders_no (order_no),
    UNIQUE KEY uq_reseller_orders_token (public_token),
    UNIQUE KEY uq_reseller_orders_client (client_order_id),
    KEY idx_reseller_orders_status (branch_id, status, created_at),
    KEY idx_reseller_orders_phone (buyer_phone),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (account_id) REFERENCES reseller_accounts(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

CREATE TABLE IF NOT EXISTS reseller_order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    product_id INT DEFAULT NULL,
    variant_id INT DEFAULT NULL,
    product_name VARCHAR(190) NOT NULL,
    sku VARCHAR(80) DEFAULT NULL,
    variant_label VARCHAR(120) DEFAULT NULL,
    price DECIMAL(12,2) NOT NULL,
    quantity INT NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    KEY idx_reseller_order_items_order (order_id),
    FOREIGN KEY (order_id) REFERENCES reseller_orders(id) ON DELETE CASCADE
);