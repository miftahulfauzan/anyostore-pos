import 'receipt_layout.dart' show ReceiptLayout;

/// Baris cetak Penutupan Penjualan.
///
/// Susunannya mengikuti halaman web `/closing` (target visual): blok
/// INFORMASI → RINGKASAN → PEMBAYARAN dengan garis tebal untuk angka penting.
/// Lebar kertas, font, dan margin memakai setelan struk cabang yang sama
/// (`receipt_layout.dart`), jadi 58/80 mm dan Font A/B tetap dihormati.
enum ClosingAlign { left, center }

class ClosingLine {
  const ClosingLine(
    this.text, {
    this.bold = false,
    this.big = false,
    this.align = ClosingAlign.left,
  });

  final String text;
  final bool bold;

  /// Huruf selebar dua (hanya untuk nama toko di kertas 80 mm).
  final bool big;
  final ClosingAlign align;
}

const _weekdays = [
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
  'Minggu',
];

const _monthsLong = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

// Sama dengan toLocaleString('en-GB') di web: 13 Nov 2026, 06:10.
const _monthsShort = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const _methodLabels = {
  'cash': 'KAS',
  'qris': 'QRIS',
  'debit': 'DEBIT',
  'credit': 'KREDIT',
  'transfer': 'TRANSFER',
  'split': 'SPLIT',
  'other': 'LAINNYA',
};

/// Uang dengan tanda minus di depan "Rp": -Rp10.000 (bukan Rp-10.000).
String closingMoney(num value) {
  final negative = value < 0;
  final digits = value.abs().round().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write('.');
    buffer.write(digits[i]);
  }
  return '${negative ? '-' : ''}Rp$buffer';
}

/// Tanggal bisnis panjang: 2026-11-11 -> "Rabu, 11 November 2026".
String closingLongDate(String? isoDate) {
  final raw = (isoDate ?? '').trim();
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(raw);
  if (match == null) return raw;
  final date = DateTime.utc(
    int.parse(match.group(1)!),
    int.parse(match.group(2)!),
    int.parse(match.group(3)!),
  );
  final weekday = _weekdays[date.weekday - 1];
  return '$weekday, ${date.day} ${_monthsLong[date.month - 1]} ${date.year}';
}

/// Cap waktu cetak dalam WIB: "13 Nov 2026, 06:10".
String closingStamp(String? printedAt, {DateTime? now}) {
  final raw = (printedAt ?? '').trim();
  final parsed = raw.isEmpty ? null : DateTime.tryParse(raw);
  final wib =
      (parsed ?? (now ?? DateTime.now())).toUtc().add(const Duration(hours: 7));
  final hour = wib.hour.toString().padLeft(2, '0');
  final minute = wib.minute.toString().padLeft(2, '0');
  return '${wib.day} ${_monthsShort[wib.month - 1]} ${wib.year}, $hour:$minute';
}

class ClosingLayout {
  ClosingLayout._(this.width, this.margin, {required this.fontB});

  factory ClosingLayout.fromClosing(Map<String, dynamic> closing) {
    final base = ReceiptLayout.fromReceipt(closing);
    return ClosingLayout._(base.width, base.margin, fontB: base.fontB);
  }

  final int width;
  final int margin;
  final bool fontB;

  int get _inner => width - margin * 2;

  static Map<String, dynamic> _store(Map<String, dynamic> closing) =>
      (closing['store'] as Map?)?.cast<String, dynamic>() ?? const {};

  List<ClosingLine> build([Map<String, dynamic>? payload]) {
    final closing = payload ?? <String, dynamic>{};
    final store = _store(closing);
    final rows = <ClosingLine>[];

    String fit(String value, int max) {
      final text = value.trim();
      if (max <= 0) return '';
      if (text.length <= max) return text;
      if (max <= 3) return text.substring(0, max);
      return '${text.substring(0, max - 3)}...';
    }

    List<String> wrap(String value, int max) {
      final result = <String>[];
      for (final paragraph in value.replaceAll('\r\n', '\n').split('\n')) {
        final trimmed = paragraph.trim();
        if (trimmed.isEmpty) continue;
        var line = '';
        for (final word in trimmed.split(RegExp(r'\s+'))) {
          if (line.isEmpty) {
            line = word;
          } else if (line.length + word.length + 1 <= max) {
            line = '$line $word';
          } else {
            result.add(line);
            line = word;
          }
        }
        if (line.isNotEmpty) result.add(line);
      }
      return result.isEmpty ? const [''] : result;
    }

    String centered(String value, int widthChars) {
      final text = fit(value, widthChars);
      final gap = widthChars - text.length;
      if (gap <= 0) return text;
      final left = gap ~/ 2;
      return '${' ' * left}$text${' ' * (gap - left)}';
    }

    void emit(
      String content, {
      bool bold = false,
      bool center = false,
      bool big = false,
    }) {
      if (big) {
        // Huruf lebar ganda: jangan diberi margin/padding karena printer
        // menggandakan setiap karakter (padding pun ikut melebar).
        rows.add(ClosingLine(fit(content, _inner ~/ 2),
            bold: bold, big: true, align: ClosingAlign.center));
        return;
      }
      final body = center
          ? centered(content, _inner)
          : fit(content, _inner).padRight(_inner);
      rows.add(ClosingLine(' ' * margin + body + ' ' * margin,
          bold: bold, align: center ? ClosingAlign.center : ClosingAlign.left));
    }

    void rule(String char) => emit(char * _inner);

    void pair(String label, String value, {bool bold = false}) {
      final right = fit(value, _inner);
      final left = fit(label, _inner - right.length - 1);
      final gap = _inner - left.length - right.length;
      emit('$left${' ' * (gap < 1 ? 1 : gap)}$right', bold: bold);
    }

    String money(Object? value) =>
        closingMoney(value is num ? value : double.tryParse('$value') ?? 0);

    // ===== Kepala =====
    final storeName = (store['store_name'] ?? closing['store'] ?? 'Anyostore')
        .toString()
        .trim();
    final name = storeName.isEmpty ? 'Anyostore' : storeName;
    if (name.length * 2 <= _inner) {
      emit(name, bold: true, big: true);
    } else {
      emit(name, bold: true, center: true);
    }
    emit((closing['document'] ?? 'Penutupan Penjualan').toString(),
        bold: true, center: true);
    final address = (store['store_address'] ?? '').toString().trim();
    if (address.isNotEmpty) {
      for (final line in wrap(address, _inner).take(3)) {
        emit(line, center: true);
      }
    }
    rule('-');

    // ===== Informasi =====
    emit('INFORMASI', bold: true);
    pair('Tanggal', closingLongDate(closing['date']?.toString()));
    final stamp = closingStamp(closing['printed_at']?.toString());
    if (stamp.isNotEmpty) pair('Dicetak', stamp);
    final printedBy = (closing['printed_by'] ?? '').toString().trim();
    if (printedBy.isNotEmpty) pair('Oleh', printedBy);
    rule('-');

    // ===== Ringkasan =====
    emit('RINGKASAN', bold: true);
    pair('Resi', '${(closing['receipt_count'] as num?)?.toInt() ?? 0}');
    pair('Pengembalian', '${(closing['return_count'] as num?)?.toInt() ?? 0}');
    rule('=');
    pair('Total Penjualan', money(closing['total_sales']), bold: true);
    rule('=');
    pair('Subtotal', money(closing['subtotal'] ?? closing['total_sales']));
    pair('Pengeluaran', money(closing['expenses']));
    pair('Pemasukan', money(closing['income']));
    rule('-');

    // ===== Pembayaran =====
    emit('PEMBAYARAN', bold: true);
    final methods =
        (closing['methods'] as Map?)?.cast<String, dynamic>() ?? const {};
    if (methods.isEmpty) {
      emit('Belum ada transaksi pada tanggal ini.', center: true);
    }
    for (final entry in methods.entries) {
      final method = entry.key;
      final data = (entry.value as Map?)?.cast<String, dynamic>() ?? const {};
      final isCash = method == 'cash';
      final label = _methodLabels[method] ?? method.toUpperCase();
      rule('=');
      pair(label, money(data['total']), bold: true);
      rule('=');
      rule('.');
      pair(isCash ? 'Kas Penjualan' : 'Penjualan', money(data['sales']));
      pair(
          isCash ? 'Kas Pengembalian' : 'Pengembalian', money(data['returns']));
      pair(isCash ? 'Kas Pembatalan' : 'Batal', money(data['cancellations']));
      if (isCash) {
        pair('Kas Masuk-Keluar', money(data['cash_in_out']));
      }
    }
    rule('-');
    rule('=');
    pair('Total Diharapkan', money(closing['expected_total']), bold: true);
    rule('=');
    return rows;
  }
}

/// Pintasan: susun baris penutupan untuk payload transaksi penutupan.
List<ClosingLine> buildClosingLines(Map<String, dynamic> closing) =>
    ClosingLayout.fromClosing(closing).build(closing);
