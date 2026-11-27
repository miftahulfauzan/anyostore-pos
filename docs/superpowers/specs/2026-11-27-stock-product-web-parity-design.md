# Stok Produk Web/PWA mengikuti APK

Tanggal: 2026-11-27 · Status: disetujui melalui pratinjau visual.

## Intent

Samakan halaman **Stok Produk** web/PWA dengan hierarki layar APK agar total stok, kondisi stok, dan daftar produk mudah dipindai di HP. Desktop tetap mempertahankan perbandingan jumlah per gudang.

## Goals

- Hero denim menampilkan total stok, jumlah produk, scope aktif, donut status Aman/Menipis/Habis, dan legend yang dapat dibaca tanpa mengandalkan warna saja.
- PWA memakai chip status, pencarian, dan satu kontrol ringkas untuk kategori, urut, serta ekspor.
- Daftar HP berbentuk baris datar dengan foto 1:1, identitas produk, jumlah total, status, dan rincian gudang/rak yang tetap bisa diedit.
- Desktop memakai hero yang sama di atas tabel matriks per gudang, dengan status produk sebagai kolom tambahan.
- Search, kategori, scope role/cabang, ekspor, cetak, pagination, dan edit posisi rak tetap tersedia.

## Non-goals

- Tidak mengubah APK, skema, harga, jalur tulis stok, atau aturan mutasi stok.
- Bentuk response API tetap sama; daftar stok mencakup produk aktif tanpa baris saldo sebagai stok 0, dan agregat ringkasan Habis memakai batas `total_stock <= 0` agar konsisten dengan status APK.
- Tidak mengganti tabel desktop dengan katalog foto atau mengubah perilaku mutasi stok.
- Tidak menambah dependency atau aturan CSS global `button`/`a`.

## Constraints

- Stok adalah satu angka per produk per gudang; varian tidak menjadi pilihan stok.
- Daftar web dimulai dari produk aktif, lalu left join gudang aktif dan saldo produk (`variant_id IS NULL`). Produk tanpa gudang aktif pun tetap memiliki identitas produk dan jumlah 0.
- Pakai `SafeImage` yang sudah ada dan token tipografi web di `globals.css`.
- Pertahankan tema terang/gelap, mode cetak, akses keyboard, pesan loading/error/empty, dan tap target mobile.
- Halaman default tetap memakai pagination 40 produk. Filter status dan pilihan urut selain nama A–Z dapat memakai endpoint yang sama tanpa parameter limit agar seluruh hasil yang cocok tetap akurat.

## Approaches

| Opsi | Bentuk | Trade-off |
|---|---|---|
| A — APK hanya di HP | Hero dan baris status di mobile, ringkasan lama di desktop | Desktop tetap punya dua hierarki stok yang berbeda. |
| **B — Hero bersama, tabel desktop tetap (dipilih)** | Ringkasan dan kontrol mengikuti APK di semua ukuran; desktop tetap punya matriks gudang | Paling konsisten sambil mempertahankan fungsi penting desktop. |
| C — Daftar APK di semua ukuran | Semua layar memakai baris produk yang sama | Menghilangkan perbandingan gudang berdampingan dan edit rak per gudang. |

## Keputusan implementasi

- **Opsi B** dipilih; pemilik menyetujui mockup APK dan PWA sebelum implementasi.
- Donut menggunakan `conic-gradient` CSS tanpa library chart.
- Status aktif dan urut selain nama A–Z memuat hasil lengkap dari endpoint stok yang sama agar filter/urut berlaku ke seluruh hasil. Pencarian/kategori/scope aktif tetap ikut pada permintaan; tampilan default tetap 40 produk per halaman.
- Kategori, urut, serta Unduh Excel/PDF tetap tampak langsung di desktop; di HP masuk ke panel kontrol ringkas dari tombol filter.
