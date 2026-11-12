import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/closing_lines.dart';

Map<String, dynamic> _closing({
  String printerSize = '80',
  String? storeName = 'Anyo Blok B',
  Map<String, dynamic>? methods,
  Object? printedAt = '2026-11-12T23:10:00.000Z',
}) =>
    <String, dynamic>{
      'store': {
        'store_name': storeName,
        'store_address':
            'Blok B lantai LG los F no 107\nTanah Abang\nJakarta Pusat',
        'printer_size': printerSize,
        'receipt_font': 'b',
      },
      'document': 'Penutupan Penjualan',
      'date': '2026-11-11',
      'printed_at': printedAt,
      'printed_by': 'Miftahul Fauzan',
      'receipt_count': 5,
      'return_count': 0,
      'total_sales': 1770000,
      'subtotal': 1770000,
      'expenses': 10000,
      'income': 0,
      'expected_total': 1760000,
      'methods': methods ??
          {
            'cash': {
              'sales': 1115000,
              'returns': 0,
              'cancellations': 0,
              'cash_in_out': -10000,
              'total': 1105000,
            },
            'qris': {
              'sales': 655000,
              'returns': 0,
              'cancellations': 0,
              'cash_in_out': 0,
              'total': 655000,
            },
          },
    };

List<String> _rows(Map<String, dynamic> closing) =>
    buildClosingLines(closing).map((line) => line.text).toList();

void main() {
  test('format uang: minus di depan Rp dan ribuan bertitik', () {
    expect(closingMoney(1770000), 'Rp1.770.000');
    expect(closingMoney(-10000), '-Rp10.000');
    expect(closingMoney(0), 'Rp0');
    expect(closingMoney(1234.6), 'Rp1.235');
  });

  test('tanggal panjang Bahasa Indonesia dan cap waktu WIB', () {
    expect(closingLongDate('2026-11-11'), 'Rabu, 11 November 2026');
    expect(closingLongDate('2026-01-01'), 'Kamis, 1 Januari 2026');
    expect(closingLongDate(''), '');
    expect(closingStamp('2026-11-12T23:10:00.000Z'), '13 Nov 2026, 06:10');
    expect(
        closingStamp('bukan-tanggal', now: DateTime.utc(2026, 11, 12, 23, 10)),
        '13 Nov 2026, 06:10');
  });

  test('susunan 80 mm sama dengan halaman web /closing', () {
    final rows = _rows(_closing());
    final trimmed = rows.map((row) => row.trim()).toList();

    // Semua baris selebar kertas 64 kolom, kecuali baris huruf lebar ganda
    // (nama toko) yang dicetak tanpa padding agar tidak melebar 2x.
    final lines80 = buildClosingLines(_closing());
    expect(lines80.every((line) => line.big || line.text.length == 64), isTrue,
        reason: 'baris harus 64 kolom');

    // Kepala: nama toko huruf lebar ganda + judul dokumen.
    final first = buildClosingLines(_closing()).first;
    expect(first.text.trim(), 'Anyo Blok B');
    expect(first.big, isTrue);
    expect(first.align, ClosingAlign.center);
    expect(trimmed, contains('Penutupan Penjualan'));
    expect(trimmed, contains('Blok B lantai LG los F no 107'));
    expect(trimmed, contains('Jakarta Pusat'));

    // Urutan blok seperti web.
    int indexOf(String label) =>
        trimmed.indexWhere((row) => row.startsWith(label));
    expect(indexOf('INFORMASI'), greaterThan(-1));
    expect(indexOf('RINGKASAN'), greaterThan(indexOf('INFORMASI')));
    expect(indexOf('PEMBAYARAN'), greaterThan(indexOf('RINGKASAN')));

    // Isi informasi & ringkasan.
    expect(
        trimmed.any((row) =>
            row.startsWith('Tanggal') &&
            row.endsWith('Rabu, 11 November 2026')),
        isTrue);
    expect(
        trimmed.any((row) =>
            row.startsWith('Dicetak') && row.endsWith('13 Nov 2026, 06:10')),
        isTrue);
    expect(
        trimmed.any(
            (row) => row.startsWith('Oleh') && row.endsWith('Miftahul Fauzan')),
        isTrue);
    expect(trimmed.any((row) => row.startsWith('Resi') && row.endsWith('5')),
        isTrue);
    expect(
        trimmed
            .any((row) => row.startsWith('Pengembalian') && row.endsWith('0')),
        isTrue);
    expect(
        trimmed.any((row) =>
            row.startsWith('Total Penjualan') && row.endsWith('Rp1.770.000')),
        isTrue);
    expect(
        trimmed.any(
            (row) => row.startsWith('Subtotal') && row.endsWith('Rp1.770.000')),
        isTrue);
    expect(
        trimmed.any(
            (row) => row.startsWith('Pengeluaran') && row.endsWith('Rp10.000')),
        isTrue);
    expect(
        trimmed
            .any((row) => row.startsWith('Pemasukan') && row.endsWith('Rp0')),
        isTrue);

    // Metode bayar: tunai memakai label "Kas ...", non-tunai tanpa "Kas".
    expect(
        trimmed
            .any((row) => row.startsWith('KAS') && row.endsWith('Rp1.105.000')),
        isTrue);
    expect(
        trimmed.any((row) =>
            row.startsWith('Kas Penjualan') && row.endsWith('Rp1.115.000')),
        isTrue);
    expect(
        trimmed.any(
            (row) => row.startsWith('Kas Pengembalian') && row.endsWith('Rp0')),
        isTrue);
    expect(
        trimmed.any(
            (row) => row.startsWith('Kas Pembatalan') && row.endsWith('Rp0')),
        isTrue);
    expect(
        trimmed.any((row) =>
            row.startsWith('Kas Masuk-Keluar') && row.endsWith('-Rp10.000')),
        isTrue);
    expect(
        trimmed
            .any((row) => row.startsWith('QRIS') && row.endsWith('Rp655.000')),
        isTrue);
    expect(
        trimmed.any(
            (row) => row.startsWith('Penjualan') && row.endsWith('Rp655.000')),
        isTrue);
    expect(trimmed.any((row) => row.startsWith('Batal') && row.endsWith('Rp0')),
        isTrue);
    expect(
        trimmed.any((row) =>
            row.startsWith('Kas Masuk-Keluar') && row.contains('QRIS')),
        isFalse);

    // Total di akhir, tanpa kalimat penutup (sama dengan web).
    expect(
        trimmed.any((row) =>
            row.startsWith('Total Diharapkan') && row.endsWith('Rp1.760.000')),
        isTrue);
    expect(rows.any((row) => row.contains('Terima kasih')), isFalse);
    expect(trimmed.last.startsWith('='), isTrue);
  });

  test('angka penting dicetak tebal', () {
    final lines = buildClosingLines(_closing());
    bool boldRow(String label) =>
        lines.firstWhere((line) => line.text.trim().startsWith(label)).bold;
    expect(boldRow('Total Penjualan'), isTrue);
    expect(boldRow('KAS'), isTrue);
    expect(boldRow('QRIS'), isTrue);
    expect(boldRow('Total Diharapkan'), isTrue);
    expect(boldRow('Subtotal'), isFalse);
    expect(boldRow('Kas Penjualan'), isFalse);
  });

  test('58 mm memakai 42 kolom dan nama panjang turun ke bold biasa', () {
    final narrow = _rows(_closing(printerSize: '58'));
    final narrowLines = buildClosingLines(_closing(printerSize: '58'));
    expect(narrowLines.every((line) => line.big || line.text.length == 42),
        isTrue);
    expect(narrow.any((row) => row.contains('Rabu, 11 November 2026')), isTrue);

    final longName = buildClosingLines(_closing(
      printerSize: '58',
      storeName: 'ANYOSTORE TOKO BLOK B TANAH ABANG',
    ));
    expect(longName.first.big, isFalse,
        reason: 'nama panjang tidak boleh double width');
    expect(longName.first.bold, isTrue);
    expect(longName.first.text.length, 42);
    expect(longName.first.text.trim(), 'ANYOSTORE TOKO BLOK B TANAH ABANG');
  });

  test('tanpa cap cetak dan tanpa metode bayar tetap aman', () {
    final rows = _rows(_closing(printedAt: null, methods: {}))
        .map((row) => row.trim())
        .toList();
    // Tanpa printed_at, cap cetak memakai waktu perangkat (tetap informatif).
    expect(rows.any((row) => row.startsWith('Dicetak')), isTrue);
    expect(rows, contains('Belum ada transaksi pada tanggal ini.'));
    expect(rows.any((row) => row.startsWith('Total Diharapkan')), isTrue);
  });

  test('mode semua toko memakai nama gabungan dari laporan', () {
    final closing = _closing(storeName: 'Semua Toko/Gudang');
    final rows = _rows(closing).map((row) => row.trim()).toList();
    expect(rows.first, 'Semua Toko/Gudang');
  });
}
