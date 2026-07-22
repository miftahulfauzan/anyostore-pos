# 3. Database Schema

## ER Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    branches      │     │     users       │     │    products     │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id              │◄────│ branch_id       │     │ id              │
│ name            │     │ id              │     │ branch_id       │
│ address         │     │ name            │     │ category_id     │
│ phone           │     │ email           │     │ name            │
└─────────────────┘     │ password        │     │ description     │
                        │ role            │     │ sku             │
                        │ pin_hash        │     │ barcode         │
                        └─────────────────┘     │ price           │
                                                │ cost            │
                                                │ stock           │
                                                │ min_stock       │
                                                │ is_active       │
                                                └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  transactions   │     │ transaction_items│    │product_variants │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id              │◄────│ transaction_id  │     │ id              │
│ branch_id       │     │ product_id      │────►│ product_id      │
│ invoice_no      │     │ variant_id      │     │ size            │
│ user_id         │     │ product_name    │     │ color           │
│ customer_id     │     │ quantity        │     │ sku             │
│ subtotal        │     │ price           │     │ stock           │
│ discount        │     │ subtotal        │     │ price           │
│ grand_total     │     └─────────────────┘     └─────────────────┘
│ payment_method  │
│ amount_paid     │     ┌─────────────────┐     ┌─────────────────┐
│ change          │     │   customers     │     │    suppliers    │
└─────────────────┘     ├─────────────────┤     ├─────────────────┤
                        │ id              │     │ id              │
                        │ branch_id       │     │ branch_id       │
                        │ name            │     │ name            │
                        │ phone           │     │ contact_person  │
                        │ email           │     │ phone           │
                        └─────────────────┘     │ email           │
                                                └─────────────────┘
```

## 3.1 branches (Cabang)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| name | VARCHAR(100) | NOT NULL |
| address | TEXT | |
| phone | VARCHAR(20) | |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.2 users (Pengguna)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| name | VARCHAR(100) | NOT NULL |
| email | VARCHAR(100) | UNIQUE |
| password | VARCHAR(255) | NOT NULL |
| role | ENUM | 'owner','manager','admin','kasir','gudang' |
| pin_hash | VARCHAR(255) | bcrypt hash PIN, DEFAULT NULL |
| is_active | BOOLEAN | DEFAULT TRUE |
| last_login | TIMESTAMP | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.3 categories (Kategori)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| name | VARCHAR(100) | NOT NULL |
| slug | VARCHAR(100) | UNIQUE |
| sku_prefix | VARCHAR(10) | |
| description | TEXT | |
| is_active | BOOLEAN | DEFAULT TRUE |

## 3.4 products (Produk)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| category_id | INT | FOREIGN KEY → categories.id |
| name | VARCHAR(200) | NOT NULL |
| description | TEXT | |
| sku | VARCHAR(50) | UNIQUE |
| barcode | VARCHAR(50) | UNIQUE |
| price | DECIMAL(12,2) | NOT NULL |
| cost | DECIMAL(12,2) | DEFAULT 0 |
| slug | VARCHAR(200) | UNIQUE |
| stock | INT | DEFAULT 0 |
| min_stock | INT | DEFAULT 5 |
| gender | ENUM | 'male','female','unisex','kids' |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

## 3.5 product_variants (Varian Produk)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| product_id | INT | FOREIGN KEY → products.id |
| size | VARCHAR(20) | |
| color | VARCHAR(50) | |
| sku | VARCHAR(50) | UNIQUE |
| barcode | VARCHAR(50) | |
| stock | INT | DEFAULT 0 |
| price | DECIMAL(12,2) | |
| is_active | BOOLEAN | DEFAULT TRUE |

## 3.6 product_photos (Foto Produk)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| product_id | INT | FOREIGN KEY → products.id |
| filename | VARCHAR(255) | NOT NULL |
| path | VARCHAR(500) | NOT NULL |
| is_primary | BOOLEAN | DEFAULT FALSE |
| sort_order | INT | DEFAULT 0 |

## 3.7 customers (Pelanggan)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| name | VARCHAR(100) | NOT NULL |
| phone | VARCHAR(20) | |
| email | VARCHAR(100) | |
| address | TEXT | |
| birth_date | DATE | |
| gender | ENUM | 'male','female' |
| referral_code | VARCHAR(20) | UNIQUE |
| referred_by | INT | FOREIGN KEY → customers.id, DEFAULT NULL |
| loyalty_points | INT | DEFAULT 0 |
| membership_tier | ENUM | 'bronze','silver','gold' | DEFAULT 'bronze' |
| total_purchases | INT | DEFAULT 0 |
| total_spent | DECIMAL(14,2) | DEFAULT 0 |
| last_purchase | TIMESTAMP | |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.8 transactions (Transaksi)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| invoice_no | VARCHAR(30) | UNIQUE |
| client_transaction_id | CHAR(36) | UNIQUE, idempotency key dari mobile/offline |
| user_id | INT | FOREIGN KEY → users.id |
| customer_id | INT | FOREIGN KEY → customers.id, DEFAULT NULL |
| subtotal | DECIMAL(12,2) | NOT NULL |
| discount_type | ENUM | 'none','percentage','nominal' |
| discount_value | DECIMAL(12,2) | DEFAULT 0 |
| discount | DECIMAL(12,2) | DEFAULT 0 |
| grand_total | DECIMAL(12,2) | NOT NULL |
| payment_method | ENUM | 'cash','qris','debit','transfer','credit','split' |
| amount_paid | DECIMAL(12,2) | NOT NULL |
| change | DECIMAL(12,2) | DEFAULT 0 |
| notes | TEXT | |
| status | ENUM | 'completed','cancelled','refunded','pending','held' | DEFAULT 'completed' |
| printed | BOOLEAN | DEFAULT FALSE |
| print_count | INT | DEFAULT 0 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.8a invoice_sequences (Urutan Invoice Harian)

| Column | Type | Constraint |
|--------|------|------------|
| branch_id | INT | PRIMARY KEY, FOREIGN KEY → branches.id |
| business_date | DATE | PRIMARY KEY |
| last_number | INT | NOT NULL, DEFAULT 0 |

Gunakan `INSERT ... ON DUPLICATE KEY UPDATE last_number = LAST_INSERT_ID(last_number + 1)` di dalam transaksi database untuk mendapatkan nomor invoice yang aman dari race condition.

## 3.9 transaction_items (Item Transaksi)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| transaction_id | INT | FOREIGN KEY → transactions.id |
| product_id | INT | FOREIGN KEY → products.id |
| variant_id | INT | FOREIGN KEY → product_variants.id, DEFAULT NULL |
| product_name | VARCHAR(200) | |
| product_sku | VARCHAR(50) | |
| variant_detail | VARCHAR(100) | |
| quantity | INT | NOT NULL |
| price | DECIMAL(12,2) | NOT NULL |
| discount | DECIMAL(12,2) | DEFAULT 0 |
| subtotal | DECIMAL(12,2) | NOT NULL |
| cost | DECIMAL(12,2) | DEFAULT 0 |

## 3.10 stock_mutations (Mutasi Stok)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| warehouse_id | INT | FOREIGN KEY → warehouses.id, DEFAULT NULL |
| product_id | INT | FOREIGN KEY → products.id |
| variant_id | INT | FOREIGN KEY → product_variants.id, DEFAULT NULL |
| user_id | INT | FOREIGN KEY → users.id |
| type | ENUM | 'sale','purchase','adjustment','transfer_in','transfer_out','sale_return','damage','loss','gift' |
| reference_type | VARCHAR(50) | |
| reference_id | INT | |
| qty | INT | NOT NULL |
| stock_before | INT | |
| stock_after | INT | |
| notes | TEXT | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.11 warehouses (Gudang)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| name | VARCHAR(100) | NOT NULL |
| description | TEXT | |
| is_active | BOOLEAN | DEFAULT TRUE |

## 3.12 stock_opnames (Stok Opname)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| warehouse_id | INT | FOREIGN KEY → warehouses.id |
| branch_id | INT | FOREIGN KEY → branches.id |
| opname_date | DATE | NOT NULL |
| category_id | INT | FOREIGN KEY → categories.id, DEFAULT NULL |
| total_items | INT | DEFAULT 0 |
| total_selisih | INT | DEFAULT 0 |
| status | ENUM | 'draft','pending_approval','approved','rejected' | DEFAULT 'draft' |
| approved_by | INT | FOREIGN KEY → users.id, DEFAULT NULL |
| approved_at | TIMESTAMP | |
| notes | TEXT | |
| created_by | INT | FOREIGN KEY → users.id |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.13 stock_opname_items (Detail Stok Opname)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| opname_id | INT | FOREIGN KEY → stock_opnames.id |
| product_id | INT | FOREIGN KEY → products.id |
| variant_id | INT | FOREIGN KEY → product_variants.id, DEFAULT NULL |
| system_stock | INT | NOT NULL |
| physical_stock | INT | NOT NULL |
| selisih | INT | NOT NULL |
| notes | TEXT | |

## 3.14 stock_transfers (Transfer Stok)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| from_warehouse_id | INT | FOREIGN KEY → warehouses.id |
| to_warehouse_id | INT | FOREIGN KEY → warehouses.id |
| branch_id | INT | FOREIGN KEY → branches.id |
| status | ENUM | 'pending','approved','completed','cancelled' |
| notes | TEXT | |
| created_by | INT | FOREIGN KEY → users.id |
| approved_by | INT | FOREIGN KEY → users.id, DEFAULT NULL |
| approved_at | TIMESTAMP | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.15 stock_transfer_items (Detail Transfer)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| transfer_id | INT | FOREIGN KEY → stock_transfers.id |
| product_id | INT | FOREIGN KEY → products.id |
| variant_id | INT | DEFAULT NULL |
| quantity | INT | NOT NULL |

## 3.16 expense_categories (Kategori Biaya)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| name | VARCHAR(100) | NOT NULL |
| account_code | VARCHAR(10) | |
| description | TEXT | |
| is_active | BOOLEAN | DEFAULT TRUE |

## 3.17 expenses (Pengeluaran)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| category_id | INT | FOREIGN KEY → expense_categories.id |
| name | VARCHAR(200) | NOT NULL |
| amount | DECIMAL(12,2) | NOT NULL |
| payment_method | ENUM | 'cash','transfer','debit' |
| expense_date | DATE | NOT NULL |
| notes | TEXT | |
| receipt_file | VARCHAR(500) | |
| status | ENUM | 'pending','approved','rejected' | DEFAULT 'pending' |
| user_id | INT | FOREIGN KEY → users.id |
| approved_by | INT | FOREIGN KEY → users.id, DEFAULT NULL |
| approved_at | TIMESTAMP | |
| is_recurring | BOOLEAN | DEFAULT FALSE |
| recurring_pattern | VARCHAR(20) | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.18 expense_schedules (Jadwal Biaya Berulang)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| expense_id | INT | FOREIGN KEY → expenses.id |
| frequency | ENUM | 'weekly','monthly','yearly' |
| next_due_date | DATE | NOT NULL |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.19 chart_of_accounts (Akun COA)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| code | VARCHAR(10) | UNIQUE |
| name | VARCHAR(100) | NOT NULL |
| type | ENUM | 'aset','kewajiban','ekuitas','pendapatan','beban' |
| parent_id | INT | DEFAULT NULL |
| is_active | BOOLEAN | DEFAULT TRUE |

## 3.20 journal_entries (Jurnal)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| journal_no | VARCHAR(30) | UNIQUE |
| journal_date | DATE | NOT NULL |
| reference_type | VARCHAR(50) | |
| reference_id | INT | |
| description | TEXT | |
| total_debit | DECIMAL(14,2) | DEFAULT 0 |
| total_credit | DECIMAL(14,2) | DEFAULT 0 |
| is_posted | BOOLEAN | DEFAULT FALSE |
| created_by | INT | FOREIGN KEY → users.id |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.21 journal_entry_items (Detail Jurnal)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| journal_id | INT | FOREIGN KEY → journal_entries.id |
| account_id | INT | FOREIGN KEY → chart_of_accounts.id |
| debit | DECIMAL(14,2) | DEFAULT 0 |
| credit | DECIMAL(14,2) | DEFAULT 0 |

## 3.22 periods (Periode Akuntansi)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| period_name | VARCHAR(20) | NOT NULL |
| start_date | DATE | NOT NULL |
| end_date | DATE | NOT NULL |
| status | ENUM | 'open','closed' | DEFAULT 'open' |
| closed_by | INT | FOREIGN KEY → users.id, DEFAULT NULL |
| closed_at | TIMESTAMP | |

## 3.23 store_settings (Pengaturan Toko)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| `key` | VARCHAR(50) | NOT NULL |
| `value` | TEXT | |
| UNIQUE | (branch_id, `key`) | |

## 3.24 activity_logs (Log Aktivitas)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| user_id | INT | FOREIGN KEY → users.id |
| action | VARCHAR(50) | NOT NULL |
| description | TEXT | |
| ip_address | VARCHAR(45) | |
| user_agent | VARCHAR(500) | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.25 suppliers (Supplier)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| name | VARCHAR(200) | NOT NULL |
| contact_person | VARCHAR(100) | |
| phone | VARCHAR(20) | |
| email | VARCHAR(100) | |
| address | TEXT | |
| payment_terms | VARCHAR(50) | |
| notes | TEXT | |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.26 purchase_orders (Purchase Order)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| supplier_id | INT | FOREIGN KEY → suppliers.id |
| po_number | VARCHAR(30) | UNIQUE |
| order_date | DATE | NOT NULL |
| expected_date | DATE | |
| status | ENUM | 'draft','pending_approval','approved','ordered','received','completed','cancelled' |
| total_amount | DECIMAL(14,2) | DEFAULT 0 |
| notes | TEXT | |
| created_by | INT | FOREIGN KEY → users.id |
| approved_by | INT | FOREIGN KEY → users.id, DEFAULT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.27 purchase_order_items (Detail PO)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| po_id | INT | FOREIGN KEY → purchase_orders.id |
| product_id | INT | FOREIGN KEY → products.id |
| variant_id | INT | DEFAULT NULL |
| quantity | INT | NOT NULL |
| received_qty | INT | DEFAULT 0 |
| unit_cost | DECIMAL(12,2) | NOT NULL |
| subtotal | DECIMAL(12,2) | NOT NULL |

## 3.28 cash_drawers (Laci Kas)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| user_id | INT | FOREIGN KEY → users.id |
| opened_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| closed_at | TIMESTAMP | |
| opening_amount | DECIMAL(12,2) | DEFAULT 0 |
| closing_amount | DECIMAL(12,2) | |
| expected_cash | DECIMAL(12,2) | |
| actual_cash | DECIMAL(12,2) | |
| difference | DECIMAL(12,2) | |
| status | ENUM | 'open','closed' | DEFAULT 'open' |
| notes | TEXT | |

## 3.29 shifts (Shift)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| user_id | INT | FOREIGN KEY → users.id |
| shift_name | VARCHAR(50) | |
| start_time | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| end_time | TIMESTAMP | |
| status | ENUM | 'active','ended' | DEFAULT 'active' |

## 3.30 loyalty_points (Poin Loyalitas)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| customer_id | INT | FOREIGN KEY → customers.id |
| points | INT | NOT NULL |
| type | ENUM | 'earn','redeem' |
| reference_type | VARCHAR(50) | |
| reference_id | INT | |
| notes | TEXT | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.31 returns (Retur Penjualan)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| transaction_id | INT | FOREIGN KEY → transactions.id |
| return_no | VARCHAR(30) | UNIQUE, NOT NULL |
| customer_id | INT | FOREIGN KEY → customers.id, DEFAULT NULL |
| reason | TEXT | |
| refund_amount | DECIMAL(12,2) | DEFAULT 0 |
| status | ENUM | 'pending','approved','rejected' | DEFAULT 'pending' |
| created_by | INT | FOREIGN KEY → users.id |
| approved_by | INT | FOREIGN KEY → users.id, DEFAULT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.32 return_items (Detail Retur)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| return_id | INT | FOREIGN KEY → returns.id |
| transaction_item_id | INT | FOREIGN KEY → transaction_items.id |
| product_id | INT | FOREIGN KEY → products.id |
| variant_id | INT | DEFAULT NULL |
| quantity | INT | NOT NULL |
| unit_price | DECIMAL(12,2) | NOT NULL |
| subtotal | DECIMAL(12,2) | NOT NULL |
| reason | TEXT | |

## 3.33 shift_templates (Template Shift)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| name | VARCHAR(100) | NOT NULL |
| start_time | TIME | NOT NULL |
| end_time | TIME | NOT NULL |
| grace_period_minutes | INT | DEFAULT 15 |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.34 employee_schedules (Jadwal Karyawan)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| user_id | INT | FOREIGN KEY → users.id |
| shift_template_id | INT | FOREIGN KEY → shift_templates.id, DEFAULT NULL |
| schedule_date | DATE | NOT NULL |
| start_time | TIME | NOT NULL |
| end_time | TIME | NOT NULL |
| check_in | TIMESTAMP | |
| check_out | TIMESTAMP | |
| is_late | BOOLEAN | DEFAULT FALSE |
| late_minutes | INT | DEFAULT 0 |
| duration_minutes | INT | DEFAULT 0 |
| status | ENUM | 'scheduled','active','completed','absent' | DEFAULT 'scheduled' |
| notes | TEXT | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.35 commission_rules (Aturan Komisi)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id, DEFAULT NULL |
| name | VARCHAR(100) | NOT NULL |
| description | TEXT | |
| applies_to | ENUM | 'all','role','user' | DEFAULT 'all' |
| role | ENUM | 'owner','manager','admin','kasir','gudang', DEFAULT NULL |
| user_id | INT | FOREIGN KEY → users.id, DEFAULT NULL |
| calculation_type | ENUM | 'percentage_sales','percentage_profit','per_transaction','flat_monthly' |
| percentage | DECIMAL(5,2) | DEFAULT 0 |
| flat_amount | DECIMAL(12,2) | DEFAULT 0 |
| min_target | DECIMAL(12,2) | DEFAULT 0 |
| min_transactions | INT | DEFAULT 0 |
| start_date | DATE | NOT NULL |
| end_date | DATE | |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.36 commission_records (Catatan Komisi)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| user_id | INT | FOREIGN KEY → users.id |
| rule_id | INT | FOREIGN KEY → commission_rules.id, DEFAULT NULL |
| period_start | DATE | NOT NULL |
| period_end | DATE | NOT NULL |
| total_sales | DECIMAL(14,2) | DEFAULT 0 |
| total_profit | DECIMAL(14,2) | DEFAULT 0 |
| total_transactions | INT | DEFAULT 0 |
| commission_amount | DECIMAL(12,2) | DEFAULT 0 |
| status | ENUM | 'pending','approved','paid' | DEFAULT 'pending' |
| approved_by | INT | FOREIGN KEY → users.id, DEFAULT NULL |
| paid_at | TIMESTAMP | |
| notes | TEXT | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.37 commission_items (Detail Komisi per Transaksi)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| record_id | INT | FOREIGN KEY → commission_records.id |
| transaction_id | INT | FOREIGN KEY → transactions.id |
| sale_amount | DECIMAL(12,2) | NOT NULL |
| profit_amount | DECIMAL(12,2) | DEFAULT 0 |
| commission_amount | DECIMAL(12,2) | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.38 transaction_payments (Split Payment)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| transaction_id | INT | FOREIGN KEY → transactions.id |
| payment_method | ENUM | 'cash','qris','debit','transfer','credit' |
| amount | DECIMAL(12,2) | NOT NULL |
| reference | VARCHAR(100) | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.39 wholesale_prices (Harga Grosir)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| product_id | INT | FOREIGN KEY → products.id |
| variant_id | INT | FOREIGN KEY → product_variants.id, DEFAULT NULL |
| min_qty | INT | NOT NULL |
| max_qty | INT | |
| price | DECIMAL(12,2) | NOT NULL |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.40 referrals (Referral Pelanggan)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| referrer_id | INT | FOREIGN KEY → customers.id |
| referred_id | INT | FOREIGN KEY → customers.id |
| referral_code | VARCHAR(20) | NOT NULL |
| bonus_points | INT | DEFAULT 0 |
| status | ENUM | 'pending','completed' | DEFAULT 'pending' |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.41 supplier_products (Mapping Supplier-Produk)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| supplier_id | INT | FOREIGN KEY → suppliers.id |
| product_id | INT | FOREIGN KEY → products.id |
| supplier_sku | VARCHAR(50) | |
| supplier_price | DECIMAL(12,2) | |
| lead_time_days | INT | DEFAULT 7 |
| is_preferred | BOOLEAN | DEFAULT FALSE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.42 expense_budgets (Budget Pengeluaran)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| category_id | INT | FOREIGN KEY → expense_categories.id |
| period | VARCHAR(20) | NOT NULL (e.g. '2026-07') |
| budget_amount | DECIMAL(12,2) | NOT NULL |
| spent_amount | DECIMAL(12,2) | DEFAULT 0 |
| alert_threshold | DECIMAL(5,2) | DEFAULT 80.00 |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.43 pending_transactions (Transaksi Tunda/Hold)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| branch_id | INT | FOREIGN KEY → branches.id |
| user_id | INT | FOREIGN KEY → users.id |
| customer_id | INT | FOREIGN KEY → customers.id, DEFAULT NULL |
| items_json | JSON | NOT NULL |
| subtotal | DECIMAL(12,2) | DEFAULT 0 |
| discount_type | ENUM | 'none','percentage','nominal' | DEFAULT 'none' |
| discount_value | DECIMAL(12,2) | DEFAULT 0 |
| notes | TEXT | |
| held_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| resumed_at | TIMESTAMP | |

## 3.44 warehouse_stocks (Saldo Stok per Gudang)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| warehouse_id | INT | FOREIGN KEY → warehouses.id |
| product_id | INT | FOREIGN KEY → products.id |
| variant_id | INT | FOREIGN KEY → product_variants.id, DEFAULT NULL |
| variant_key | INT | generated from `variant_id`; prevents duplicate NULL-variant balance |
| quantity | INT | NOT NULL, DEFAULT 0 |
| reserved_quantity | INT | NOT NULL, DEFAULT 0 |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

`warehouse_stocks` adalah saldo stok utama. Setiap mutasi, transfer, opname, dan penjualan harus mengunci dan memperbarui baris ini bersama `stock_mutations` dalam satu transaksi database. `variant_key` menangani keterbatasan unique index MySQL untuk nilai `NULL`.

## 3.45 cash_drawer_movements (Audit Cash In/Out)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| cash_drawer_id | INT | FOREIGN KEY → cash_drawers.id |
| user_id | INT | FOREIGN KEY → users.id |
| type | ENUM | 'cash_in','cash_out' |
| amount | DECIMAL(12,2) | NOT NULL, positive |
| reason | VARCHAR(255) | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3.46 refresh_tokens (Sesi Refresh Token)

| Column | Type | Constraint |
|--------|------|------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT |
| user_id | INT | FOREIGN KEY → users.id |
| token_hash | CHAR(64) | UNIQUE, SHA-256 dari raw token |
| expires_at | TIMESTAMP | NOT NULL |
| revoked_at | TIMESTAMP | DEFAULT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
