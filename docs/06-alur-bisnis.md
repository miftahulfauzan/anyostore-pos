# 6. Alur Bisnis Detail

## 6.1 Alur Transaksi POS

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLOW TRANSAKSI POS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  START                                                          │
│    │                                                            │
│    ▼                                                            │
│  [Halaman POS]                                                 │
│    │                                                            │
│    ├──→ Scan barcode (otomatis tambah item)                     │
│    │     └── Jika punya varian → pilih ukuran & warna           │
│    │                                                            │
│    ├──→ Cari manual (ketik nama/SKU)                            │
│    │     └── Pilih dari hasil search                            │
│    │                                                            │
│    ├──→ Pilih dari grid produk                                  │
│    │                                                            │
│    ▼                                                            │
│  [Item masuk keranjang]                                         │
│    │                                                            │
│    ├──→ Atur quantity (+/-)                                     │
│    ├──→ [Opsional] Klik [Diskon] → input diskon item            │
│    ├──→ [Opsional] Klik [Cust] → cari/tambah pelanggan         │
│    ├──→ [Opsional] Klik [Hold] → simpan pending ↓              │
│    │                                                            │
│    ▼                                                            │
│  [Klik BAYAR]                                                  │
│    │                                                            │
│    ▼                                                            │
│  [Pilih Metode Pembayaran]                                      │
│    │                                                            │
│    ├──→ Tunai → input nominal → sistem hitung kembalian         │
│    ├──→ QRIS → tampilkan QR code / input ref                    │
│    ├──→ Debit → input nomor kartu                               │
│    ├──→ Transfer → input nama bank + ref                        │
│    └──→ Split → pilih 2 metode + jumlah per metode              │
│    │                                                            │
│    ▼                                                            │
│  [Klik Bayar] (konfirmasi)                                      │
│    │                                                            │
│    ▼                                                            │
│  [Proses Server]:                                                │
│    1. Validasi stok (setiap item)                                │
│    2. Generate invoice_no                                       │
│    3. INSERT transaction                                        │
│    4. INSERT transaction_items                                   │
│    5. UPDATE warehouse_stocks (kurangi; products.stock cache)  │
│    6. INSERT stock_mutations (sale)                             │
│    7. INSERT activity_log                                       │
│    │                                                            │
│    ├──→ [Jika GAGAL] → rollback + notifikasi error              │
│    │                                                            │
│    ▼                                                            │
│  [Sukses]                                                       │
│    │                                                            │
│    ├──→ Tampilkan layar sukses (total, kembalian)               │
│    ├──→ [Cetak Invoice] → kirim perintah ke printer thermal     │
│    ├──→ [Opsional] [Cetak Ulang]                                │
│    ├──→ [Opsional] [Kirim Invoice via WA]                       │
│    │                                                            │
│    ▼                                                            │
│  [Klik Transaksi Baru] → Reset keranjang                        │
│    │                                                            │
│    ▼                                                            │
│  START (lagi)                                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Pengiriman Invoice WhatsApp

Fitur `Kirim WA` membuka deep link WhatsApp hanya setelah kasir menekan tombol
dan pelanggan menyetujui penggunaan nomor teleponnya. Pesan berisi ringkasan
invoice dan tautan invoice yang memiliki token acak, masa berlaku, serta hanya
dapat dibaca oleh penerima yang memiliki tautan. Jangan menyimpan token atau
nomor telepon lengkap di log aplikasi; bila memakai provider WhatsApp Business,
simpan kredensial di secret manager dan catat status pengiriman tanpa isi pesan.

---

## 6.2 Alur Manajemen Stok

```
┌──────────────────────────────────┐
│     MANAJEMEN STOK               │
├──────────────────────────────────┤
│                                    │
│  STOK MASUK                        │
│  ────────────                      │
│  1. Pilih produk                   │
│  2. Pilih varian (jika ada)        │
│  3. Input jumlah (+)               │
│  4. Pilih sumber:                  │
│     - Pembelian dari supplier      │
│     - Retur dari customer          │
│     - Penyesuaian (adjustment)     │
│  5. Catat harga beli (opsional)    │
│  6. Catatan (opsional)             │
│  7. Simpan                         │
│     → UPDATE warehouse_stocks +    │
│     → INSERT stock_mutations       │
│                                    │
│  STOK KELUAR                       │
│  ────────────                      │
│  1. Pilih produk                   │
│  2. Pilih varian (jika ada)        │
│  3. Input jumlah (-)               │
│  4. Pilih alasan:                  │
│     - Rusak / cacat                │
│     - Hilang                       │
│     - Kadaluarsa                   │
│     - Hadiah / sample              │
│     - Retur ke supplier            │
│  5. Catatan (wajib untuk audit)    │
│  6. Simpan                         │
│     → UPDATE warehouse_stocks -    │
│     → INSERT stock_mutations       │
│                                    │
│  NOTIFIKASI STOK MENIPIS           │
│  ─────────────────────             │
│  Cron job (setiap 6 jam):          │
│  SELECT * FROM products            │
│  WHERE stock <= min_stock          │
│  AND is_active = TRUE              │
│    → Tampilkan badge di sidebar    │
│    → Tampilkan alert di dashboard  │
│                                    │
└──────────────────────────────────┘
```

---

## 6.3 Alur Generate Invoice Number

```
Format: INV-{YYYYMMDD}-{XXXX}

Contoh: INV-20260708-0001

Logika:
1. Ambil tanggal sekarang: YYYY-MM-DD
2. Ambil nomor urut dari tabel sequence per cabang dan tanggal, di dalam
   transaksi database yang sama dengan INSERT transaksi.
3. Padding 4 digit: 0001, 0002, ..., 9999 (per cabang per hari).

Jangan gunakan `COUNT(*) + 1`: dua kasir yang checkout bersamaan dapat
mendapat nomor yang sama. Alternatif aman adalah nomor acak/ULID dengan
unique constraint dan retry bila terjadi duplicate key.
```

---

## 6.4 Alur Cetak Invoice Thermal

```
┌──────────────────────────────────────────┐
│     ALUR CETAK INVOICE THERMAL           │
├──────────────────────────────────────────┤
│                                           │
│  1. Transaksi berhasil disimpan           │
│  2. System kirim GET /api/printer/invoice/:id│
│     ke endpoint generate data invoice     │
│  3. Backend return JSON data invoice:     │
│     {                                     │
│       store_name, address, phone,         │
│       invoice_no, cashier, datetime,      │
│       items: [{name, qty, price, total}], │
│       subtotal, discount, grand_total,    │
│       payment_method, paid, change        │
│     }                                     │
│  4. Frontend format ke template ESC/POS   │
│  5. Kirim raw bytes ke printer via:       │
│     a) QZ Tray (jika web)                 │
│     b) escpos Node.js (jika Electron)     │
│  6. Printer thermal cetak + potong kertas │
│  7. Update transactions.printed = TRUE    │
│     Update transactions.print_count ++    │
│                                           │
└──────────────────────────────────────────┘
```

---

## 6.5 Alur Pembatalan Transaksi

```
1. Kasir/Admin buka detail transaksi
2. Klik [Batalkan Transaksi]
3. Konfirmasi password / PIN (untuk keamanan)
4. System:
   a. UPDATE transactions.status = 'cancelled'
   b. Kembalikan stok (UPDATE warehouse_stocks + qty)
   c. INSERT stock_mutations type='sale_return'
   d. INSERT activity_log
5. Notifikasi sukses
6. Cetak nota pembatalan (opsional)
```

---

## 6.6 Alur Gudang & Stok Opname

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLOW STOK OPNAME                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Pilih Gudang]                                                 │
│    │                                                            │
│    ▼                                                            │
│  [Pilih Kategori atau Semua Produk]                              │
│    │                                                            │
│    ▼                                                            │
│  [Mulai Opname]                                                 │
│    │                                                            │
│    ├──→ Scan barcode produk (atau pilih manual)                  │
│    │     │                                                      │
│    │     ▼                                                      │
│    │   [Input Stok Fisik]                                       │
│    │     │                                                      │
│    │     ├──→ Sistem tampilkan stok sistem                      │
│    │     ├──→ User input stok fisik                             │
│    │     └──→ Sistem hitung selisih otomatis                    │
│    │                                                            │
│    ├──→ Ulangi untuk semua produk                                │
│    │                                                            │
│    ▼                                                            │
│  [Selesai & Review]                                             │
│    │                                                            │
│    ├──→ Tampilkan ringkasan:                                    │
│    │     - Total produk dihitung                                │
│    │     - Produk dengan selisih                                │
│    │     - Total selisih (positif/negatif)                      │
│    │                                                            │
│    ├──→ [Simpan Hasil Opname]                                   │
│    │     │                                                      │
│    │     ▼                                                      │
│    │   [Proses Server]:                                         │
│    │     1. INSERT stock_opname (header)                        │
│    │     2. INSERT stock_opname_items (detail)                  │
│    │     3. UPDATE warehouse_stocks (sesuai fisik)              │
│    │     4. INSERT stock_mutations (adjustment)                 │
│    │     5. INSERT activity_log                                 │
│    │                                                            │
│    └──→ [Export Laporan] → Download Excel/PDF                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6.7 Alur Transfer Antar Gudang

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLOW TRANSFER STOK                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Pilih Gudang Asal]                                            │
│    │                                                            │
│    ▼                                                            │
│  [Pilih Gudang Tujuan]                                          │
│    │                                                            │
│    ▼                                                            │
│  [Tambah Item Transfer]                                         │
│    │                                                            │
│    ├──→ Scan/pilih produk                                       │
│    ├──→ Pilih varian (jika ada)                                 │
│    ├──→ Input jumlah transfer                                   │
│    └──→ Ulangi untuk semua item                                 │
│    │                                                            │
│    ▼                                                            │
│  [Submit Transfer]                                              │
│    │                                                            │
│    ├──→ Jika 1 cabang (intra-branch):                           │
│    │     → Langsung proses                                      │
│    │     → UPDATE stok gudang asal (-)                          │
│    │     → UPDATE stok gudang tujuan (+)                        │
│    │                                                            │
│    └──→ Jika beda cabang (inter-branch):                        │
│          → Status: pending                                      │
│          → Push notifikasi ke manager gudang tujuan             │
│          → Menunggu approval                                    │
│            │                                                    │
│            ├──→ [Approve] → Proses transfer                     │
│            └──→ [Reject] → Batalkan, notifikasi ke pengirim     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6.8 Alur Pencatatan Biaya

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLOW PENCATATAN BIAYA                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Halaman Pencatatan Biaya]                                     │
│    │                                                            │
│    ├──→ [Catat Biaya Baru]                                      │
│    │     │                                                      │
│    │     ▼                                                      │
│    │   [Form Biaya]:                                            │
│    │     - Tanggal                                              │
│    │     - Kategori (Operasional/Gaji/Marketing/ dll)           │
│    │     - Nama Pengeluaran                                     │
│    │     - Nominal (Rp)                                         │
│    │     - Metode Bayar (Tunai/Transfer/Debit)                  │
│    │     - Keterangan (opsional)                                │
│    │     - Bukti Bayar (upload foto, opsional)                  │
│    │     │                                                      │
│    │     ▼                                                      │
│    │   [Validasi]:                                              │
│    │     - Jika nominal > Rp 1.000.000 → butuh approval manager │
│    │     │                                                      │
│    │     ▼                                                      │
│    │   [Simpan]:                                                │
│    │     → INSERT expenses                                      │
│    │     → INSERT journal_entries (Debit: Beban, Kredit: Kas)   │
│    │     → INSERT activity_log                                  │
│    │     → Jika recurring → INSERT expense_schedules            │
│    │                                                            │
│    ├──→ [Lihat Daftar Biaya]                                    │
│    │     → Filter: tanggal, kategori, status                    │
│    │                                                            │
│    ├──→ [Approve Biaya] (Manager/Owner only)                    │
│    │     → UPDATE expenses.status = 'approved'                  │
│    │                                                            │
│    └──→ [Export Laporan Biaya] → Excel / PDF                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6.9 Alur Pembukuan Terintegrasi

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLOW PEMBUKUAN OTOMATIS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Transaksi POS Berhasil]                                       │
│    │                                                            │
│    ▼                                                            │
│  [Sistem Otomatis Generate Jurnal]:                              │
│    │                                                            │
│    ├──→ Jurnal #1: Pendapatan                                   │
│    │     Debit:  Kas (1-1000)           Rp XXX                 │
│    │     Kredit: Pendapatan (4-1000)     Rp XXX                 │
│    │                                                            │
│    ├──→ Jurnal #2: HPP & Persediaan                             │
│    │     Debit:  HPP (5-1000)            Rp XXX                 │
│    │     Kredit: Persediaan (1-2000)     Rp XXX                 │
│    │                                                            │
│    └──→ INSERT ke:                                              │
│          - journal_entries (header)                             │
│          - journal_entry_items (detail per akun)                │
│                                                                  │
│  [Pembelian Stok dari Supplier]                                 │
│    │                                                            │
│    ▼                                                            │
│  [Sistem Generate Jurnal]:                                       │
│    Debit:  Persediaan (1-2000)       Rp XXX                    │
│    Kredit: Kas (1-1000) / Hutang (2-1000)  Rp XXX              │
│                                                                  │
│  [Pengeluaran Biaya]                                            │
│    │                                                            │
│    ▼                                                            │
│  [Sistem Generate Jurnal]:                                       │
│    Debit:  Beban [Kategori] (5-xxxx)  Rp XXX                   │
│    Kredit: Kas (1-1000)               Rp XXX                   │
│                                                                  │
│  [Tutup Buku Bulanan]                                           │
│    │                                                            │
│    ▼                                                            │
│  [Proses]:                                                      │
│    1. Hitung total pendapatan bulan ini                          │
│    2. Hitung total beban bulan ini                               │
│    3. Hitung laba/rugi bersih                                   │
│    4. Posting ke Laba Ditahan (3-2000)                          │
│    5. UPDATE periods.status = 'closed'                          │
│    6. Lock semua transaksi bulan tersebut                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6.10 Alur Mobile Offline Sync

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLOW OFFLINE SYNC                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Mobile App - Tidak Ada Koneksi]                               │
│    │                                                            │
│    ├──→ Tampilkan banner "Mode Offline"                         │
│    ├──→ Transaksi disimpan ke local storage (SQLite/Hive)       │
│    ├──→ Stok di-cache dari data terakhir sync                   │
│    └──→ Queue untuk sync:                                       │
│          - transactions_queue                                   │
│          - stock_mutations_queue                                │
│          - expenses_queue                                       │
│                                                                  │
│  [Koneksi Kembali]                                              │
│    │                                                            │
│    ▼                                                            │
│  [Auto Sync Process]:                                           │
│    1. Kirim transactions_queue ke server                        │
│    2. Server proses satu per satu:                              │
│       - Kirim client_transaction_id UUID untuk setiap transaksi │
│       - Validasi stok                                           │
│       - Generate invoice_no                                     │
│       - INSERT transactions                                     │
│       - UPDATE warehouse_stocks                                 │
│    3. Kirim stock_mutations_queue                               │
│    4. Kirim expenses_queue                                      │
│    5. Ambil data terbaru dari server                            │
│    6. Update local cache                                        │
│    7. Bersihkan queue                                           │
│                                                                  │
│  [Konflik Sync]                                                 │
│    │                                                            │
│    ├──→ Jika stok tidak mencukupi di server:                    │
│    │     → Tandai transaksi sebagai "perlu review"              │
│    │                                                            │
│    └──→ Jika data sudah diubah di server:                       │
│          → Gunakan versi server (server wins)                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Setiap item antrean memiliki UUID yang dibuat saat transaksi lokal dibuat.
Server menyimpan UUID tersebut sebagai `transactions.client_transaction_id`
dengan unique constraint. Jika perangkat mengirim ulang UUID yang sama karena
timeout, server mengembalikan transaksi yang sudah ada (idempotent), bukan
mengurangi stok kembali.

---

## 6.11 Alur Cetak Bluetooth

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLOW CETAK BLUETOOTH                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Transaksi Berhasil]                                           │
│    │                                                            │
│    ▼                                                            │
│  [Cek Printer Bluetooth]:                                       │
│    │                                                            │
│    ├──→ Printer sudah paired?                                   │
│    │     │                                                      │
│    │     ├──→ Ya → Lanjut cetak                                 │
│    │     │                                                      │
│    │     └──→ Tidak → Tampilkan daftar printer                  │
│    │           → User pilih printer                             │
│    │           → Pair & connect                                 │
│    │                                                            │
│    ▼                                                            │
│  [Generate ESC/POS Data]:                                       │
│    - Format struk (sama dengan web)                             │
│    - Konversi ke bytes                                          │
│    - Kirim via Bluetooth socket                                 │
│                                                                  │
│  [Printer Thermal Cetak]                                        │
│    │                                                            │
│    ├──→ Berhasil → Tampilkan "Tercetak" ✓                       │
│    └──→ Gagal → Tampilkan error + tombol "Cetak Ulang"          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6.12 Alur Return & Refund

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLOW RETURN & REFUND                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Kasir buka detail transaksi]                                  │
│    │                                                            │
│    ▼                                                            │
│  [Klik Return]                                                  │
│    │                                                            │
│    ▼                                                            │
│  [Pilih Item yang Di-Return]                                    │
│    │                                                            │
│    ├──→ Tampilkan semua item dari transaksi                     │
│    ├──→ Pilih item (checkbox)                                   │
│    ├──→ Input jumlah return (bisa partial)                      │
│    └──→ Input alasan return:                                    │
│          - Salah ukuran                                         │
│          - Cacat                                                │
│          - Tidak sesuai                                         │
│          - Lainnya                                              │
│    │                                                            │
│    ▼                                                            │
│  [Pilih Refund Method]                                          │
│    │                                                            │
│    ├──→ Tunai                                                   │
│    ├──→ QRIS                                                    │
│    └──→ Kembali ke kartu                                        │
│    │                                                            │
│    ▼                                                            │
│  [Konfirmasi Return]                                            │
│    │                                                            │
│    ▼                                                            │
│  [Proses Server]:                                               │
│    1. INSERT returns (header)                                   │
│    2. INSERT return_items (detail)                              │
│    3. UPDATE transactions.status = 'refunded'                   │
│    4. UPDATE warehouse_stocks (+)                               │
│    5. INSERT stock_mutations (sale_return)                      │
│    6. INSERT journal_entries (return)                           │
│    7. INSERT activity_log                                       │
│                                                                  │
│  [Cetak Return Receipt]                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6.13 Alur End-of-Day Closing

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLOW END-OF-DAY                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Kasir klik "Tutup Kasir"]                                     │
│    │                                                            │
│    ▼                                                            │
│  [Tampilkan Ringkasan]:                                         │
│    - Total penjualan hari ini                                   │
│    - Total per metode bayar                                     │
│    - Total pengeluaran                                          │
│    - Jumlah transaksi                                           │
│    - Laba kotor hari ini                                        │
│                                                                  │
│  [Input Cash Fisik]                                             │
│    │                                                            │
│    ▼                                                            │
│  [Hitung Selisih]:                                              │
│    expected_cash = opening_amount + cash_sales - cash_out       │
│    difference = actual_cash - expected_cash                     │
│                                                                  │
│  [Generate Z-Report]                                            │
│    │                                                            │
│    ▼                                                            │
│  [Print Z-Report]                                               │
│    │                                                            │
│    ▼                                                            │
│  [Lock Transaksi Hari Ini]                                      │
│    │                                                            │
│    ▼                                                            │
│  [Update Status]:                                               │
│    - UPDATE cash_drawers.status = 'closed'                      │
│    - UPDATE shifts.status = 'ended'                             │
│    - INSERT journal_entries (tutup buku)                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6.14 Alur Purchase Order

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLOW PURCHASE ORDER                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Admin/Manager buat PO]                                        │
│    │                                                            │
│    ▼                                                            │
│  [Form PO]:                                                     │
│    - Pilih Supplier                                             │
│    - Tanggal Order                                              │
│    - Tanggal Estimasi Sampai                                    │
│    │                                                            │
│    ▼                                                            │
│  [Tambah Item PO]                                               │
│    │                                                            │
│    ├──→ Pilih Produk                                            │
│    ├──→ Pilih Varian (jika ada)                                 │
│    ├──→ Input Quantity                                          │
│    ├──→ Input Harga Beli                                        │
│    └──→ Ulangi untuk semua item                                 │
│    │                                                            │
│    ▼                                                            │
│  [Submit PO]                                                    │
│    │                                                            │
│    ├──→ Status: Draft → Pending Approval                        │
│    │                                                            │
│    ▼                                                            │
│  [Manager/Owner Approve]                                        │
│    │                                                            │
│    ├──→ Status: Pending Approval → Approved                     │
│    │                                                            │
│    ▼                                                            │
│  [Cetak PO untuk Supplier]                                      │
│    │                                                            │
│    ├──→ Status: Approved → Ordered                              │
│    │                                                            │
│    ▼                                                            │
│  [Goods Receiving]                                              │
│    │                                                            │
│    ├──→ Input qty aktual per item                               │
│    ├──→ Cek selisih (qty diterima vs qty PO)                   │
│    │                                                            │
│    ▼                                                            │
│  [Proses Server]:                                               │
│    1. UPDATE purchase_orders.status = 'received'                │
│    2. UPDATE purchase_order_items.received_qty                  │
│    3. UPDATE warehouse_stocks (+qty diterima)                   │
│    4. INSERT stock_mutations (purchase)                         │
│    5. INSERT journal_entries                                    │
│       Debit: Persediaan (1-2000)                                │
│       Kredit: Hutang Usaha (2-1000)                             │
│                                                                  │
│  [Status: Received → Completed]                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6.15 Alur Customer Loyalty

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLOW CUSTOMER LOYALTY                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Transaksi Berhasil]                                           │
│    │                                                            │
│    ▼                                                            │
│  [Hitung Poin]:                                                 │
│    points_earned = FLOOR(grand_total / 10000)                   │
│                                                                  │
│  [Tambah Poin ke Customer]                                      │
│    │                                                            │
│    ├──→ INSERT loyalty_points (type: 'earn')                    │
│    ├──→ UPDATE customers.loyalty_points += points_earned        │
│    │                                                            │
│    ▼                                                            │
│  [Cek Tier]:                                                    │
│    │                                                            │
│    ├──→ Gold (5000+): Bonus 2x poin                            │
│    ├──→ Silver (1000-4999): Bonus 1.5x poin                    │
│    └──→ Bronze (0-999): Poin normal                            │
│                                                                  │
│  [Customer Ingin Redeem]                                        │
│    │                                                            │
│    ├──→ Cek saldo poin cukup                                    │
│    ├──→ 100 poin = Rp 10.000 diskon                             │
│    │                                                            │
│    ▼                                                            │
│  [Proses Redeem]:                                               │
│    1. INSERT loyalty_points (type: 'redeem')                    │
│    2. UPDATE customers.loyalty_points -= points_redeemed        │
│    3. Tambahkan diskon ke transaksi                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
