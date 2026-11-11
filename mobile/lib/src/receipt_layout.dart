import 'format.dart';

enum ReceiptLineAlignment { left, center }

class ReceiptLine {
  const ReceiptLine(
    this.text, {
    this.alignment = ReceiptLineAlignment.left,
    this.bold = false,
  });

  final String text;
  final ReceiptLineAlignment alignment;
  final bool bold;
}

/// Tata letak struk thermal ESC/POS.
///
/// Badan struk dicetak memakai **Font B** printer (9×17 dot, satu ukuran lebih
/// kecil dari Font A 12×24) sehingga satu baris muat 42 karakter pada kertas
/// 58 mm dan 64 karakter pada 80 mm. Karena itu lebar kolom di sini dihitung
/// dari grid Font B, bukan lagi 32/48 kolom Font A.
///
/// Setiap baris dipaksa selebar kertas: margin kiri = margin kanan sehingga
/// teks tidak menempel tepi kertas dan angka kanan tetap rata.
class ReceiptLayout {
  ReceiptLayout._(this.width, this.margin);

  factory ReceiptLayout.fromReceipt(Map<String, dynamic> receipt) {
    final store = (receipt['store'] as Map<String, dynamic>?) ?? {};
    final size = (store['printer_size']?.toString() ?? '80')
        .replaceAll(RegExp(r'\s+'), '')
        .toLowerCase();
    if (size.startsWith('58')) return ReceiptLayout._(42, 3);
    return ReceiptLayout._(64, 4);
  }

  /// Jumlah kolom Font B dalam satu baris (termasuk margin kiri kanan).
  final int width;

  /// Jumlah kolom kosong di kiri dan di kanan setiap baris.
  final int margin;

  int get _inner => width - margin * 2;

  /// Label kolom kiri pada bagian informasi transaksi.
  static const _metaLabel = 12;

  List<ReceiptLine> build([Map<String, dynamic>? receipt]) {
    final data = receipt ?? <String, dynamic>{};
    final store = (data['store'] as Map<String, dynamic>?) ?? {};
    final result = <ReceiptLine>[];

    void emit(String content, {bool bold = false, bool center = false}) {
      final body = center
          ? _center(content, _inner)
          : _fit(content.replaceAll(RegExp(r'\s+$'), ''), _inner)
              .padRight(_inner);
      final text = ' ' * margin + body + ' ' * margin;
      result.add(ReceiptLine(text,
          bold: bold,
          alignment:
              center ? ReceiptLineAlignment.center : ReceiptLineAlignment.left));
    }

    void centered(String value, {bool bold = false}) {
      for (final part in _wrap(value, _inner)) {
        emit(part, bold: bold, center: true);
      }
    }

    void meta(String label, String value) {
      final room = _inner - _metaLabel;
      final safe = value.length > room ? '${value.substring(0, room - 3)}...' : value;
      emit('${label.padRight(_metaLabel)}$safe');
    }

    void pair(String label, String value) {
      final right = _fit(value, _inner);
      final left = _fit(label, _inner - right.length - 1);
      emit('${left.padRight(_inner - right.length)}$right');
    }

    void item(String name, int qty, String price, String amount) {
      var mid = '$qty x $price';
      var nameWidth = _inner - mid.length - amount.length - 3;
      if (nameWidth < 6) {
        mid = '${qty}x$price';
        nameWidth = _inner - mid.length - amount.length - 3;
      }
      final nameCol = nameWidth.clamp(4, 16);
      final safeName = name.length <= nameCol
          ? name
          : '${name.substring(0, nameCol - 1)}.';
      final gap = _inner - nameCol - 1 - mid.length - amount.length - 1;
      emit('${safeName.padRight(nameCol)} $mid'
          '${' ' * (gap < 1 ? 1 : gap)}$amount');
    }

    void rule() => emit('-' * _inner);

    // ===== Kepala: nama toko, sapaan, alamat, nomor WhatsApp =====
    centered(_ascii(_value(store, 'store_name', fallback: 'Anyostore')),
        bold: true);
    _optional(store['receipt_header'], centered);
    emit('');
    _optional(store['store_address'], centered, maxLines: 3);
    emit('');
    for (final contact in _contactLines(store)) {
      centered(contact);
    }
    final tax = _value(store, 'store_tax_id', prefix: 'NPWP: ');
    if (tax.isNotEmpty) centered(tax);
    rule();

    // ===== Informasi transaksi (judul polos, bukan kotak) =====
    emit('INFORMASI TRANSAKSI', bold: true);
    meta('Invoice', _ascii('${data['invoice_no'] ?? ''}'));
    final date = _transactionDateLabel(data);
    if (date.isNotEmpty) meta('Tanggal', date);
    final cashier = _value(data, 'cashier');
    if (cashier.isNotEmpty) meta('Kasir', _ascii(cashier));
    final customer = _value(data, 'customer_name');
    if (customer.isNotEmpty) meta('Pelanggan', _ascii(customer));
    rule();

    // ===== Produk: nama, qty x harga, jumlah dalam satu baris =====
    emit('PRODUK', bold: true);
    emit('');
    final rawItems = (data['items'] as List?) ?? [];
    for (final raw in rawItems) {
      final itemRow = (raw as Map).cast<String, dynamic>();
      final name =
          itemRow['product_name']?.toString() ?? itemRow['name']?.toString() ?? '';
      item(
        _ascii(name),
        asNum(itemRow['quantity']).toInt(),
        _moneyNumber(asNum(itemRow['price'])),
        fmtRp(asNum(itemRow['subtotal'])),
      );
    }
    emit('');
    rule();

    pair('Subtotal', fmtRp(asNum(data['subtotal'])));
    final discount = asNum(data['discount']);
    if (discount > 0) pair('Diskon', '-${fmtRp(discount)}');
    pair('Total', fmtRp(asNum(data['grand_total'])));
    rule();

    var payments = (data['payments'] as List?) ?? [];
    if (payments.isEmpty && data['payment_method'] != null) {
      payments = [
        {
          'payment_method': data['payment_method'],
          'amount': asNum(data['grand_total']),
        }
      ];
    }
    for (final raw in payments) {
      final payment = (raw as Map).cast<String, dynamic>();
      pair(_paymentLabel(payment['payment_method']),
          fmtRp(asNum(payment['amount'])));
    }
    final paymentTotal = payments.fold<num>(
        0, (total, raw) => total + asNum((raw as Map)['amount']));
    final paid = asNum(data['amount_paid']) > 0
        ? asNum(data['amount_paid'])
        : paymentTotal > 0
            ? paymentTotal
            : asNum(data['grand_total']);
    pair('Dibayar', fmtRp(paid));
    pair('Kembalian', fmtRp(asNum(data['change'])));

    rule();
    centered('Terima kasih, sampai jumpa lagi!');
    _optional(store['receipt_footer'], centered);
    _optional(store['receipt_note'], centered);
    emit('');
    return result;
  }

  /// Nomor WhatsApp admin dari pengaturan toko. Sebelumnya struk hanya memakai
  /// `store_phone` sehingga nomor admin lain tidak pernah tercetak.
  static List<String> _contactLines(Map<String, dynamic> store) {
    final numbers = <String>[];
    void add(dynamic value) {
      final text = _ascii(value?.toString().trim() ?? '');
      if (text.isEmpty) return;
      if (!numbers.contains(text)) numbers.add(text);
    }

    final raw = store['whatsapp_numbers'];
    if (raw is String && raw.trim().startsWith('[')) {
      try {
        final decoded = raw.trim();
        for (final part in decoded
            .substring(1, decoded.length - 1)
            .split(',')) {
          add(part.replaceAll('"', '').replaceAll(RegExp(r'[\[\]]'), ''));
        }
      } catch (_) {}
    } else if (raw is List) {
      for (final value in raw) {
        add(value);
      }
    }
    add(store['whatsapp_number']);
    add(store['whatsapp_number_2']);
    add(store['whatsapp_number_3']);
    if (numbers.isEmpty) add(store['store_phone']);

    return [for (final number in numbers) 'WA $number'];
  }

  static String _moneyNumber(num value) {
    final rounded = value.round();
    final digits = rounded.toString();
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buffer.write('.');
      buffer.write(digits[i]);
    }
    return buffer.toString();
  }

  static String _center(String value, int width) {
    final text = _fit(value, width);
    final gap = width - text.length;
    if (gap <= 0) return text;
    final left = gap ~/ 2;
    return '${' ' * left}$text${' ' * (gap - left)}';
  }

  static String _value(dynamic source, String key,
      {String fallback = '', String prefix = ''}) {
    final value = source is Map ? source[key]?.toString() ?? '' : '';
    return value.isEmpty ? fallback : '$prefix$value';
  }

  /// Printer thermal memakai codepage lama: ganti karakter non-ASCII supaya
  /// tidak tercetak sebagai simbol acak.
  static String _ascii(String value) => value
      .replaceAll('·', '-')
      .replaceAll('…', '...')
      .replaceAll('–', '-')
      .replaceAll('—', '-')
      .replaceAll('’', "'")
      .replaceAll('‘', "'")
      .replaceAll('“', '"')
      .replaceAll('”', '"')
      .replaceAll('×', 'x');

  static String _transactionDateLabel(Map<String, dynamic> data) {
    final rawBusinessDate = data['transaction_date']?.toString() ?? '';
    var date = _slashDate(rawBusinessDate);
    final parsed = DateTime.tryParse(data['created_at']?.toString() ?? '');
    if (parsed != null) {
      final wib = parsed.toUtc().add(const Duration(hours: 7));
      date = date.isEmpty
          ? '${_twoDigit(wib.day)}/${_twoDigit(wib.month)}/${wib.year}'
          : date;
      return '$date ${_twoDigit(wib.hour)}:${_twoDigit(wib.minute)}';
    }
    return date;
  }

  static String _slashDate(String value) {
    final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(value);
    if (match == null) return '';
    return '${match.group(3)}/${match.group(2)}/${match.group(1)}';
  }

  static String _twoDigit(int value) => value.toString().padLeft(2, '0');

  static String _paymentLabel(dynamic value) {
    switch (value?.toString().trim().toLowerCase()) {
      case 'cash':
        return 'Tunai';
      case 'qris':
        return 'QRIS';
      case 'transfer':
        return 'Transfer';
      case 'debit':
        return 'Debit';
      case 'credit':
        return 'Kredit';
      case 'split':
        return 'Pembayaran terpisah';
      default:
        return value?.toString().trim().isNotEmpty == true
            ? value.toString()
            : 'Pembayaran';
    }
  }

  static void _optional(dynamic value, void Function(String) add,
      {int? maxLines}) {
    final text = _ascii(value?.toString().trim() ?? '');
    if (text.isEmpty) return;
    if (maxLines == null) {
      add(text);
      return;
    }
    final rows = text
        .replaceAll('\r\n', '\n')
        .split('\n')
        .map((row) => row.trim())
        .where((row) => row.isNotEmpty)
        .take(maxLines)
        .join('\n');
    add(rows);
  }

  static String _fit(String value, int max) {
    final normalized = value.trim();
    if (max <= 0) return '';
    if (normalized.length <= max) return normalized;
    if (max <= 3) return normalized.substring(0, max);
    return '${normalized.substring(0, max - 3)}...';
  }

  static List<String> _wrap(String value, int max) {
    if (max <= 0) return const [''];
    final result = <String>[];
    for (final paragraph in value.replaceAll('\r\n', '\n').split('\n')) {
      final words = paragraph.trim().split(RegExp(r'\s+'));
      if (paragraph.trim().isEmpty) continue;
      var line = '';
      for (final word in words) {
        if (word.isEmpty) continue;
        if (word.length > max) {
          if (line.isNotEmpty) {
            result.add(line);
            line = '';
          }
          var remaining = word;
          while (remaining.length > max) {
            result.add(remaining.substring(0, max));
            remaining = remaining.substring(max);
          }
          line = remaining;
        } else if (line.isEmpty) {
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
}
