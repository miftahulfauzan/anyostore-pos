# 7. Printer Thermal

## 7.1 ESC/POS Command Reference

| Command | Hex | Fungsi |
|---------|-----|--------|
| Initialize | `1B 40` | Reset printer ke default |
| Center Align | `1B 61 01` | Rata tengah |
| Left Align | `1B 61 00` | Rata kiri |
| Bold On | `1B 45 01` | Aktifkan bold |
| Bold Off | `1B 45 00` | Matikan bold |
| Double Height | `1D 21 11` | Ukuran ganda |
| Normal Size | `1D 21 00` | Ukuran normal |
| Feed & Cut | `1D 56 00` | Potong kertas |
| Open Drawer | `1B 70 00` | Buka laci kas |

## 7.2 Template Struk 80mm

```
┌──────────────────────────────────────┐
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
│         TERIMA KASIH                 │
│    Barang dibeli tidak dapat          │
│      ditukar/dikembalikan            │
└──────────────────────────────────────┘
```

## 7.3 Template Struk 58mm

```
┌─────────────────────────────┐
│    TOKO PAKAIAN ANDA        │
│  Jl. Contoh No. 123         │
│  Telp: 081234567890         │
│─────────────────────────────│
│ INV: INV-20260708-0001      │
│ Kasir: Ahmad                 │
│ Tgl: 08/07/2026 14:30       │
│─────────────────────────────│
│ Kaos Polos    2x  Rp110.000 │
│ Kemeja Flanel 1x  Rp150.000 │
│─────────────────────────────│
│ Subtotal:     Rp260.000     │
│ Diskon:      -Rp10.000      │
│ TOTAL:        Rp250.000     │
│─────────────────────────────│
│ TUNAI:        Rp250.000     │
│ Kembali:      Rp0           │
│─────────────────────────────│
│      TERIMA KASIH           │
└─────────────────────────────┘
```

## 7.4 Integration Methods

### QZ Tray (Web Browser)

```javascript
async function printViaQZ(transaction) {
  await qz.websocket.connect();
  const config = qz.configs.create('Receipt Printer');
  
  const data = buildESCPOSBuffer(transaction);
  
  await qz.print(config, [{
    type: 'raw',
    format: 'raw',
    data: Array.from(data),
    options: { language: 'escpos' }
  }]);
  
  await qz.websocket.disconnect();
}
```

### Backend Print Service

```javascript
// backend/src/services/printerService.js
const ThermalPrinter = require('node-thermal-printer').printer;
const PrinterTypes = require('node-thermal-printer').types;

async function printReceipt(transaction) {
  let printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: '/dev/usb/lp0', // atau TCP/IP
    characterSet: 'CP437'
  });
  
  printer.alignCenter();
  printer.bold(true);
  printer.println(transaction.store_name);
  printer.bold(false);
  printer.println(transaction.store_address);
  printer.drawLine();
  
  printer.alignLeft();
  printer.println(`Invoice: ${transaction.invoice_no}`);
  printer.println(`Kasir: ${transaction.cashier}`);
  printer.println(`Tgl: ${formatDate(transaction.created_at)}`);
  printer.drawLine();
  
  for (const item of transaction.items) {
    printer.tableCustom([
      { text: item.name, width: 0.5 },
      { text: `${item.qty}x`, width: 0.2, align: 'right' },
      { text: formatRupiah(item.total), width: 0.3, align: 'right' }
    ]);
  }
  
  printer.drawLine();
  printer.bold(true);
  printer.println(`TOTAL: ${formatRupiah(transaction.grand_total)}`);
  printer.bold(false);
  printer.cut();
  
  await printer.execute();
}
```

### Mobile Bluetooth Print (Flutter)

```dart
import 'package:esc_pos_bluetooth/esc_pos_bluetooth.dart';
import 'package:flutter_bluetooth_printer/flutter_bluetooth_printer.dart';

Future<void> printViaBluetooth(Map<String, dynamic> transaction) async {
  final printer = BluetoothPrinter();
  final devices = await printer.scan();
  final device = devices.first; // Pilih printer pertama

  await printer.connect(device);

  final profile = await CapabilityProfile.load();
  final generator = Generator(PaperSize.mm80, profile);
  final bytes = <int>[];
  bytes.addAll(generator.text(transaction['store_name'],
      styles: const PosStyles(align: PosAlign.center, bold: true)));
  bytes.addAll(generator.text(transaction['store_address']));
  bytes.addAll(generator.drawLine());
  bytes.addAll(generator.text('Invoice: ${transaction['invoice_no']}'));
  bytes.addAll(generator.cut());

  await printer.write(bytes);
}
```

## 7.5 Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Printer tidak menyala | Cek kabel power & koneksi USB/Bluetooth |
| Hasil cetak kosong | Cek thermal head, ganti roll kertas |
| Teks terpotong | Adjust margin, cek lebar kertas (58/80mm) |
| Kertas macet | Bersihkan roller, jangan gunakan kertas terlipat |
| Bluetooth gagal | Unpair & pair ulang, restart printer |
| QZ Tray tidak jalan | Install QZ Tray, allow WebSocket di browser |
