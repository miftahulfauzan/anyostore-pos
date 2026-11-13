-- Akun pembeli reseller (login email + password) dan alamat tersimpan.
-- Login pembeli terpisah dari tabel users (pegawai): cookie & role berbeda.
CREATE TABLE IF NOT EXISTS reseller_accounts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    customer_id INT DEFAULT NULL,
    email VARCHAR(190) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(30) DEFAULT NULL,
    status ENUM('active','suspended') NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reseller_accounts_email (email),
    KEY idx_reseller_accounts_phone (phone),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS reseller_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    ip VARCHAR(45) DEFAULT NULL,
    user_agent VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    UNIQUE KEY uq_reseller_sessions_token (token_hash),
    KEY idx_reseller_sessions_account (account_id),
    FOREIGN KEY (account_id) REFERENCES reseller_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_addresses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_id INT NOT NULL,
    label VARCHAR(60) DEFAULT NULL,
    recipient VARCHAR(120) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(120) DEFAULT NULL,
    postal_code VARCHAR(12) DEFAULT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_customer_addresses_account (account_id),
    FOREIGN KEY (account_id) REFERENCES reseller_accounts(id) ON DELETE CASCADE
);