-- ============================================
-- POS PAKAIAN - DATABASE MIGRATION
-- Version: 1.1.0
-- Date: 2026-07-08
-- ============================================

-- ============================================
-- 1. branches (Cabang)
-- ============================================
CREATE TABLE branches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. users (Pengguna)
-- ============================================
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('owner','manager','admin','kasir','gudang') NOT NULL,
    pin_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================
-- 3. categories (Kategori Produk)
-- ============================================
CREATE TABLE categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE,
    sku_prefix VARCHAR(10),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- 4. products (Produk)
-- ============================================
CREATE TABLE products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    category_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    slug VARCHAR(200) UNIQUE,
    sku VARCHAR(50) UNIQUE,
    barcode VARCHAR(50) UNIQUE,
    price DECIMAL(12,2) NOT NULL,
    cost DECIMAL(12,2) DEFAULT 0,
    stock INT DEFAULT 0,
    min_stock INT DEFAULT 5,
    gender ENUM('male','female','unisex','kids') DEFAULT 'unisex',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX idx_products_branch_category ON products(branch_id, category_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);

-- ============================================
-- 5. product_variants (Varian Produk)
-- ============================================
CREATE TABLE product_variants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    size VARCHAR(20),
    color VARCHAR(50),
    sku VARCHAR(50) UNIQUE,
    barcode VARCHAR(50),
    stock INT DEFAULT 0,
    price DECIMAL(12,2),
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ============================================
-- 6. product_photos (Foto Produk)
-- ============================================
CREATE TABLE product_photos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    path VARCHAR(500) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ============================================
-- 7. customers (Pelanggan)
-- ============================================
CREATE TABLE customers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    birth_date DATE,
    gender ENUM('male','female'),
    referral_code VARCHAR(20) UNIQUE,
    referred_by INT DEFAULT NULL,
    loyalty_points INT DEFAULT 0,
    membership_tier ENUM('bronze','silver','gold') DEFAULT 'bronze',
    total_purchases INT DEFAULT 0,
    total_spent DECIMAL(14,2) DEFAULT 0,
    last_purchase TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================
-- 8. transactions (Transaksi)
-- ============================================
CREATE TABLE transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    invoice_no VARCHAR(30) UNIQUE,
    client_transaction_id CHAR(36) DEFAULT NULL,
    user_id INT NOT NULL,
    customer_id INT DEFAULT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    discount_type ENUM('none','percentage','nominal') DEFAULT 'none',
    discount_value DECIMAL(12,2) DEFAULT 0,
    discount DECIMAL(12,2) DEFAULT 0,
    grand_total DECIMAL(12,2) NOT NULL,
    payment_method ENUM('cash','qris','debit','transfer','credit','split') NOT NULL,
    amount_paid DECIMAL(12,2) NOT NULL,
    `change` DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    status ENUM('completed','cancelled','refunded','pending','held') DEFAULT 'completed',
    printed BOOLEAN DEFAULT FALSE,
    print_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX idx_transactions_branch_date ON transactions(branch_id, created_at);
CREATE INDEX idx_transactions_invoice ON transactions(invoice_no);
CREATE UNIQUE INDEX uq_transactions_client_id ON transactions(client_transaction_id);

-- Atomic counter for invoice numbers per branch and business date.
CREATE TABLE invoice_sequences (
    branch_id INT NOT NULL,
    business_date DATE NOT NULL,
    last_number INT NOT NULL DEFAULT 0,
    PRIMARY KEY (branch_id, business_date),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================
-- 9. transaction_items (Item Transaksi)
-- ============================================
CREATE TABLE transaction_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_id INT NOT NULL,
    product_id INT NOT NULL,
    variant_id INT DEFAULT NULL,
    product_name VARCHAR(200),
    product_sku VARCHAR(50),
    variant_detail VARCHAR(100),
    quantity INT NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    discount DECIMAL(12,2) DEFAULT 0,
    subtotal DECIMAL(12,2) NOT NULL,
    cost DECIMAL(12,2) DEFAULT 0,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ============================================
-- 10. stock_mutations (Mutasi Stok)
-- ============================================
CREATE TABLE stock_mutations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    warehouse_id INT DEFAULT NULL,
    product_id INT NOT NULL,
    variant_id INT DEFAULT NULL,
    user_id INT NOT NULL,
    type ENUM('sale','purchase','adjustment','transfer_in','transfer_out','sale_return','damage','loss','gift') NOT NULL,
    reference_type VARCHAR(50),
    reference_id INT,
    qty INT NOT NULL,
    stock_before INT,
    stock_after INT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_stock_mutations_product ON stock_mutations(product_id, variant_id);

-- ============================================
-- 11. warehouses (Gudang)
-- ============================================
CREATE TABLE warehouses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

ALTER TABLE stock_mutations
    ADD CONSTRAINT fk_stock_mutations_warehouse
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);

-- Current stock is authoritative per warehouse. products.stock is retained only
-- as a cached branch total and must be updated in the same database transaction.
CREATE TABLE warehouse_stocks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    warehouse_id INT NOT NULL,
    product_id INT NOT NULL,
    variant_id INT DEFAULT NULL,
    variant_key INT AS (COALESCE(variant_id, 0)) STORED,
    quantity INT NOT NULL DEFAULT 0,
    reserved_quantity INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id),
    UNIQUE KEY uq_warehouse_stock (warehouse_id, product_id, variant_key)
);

-- ============================================
-- 12. stock_opnames (Stok Opname)
-- ============================================
CREATE TABLE stock_opnames (
    id INT PRIMARY KEY AUTO_INCREMENT,
    warehouse_id INT NOT NULL,
    branch_id INT NOT NULL,
    opname_date DATE NOT NULL,
    category_id INT DEFAULT NULL,
    total_items INT DEFAULT 0,
    total_selisih INT DEFAULT 0,
    status ENUM('draft','pending_approval','approved','rejected') DEFAULT 'draft',
    approved_by INT DEFAULT NULL,
    approved_at TIMESTAMP NULL,
    notes TEXT,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ============================================
-- 13. stock_opname_items (Detail Opname)
-- ============================================
CREATE TABLE stock_opname_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    opname_id INT NOT NULL,
    product_id INT NOT NULL,
    variant_id INT DEFAULT NULL,
    system_stock INT NOT NULL,
    physical_stock INT NOT NULL,
    selisih INT NOT NULL,
    notes TEXT,
    FOREIGN KEY (opname_id) REFERENCES stock_opnames(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ============================================
-- 14. stock_transfers (Transfer Stok)
-- ============================================
CREATE TABLE stock_transfers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    from_warehouse_id INT NOT NULL,
    to_warehouse_id INT NOT NULL,
    branch_id INT NOT NULL,
    status ENUM('pending','approved','completed','cancelled') DEFAULT 'pending',
    notes TEXT,
    created_by INT NOT NULL,
    approved_by INT DEFAULT NULL,
    approved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ============================================
-- 15. stock_transfer_items (Detail Transfer)
-- ============================================
CREATE TABLE stock_transfer_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    transfer_id INT NOT NULL,
    product_id INT NOT NULL,
    variant_id INT DEFAULT NULL,
    quantity INT NOT NULL,
    FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ============================================
-- 16. expense_categories (Kategori Biaya)
-- ============================================
CREATE TABLE expense_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    account_code VARCHAR(10),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- 17. expenses (Pengeluaran)
-- ============================================
CREATE TABLE expenses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    category_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method ENUM('cash','transfer','debit') DEFAULT 'cash',
    expense_date DATE NOT NULL,
    notes TEXT,
    receipt_file VARCHAR(500),
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    user_id INT NOT NULL,
    approved_by INT DEFAULT NULL,
    approved_at TIMESTAMP NULL,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_pattern VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (category_id) REFERENCES expense_categories(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 18. expense_schedules (Jadwal Biaya Berulang)
-- ============================================
CREATE TABLE expense_schedules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    expense_id INT NOT NULL,
    frequency ENUM('weekly','monthly','yearly') NOT NULL,
    next_due_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_id) REFERENCES expenses(id)
);

-- ============================================
-- 19. chart_of_accounts (Akun COA)
-- ============================================
CREATE TABLE chart_of_accounts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    type ENUM('aset','kewajiban','ekuitas','pendapatan','beban') NOT NULL,
    parent_id INT DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- 20. journal_entries (Jurnal)
-- ============================================
CREATE TABLE journal_entries (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    journal_no VARCHAR(30) UNIQUE,
    journal_date DATE NOT NULL,
    reference_type VARCHAR(50),
    reference_id INT,
    description TEXT,
    total_debit DECIMAL(14,2) DEFAULT 0,
    total_credit DECIMAL(14,2) DEFAULT 0,
    is_posted BOOLEAN DEFAULT FALSE,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ============================================
-- 21. journal_entry_items (Detail Jurnal)
-- ============================================
CREATE TABLE journal_entry_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    journal_id INT NOT NULL,
    account_id INT NOT NULL,
    debit DECIMAL(14,2) DEFAULT 0,
    credit DECIMAL(14,2) DEFAULT 0,
    FOREIGN KEY (journal_id) REFERENCES journal_entries(id),
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
);

-- ============================================
-- 22. periods (Periode Akuntansi)
-- ============================================
CREATE TABLE periods (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    period_name VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status ENUM('open','closed') DEFAULT 'open',
    closed_by INT DEFAULT NULL,
    closed_at TIMESTAMP NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================
-- 23. store_settings (Pengaturan Toko)
-- ============================================
CREATE TABLE store_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    `key` VARCHAR(50) NOT NULL,
    `value` TEXT,
    UNIQUE KEY unique_branch_key (branch_id, `key`),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================
-- 24. activity_logs (Log Aktivitas)
-- ============================================
CREATE TABLE activity_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 25. suppliers (Supplier)
-- ============================================
CREATE TABLE suppliers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    payment_terms VARCHAR(50),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================
-- 26. purchase_orders (Purchase Order)
-- ============================================
CREATE TABLE purchase_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    supplier_id INT NOT NULL,
    po_number VARCHAR(30) UNIQUE,
    order_date DATE NOT NULL,
    expected_date DATE,
    status ENUM('draft','pending_approval','approved','ordered','received','completed','cancelled') DEFAULT 'draft',
    total_amount DECIMAL(14,2) DEFAULT 0,
    notes TEXT,
    created_by INT NOT NULL,
    approved_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ============================================
-- 27. purchase_order_items (Detail PO)
-- ============================================
CREATE TABLE purchase_order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    po_id INT NOT NULL,
    product_id INT NOT NULL,
    variant_id INT DEFAULT NULL,
    quantity INT NOT NULL,
    received_qty INT DEFAULT 0,
    unit_cost DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ============================================
-- 28. cash_drawers (Laci Kas)
-- ============================================
CREATE TABLE cash_drawers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    user_id INT NOT NULL,
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL,
    opening_amount DECIMAL(12,2) DEFAULT 0,
    closing_amount DECIMAL(12,2),
    expected_cash DECIMAL(12,2),
    actual_cash DECIMAL(12,2),
    difference DECIMAL(12,2),
    status ENUM('open','closed') DEFAULT 'open',
    notes TEXT,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Immutable audit ledger for cash-in and cash-out events.
CREATE TABLE cash_drawer_movements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cash_drawer_id INT NOT NULL,
    user_id INT NOT NULL,
    type ENUM('cash_in','cash_out') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cash_drawer_id) REFERENCES cash_drawers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 29. shifts (Shift)
-- ============================================
CREATE TABLE shifts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    user_id INT NOT NULL,
    shift_name VARCHAR(50),
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP NULL,
    status ENUM('active','ended') DEFAULT 'active',
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 30. loyalty_points (Poin Loyalitas)
-- ============================================
CREATE TABLE loyalty_points (
    id INT PRIMARY KEY AUTO_INCREMENT,
    customer_id INT NOT NULL,
    points INT NOT NULL,
    type ENUM('earn','redeem') NOT NULL,
    reference_type VARCHAR(50),
    reference_id INT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- ============================================
-- 31. returns (Retur Penjualan)
-- ============================================
CREATE TABLE returns (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    transaction_id INT NOT NULL,
    return_no VARCHAR(30) UNIQUE NOT NULL,
    customer_id INT DEFAULT NULL,
    reason TEXT,
    refund_amount DECIMAL(12,2) DEFAULT 0,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    created_by INT NOT NULL,
    approved_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ============================================
-- 32. return_items (Detail Retur)
-- ============================================
CREATE TABLE return_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    return_id INT NOT NULL,
    transaction_item_id INT NOT NULL,
    product_id INT NOT NULL,
    variant_id INT DEFAULT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    reason TEXT,
    FOREIGN KEY (return_id) REFERENCES returns(id),
    FOREIGN KEY (transaction_item_id) REFERENCES transaction_items(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ============================================
-- 33. shift_templates (Template Shift)
-- ============================================
CREATE TABLE shift_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_period_minutes INT DEFAULT 15,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================
-- 34. employee_schedules (Jadwal Karyawan)
-- ============================================
CREATE TABLE employee_schedules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    user_id INT NOT NULL,
    shift_template_id INT DEFAULT NULL,
    schedule_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    check_in TIMESTAMP NULL,
    check_out TIMESTAMP NULL,
    is_late BOOLEAN DEFAULT FALSE,
    late_minutes INT DEFAULT 0,
    duration_minutes INT DEFAULT 0,
    status ENUM('scheduled','active','completed','absent') DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (shift_template_id) REFERENCES shift_templates(id)
);

-- ============================================
-- 35. commission_rules (Aturan Komisi)
-- ============================================
CREATE TABLE commission_rules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT DEFAULT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    applies_to ENUM('all','role','user') DEFAULT 'all',
    role ENUM('owner','manager','admin','kasir','gudang') DEFAULT NULL,
    user_id INT DEFAULT NULL,
    calculation_type ENUM('percentage_sales','percentage_profit','per_transaction','flat_monthly') NOT NULL,
    percentage DECIMAL(5,2) DEFAULT 0,
    flat_amount DECIMAL(12,2) DEFAULT 0,
    min_target DECIMAL(12,2) DEFAULT 0,
    min_transactions INT DEFAULT 0,
    start_date DATE NOT NULL,
    end_date DATE DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 36. commission_records (Catatan Komisi)
-- ============================================
CREATE TABLE commission_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    user_id INT NOT NULL,
    rule_id INT DEFAULT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_sales DECIMAL(14,2) DEFAULT 0,
    total_profit DECIMAL(14,2) DEFAULT 0,
    total_transactions INT DEFAULT 0,
    commission_amount DECIMAL(12,2) DEFAULT 0,
    status ENUM('pending','approved','paid') DEFAULT 'pending',
    approved_by INT DEFAULT NULL,
    paid_at TIMESTAMP NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (rule_id) REFERENCES commission_rules(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- ============================================
-- 37. commission_items (Detail Komisi per Transaksi)
-- ============================================
CREATE TABLE commission_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    record_id INT NOT NULL,
    transaction_id INT NOT NULL,
    sale_amount DECIMAL(12,2) NOT NULL,
    profit_amount DECIMAL(12,2) DEFAULT 0,
    commission_amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (record_id) REFERENCES commission_records(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

-- ============================================
-- 38. transaction_payments (Split Payment)
-- ============================================
CREATE TABLE transaction_payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_id INT NOT NULL,
    payment_method ENUM('cash','qris','debit','transfer','credit') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reference VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

-- ============================================
-- 39. wholesale_prices (Harga Grosir)
-- ============================================
CREATE TABLE wholesale_prices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    variant_id INT DEFAULT NULL,
    min_qty INT NOT NULL,
    max_qty INT DEFAULT NULL,
    price DECIMAL(12,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id)
);

-- ============================================
-- 40. referrals (Referral Pelanggan)
-- ============================================
CREATE TABLE referrals (
    id INT PRIMARY KEY AUTO_INCREMENT,
    referrer_id INT NOT NULL,
    referred_id INT NOT NULL,
    referral_code VARCHAR(20) NOT NULL,
    bonus_points INT DEFAULT 0,
    status ENUM('pending','completed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (referrer_id) REFERENCES customers(id),
    FOREIGN KEY (referred_id) REFERENCES customers(id)
);

-- ============================================
-- 41. supplier_products (Mapping Supplier-Produk)
-- ============================================
CREATE TABLE supplier_products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    supplier_id INT NOT NULL,
    product_id INT NOT NULL,
    supplier_sku VARCHAR(50),
    supplier_price DECIMAL(12,2),
    lead_time_days INT DEFAULT 7,
    is_preferred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ============================================
-- 42. expense_budgets (Budget Pengeluaran)
-- ============================================
CREATE TABLE expense_budgets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    category_id INT NOT NULL,
    period VARCHAR(20) NOT NULL,
    budget_amount DECIMAL(12,2) NOT NULL,
    spent_amount DECIMAL(12,2) DEFAULT 0,
    alert_threshold DECIMAL(5,2) DEFAULT 80.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (category_id) REFERENCES expense_categories(id)
);

-- ============================================
-- 43. pending_transactions (Transaksi Tunda/Hold)
-- ============================================
CREATE TABLE pending_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    user_id INT NOT NULL,
    customer_id INT DEFAULT NULL,
    items_json JSON NOT NULL,
    subtotal DECIMAL(12,2) DEFAULT 0,
    discount_type ENUM('none','percentage','nominal') DEFAULT 'none',
    discount_value DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    held_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resumed_at TIMESTAMP NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Refresh tokens are stored as hashes; never persist the raw token.
CREATE TABLE refresh_tokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_refresh_tokens_user (user_id, expires_at)
);

-- ============================================
-- SEED DATA
-- ============================================

-- Branch
INSERT INTO branches (id, name, address, phone) VALUES
(1, 'Toko Pusat', 'Jl. Contoh No. 123, Kota', '081234567890');

-- Categories
INSERT INTO categories (name, slug, sku_prefix) VALUES
('Baju Kaos', 'baju-kaos', 'BJK'),
('Kemeja', 'kemeja', 'KMJ'),
('Batik', 'batik', 'BTK'),
('Jaket & Hoodie', 'jaket-hoodie', 'JKT'),
('Celana Panjang', 'celana-panjang', 'CLP'),
('Celana Pendek', 'celana-pendek', 'CLD'),
('Gamis & Terusan', 'gamis-terusan', 'GMS'),
('Koko & Muslim', 'koko-muslim', 'KKO'),
('Daster', 'daster', 'DSTR'),
('Rok', 'rok', 'ROK'),
('Sepatu', 'sepatu', 'SPT'),
('Tas', 'tas', 'TAS'),
('Aksesoris', 'aksesoris', 'AKS'),
('Lainnya', 'lainnya', 'LLN');

-- Warehouses
INSERT INTO warehouses (branch_id, name, description) VALUES
(1, 'Gudang Pusat', 'Gudang utama'),
(1, 'Gudang Cadangan', 'Stok cadangan');

-- Expense Categories
INSERT INTO expense_categories (name, account_code) VALUES
('Operasional', '5-2000'),
('Gaji', '5-1100'),
('Marketing', '5-3000'),
('Perlengkapan', '5-4000'),
('Maintenance', '5-5000'),
('Transport', '5-6000'),
('Pajak', '5-7000'),
('Lainnya', '5-9000');

-- Chart of Accounts
INSERT INTO chart_of_accounts (code, name, type) VALUES
('1-1000', 'Kas', 'aset'),
('1-1100', 'Bank', 'aset'),
('1-1200', 'Piutang', 'aset'),
('1-2000', 'Persediaan', 'aset'),
('2-1000', 'Hutang Usaha', 'kewajiban'),
('2-2000', 'Hutang Bank', 'kewajiban'),
('3-1000', 'Modal Usaha', 'ekuitas'),
('3-2000', 'Laba Ditahan', 'ekuitas'),
('4-1000', 'Pendapatan Penjualan', 'pendapatan'),
('4-2000', 'Pendapatan Lain', 'pendapatan'),
('5-1000', 'HPP', 'beban'),
('5-1100', 'Beban Gaji', 'beban'),
('5-2000', 'Beban Operasional', 'beban'),
('5-3000', 'Beban Marketing', 'beban'),
('5-4000', 'Beban Perlengkapan', 'beban'),
('5-5000', 'Beban Maintenance', 'beban'),
('5-6000', 'Beban Transport', 'beban');

-- Users are deliberately not seeded: create passwords and PIN hashes with bcrypt
-- through the setup command in docs/10-pengaturan.md.

-- Store Settings
INSERT INTO store_settings (branch_id, `key`, `value`) VALUES
(1, 'store_name', 'Toko Pakaian Saya'),
(1, 'store_address', 'Jl. Contoh No. 123, Kota'),
(1, 'store_phone', '081234567890'),
(1, 'store_email', 'toko@email.com'),
(1, 'receipt_header', 'Terima kasih telah berbelanja'),
(1, 'receipt_footer', 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan'),
(1, 'printer_size', '80'),
(1, 'auto_print', 'true'),
(1, 'currency', 'IDR'),
(1, 'tax_rate', '0'),
(1, 'loyalty_points_rate', '1'),
(1, 'loyalty_points_value', '100'),
(1, 'show_logo', 'true'),
(1, 'show_qr', 'true'),
(1, 'show_cashier', 'true'),
(1, 'show_barcode', 'false');

-- Shift Templates
INSERT INTO shift_templates (branch_id, name, start_time, end_time) VALUES
(1, 'Pagi', '08:00:00', '14:00:00'),
(1, 'Sore', '14:00:00', '20:00:00'),
(1, 'Malam', '20:00:00', '02:00:00'),
(1, 'Full Day', '08:00:00', '20:00:00');
