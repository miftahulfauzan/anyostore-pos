# 4. API Endpoints

Server URL: `http://localhost:3001` (all endpoint paths below include `/api`).

## 4.1 Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login dengan email + password |
| POST | /api/auth/login-pin | Login dengan PIN |
| POST | /api/auth/refresh | Refresh token |
| POST | /api/auth/logout | Logout |
| GET | /api/auth/me | Get current user |

## 4.2 Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/products | List produk (query: search, category, page, limit) |
| GET | /api/products/:id | Detail produk |
| GET | /api/products/barcode/:barcode | Cari produk via barcode |
| POST | /api/products | Tambah produk |
| PUT | /api/products/:id | Edit produk |
| DELETE | /api/products/:id | Hapus produk |
| GET | /api/products/:id/variants | List varian produk |
| POST | /api/products/:id/variants | Tambah varian |
| PUT | /api/products/variants/:id | Edit varian |
| DELETE | /api/products/variants/:id | Hapus varian |

## 4.3 Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/categories | List semua kategori |
| POST | /api/categories | Tambah kategori |
| PUT | /api/categories/:id | Edit kategori |
| DELETE | /api/categories/:id | Hapus kategori |

## 4.4 Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/transactions | List transaksi (query: date, status, user, page) |
| GET | /api/transactions/:id | Detail transaksi |
| POST | /api/transactions | Buat transaksi baru |
| PUT | /api/transactions/:id/cancel | Batalkan transaksi |
| PUT | /api/transactions/:id/refund | Refund transaksi |
| PUT | /api/transactions/:id/reprint | Tandai sudah cetak |
| GET | /api/transactions/daily-summary | Ringkasan harian |

## 4.5 Customers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/customers | List pelanggan |
| GET | /api/customers/:id | Detail pelanggan |
| POST | /api/customers | Tambah pelanggan |
| PUT | /api/customers/:id | Edit pelanggan |
| DELETE | /api/customers/:id | Hapus pelanggan |

## 4.6 Stock Mutations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/stock-mutations | List mutasi stok |
| GET | /api/stock-mutations/card/:product_id | Kartu stok |
| POST | /api/stock-mutations | Tambah mutasi (masuk/keluar) |

## 4.7 Warehouses

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/warehouses | List gudang |
| POST | /api/warehouses | Tambah gudang |
| PUT | /api/warehouses/:id | Edit gudang |
| DELETE | /api/warehouses/:id | Hapus gudang |

## 4.8 Stock Opname

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/stock-opname | List opname |
| GET | /api/stock-opname/:id | Detail opname |
| POST | /api/stock-opname | Mulai opname |
| PUT | /api/stock-opname/:id/approve | Approve opname |

## 4.9 Stock Transfers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/stock-transfers | List transfer |
| GET | /api/stock-transfers/:id | Detail transfer |
| POST | /api/stock-transfers | Buat transfer |
| PUT | /api/stock-transfers/:id/approve | Approve transfer |
| PUT | /api/stock-transfers/:id/cancel | Batalkan transfer |

## 4.10 Expenses

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/expenses | List pengeluaran |
| GET | /api/expenses/:id | Detail pengeluaran |
| POST | /api/expenses | Catat pengeluaran |
| PUT | /api/expenses/:id | Edit pengeluaran |
| PUT | /api/expenses/:id/approve | Approve pengeluaran |
| GET | /api/expenses/categories | Kategori biaya |
| POST | /api/expenses/categories | Tambah kategori |

## 4.11 Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/reports/sales | Laporan penjualan |
| GET | /api/reports/products-top | Produk terlaris |
| GET | /api/reports/profit-loss | Laba rugi |
| GET | /api/reports/payment-methods | Ringkasan metode bayar |
| GET | /api/reports/expense-summary | Ringkasan pengeluaran |

## 4.12 Users & Access

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users | List pengguna |
| POST | /api/users | Tambah pengguna |
| PUT | /api/users/:id | Edit pengguna |
| DELETE | /api/users/:id | Hapus pengguna |
| PUT | /api/users/:id/pin | Update PIN |
| PUT | /api/users/:id/toggle-active | Aktifkan/nonaktifkan |

## 4.13 Suppliers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/suppliers | List supplier |
| GET | /api/suppliers/:id | Detail supplier |
| POST | /api/suppliers | Tambah supplier |
| PUT | /api/suppliers/:id | Edit supplier |
| DELETE | /api/suppliers/:id | Hapus supplier |
| GET | /api/suppliers/:id/products | Produk dari supplier |

## 4.14 Purchase Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/purchase-orders | List PO |
| GET | /api/purchase-orders/:id | Detail PO |
| POST | /api/purchase-orders | Buat PO |
| PUT | /api/purchase-orders/:id/submit | Submit PO (draft → pending_approval) |
| PUT | /api/purchase-orders/:id/approve | Approve PO (pending_approval → approved) |
| PUT | /api/purchase-orders/:id/order | Order PO (approved → ordered) |
| PUT | /api/purchase-orders/:id/receive | Goods receiving |
| POST | /api/purchase-orders/:id/return | Return ke supplier |

## 4.15 Cash Drawer

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/cash-drawer/open | Buka laci kas |
| PUT | /api/cash-drawer/close | Tutup laci kas |
| POST | /api/cash-drawer/cash-in | Cash in (setor) |
| POST | /api/cash-drawer/cash-out | Cash out (ambil) |
| GET | /api/cash-drawer/z-report | Z-Report |
| GET | /api/cash-drawer/history | History cash drawer |

## 4.16 Shifts

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/shifts/start | Mulai shift |
| PUT | /api/shifts/end | Akhiri shift |
| GET | /api/shifts | List shift |
| GET | /api/shifts/:id | Detail shift |

## 4.17 Loyalty Points

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/loyalty/balance/:customer_id | Cek saldo poin |
| POST | /api/loyalty/earn | Tambah poin |
| POST | /api/loyalty/redeem | Tukar poin |
| GET | /api/loyalty/history/:customer_id | Riwayat poin |

## 4.18 Activity Logs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/activity-logs | List log aktivitas |

## 4.19 File Upload

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/upload/product-images | Upload foto produk |
| POST | /api/upload/expense-receipt | Upload bukti pengeluaran |

## 4.20 Printer

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/printer/invoice/:id | Generate data invoice |
| POST | /api/printer/print | Cetak via backend |

## 4.21 Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/settings | Get all settings |
| PUT | /api/settings | Update settings |
| PUT | /api/settings/receipt | Update receipt settings |
| POST | /api/settings/receipt/logo | Upload logo struk |

## 4.22 Returns (Retur)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/returns | List retur |
| GET | /api/returns/:id | Detail retur |
| POST | /api/returns | Buat retur baru |
| PUT | /api/returns/:id/approve | Approve retur |
| PUT | /api/returns/:id/reject | Tolak retur |

## 4.23 Employee Schedules (Jadwal)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/schedules | List jadwal karyawan |
| POST | /api/schedules | Buat jadwal baru |
| PUT | /api/schedules/:id | Edit jadwal |
| DELETE | /api/schedules/:id | Hapus jadwal |
| POST | /api/schedules/check-in | Check-in karyawan |
| POST | /api/schedules/check-out | Check-out karyawan |
| GET | /api/schedules/attendance | Laporan kehadiran |

## 4.24 Shift Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/shift-templates | List template shift |
| POST | /api/shift-templates | Buat template baru |
| PUT | /api/shift-templates/:id | Edit template |
| DELETE | /api/shift-templates/:id | Hapus template |

## 4.25 Commission Rules (Aturan Komisi)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/commission-rules | List aturan komisi |
| POST | /api/commission-rules | Buat aturan baru |
| PUT | /api/commission-rules/:id | Edit aturan |
| DELETE | /api/commission-rules/:id | Hapus aturan |

## 4.26 Commission Records (Catatan Komisi)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/commissions | List catatan komisi |
| GET | /api/commissions/:id | Detail komisi karyawan |
| GET | /api/commissions/my | Komisi saya (kasir) |
| POST | /api/commissions/calculate | Hitung komisi periode |
| PUT | /api/commissions/:id/approve | Approve komisi |
| PUT | /api/commissions/:id/pay | Tandai sudah dibayar |
| GET | /api/commissions/summary | Ringkasan komisi semua karyawan |

## 4.27 Accounting/Journal

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/journal/entries | List jurnal (query: date, status, page) |
| GET | /api/journal/entries/:id | Detail jurnal |
| POST | /api/journal/entries | Buat jurnal baru |
| PUT | /api/journal/entries/:id/post | Post jurnal |
| GET | /api/journal/trial-balance | Trial balance |
| GET | /api/journal/general-ledger | General ledger |
| GET | /api/journal/accounts/:id/transactions | Mutasi per akun |

## 4.28 Product Photos

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/products/:id/photos | List foto produk |
| POST | /api/products/:id/photos | Upload foto |
| PUT | /api/products/:id/photos/:photo_id/primary | Set foto utama |
| DELETE | /api/products/:id/photos/:photo_id | Hapus foto |

## 4.29 Expense Categories (CRUD Lengkap)

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | /api/expenses/categories/:id | Edit kategori |
| DELETE | /api/expenses/categories/:id | Hapus kategori |

## 4.30 Reports (Lanjutan)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/reports/per-cashier | Laporan per kasir |
| GET | /api/reports/categories-top | Kategori terlaris |
| GET | /api/reports/daily-chart | Data chart harian |
| GET | /api/reports/monthly-chart | Data chart bulanan |

## 4.31 Wholesale Prices (Harga Grosir)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/wholesale-prices | List harga grosir |
| GET | /api/wholesale-prices/product/:product_id | Harga grosir produk |
| POST | /api/wholesale-prices | Tambah harga grosir |
| PUT | /api/wholesale-prices/:id | Edit harga grosir |
| DELETE | /api/wholesale-prices/:id | Hapus harga grosir |

## 4.32 Referrals

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/referrals/my-code | Kode referral saya |
| POST | /api/referrals/apply | Pakai kode referral |
| GET | /api/referrals/history | Riwayat referral |

## 4.33 Supplier Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/suppliers/:id/products | Mapping produk ke supplier |
| PUT | /api/supplier-products/:id | Edit mapping |
| DELETE | /api/supplier-products/:id | Hapus mapping |

## 4.34 Expense Budgets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/expense-budgets | List budget |
| POST | /api/expense-budgets | Tambah budget |
| PUT | /api/expense-budgets/:id | Edit budget |
| GET | /api/expense-budgets/summary | Ringkasan budget vs aktual |

## 4.35 Split Payment

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/transactions/:id/payments | Tambah pembayaran split |
| GET | /api/transactions/:id/payments | List pembayaran transaksi |

## 4.36 Pending/Hold Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/transactions/hold | Tahan transaksi |
| GET | /api/transactions/pending | List transaksi tertahan |
| POST | /api/transactions/:id/resume | Lanjutkan transaksi |
| DELETE | /api/transactions/pending/:id | Hapus transaksi tertahan |

## API Contract yang Wajib Diterapkan

- Sebelum frontend/backend diimplementasikan, endpoint terautentikasi harus memiliki kontrak OpenAPI 3.1 yang menyatakan role yang diizinkan, body/query schema, status error, dan contoh response.
- Endpoint list harus menerima `page` dan `limit`, membatasi `limit` maksimal 100, dan mengembalikan format paginasi di bawah.
- `POST /api/transactions` menerima `client_transaction_id` (UUID) untuk transaksi mobile/offline. Nilai yang sama harus mengembalikan hasil transaksi pertama, bukan membuat transaksi baru.
- Untuk split payment, `payment_method` transaksi bernilai `split`; semua baris `transaction_payments` harus berjumlah tepat `grand_total`. Kembalian hanya boleh dihitung dari bagian pembayaran `cash`.
- Cash in/out wajib menyimpan `amount`, `reason`, dan `cash_drawer_id` sebagai `cash_drawer_movements`; nominal harus positif.

---

# Request & Response Examples

## E.4.1 Authentication (Contoh Request/Response)

### POST /api/auth/login

**Request:**
```json
{
  "email": "kasir@toko.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 4,
      "name": "Kasir C",
      "email": "kasir@toko.com",
      "role": "kasir",
      "branch_id": 1
    }
  }
}
```

### POST /api/auth/login-pin

**Request:**
```json
{
  "pin": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 4,
      "name": "Kasir C",
      "role": "kasir"
    }
  }
}
```

## E.4.2 Products (Contoh Request/Response)

### GET /api/products?search=kaos&page=1&limit=20

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Kaos Polos Katun",
      "slug": "kaos-polos-katun",
      "category_id": 1,
      "category_name": "Baju Kaos",
      "cost": 45000,
      "price": 85000,
      "stock": 150,
      "barcode": "BJK0001",
      "sku": "BJK-0001",
      "gender": "unisex",
      "photos": ["/uploads/products/1.jpg"]
    }
  ],
  "total": 45,
  "page": 1,
  "totalPages": 3
}
```

### POST /api/products

**Request:**
```json
{
  "name": "Kaos Polos Katun",
  "category_id": 1,
  "cost": 45000,
  "price": 85000,
  "stock": 100,
  "gender": "unisex",
  "description": "Kaos polos 100% katun"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "sku": "BJK-0001",
    "barcode": "BJK0001"
  },
  "message": "Produk berhasil ditambahkan"
}
```

## E.4.4 Transactions (Contoh Request/Response)

### POST /api/transactions

**Request:**
```json
{
  "branch_id": 1,
  "customer_id": 5,
  "items": [
    {
      "product_id": 1,
      "variant_id": null,
      "quantity": 2,
      "price": 85000
    },
    {
      "product_id": 3,
      "variant_id": 7,
      "quantity": 1,
      "price": 125000
    }
  ],
  "discount_type": "percentage",
  "discount_value": 10,
  "payment_method": "cash",
  "amount_paid": 200000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "invoice_no": "INV-20260711-0042",
    "subtotal": 295000,
    "discount": 29500,
    "grand_total": 265500,
    "change": 500,
    "loyalty_points_earned": 265
  },
  "message": "Transaksi berhasil"
}
```

## E.4.10 Expenses (Contoh Request/Response)

### POST /api/expenses

**Request:**
```json
{
  "category_id": 2,
  "name": "Gaji kasir bulan Juli",
  "amount": 5000000,
  "expense_date": "2026-07-11",
  "payment_method": "transfer",
  "status": "approved"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 15,
    "status": "approved",
    "journal_entry_id": 78
  },
  "message": "Pengeluaran tercatat"
}
```

## E.4.14 Purchase Orders (Contoh Request/Response)

### POST /api/purchase-orders

**Request:**
```json
{
  "supplier_id": 3,
  "order_date": "2026-07-11",
  "expected_date": "2026-07-18",
  "items": [
    {
      "product_id": 1,
      "variant_id": 2,
      "quantity": 50,
      "unit_cost": 45000
    }
  ],
  "notes": "Restock kaos polos"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 8,
    "po_number": "PO-20260711-0008",
    "status": "pending_approval",
    "total_amount": 2250000
  },
  "message": "PO berhasil dibuat"
}
```

## E.4.15 Cash Drawer (Contoh Request/Response)

### POST /api/cash-drawer/open

**Request:**
```json
{
  "opening_amount": 500000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 12,
    "opened_at": "2026-07-11T08:00:00Z",
    "opening_amount": 500000
  }
}
```

### GET /api/cash-drawer/z-report

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2026-07-11",
    "opening_amount": 500000,
    "total_sales": 2650000,
    "total_expenses": 150000,
    "cash_in": 0,
    "cash_out": 0,
    "expected_cash": 3000000,
    "actual_cash": 3000000,
    "difference": 0,
    "transactions_count": 42
  }
}
```

## E.4.22 Returns (Contoh Request/Response)

### POST /api/returns

**Request:**
```json
{
  "transaction_id": 42,
  "reason": "Ukuran tidak sesuai",
  "items": [
    {
      "transaction_item_id": 85,
      "product_id": 1,
      "quantity": 1,
      "unit_price": 85000
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 3,
    "return_no": "RET-20260711-0003",
    "refund_amount": 85000,
    "status": "pending"
  },
  "message": "Retur berhasil dibuat"
}
```

## E.4.23 Schedules (Contoh Request/Response)

### POST /api/schedules/check-in

**Request:**
```json
{
  "schedule_id": 15
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "check_in": "2026-07-11T08:02:00Z",
    "is_late": false,
    "late_minutes": 0
  },
  "message": "Check-in berhasil"
}
```

### GET /api/schedules/attendance?start_date=2026-07-01&end_date=2026-07-31

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "user_id": 4,
      "user_name": "Kasir C",
      "total_schedules": 22,
      "present": 20,
      "absent": 2,
      "late": 3,
      "avg_duration_minutes": 480
    }
  ]
}
```

## E.4.25 Commission Rules (Contoh Request/Response)

### POST /api/commission-rules

**Request:**
```json
{
  "name": "Komisi Kasir Juli 2026",
  "description": "Komisi 2% dari omset untuk kasir",
  "applies_to": "role",
  "role": "kasir",
  "calculation_type": "percentage_sales",
  "percentage": 2.00,
  "min_target": 5000000,
  "min_transactions": 50,
  "start_date": "2026-07-01",
  "end_date": "2026-07-31"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Komisi Kasir Juli 2026",
    "calculation_type": "percentage_sales",
    "percentage": 2.00,
    "min_target": 5000000
  },
  "message": "Aturan komisi berhasil dibuat"
}
```

## E.4.26 Commission Records (Contoh Request/Response)

### POST /api/commissions/calculate

**Request:**
```json
{
  "period_start": "2026-07-01",
  "period_end": "2026-07-31"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_users": 3,
    "records": [
      {
        "user_id": 4,
        "user_name": "Kasir C",
        "total_sales": 12500000,
        "total_transactions": 85,
        "commission_amount": 250000,
        "status": "pending"
      },
      {
        "user_id": 5,
        "user_name": "Kasir D",
        "total_sales": 8000000,
        "total_transactions": 52,
        "commission_amount": 160000,
        "status": "pending"
      }
    ]
  },
  "message": "Komisi berhasil dihitung"
}
```

### GET /api/commissions/my?month=2026-07

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "Juli 2026",
    "total_sales": 12500000,
    "total_transactions": 85,
    "commission_amount": 250000,
    "status": "pending",
    "details": [
      {
        "date": "2026-07-11",
        "invoice_no": "INV-20260711-0042",
        "sale_amount": 265500,
        "commission": 5310
      }
    ]
  }
}
```

### GET /api/commissions/summary?month=2026-07

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "Juli 2026",
    "total_commission": 610000,
    "by_user": [
      {
        "user_id": 4,
        "user_name": "Kasir C",
        "total_sales": 12500000,
        "commission": 250000,
        "status": "pending"
      },
      {
        "user_id": 5,
        "user_name": "Kasir D",
        "total_sales": 8000000,
        "commission": 160000,
        "status": "approved"
      }
    ]
  }
}
```

## Response Format

```json
// Success
{
  "success": true,
  "data": { ... },
  "message": "Berhasil"
}

// Error
{
  "success": false,
  "message": "Error message"
}

// Paginated
{
  "success": true,
  "data": [...],
  "total": 100,
  "page": 1,
  "totalPages": 10
}
```
