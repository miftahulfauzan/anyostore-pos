# Dokumentasi POS Pakaian

Dokumentasi lengkap untuk sistem Point of Sale (POS) pakaian profesional.

## Statistik

| Metrik | Value |
|--------|-------|
| Total Dokumen | 22 file |
| Database Tables | 47 tabel |
| API Endpoints | 167 endpoint |
| User Roles | 5 level |

## Daftar Isi

| No | File | Deskripsi |
|----|------|-----------|
| 1 | [01-fitur-utama.md](01-fitur-utama.md) | Semua fitur: produk, POS, stok, laporan, gudang, biaya, pembukuan, mobile |
| 2 | [02-tech-stack.md](02-tech-stack.md) | Tech stack: Next.js, Express, MySQL, Flutter |
| 3 | [03-database.md](03-database.md) | Schema database 47 tabel dengan ER diagram |
| 4 | [04-api-endpoints.md](04-api-endpoints.md) | 167 REST API endpoints |
| 5 | [05-halaman-ui.md](05-halaman-ui.md) | Wireframe UI: login, dashboard, POS, produk, laporan |
| 6 | [06-alur-bisnis.md](06-alur-bisnis.md) | 15 flowchart alur bisnis |
| 7 | [07-printer-thermal.md](07-printer-thermal.md) | ESC/POS commands, template struk 58mm/80mm |
| 8 | [08-contoh-kode.md](08-contoh-kode.md) | 11 contoh kode: API, frontend, mobile |
| 9 | [09-struktur-direktori.md](09-struktur-direktori.md) | Struktur folder project |
| 10 | [10-pengaturan.md](10-pengaturan.md) | Environment variables, seed data |
| 11 | [11-catatan-implementasi.md](11-catatan-implementasi.md) | Tips: barcode, security, performance |
| 12 | [12-migration.sql](12-migration.sql) | SQL DDL lengkap 47 tabel + seed data |
| 13 | [13-mockup-visual.md](13-mockup-visual.md) | 15 mockup visual ASCII |
| 14 | [14-testing-strategy.md](14-testing-strategy.md) | Strategi testing: unit, integration, E2E, load |
| 15 | [15-deployment.md](15-deployment.md) | Deployment: Docker, CI/CD, production setup |
| 16 | [16-security.md](16-security.md) | Security: JWT, RBAC, rate limiting, encryption |
| 17 | [17-error-handling-logging.md](17-error-handling-logging.md) | Error handling, logging, monitoring |
| 18 | [18-supplier-purchase-orders.md](18-supplier-purchase-orders.md) | Manajemen supplier & purchase order |
| 19 | [19-cash-reconciliation.md](19-cash-reconciliation.md) | Cash drawer, Z-Report, reconciliation |
| 20 | [20-accessibility.md](20-accessibility.md) | Aksesibilitas: WCAG 2.1, keyboard nav, ARIA |
| 21 | [21-setup-flutter.md](21-setup-flutter.md) | Setup Flutter mobile app: install, dependencies, screens, services |
| 22 | [22-dark-mode-receipt-scheduling.md](22-dark-mode-receipt-scheduling.md) | Dark mode, receipt custom, employee scheduling |

## Struktur Folder

```
pos-pakaian/
├── README.md
├── docs/
│   ├── 01-fitur-utama.md
│   ├── 02-tech-stack.md
│   ├── ...
│   ├── 20-accessibility.md
│   ├── 21-setup-flutter.md
│   └── 22-dark-mode-receipt-scheduling.md
├── backend/
├── frontend/
├── mobile/
└── docker/
```
