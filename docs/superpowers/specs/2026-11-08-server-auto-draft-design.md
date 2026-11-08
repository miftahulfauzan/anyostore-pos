# Draft Server Otomatis dari POS Android

## Intent

Saat POS Android berisi keranjang lalu aplikasi masuk background/ditutup, keranjang disimpan sebagai Draft server agar dapat dilanjutkan dari perangkat atau sesi lain. Penyimpanan lokal tetap dipertahankan sebagai fallback saat jaringan tidak tersedia.

## Goals

- Mengirim keranjang aktif ke endpoint hold pada lifecycle `paused`/`detached`.
- Tidak membuat draft ganda ketika Android mengirim beberapa event lifecycle.
- Mempertahankan isi, harga, qty, diskon, catatan, pelanggan, dan cabang.
- Draft server dapat dipilih dan dibuka kembali seperti draft manual yang sudah ada.

## Non-goals

- Tidak mengubah checkout, perhitungan harga, atau pembayaran.
- Tidak menghapus draft server lama milik pengguna.
- Tidak menjadikan jaringan sebagai syarat untuk menyimpan keranjang.

## Approaches

1. Hanya mengandalkan local draft: paling sederhana, tetapi tidak memenuhi kebutuhan draft server.
2. Hold server best-effort tanpa idempotensi: mudah, tetapi lifecycle Android dapat membuat duplikat.
3. Hold server best-effort dengan `client_hold_id` idempoten dan fallback lokal: dipilih karena tetap ringan, aman terhadap retry, dan kompatibel dengan hold manual.

## Implementation

- Tambahkan `client_hold_id` unik nullable pada `pending_transactions` melalui migrasi baru.
- Endpoint hold melakukan upsert berdasarkan ID tersebut dan mengembalikan ID draft yang sama saat retry.
- Mobile menyimpan ID itu dalam snapshot lokal, mengirimnya saat auto-hold maupun hold manual, dan menjaga satu request in-flight.
- Setelah server berhasil, snapshot lokal dikosongkan; jika gagal, snapshot lokal tidak disentuh.

## Acceptance

- Satu cart menghasilkan paling banyak satu draft server meskipun lifecycle dipanggil berulang.
- Offline/background failure tidak menghilangkan cart.
- Test backend dan Flutter membuktikan idempotensi serta auto-hold lifecycle.
