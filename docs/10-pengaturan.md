# 10. Pengaturan

## 10.1 Environment Variables

### Backend (.env)

```bash
# Server
PORT=3001
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=pos_pakaian

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=8h
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_REFRESH_EXPIRES_IN=7d

# Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=5242880  # 5MB

# CORS
CORS_ORIGIN=http://localhost:3000

# Printer
PRINTER_INTERFACE=/dev/usb/lp0
PRINTER_TYPE=EPSON
```

### Frontend (.env.local)

```bash
# Local development only. In production behind Nginx, use /api (same origin).
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_APP_NAME=POS Pakaian
```

## 10.2 Pengaturan Default Toko

```sql
-- Seed data untuk store_settings
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
```

## 10.3 Seed Data

```sql
-- Branch
INSERT INTO branches (id, name, address, phone) VALUES
(1, 'Toko Pusat', 'Jl. Contoh No. 123', '081234567890');

-- Do not seed users with known credentials or plaintext PINs.
-- Create the first owner after generating bcrypt hashes as described below.

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

-- Shift Templates
INSERT INTO shift_templates (branch_id, name, start_time, end_time) VALUES
(1, 'Pagi', '08:00:00', '14:00:00'),
(1, 'Sore', '14:00:00', '20:00:00'),
(1, 'Malam', '20:00:00', '02:00:00'),
(1, 'Full Day', '08:00:00', '20:00:00');
```

> **Catatan Loyalty:** `loyalty_points_rate` = poin yang didapat per Rp 10.000 belanja (1 poin). `loyalty_points_value` = nilai Rupiah per 1 poin saat diredeem (Rp 100). Jadi 100 poin = Rp 10.000 diskon.

## 10.4 Generate Password Hash

```bash
# Install bcrypt-cli
npm install -g bcrypt-cli

# Generate hash
bcrypt -g
# Input: admin123
# Output: $2b$10$...

# Atau gunakan Node.js
node -e "require('bcrypt').hash('admin123', 12).then(h => console.log(h))"
```

Generate a separate bcrypt hash for the six-digit PIN, then create the initial
owner (replace both placeholders; never commit the values):

```sql
INSERT INTO users (branch_id, name, email, password, role, pin_hash)
VALUES (1, 'Owner', 'owner@example.com', '<bcrypt-password-hash>', 'owner', '<bcrypt-pin-hash>');
```

For production behind Nginx set `NEXT_PUBLIC_API_URL=/api`; a browser must not
call `localhost:3001`, because that refers to the browser device rather than the server.
