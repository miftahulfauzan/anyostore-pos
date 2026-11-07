# Desain Penutupan Kas: Keuangan Masuk ke Arus Kas

## Intent

Membuat penutupan dan laci kas menghitung kas fisik secara konsisten. Pengeluaran/pemasukan dari menu Keuangan harus ikut ke arus kas sesuai metode pembayaran, sehingga pengeluaran tunai mengurangi kas penjualan dan pemasukan tunai menambahnya.

## Goals

- Menampilkan seluruh pengeluaran dan pemasukan pada ringkasan penutupan seperti sekarang.
- Memasukkan hanya entri Keuangan dengan `payment_method = 'cash'` ke “Kas Masuk-Keluar”.
- Menghitung kas fisik dengan rumus:
  `Kas Penjualan - Pengembalian - Pembatalan + Kas Masuk-Keluar`.
- Menjaga mutasi manual laci kas tetap dihitung.
- Menggunakan rumus yang sama pada `daily-closing` dan `cash-drawer` expected cash.

## Non-goals

- Tidak membuat ulang entri Keuangan menjadi `cash_drawer_movements`; keduanya tetap sumber data berbeda agar edit/hapus Keuangan tidak meninggalkan mutasi yatim.
- Tidak memasukkan pengeluaran/pemasukan transfer atau debit ke kas fisik.
- Tidak mengubah perhitungan laba-rugi atau total pengeluaran pada dashboard.
- Tidak menghitung refund/retur dua kali; refund tetap mengikuti `returns`/alur refund yang sudah ada.

## Pendekatan yang dipilih

Gunakan satu helper arus kas bersama untuk menjumlahkan mutasi manual dan entri Keuangan tunai. `reports/daily-closing` mengambil net manual + net Keuangan tunai berdasarkan tanggal laporan. `cash-drawer` mengambil net yang sama berdasarkan rentang waktu laci terbuka. `closing-math` menerima net gabungan tersebut sebagai satu penyesuaian kas.

## Aturan data

- `expense` bernilai negatif pada arus kas.
- `income` bernilai positif pada arus kas.
- Hanya `status = 'approved'` yang dihitung.
- Mutasi manual `cash_in` positif dan `cash_out` negatif.
- Refund/retur tidak masuk lagi ke mutasi manual jika sudah dihitung melalui rincian pembayaran retur.

## Verifikasi

- Tambahkan unit test untuk gabungan kas masuk, kas keluar, dan mutasi manual.
- Tambahkan regression test agar query penutupan memakai entri Keuangan tunai.
- Pastikan test backend penuh dan build frontend tetap lulus.
