# Sidebar Mobile Lebih Rapat

## Intent

Memendekkan scroll pada drawer/sidebar Android dengan mengurangi ruang kosong antar grup dan menu, tanpa mengubah desain visual, urutan menu, atau kenyamanan ketuk.

## Goals

- Jarak antar grup dan spacer yang berulang dibuat lebih rapat.
- Tinggi minimum setiap item interaktif, termasuk header grup expand/collapse, tetap 44 logical px.
- Semua role dan menu tetap tersedia seperti sekarang.
- Perubahan tetap rapi pada lebar 320 dan 390 logical px.

## Non-goals

- Tidak mengubah warna, ikon, tipografi, label, atau urutan menu.
- Tidak mengubah perilaku grup expand/collapse.
- Tidak membuat grup tertutup secara default.

## Approaches

1. **Rapat aman (dipilih):** kurangi spacer, margin, dan padding kosong antar grup; pertahankan target sentuh 44 px.
2. **Sangat padat:** kurangi tinggi item menu juga; scroll lebih singkat tetapi target sentuh lebih kecil.
3. **Grup tertutup default:** sidebar langsung pendek tetapi pengguna harus membuka grup untuk melihat item.

Opsi 1 dipilih karena memenuhi tujuan tanpa mengubah desain yang sudah disetujui atau mengorbankan aksesibilitas sentuh.

## Implementation decisions

- Perubahan dipusatkan pada `mobile/lib/src/more_page.dart`.
- Tambahkan regression test layout pada `mobile/test/shared_shell_visual_test.dart` yang membuktikan item menu tetap memiliki tinggi minimum dan jarak antar grup tidak melebihi baseline baru.
- Validasi dengan test sidebar pada viewport 320/390 px dan build APK release split-per-ABI.
