# 1. Fitur Utama

## 1.1 Manajemen Produk Pakaian

### Kolom Form Produk

| No | Kolom | Tipe | Keterangan |
|---|---|---|---|
| 1 | **Foto Produk** | Image (multiple) | Upload 1-5 foto. Foto utama ditampilkan di POS & struk |
| 2 | **Nama Produk** | Text (required) | Nama produk yang tampil di POS |
| 3 | **Varian** | Select (Ukuran + Warna) | Pilih ukuran (S/M/L/XL) dan warna. Bisa multi-varian |
| 4 | **SKU** | Text (unique) | Kode unik produk. Auto-generate atau input manual |
| 5 | **Barcode** | Text (unique) | Barcode produk. Auto-generate dari SKU atau input manual |
| 6 | **Qty Stok** | Number | Jumlah stok saat ini. Update otomatis saat transaksi |
| 7 | **Harga Beli** | Currency (Rp) | Harga modal / HPP. Untuk hitung laba |
| 8 | **Harga Jual** | Currency (Rp) | Harga jual ke pelanggan |

### Varian Produk

| Ukuran | Warna |
|---|---|
| XXS, XS, S, M, L, XL, XXL, 3XL, 4XL | Hitam, Putih, Merah, Biru, Hijau, Kuning |
| All Size | Abu-abu, Coklat, Navy, Maroon, Orange |
| 36, 37, 38, 39, 40, 41, 42, 43, 44, 45 (sepatu) | Pink, Tosca, Lavender, Cream, dll |

Setiap kombinasi Ukuran + Warna = 1 varian dengan stok & harga tersendiri.

### Contoh Data Produk

| Foto | Nama | Varian | SKU | Barcode | Stok | Harga Beli | Harga Jual |
|---|---|---|---|---|---|---|---|
| 📷 | Kaos Polos Hitam | M / Hitam | BJK-001 | 8991234567890 | 12 | Rp 25.000 | Rp 55.000 |
| 📷 | Kaos Polos Hitam | L / Hitam | BJK-001 | 8991234567891 | 8 | Rp 25.000 | Rp 55.000 |
| 📷 | Kemeja Flanel | L / Biru | KMJ-002 | 8991234567892 | 5 | Rp 65.000 | Rp 150.000 |
| 📷 | Jaket Denim | XL / Biru | JKT-003 | 8991234567893 | 3 | Rp 120.000 | Rp 250.000 |

### Fitur Tambahan Produk

| Fitur | Detail |
|---|---|
| **Kategori** | Baju, Celana, Jaket, Gamis, Koko, Aksesoris, Sepatu, Daster, Lainnya |
| **Gender** | Pria, Wanita, Unisex, Anak |
| **Status** | Aktif / Nonaktif (produk tidak muncul di POS jika nonaktif) |
| **Stok Minimal** | Alert ketika stok di bawah batas minimal |
| **Harga Grosir** | Harga khusus untuk pembelian dalam jumlah tertentu (>= qty) |
| **Slug** | URL-friendly identifier untuk produk |

### Kategori Pakaian

| No | Nama | Slug | Kode SKU |
|---|---|---|---|
| 1 | Baju Kaos | baju-kaos | BJK |
| 2 | Kemeja | kemeja | KMJ |
| 3 | Batik | batik | BTK |
| 4 | Jaket & Hoodie | jaket-hoodie | JKT |
| 5 | Celana Panjang | celana-panjang | CLP |
| 6 | Celana Pendek | celana-pendek | CLD |
| 7 | Gamis & Terusan | gamis-terusan | GMS |
| 8 | Koko & Muslim | koko-muslim | KKO |
| 9 | Daster | daster | DSTR |
| 10 | Rok | rok | ROK |
| 11 | Sepatu | sepatu | SPT |
| 12 | Tas | tas | TAS |
| 13 | Aksesoris | aksesoris | AKS |
| 14 | Lainnya | lainnya | LLN |

## 1.2 Transaksi POS

### Fitur Kasir

| Fitur | Detail |
|---|---|
| **Multi Item** | Tambah banyak item dalam 1 transaksi |
| **Scan Barcode** | Scan barcode untuk cari produk cepat |
| **Discount Item** | Diskon per item (percentage/nominal) |
| **Discount Transaksi** | Diskon keseluruhan transaksi |
| **Multi Metode Bayar** | Cash, QRIS, Debit, Transfer, Credit |
| **Split Payment** | Bayar dengan kombinasi metode (Tunai + QRIS) |
| **Hold/Resume** | Tahan transaksi untuk lanjut nanti |
| **Customer** | Pilih pelanggan untuk poin loyalty |
| **Note** | Catatan transaksi |

### Flow Transaksi

```
[Pilih Produk] → [Scan/Search] → [Set Qty] → [Diskon?] → 
[Customer?] → [Bayar] → [Split?] → [Cetak Struk] → [Selesai]
```

### Pending/Hold Transaction

Transaksi yang ditahan disimpan di `pending_transactions` dengan `items_json` berisi detail item. Kasir bisa resume atau hapus.

## 1.3 Thermal Printer

- Cetak invoice 58mm / 80mm via ESC/POS
- Support QZ Tray atau direct print
- Template struk customizable (lihat `22-dark-mode-receipt-scheduling.md`)
- Auto-print setelah transaksi selesai

## 1.4 Multi Cabang

| Fitur | Detail |
|---|---|
| **Gudang per Cabang** | Setiap cabang punya gudang sendiri |
| **Transfer Antar Cabang** | Pindah stok antar gudang cabang |
| **Laporan per Cabang** | Filter laporan berdasarkan cabang |
| **User per Cabang** | User terikat ke 1 cabang |

## 1.5 Hak Akses PIN

5 Level akses:

| Level | Keterangan |
|---|---|
| **Owner** | Akses penuh semua fitur |
| **Manager** | Kelola produk, stok, laporan, user |
| **Admin** | Kelola produk, stok, transaksi |
| **Kasir** | Transaksi POS, lihat produk |
| **Gudang** | Kelola stok, transfer, opname |

Login dengan PIN 6 digit atau email+password.

### Matrix Akses Modul per Role

Modul yang muncul di sidebar menyesuaikan role yang login. Jika user **bukan Owner/Manager**, modul admin (Produk, Stok, Laporan, Pengaturan, User, Akuntansi, dll) **tidak ditampilkan** — hanya modul operasional dasar.

| Modul | Owner | Manager | Admin | Kasir | Gudang |
|-------|:-----:|:-------:|:-----:|:-----:|:------:|
| Dashboard | ✅ | ✅ | ✅ | ✅* | ✅* |
| POS (Kasir) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Input Pemasukan (Penjualan) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Input Pengeluaran | ✅ | ✅ | ✅ | ✅ | ❌ |
| Produk | ✅ | ✅ | ✅ | ❌ | ❌ |
| Stok & Gudang | ✅ | ✅ | ✅ | ❌ | ✅ |
| Supplier & PO | ✅ | ✅ | ❌ | ❌ | ✅ |
| Laporan | ✅ | ✅ | ❌ | ❌ | ❌ |
| Kas & Reconciliation | ✅ | ✅ | ✅ | ✅** | ❌ |
| Akuntansi/Jurnal | ✅ | ✅ | ❌ | ❌ | ❌ |
| Komisi | ✅ | ✅ | ❌ | ❌ | ❌ |
| Jadwal & Kehadiran | ✅ | ✅ | ❌ | ❌ | ✅ |
| User & Akses | ✅ | ✅ | ❌ | ❌ | ❌ |
| Pengaturan Toko | ✅ | ✅ | ❌ | ❌ | ❌ |

> **Catatan:**
> - ✅* = Dashboard untuk Kasir/Gudang hanya ringkasan harian sederhana (bukan analitik lengkap)
> - ✅** = Kasir hanya bisa buka/tutup laci kas & lihat Z-Report sendiri, bukan approval
> - **Prinsip:** Modul Admin (Produk, Stok, Laporan, Akuntansi, User, Pengaturan) HANYA untuk Owner/Manager/Admin. Kasir & Gudang tidak melihat menu tersebut di sidebar.
> - Filtering dilakukan di **frontend** (sembunyikan menu berdasarkan `user.role`) DAN **backend** (`authorize()` per endpoint). Frontend menyembunyikan, backend menolak.

## 1.6 Pembukuan Otomatis

- Double-entry accounting
- Jurnal otomatis dari transaksi, pengeluaran, retur
- Chart of Accounts (COA) standar
- Trial balance, General Ledger, Laporan Laba Rugi
- Periode akuntansi (open/close)

## 1.7 Mobile App

- Android & iOS (Flutter)
- Offline mode (sync saat online)
- Fitur: POS, Scan barcode, Lihat stok, Laporan
- Push notification untuk order/stock alert

## 1.8 Stok & Gudang

| Fitur | Detail |
|---|---|
| **Mutasi Stok** | Sale, Purchase, Adjustment, Transfer, Return, Damage, Gift |
| **Stock Opname** | Fisik vs sistem, approval workflow |
| **Stock Transfer** | Antar gudang dengan approval |
| **Low Stock Alert** | Notifikasi saat stok < min_stock |
| **Stock Card** | Riwayat mutasi per produk |

## 1.9 Laporan

| Laporan | Detail |
|---|---|
| **Penjualan** | Omset, item terlaris, per kasir |
| **Laba Rugi** | Revenue - COGS - Expenses |
| **Stok** | Nilai stok, slow-moving, habis |
| **Kas** | Cash flow, Z-Report |
| **Komisi** | Per kasir/periode |
| **Pembukuan** | Jurnal, trial balance, ledger |

## 1.10 Biaya (Expenses)

| Fitur | Detail |
|---|---|
| **Kategori Biaya** | Operasional, Gaji, Marketing, dll |
| **Approval** | Pending → Approved/Rejected |
| **Recurring** | Biaya berulang (mingguan/bulanan/tahunan) |
| **Budget** | Set budget per kategori, alert jika melebihi |
| **Receipt** | Upload bukti pengeluaran |

## 1.11 Supplier & Purchase Order

| Fitur | Detail |
|---|---|
| **Supplier CRUD** | Kelola data supplier |
| **PO Workflow** | Draft → Approval → Ordered → Received |
| **Goods Receiving** | Terima barang, update stok |
| **Return ke Supplier** | Retur barang cacat |
| **Supplier-Product Mapping** | Produk mana dari supplier mana |
| **Preferred Supplier** | Tandai supplier utama per produk |

## 1.12 Cash Reconciliation

| Fitur | Detail |
|---|---|
| **Cash Drawer** | Buka/tutup laci kas |
| **Opening Amount** | Set modal awal |
| **Z-Report** | Ringkasan penjualan harian |
| **Cash In/Out** | Setor/ambil kas |
| **Difference** | Selisih expected vs actual |
| **Shift Management** | Multi shift per hari |

## 1.13 Customer Referral

| Fitur | Detail |
|---|---|
| **Referral Code** | Kode unik per pelanggan |
| **Bonus Points** | Poin untuk referrer & referred |
| **Track** | Riwayat referral, status pending/completed |
| **Auto Apply** | Saat registrasi customer baru pakai kode |

## 1.14 Loyalty Points

| Fitur | Detail |
|---|---|
| **Earn** | Poin dari transaksi (1% dari total) |
| **Redeem** | Tukar poin dengan diskon |
| **Tier** | Bronze, Silver, Gold |
| **History** | Riwayat poin per customer |

## 1.15 Returns (Retur)

| Fitur | Detail |
|---|---|
| **Retur Penjualan** | Kembalikan barang, refund |
| **Approval** | Pending → Approved/Rejected |
| **Stock Update** | Stok balik otomatis |
| **Journal** | Jurnal retur otomatis |

## 1.16 Commission (Komisi)

| Fitur | Detail |
|---|---|
| **Aturan Komisi** | Percentage sales, percentage profit, per transaction, flat |
| **Target** | Min target omset/transaksi |
| **Calculate** | Hitung periode tertentu |
| **Approve & Pay** | Approval sebelum bayar |

## 1.17 Employee Scheduling

| Fitur | Detail |
|---|---|
| **Shift Template** | Pagi/Sore/Malam/Full Day |
| **Jadwal Mingguan** | Assign shift ke karyawan |
| **Check-in/Out** | Fingerprint/scan, auto detect late |
| **Attendance Report** | Hadir, terlambat, alpha, lembur |
| **Overlap Prevention** | Cegah double shift |

Lihat `22-dark-mode-receipt-scheduling.md` untuk detail lengkap.

## 1.18 Dark Mode & Receipt Customization

| Fitur | Detail |
|---|---|
| **Dark Mode** | Toggle terang/gelap/sistem per user |
| **Receipt Custom** | Header, footer, logo, QR, cashier name |
| **Theme Config** | CSS variables untuk light/dark |

Lihat `22-dark-mode-receipt-scheduling.md` untuk detail lengkap.
