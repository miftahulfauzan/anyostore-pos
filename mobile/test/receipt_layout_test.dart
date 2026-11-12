import 'package:flutter_test/flutter_test.dart';

import 'package:pos_pakaian_mobile/src/receipt_layout.dart';

/// Baris struk selalu selebar kertas (margin kiri = margin kanan), jadi
/// perbandingan isi memakai versi trim.
List<String> _rows(Map<String, dynamic> receipt) =>
    ReceiptLayout.fromReceipt(receipt)
        .build(receipt)
        .map((line) => line.text.trimRight())
        .toList();

List<String> _trimmed(Map<String, dynamic> receipt) => _rows(receipt)
    .map((line) => line.trim())
    .where((line) => line.isNotEmpty)
    .toList();

Map<String, dynamic> _receipt({
  String size = '80',
  Map<String, dynamic>? store,
  List<Map<String, dynamic>>? items,
}) =>
    <String, dynamic>{
      'store': {
        'printer_size': size,
        'store_name': 'BASIK PGMTA',
        if (store != null) ...store,
      },
      'invoice_no': 'INV-20261110-B1-0008',
      'transaction_date': '2026-11-10',
      'created_at': '2026-11-10T07:08:14.000Z',
      'cashier': 'Miftahul Fauzan',
      'items': items ??
          [
            {
              'product_name': 'B-05',
              'quantity': 6,
              'price': 90000,
              'subtotal': 540000,
            },
          ],
      'subtotal': 540000,
      'grand_total': 540000,
      'payments': [
        {'payment_method': 'transfer', 'amount': 540000},
      ],
      'amount_paid': 540000,
      'change': 0,
    };

void main() {
  test('grid Font B: 58 mm = 42 kolom, 80 mm = 64 kolom, margin simetris', () {
    expect(ReceiptLayout.fromReceipt(_receipt(size: '58')).width, 42);
    expect(ReceiptLayout.fromReceipt(_receipt(size: '58mm')).width, 42);
    expect(ReceiptLayout.fromReceipt(_receipt(size: '80')).width, 64);

    for (final size in ['58', '80']) {
      final layout = ReceiptLayout.fromReceipt(_receipt(size: size));
      final rows = layout.build(_receipt(size: size));
      // Semua baris sama panjang -> margin kiri dan kanan identik.
      expect(rows.every((row) => row.text.length == layout.width), isTrue);
      // Teks tidak menempel tepi kertas.
      expect(rows.every((row) => row.text.startsWith(' ' * layout.margin)), isTrue);
      expect(rows.every((row) => row.text.endsWith(' ' * layout.margin)), isTrue);
    }
  });

  test('judul bagian polos tanpa garis pengurung', () {
    final rows = _rows(_receipt());
    final infoIndex = rows.indexWhere((row) => row.trim() == 'INFORMASI TRANSAKSI');
    final produkIndex = rows.indexWhere((row) => row.trim() == 'PRODUK');
    expect(infoIndex, greaterThan(-1));
    expect(produkIndex, greaterThan(infoIndex));
    // Baris tepat sebelum judul adalah garis pemisah, bukan kotak.
    expect(rows[infoIndex - 1].trim(), matches(RegExp(r'^-+$')));
    expect(rows[infoIndex + 1].trim(), startsWith('Invoice'));
  });

  test('produk: nama, qty x harga, dan jumlah dalam satu baris', () {
    final rows = _rows(_receipt(size: '80'));
    final item = rows.firstWhere((row) => row.contains('B-05'));
    expect(item, contains('6 x 90.000'));
    expect(item, contains('Rp540.000'));
    // Tidak ada baris terpisah hanya berisi qty x harga.
    expect(_trimmed(_receipt()).where((row) => row == '6 x 90.000'), isEmpty);
    // Jumlah rata kanan tepat di margin kanan.
    expect(item.trimRight(), endsWith('Rp540.000'));
  });

  test('blok PRODUK diberi jarak satu baris dari garis', () {
    final rows = _rows(_receipt());
    final produkIndex = rows.indexWhere((row) => row.trim() == 'PRODUK');
    expect(rows[produkIndex + 1].trim(), isEmpty);
    final itemIndex = rows.indexWhere((row) => row.contains('B-05'));
    expect(rows[itemIndex + 1].trim(), isEmpty);
  });

  test('informasi transaksi memakai kolom label tetap', () {
    final rows = _trimmed(_receipt());
    expect(rows.any((row) => row.startsWith('Invoice') && row.contains('INV-20261110-B1-0008')), isTrue);
    expect(rows.any((row) => row.startsWith('Tanggal') && row.contains('10/11/2026 14:08')), isTrue);
    expect(rows.any((row) => row.startsWith('Kasir') && row.endsWith('Miftahul Fauzan')), isTrue);
    // Label sejajar pada kolom ke-12.
    final invoice = _rows(_receipt()).firstWhere((row) => row.trim().startsWith('Invoice'));
    final kasir = _rows(_receipt()).firstWhere((row) => row.trim().startsWith('Kasir'));
    expect(invoice.indexOf('INV-'), kasir.indexOf('Miftahul'));
  });

  test('alamat toko maksimal 3 baris dan mengikuti info toko', () {
    final receipt = _receipt(store: {
      'store_address': 'Pgmta Lantai 6 Blok B no 118\nTanah Abang\nJakarta Pusat\nBaris keempat',
    });
    final rows = _trimmed(receipt);
    expect(rows, contains('Pgmta Lantai 6 Blok B no 118'));
    expect(rows, contains('Tanah Abang'));
    expect(rows, contains('Jakarta Pusat'));
    expect(rows.any((row) => row.contains('Baris keempat')), isFalse);
  });

  test('mencetak semua nomor WhatsApp admin, bukan hanya telepon toko', () {
    final receipt = _receipt(store: {
      'store_phone': '021123456',
      'whatsapp_numbers': '["081313133162","085691166333","087766676769"]',
    });
    final rows = _trimmed(receipt);
    expect(rows, contains('WhatsApp'));
    expect(rows, contains('081313133162'));
    expect(rows, contains('085691166333'));
    expect(rows, contains('087766676769'));
    // Nomor telepon tidak dicetak bila daftar WA admin sudah ada.
    expect(rows.any((row) => row.contains('021123456')), isFalse);
  });

  test('jatuh ke telepon toko bila daftar WhatsApp kosong', () {
    final rows = _trimmed(_receipt(store: {'store_phone': '081234567890'}));
    expect(rows, contains('WhatsApp'));
    expect(rows, contains('081234567890'));
  });

  test('produk panjang dipotong dan tetap satu baris', () {
    final receipt = _receipt(items: [
      {
        'product_name': 'Celana Denim Panjang Bordir Model Terbaru',
        'quantity': 12,
        'price': 1140000,
        'subtotal': 13680000,
      },
    ]);
    final layout = ReceiptLayout.fromReceipt(receipt);
    final item = layout
        .build(receipt)
        .map((row) => row.text)
        .firstWhere((row) => row.contains('Celana'));
    expect(item.length, layout.width);
    expect(item, contains('12 x 1.140.000'));
    expect(item, contains('Rp13.680.000'));
    expect(item, isNot(contains('denim panjang bordir model terbaru')));
  });

  test('ringkasan pembayaran dan kaki struk tetap lengkap', () {
    final rows = _trimmed(_receipt(store: {
      'receipt_note': 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan',
    }));
    int indexOf(String label) => rows.indexWhere((row) => row.startsWith(label));
    expect(indexOf('Subtotal'), lessThan(indexOf('Total')));
    expect(indexOf('Total'), lessThan(indexOf('Transfer')));
    expect(indexOf('Transfer'), lessThan(indexOf('Dibayar')));
    expect(indexOf('Dibayar'), lessThan(indexOf('Kembalian')));
    expect(indexOf('Kembalian'), lessThan(rows.indexOf('Terima kasih, sampai jumpa lagi!')));
    // Catatan panjang dibungkus, tidak terpotong.
    expect(rows.any((row) => row.startsWith('Barang yang sudah dibeli')), isTrue);
  });

  test('karakter non-ASCII diganti supaya tidak tercetak acak', () {
    final rows = _trimmed(_receipt(store: {
      'store_name': 'BASIK \u00b7 PGMTA',
      'receipt_header': 'Terima kasih \u2014 sampai jumpa\u2026',
    }));
    expect(rows.first, 'BASIK - PGMTA');
    expect(rows, contains('Terima kasih - sampai jumpa...'));
  });

  test('judul, label, dan penutup mengikuti template dari web', () {
    final receipt = _receipt(store: {
      'receipt_title_info': 'STRUK PENJUALAN',
      'receipt_title_products': 'DAFTAR BARANG',
      'receipt_label_invoice': 'No',
      'receipt_label_total': 'Jumlah',
      'receipt_label_change': 'Sisa',
      'receipt_closing': 'Terima kasih sudah belanja',
    });
    final rows = _trimmed(receipt);
    expect(rows, contains('STRUK PENJUALAN'));
    expect(rows, contains('DAFTAR BARANG'));
    expect(rows.any((row) => row.startsWith('No ')), isTrue);
    expect(rows.any((row) => row.startsWith('Jumlah')), isTrue);
    expect(rows.any((row) => row.startsWith('Sisa')), isTrue);
    expect(rows, contains('Terima kasih sudah belanja'));
    expect(rows, isNot(contains('INFORMASI TRANSAKSI')));
  });

  test('baris bisa disembunyikan lewat toggle template', () {
    final receipt = _receipt(store: {
      'store_address': 'Blok B no 118',
      'store_tax_id': '01.234.567.8',
      'whatsapp_numbers': '["081313133162"]',
      'receipt_show_address': 'false',
      'receipt_show_wa': 'false',
      'receipt_show_npwp': 'false',
      'receipt_show_cashier': 'false',
      'receipt_show_payment': 'false',
      'receipt_show_paid': 'false',
      'receipt_show_change': 'false',
    });
    final rows = _trimmed(receipt);
    expect(rows.any((row) => row.contains('Blok B no 118')), isFalse);
    expect(rows.contains('WhatsApp'), isFalse);
    expect(rows.any((row) => row.startsWith('NPWP')), isFalse);
    expect(rows.any((row) => row.startsWith('Kasir')), isFalse);
    expect(rows.any((row) => row.startsWith('Transfer')), isFalse);
    expect(rows.any((row) => row.startsWith('Dibayar')), isFalse);
    expect(rows.any((row) => row.startsWith('Kembalian')), isFalse);
    // Ringkasan nilai tetap ada.
    expect(rows.any((row) => row.startsWith('Total')), isTrue);
  });

  test('gaya pemisah: garis, baris kosong, atau tanpa pemisah', () {
    final dash = _rows(_receipt());
    expect(dash.any((row) => row.trim() == '-' * 56), isTrue);

    final blank = _rows(_receipt(store: {'receipt_separator': 'blank'}));
    expect(blank.any((row) => row.trim() == '-' * 56), isFalse);

    final none = _rows(_receipt(store: {'receipt_separator': 'none'}));
    expect(none.any((row) => row.trim().startsWith('-----')), isFalse);
  });

  test('font normal (Font A) memakai 48 kolom dan margin bisa diatur', () {
    final fontA = ReceiptLayout.fromReceipt(_receipt(store: {'receipt_font': 'a'}));
    expect(fontA.width, 48);
    expect(fontA.fontB, isFalse);

    final marginFive = ReceiptLayout.fromReceipt(_receipt(store: {'receipt_margin': '5'}));
    expect(marginFive.margin, 5);
    expect(marginFive.width, 64);

    final fontA58 = ReceiptLayout.fromReceipt(_receipt(
      size: '58',
      store: {'receipt_font': 'a'},
    ));
    expect(fontA58.width, 32);
  });
}
