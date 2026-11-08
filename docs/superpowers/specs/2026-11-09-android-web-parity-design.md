# Android–Web Reporting Parity Design

## Intent

Menyamakan angka dan ruang lingkup laporan Android dan web untuk periode serta toko/gudang yang sama. Owner harus memperoleh hasil yang konsisten ketika memilih satu cabang atau seluruh cabang; dashboard, penutupan, riwayat, dan keuangan tidak boleh menghitung filter secara berbeda di masing-masing klien.

## Goals

- Dashboard penjualan mengikuti `start`/`end` yang dipilih dan menyediakan data rentang yang dipakai Android maupun web.
- Penutupan owner memakai scope yang sama, termasuk agregasi `Semua Toko/Gudang`.
- Print penutupan Android memuat pengeluaran dan pemasukan.
- Riwayat transaksi dan keuangan Android memakai preset, rentang, search, status/kategori/metode, pagination, serta scope cabang yang setara dengan web.
- Regression test menjaga nama parameter, field respons, dan perilaku scope agar parity tidak mundur.

## Non-goals

- Mengubah rumus harga, stok, pembayaran, retur, atau status transaksi.
- Mengubah desain visual besar halaman dashboard/riwayat/keuangan.
- Mengubah format data offline selain menyaringnya mengikuti periode/filter aktif.

## Constraints

- Backend tetap memakai `SALES_STATUSES_SQL`, `localDateString`, `parseOwnerBranchId`, dan logika closing yang sudah ada.
- `branch_id=all` berarti seluruh cabang aktif hanya untuk owner; role lain tetap dibatasi cabangnya sendiri.
- Periode memakai tanggal bisnis WIB dalam format `YYYY-MM-DD`.
- Pagination riwayat dan keuangan menggunakan 20 baris per halaman agar web dan Android konsisten.
- Perubahan Android tetap mempertahankan offline cache dan antrean sinkronisasi.

## Approaches

1. **Kontrak backend tunggal (dipilih).** Backend menghitung rentang dan scope owner; kedua klien meminta parameter yang sama dan merender field hasil yang sama. Ini menghindari perbedaan akibat status retur, pembatalan, atau agregasi lokal.
2. **Perhitungan terpisah per klien.** Lebih sedikit perubahan backend tetapi akan menggandakan aturan bisnis dan mudah kembali berbeda.

Kontrak backend tunggal dipilih karena parity angka adalah tujuan utama dan sudah ada endpoint `reports/overview` sebagai pola kanonik.

## Design

`GET /api/dashboard` mempertahankan field ringkasan legacy dan menambahkan `selected_period`, `selected_summary`, `selected_sales_trend`, `selected_payment_breakdown`, `selected_recent_transactions`, dan `selected_stores` yang dihitung dari `start`/`end`. Dashboard web dan mode kasir Android memakai field rentang tersebut.

`GET /api/reports/daily-closing?date=...&branch_id=all` mengembalikan penutupan gabungan seluruh cabang aktif untuk owner. Penjumlahan dilakukan di backend melalui data penutupan per cabang, termasuk `methods`, `expenses`, `income`, dan `expected_total`; web dan Android meminta endpoint yang sama.

Android `printClosing` menerima dan mencetak `expenses` serta `income`. Riwayat Android memakai periode default bulan berjalan, preset yang sama dengan web, search/status/rentang, dan limit 20. Keuangan Android menambahkan rentang, kategori, metode, search, serta pagination melalui endpoint `/finance/expenses` yang sudah mendukung parameter tersebut.

## Regression coverage

Tambahkan test parity yang membaca kontrak source web/Flutter dan test backend untuk endpoint dashboard rentang serta closing `all`. Test harus gagal sebelum field/parameter baru tersedia, kemudian lulus setelah implementasi.

## Open builder decisions

- Untuk owner scope `all`, penutupan Android boleh ditampilkan dan dicetak hanya jika store settings spesifik tersedia; data laporan tetap dapat ditampilkan. Jika tidak ada setting gabungan, tombol print Android tetap disabled agar header toko tidak salah.
- Retur pada halaman riwayat tetap mengikuti endpoint existing; filter utama yang disamakan adalah transaksi.
