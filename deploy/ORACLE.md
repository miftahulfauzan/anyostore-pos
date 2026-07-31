# Deployment Oracle Cloud Always Free

Paket production menjalankan frontend, API, MySQL, dan reverse proxy HTTPS dalam satu VM. Database tidak membuka port ke internet. Hanya port 80 dan 443 yang perlu dibuka.

## Kebutuhan VM

- Ubuntu 24.04 ARM64 atau Oracle Linux ARM64
- VM.Standard.A1.Flex Always Free
- Minimal 2 OCPU dan 12 GB RAM jika tersedia
- Boot volume minimal 50 GB
- Public IPv4

## Persiapan akun dan jaringan

1. Buat VM pada home region akun Oracle.
2. Tambahkan ingress TCP 80 dan 443 pada Security List atau Network Security Group.
3. Jangan membuka port 3000, 3001, atau 3306 ke internet.
4. Arahkan DNS domain ke public IPv4 VM. Jika belum memiliki domain, gunakan mode HTTP berbasis IP hanya selama pengujian awal.

## Persiapan aplikasi di server

1. Pasang Docker Engine, Docker Compose plugin, Git, dan firewall.
2. Salin source aplikasi ke server.
3. Buat folder `uploads`, lalu pastikan UID 1000 dapat menulis ke folder tersebut.
4. Salin `.env.production.example` menjadi `.env.production` dan ganti seluruh rahasia.
5. Jalankan:

   ```sh
   docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
   ```

## Verifikasi

- Buka `/api/health` dan pastikan status `ok`.
- Login sebagai owner dan admin masing-masing toko.
- Uji upload gambar, transaksi, cetak struk, dan pergantian toko owner.
- Jalankan backup dan pastikan berkas SQL serta arsip upload terbentuk.

## Backup

Jalankan dari folder aplikasi:

```sh
sh scripts/backup-production.sh
```

Simpan salinan backup di perangkat lain. Jangan mengandalkan satu-satunya salinan yang berada di VM.
