# 22. Dark Mode, Receipt Customization & Employee Scheduling

## 22.1 Dark Mode

### Konsep

Dark mode mengurangi kecerahan layar untuk kenyamanan kasir yang bekerja berjam-jam, terutama di malam hari atau tempat dengan pencahayaan minim.

### Color Palette

```css
/* Light Mode (Default) */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f9fafb;
  --bg-tertiary: #f3f4f6;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --border-color: #e5e7eb;
  --accent-color: #2563eb;
}

/* Dark Mode */
:root[data-theme="dark"] {
  --bg-primary: #111827;
  --bg-secondary: #1f2937;
  --bg-tertiary: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --border-color: #4b5563;
  --accent-color: #3b82f6;
}
```

### Konfigurasi per User

| Setting | Tipe | Default |
|---------|------|---------|
| theme | enum | 'light', 'dark', 'system' |
| auto_switch | boolean | true (ikut sistem) |

### Implementasi Frontend (Next.js)

```javascript
// frontend/src/hooks/useTheme.js
import { useEffect, useState } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState('light');
  
  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'system';
    setTheme(saved);
    applyTheme(saved);
  }, []);
  
  const applyTheme = (newTheme) => {
    const root = document.documentElement;
    
    if (newTheme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', newTheme);
    }
  };
  
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };
  
  return { theme, toggleTheme };
}
```

### Implementasi Flutter

```dart
// lib/providers/theme_provider.dart
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ThemeProvider extends ChangeNotifier {
  ThemeMode _themeMode = ThemeMode.light;
  
  ThemeMode get themeMode => _themeMode;
  
  ThemeProvider() {
    _loadTheme();
  }
  
  Future<void> _loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    final theme = prefs.getString('theme') ?? 'system';
    _themeMode = _getThemeMode(theme);
    notifyListeners();
  }
  
  Future<void> setTheme(String theme) async {
    _themeMode = _getThemeMode(theme);
    
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('theme', theme);
    
    notifyListeners();
  }
  
  ThemeMode _getThemeMode(String theme) {
    switch (theme) {
      case 'dark':
        return ThemeMode.dark;
      case 'light':
        return ThemeMode.light;
      default:
        return ThemeMode.system;
    }
  }
}

// lib/config/theme.dart
import 'package:flutter/material.dart';

class AppTheme {
  static ThemeData lightTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xFF2563EB),
      brightness: Brightness.light,
    ),
    scaffoldBackgroundColor: const Color(0xFFF9FAFB),
    cardColor: Colors.white,
  );
  
  static ThemeData darkTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xFF3B82F6),
      brightness: Brightness.dark,
    ),
    scaffoldBackgroundColor: const Color(0xFF111827),
    cardColor: const Color(0xFF1F2937),
  );
}
```

### Toggle Widget

```dart
// lib/widgets/theme_toggle.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/theme_provider.dart';

class ThemeToggle extends StatelessWidget {
  const ThemeToggle({super.key});

  @override
  Widget build(BuildContext context) {
    final themeProvider = context.watch<ThemeProvider>();
    
    return SegmentedButton<ThemeMode>(
      segments: const [
        ButtonSegment(
          value: ThemeMode.light,
          icon: Icon(Icons.light_mode),
          label: Text('Terang'),
        ),
        ButtonSegment(
          value: ThemeMode.dark,
          icon: Icon(Icons.dark_mode),
          label: Text('Gelap'),
        ),
        ButtonSegment(
          value: ThemeMode.system,
          icon: Icon(Icons.brightness_auto),
          label: Text('Sistem'),
        ),
      ],
      selected: {themeProvider.themeMode},
      onSelectionChanged: (Set<ThemeMode> modes) {
        themeProvider.setTheme(modes.first.name);
      },
    );
  }
}
```

---

## 22.2 Receipt Customization

### Pengaturan Struk

| Field | Tipe | Default | Keterangan |
|-------|------|---------|------------|
| store_logo | Image | - | Logo toko (max 200x200px) |
| receipt_header | Text | 'Terima kasih telah berbelanja' | Pesan atas struk |
| receipt_footer | Text | 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan' | Pesan bawah struk |
| show_logo | Boolean | true | Tampilkan logo |
| show_qr | Boolean | true | Tampilkan QR code transaksi |
| show_cashier | Boolean | true | Tampilkan nama kasir |
| show_barcode | Boolean | false | Tampilkan barcode invoice |
| custom_message | Text | '' | Pesan tambahan (opsional) |

### Template Struk dengan Logo

```
┌──────────────────────────────────────┐
│           [LOGO TOKO]                │
│                                      │
│         TOKO PAKAIAN ANDA            │
│     Jl. Contoh No. 123, Kota         │
│        Telp: 081234567890            │
│──────────────────────────────────────│
│ Invoice: INV-20260708-0001           │
│ Kasir: Ahmad                         │
│ Tgl: 08/07/2026 14:30                │
│──────────────────────────────────────│
│ Item              Qty    Total       │
│──────────────────────────────────────│
│ Kaos Polos M/Hitam  2   Rp110.000   │
│ Kemeja Flanel L/Biru 1  Rp150.000   │
│──────────────────────────────────────│
│ Subtotal:              Rp260.000     │
│ Diskon:               -Rp10.000      │
│ TOTAL:                 Rp250.000     │
│──────────────────────────────────────│
│ TUNAI:                 Rp250.000     │
│ Kembalian:             Rp0           │
│──────────────────────────────────────│
│     [QR CODE TRANSAKSI]              │
│                                      │
│ Terima kasih telah berbelanja di     │
│ Toko Pakaian Anda!                   │
│                                      │
│ Ikuti kami: @tokopakaian             │
│──────────────────────────────────────│
│ Barang yang sudah dibeli             │
│ tidak dapat ditukar/dikembalikan     │
└──────────────────────────────────────┘
```

### Form Pengaturan Struk

```
┌──────────────────────────────────────────────────────────────────┐
│ ⚙️ Pengaturan Struk                                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Logo Toko:                                                      │
│  ┌─────────────────┐                                             │
│  │     [LOGO]      │  [Upload Logo] [Hapus]                      │
│  │                 │  Format: JPG, PNG (max 200x200px)           │
│  └─────────────────┘                                             │
│                                                                   │
│  Pesan Header:                                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Terima kasih telah berbelanja di Toko Pakaian Anda!         ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                   │
│  Pesan Footer:                                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Barang yang sudah dibeli tidak dapat ditukar/dikembalikan   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                   │
│  Pesan Tambahan (opsional):                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Ikuti kami: @tokopakaian | WA: 081234567890                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                   │
│  Opsi Tampilan:                                                   │
│  ☑️ Tampilkan Logo                                               │
│  ☑️ Tampilkan QR Code Transaksi                                  │
│  ☑️ Tampilkan Nama Kasir                                         │
│  ☐ Tampilkan Barcode Invoice                                     │
│                                                                   │
│  Preview:                                                        │
│  ┌─────────────────────────────────────┐                        │
│  │ [Preview struk akan tampil di sini] │                        │
│  └─────────────────────────────────────┘                        │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ 💾 Simpan        │  │ 🖨️ Test Print    │                     │
│  └──────────────────┘  └──────────────────┘                     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Backend API

```javascript
// backend/src/routes/settings.js
router.put('/receipt', authenticate, authorize(['owner']), async (req, res) => {
  const {
    receipt_header,
    receipt_footer,
    custom_message,
    show_logo,
    show_qr,
    show_cashier,
    show_barcode
  } = req.body;
  
  const settings = [
    ['receipt_header', receipt_header],
    ['receipt_footer', receipt_footer],
    ['custom_message', custom_message],
    ['show_logo', show_logo],
    ['show_qr', show_qr],
    ['show_cashier', show_cashier],
    ['show_barcode', show_barcode]
  ];
  
  for (const [key, value] of settings) {
    await db.query(
      `INSERT INTO store_settings (branch_id, \`key\`, \`value\`) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE \`value\` = ?`,
      [req.user.branch_id, key, value, value]
    );
  }
  
  res.json({ success: true, message: 'Pengaturan struk diperbarui' });
});

// Upload logo
router.post('/receipt/logo', authenticate, authorize(['owner']), 
  upload.single('logo'), async (req, res) => {
    const logoPath = `/uploads/${req.file.filename}`;
    
    await db.query(
      `INSERT INTO store_settings (branch_id, \`key\`, \`value\`) 
       VALUES (?, 'store_logo', ?) 
       ON DUPLICATE KEY UPDATE \`value\` = ?`,
      [req.user.branch_id, logoPath, logoPath]
    );
    
    res.json({ success: true, data: { path: logoPath } });
});
```

### Generate Struk dengan Logo

```javascript
// backend/src/services/receiptService.js
async function generateReceipt(transactionId) {
  const [tx] = await db.query(
    `SELECT t.*, u.name as cashier_name
     FROM transactions t
     JOIN users u ON t.user_id = u.id
     WHERE t.id = ?`,
    [transactionId]
  );
  
  const [settings] = await db.query(
    `SELECT \`key\`, \`value\` FROM store_settings 
     WHERE branch_id = ? AND \`key\` IN (
       'store_name', 'store_address', 'store_phone',
       'receipt_header', 'receipt_footer', 'custom_message',
       'store_logo', 'show_logo', 'show_qr', 'show_cashier', 'show_barcode'
     )`,
    [tx.branch_id]
  );
  
  const config = {};
  for (const s of settings) config[s.key] = s.value;
  
  const [items] = await db.query(
    'SELECT * FROM transaction_items WHERE transaction_id = ?',
    [transactionId]
  );
  
  return {
    store: {
      name: config.store_name,
      address: config.store_address,
      phone: config.store_phone,
      logo: config.show_logo === 'true' ? config.store_logo : null
    },
    transaction: {
      invoice_no: tx.invoice_no,
      cashier: config.show_cashier === 'true' ? tx.cashier_name : null,
      datetime: tx.created_at,
      items: items.map(i => ({
        name: i.product_name,
        variant: i.variant_detail,
        qty: i.quantity,
        price: i.price,
        total: i.subtotal
      })),
      subtotal: tx.subtotal,
      discount: tx.discount,
      grand_total: tx.grand_total,
      payment_method: tx.payment_method,
      paid: tx.amount_paid,
      change: tx.change
    },
    config: {
      header: config.receipt_header,
      footer: config.receipt_footer,
      custom_message: config.custom_message,
      show_qr: config.show_qr === 'true',
      show_barcode: config.show_barcode === 'true'
    }
  };
}
```

---

## 22.3 Employee Scheduling

### Catatan Schema

> Tabel `employee_schedules` (tabel 34) dan `shift_templates` (tabel 33) sudah ditambahkan ke `12-migration.sql`.
> Tabel `shifts` (tabel 29) digunakan untuk tracking shift aktif kasir (check-in/check-out per sesi).
> Tabel `employee_schedules` untuk jadwal mingguan/bulanan karyawan (jadwal tetap).
> Tabel `shift_templates` untuk menyimpan template jam kerja (Pagi/Sore/Malam).

### Konsep

Sistem jadwal shift otomatis untuk mengatur jam kerja karyawan, mencegah overlap shift, dan memudahkan penggajian.

### Data Shift

| Field | Tipe | Keterangan |
|-------|------|------------|
| id | INT | Primary key |
| branch_id | INT | Cabang |
| user_id | INT | Karyawan |
| shift_template_id | INT | FK → shift_templates.id (template shift) |
| schedule_date | DATE | Tanggal shift |
| start_time | TIME | Jam mulai |
| end_time | TIME | Jam selesai |
| status | ENUM | scheduled, active, completed, absent |
| check_in | TIMESTAMP | Jam masuk aktual |
| check_out | TIMESTAMP | Jam pulang aktual |
| is_late | BOOLEAN | Terlambat atau tidak |
| late_minutes | INT | Jumlah menit terlambat |
| duration_minutes | INT | Durasi kerja (menit) |
| notes | TEXT | Catatan |

### Template Shift

| Nama Shift | Jam | Keterangan |
|------------|-----|------------|
| Pagi | 08:00 - 14:00 | 6 jam |
| Sore | 14:00 - 20:00 | 6 jam |
| Malam | 20:00 - 02:00 | 6 jam |
| Full Day | 08:00 - 20:00 | 12 jam (2 shift) |

### Jadwal Mingguan

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📅 Jadwal Shift - Juli 2026                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Karyawan    │ Sen  │ Sel  │ Rab  │ Kam  │ Jum  │ Sab  │ Min  │            │
│  ────────────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤            │
│  Ahmad       │ Pagi │ Pagi │ Pagi │ OFF  │ Pagi │ Pagi │ OFF  │            │
│  Budi        │ OFF  │ Sore │ Sore │ Sore │ OFF  │ Sore │ Sore │            │
│  Citra       │ Sore │ OFF  │ Pagi │ Pagi │ Sore │ OFF  │ Pagi │            │
│  Dian        │ Pagi │ Pagi │ OFF  │ Sore │ OFF  │ Pagi │ Sore │            │
│                                                                              │
│  Legenda: Pagi (08-14) | Sore (14-20) | OFF (Libur)                         │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │ + Tambah Shift│  │ 📤 Export    │  │ 🖨️ Print     │                       │
│  └──────────────┘  └──────────────┘  └──────────────┘                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Form Tambah Shift

```
┌──────────────────────────────────────────────────────────────────┐
│ + Tambah Shift                                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Karyawan: ┌──────────────────────────────────────────────┐     │
│            │ Ahmad (Kasir)                               ▼ │     │
│            └──────────────────────────────────────────────┘     │
│                                                                   │
│  Tanggal: ┌──────────────┐  Sampai: ┌──────────────┐           │
│           │ 07/07/2026   │          │ 13/07/2026   │           │
│           └──────────────┘          └──────────────┘           │
│                                                                   │
│  Shift: ┌────────────────────────────────────────────────────┐ │
│         │ Pagi (08:00 - 14:00)                              ▼ │ │
│         └────────────────────────────────────────────────────┘ │
│                                                                   │
│  Atau input manual:                                              │
│  Jam Mulai: ┌──────────┐  Jam Selesai: ┌──────────┐           │
│             │ 08:00    │               │ 14:00    │           │
│             └──────────┘               └──────────┘           │
│                                                                   │
│  Ulangi: [ 5 hari kerja, libur 2 hari ]                         │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Preview:                                                │    │
│  │ Sen 07/07: Pagi (08-14)                                │    │
│  │ Sel 08/07: Pagi (08-14)                                │    │
│  │ Rab 09/07: Pagi (08-14)                                │    │
│  │ Kam 10/07: OFF                                          │    │
│  │ Jum 11/07: Pagi (08-14)                                │    │
│  │ Sab 12/07: Pagi (08-14)                                │    │
│  │ Min 13/07: OFF                                          │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ 💾 Simpan        │  │ ❌ Batal         │                     │
│  └──────────────────┘  └──────────────────┘                     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Check-in / Check-out

```
┌──────────────────────────────────────────────────────────────────┐
│ ⏰ Check In / Out                                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Hari Ini: Senin, 07 Juli 2026                                   │
│  Shift: Pagi (08:00 - 14:00)                                     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │                                                         │     │
│  │              [FINGERPRINT/SCAN AREA]                    │     │
│  │                                                         │     │
│  │         Atau tekan tombol di bawah:                     │     │
│  │                                                         │     │
│  │    ┌─────────────────────────────────────────┐         │     │
│  │    │         ✅ CHECK IN                      │         │     │
│  │    │         Jam: 07:58:32                    │         │     │
│  │    └─────────────────────────────────────────┘         │     │
│  │                                                         │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Status Hari Ini:                                                 │
│  Check In:  07:58:32 ✅                                          │
│  Check Out: -                                                    │
│  Durasi:    -                                                    │
│                                                                   │
│  Riwayat 7 Hari Terakhir:                                        │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │ Tanggal  │ Shift    │ Masuk    │ Pulang   │ Durasi   │      │
│  ├──────────┼──────────┼──────────┼──────────┼──────────┤      │
│  │ 07 Jul   │ Pagi     │ 07:58    │ -        │ -        │      │
│  │ 06 Jul   │ OFF      │ -        │ -        │ -        │      │
│  │ 05 Jul   │ Pagi     │ 08:02    │ 14:05    │ 6j 3m    │      │
│  │ 04 Jul   │ Pagi     │ 07:55    │ 14:00    │ 6j 5m    │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Laporan Kehadiran

```
┌──────────────────────────────────────────────────────────────────┐
│ 📊 Laporan Kehadiran - Juli 2026                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Periode: 01 - 13 Juli 2026                                      │
│                                                                   │
│  Ringkasan:                                                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Total Hari Kerja:    25 hari                               │  │
│  │ Hadir:               22 hari (88%)                         │  │
│  │ Terlambat:           3 hari (12%)                          │  │
│  │ Alpha:               0 hari                                │  │
│  │ Izin:                0 hari                                │  │
│  │ Lembur:              5 jam                                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Detail per Karyawan:                                             │
│  ┌──────────┬────────┬────────┬────────┬────────┬────────┐     │
│  │ Nama     │ Hadir  │ Terlambat│ Alpha │ Lembur │ Rata2  │     │
│  ├──────────┼────────┼────────┼────────┼────────┼────────┤     │
│  │ Ahmad    │ 22/25  │ 2      │ 0      │ 3 jam  │ 6j 2m  │     │
│  │ Budi     │ 21/25  │ 1      │ 0      │ 2 jam  │ 6j 0m  │     │
│  │ Citra    │ 23/25  │ 0      │ 0      │ 0 jam  │ 6j 0m  │     │
│  │ Dian     │ 20/25  │ 0      │ 0      │ 0 jam  │ 5j 58m │     │
│  └──────────┴────────┴────────┴────────┴────────┴────────┘     │
│                                                                   │
│  [ Export Excel ]  [ Export PDF ]  [ Print ]                      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Backend API

```javascript
// backend/src/routes/schedules.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/schedules - List jadwal
router.get('/', authenticate, async (req, res) => {
  const { start_date, end_date, user_id } = req.query;
  
  let query = `
    SELECT s.*, u.name as user_name, u.role as user_role,
           st.name as shift_name
    FROM employee_schedules s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN shift_templates st ON s.shift_template_id = st.id
    WHERE s.branch_id = ?
  `;
  const params = [req.user.branch_id];
  
  if (start_date) { query += ' AND s.schedule_date >= ?'; params.push(start_date); }
  if (end_date) { query += ' AND s.schedule_date <= ?'; params.push(end_date); }
  if (user_id) { query += ' AND s.user_id = ?'; params.push(user_id); }
  
  query += ' ORDER BY s.schedule_date, s.start_time';
  
  const [rows] = await db.query(query, params);
  res.json({ data: rows });
});

// POST /api/schedules - Buat jadwal
router.post('/', authenticate, authorize(['owner', 'manager']), async (req, res) => {
  const { user_id, schedule_date, shift_template_id, start_time, end_time } = req.body;
  
  // Cek overlap
  const [existing] = await db.query(
    `SELECT * FROM employee_schedules 
     WHERE user_id = ? AND schedule_date = ?
     AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?))`,
    [user_id, schedule_date, end_time, start_time, end_time, start_time]
  );
  
  if (existing.length > 0) {
    return res.status(400).json({ message: 'Shift overlap dengan jadwal yang sudah ada' });
  }
  
  const [result] = await db.query(
    `INSERT INTO employee_schedules 
     (branch_id, user_id, shift_template_id, schedule_date, start_time, end_time, status)
     VALUES (?, ?, ?, ?, ?, ?, 'scheduled')`,
    [req.user.branch_id, user_id, shift_template_id, schedule_date, start_time, end_time]
  );
  
  res.json({ success: true, data: { id: result.insertId } });
});

// POST /api/schedules/check-in
router.post('/check-in', authenticate, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  
  const [schedule] = await db.query(
    `SELECT * FROM employee_schedules 
     WHERE user_id = ? AND schedule_date = ? AND status = 'scheduled'`,
    [req.user.id, today]
  );
  
  if (schedule.length === 0) {
    return res.status(400).json({ message: 'Tidak ada shift hari ini' });
  }
  
  const now = new Date();
  const shift = schedule[0];
  
  // Cek keterlambatan
  const isLate = now.toTimeString() > shift.start_time;
  
  // Hitung menit terlambat
  const [shiftTime] = await db.query(
    'SELECT start_time FROM shift_templates WHERE id = ?',
    [shift.shift_template_id]
  );
  let lateMinutes = 0;
  if (isLate && shiftTime.length > 0) {
    const scheduled = new Date(`1970-01-01T${shiftTime[0].start_time}`);
    const actual = new Date(`1970-01-01T${now.toTimeString().slice(0, 8)}`);
    lateMinutes = Math.floor((actual - scheduled) / 60000);
  }
  
  await db.query(
    `UPDATE employee_schedules 
     SET check_in = ?, status = 'active', is_late = ?, late_minutes = ?
     WHERE id = ?`,
    [now, isLate, lateMinutes, shift.id]
  );
  
  res.json({ success: true, data: { check_in: now, is_late: isLate, late_minutes: lateMinutes } });
});

// POST /api/schedules/check-out
router.post('/check-out', authenticate, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  
  const [schedule] = await db.query(
    `SELECT * FROM employee_schedules 
     WHERE user_id = ? AND schedule_date = ? AND status = 'active'`,
    [req.user.id, today]
  );
  
  if (schedule.length === 0) {
    return res.status(400).json({ message: 'Tidak ada shift aktif' });
  }
  
  const now = new Date();
  const shift = schedule[0];
  
  // Hitung durasi
  const checkIn = new Date(shift.check_in);
  const duration = Math.floor((now - checkIn) / (1000 * 60)); // dalam menit
  
  await db.query(
    `UPDATE employee_schedules 
     SET check_out = ?, status = 'completed', duration_minutes = ?
     WHERE id = ?`,
    [now, duration, shift.id]
  );
  
  res.json({ success: true, data: { check_out: now, duration: duration } });
});

module.exports = router;
```

### Database Tables

```sql
-- Employee Schedules (sudah ada di 12-migration.sql sebagai tabel 34)
CREATE TABLE employee_schedules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    user_id INT NOT NULL,
    shift_template_id INT DEFAULT NULL,
    schedule_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status ENUM('scheduled','active','completed','absent') DEFAULT 'scheduled',
    check_in TIMESTAMP NULL,
    check_out TIMESTAMP NULL,
    is_late BOOLEAN DEFAULT FALSE,
    late_minutes INT DEFAULT 0,
    duration_minutes INT DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (shift_template_id) REFERENCES shift_templates(id)
);

-- Shift Templates (sudah ada di 12-migration.sql sebagai tabel 33)
CREATE TABLE shift_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    branch_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_period_minutes INT DEFAULT 15,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- Seed data
INSERT INTO shift_templates (branch_id, name, start_time, end_time) VALUES
(1, 'Pagi', '08:00:00', '14:00:00'),
(1, 'Sore', '14:00:00', '20:00:00'),
(1, 'Malam', '20:00:00', '02:00:00'),
(1, 'Full Day', '08:00:00', '20:00:00');
```
