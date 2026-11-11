import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/printer_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('prints every receipt row on its own thermal line', () async {
    final escCalls = <String>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const escChannel = MethodChannel('bluetooth_print_plus_esc');
    const bluetoothChannel = MethodChannel('bluetooth_print_plus/methods');
    messenger.setMockMethodCallHandler(escChannel, (call) async {
      escCalls.add(call.method);
      if (call.method == 'getCommand') return Uint8List.fromList([1]);
      return null;
    });
    messenger.setMockMethodCallHandler(bluetoothChannel, (call) async => null);
    addTearDown(() {
      messenger.setMockMethodCallHandler(escChannel, null);
      messenger.setMockMethodCallHandler(bluetoothChannel, null);
    });

    await PrinterService().printReceipt({
      'store': {'printer_size': '58', 'store_name': 'BASIK PGMTA'},
      'invoice_no': 'INV-0001',
      'items': [
        {
          'product_name': 'Celana Denim Panjang',
          'quantity': 4,
          'price': 90000,
          'subtotal': 360000,
        },
      ],
      'subtotal': 360000,
      'grand_total': 360000,
    });

    final textCount = escCalls.where((method) => method == 'text').length;
    final newlineCount = escCalls.where((method) => method == 'newline').length;
    expect(textCount, greaterThan(4));
    expect(newlineCount, textCount);
  });

  test('struk dicetak dengan Font B (satu ukuran lebih kecil)', () async {
    final fonts = <Object?>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const escChannel = MethodChannel('bluetooth_print_plus_esc');
    const bluetoothChannel = MethodChannel('bluetooth_print_plus/methods');
    messenger.setMockMethodCallHandler(escChannel, (call) async {
      if (call.method == 'text') {
        fonts.add((call.arguments as Map)['font']);
      }
      if (call.method == 'getCommand') return Uint8List.fromList([1]);
      return null;
    });
    messenger.setMockMethodCallHandler(bluetoothChannel, (call) async => null);
    addTearDown(() {
      messenger.setMockMethodCallHandler(escChannel, null);
      messenger.setMockMethodCallHandler(bluetoothChannel, null);
    });

    await PrinterService().printReceipt({
      'store': {'printer_size': '80', 'store_name': 'BASIK PGMTA'},
      'invoice_no': 'INV-0001',
      'grand_total': 10000,
      'items': [
        {'product_name': 'B-05', 'quantity': 6, 'price': 90000, 'subtotal': 540000},
      ],
    });

    expect(fonts, isNotEmpty);
    // 1 = Font B pada plugin ESC/POS.
    expect(fonts.every((font) => font == 1), isTrue);
  });

  test('template Font A mencetak dengan font normal', () async {
    final fonts = <Object?>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const escChannel = MethodChannel('bluetooth_print_plus_esc');
    const bluetoothChannel = MethodChannel('bluetooth_print_plus/methods');
    messenger.setMockMethodCallHandler(escChannel, (call) async {
      if (call.method == 'text') {
        fonts.add((call.arguments as Map)['font']);
      }
      if (call.method == 'getCommand') return Uint8List.fromList([1]);
      return null;
    });
    messenger.setMockMethodCallHandler(bluetoothChannel, (call) async => null);
    addTearDown(() {
      messenger.setMockMethodCallHandler(escChannel, null);
      messenger.setMockMethodCallHandler(bluetoothChannel, null);
    });

    await PrinterService().printReceipt({
      'store': {
        'printer_size': '80',
        'store_name': 'BASIK PGMTA',
        'receipt_font': 'a',
      },
      'invoice_no': 'INV-0001',
      'grand_total': 10000,
    });

    expect(fonts, isNotEmpty);
    expect(fonts.every((font) => font == 0), isTrue);
  });

  test('sends the complete receipt payload in ordered Bluetooth chunks',
      () async {
    final writes = <Uint8List>[];
    final payload =
        Uint8List.fromList(List<int>.generate(1025, (index) => index % 251));
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const escChannel = MethodChannel('bluetooth_print_plus_esc');
    const bluetoothChannel = MethodChannel('bluetooth_print_plus/methods');
    messenger.setMockMethodCallHandler(escChannel, (call) async {
      if (call.method == 'getCommand') return payload;
      return null;
    });
    messenger.setMockMethodCallHandler(bluetoothChannel, (call) async {
      if (call.method == 'write') {
        final args = call.arguments as Map<dynamic, dynamic>;
        writes.add(Uint8List.fromList(List<int>.from(args['data'] as List)));
      }
      return true;
    });
    addTearDown(() {
      messenger.setMockMethodCallHandler(escChannel, null);
      messenger.setMockMethodCallHandler(bluetoothChannel, null);
    });

    await PrinterService().printReceipt({
      'store': {'printer_size': '58', 'store_name': 'BASIK PGMTA'},
      'invoice_no': 'INV-0001',
      'items': List.generate(
        5,
        (index) => {
          'product_name': 'Produk $index',
          'quantity': 1,
          'price': 90000,
          'subtotal': 90000,
        },
      ),
      'subtotal': 450000,
      'grand_total': 450000,
    });

    expect(writes.length, greaterThan(1));
    expect(writes.every((chunk) => chunk.length <= 256), isTrue);
    expect(writes.expand((chunk) => chunk).toList(), orderedEquals(payload));
  });

  test('prints the invoice logo and feeds before cutting the paper', () async {
    final calls = <MethodCall>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const escChannel = MethodChannel('bluetooth_print_plus_esc');
    const bluetoothChannel = MethodChannel('bluetooth_print_plus/methods');
    messenger.setMockMethodCallHandler(escChannel, (call) async {
      calls.add(call);
      if (call.method == 'getCommand') return Uint8List.fromList([1]);
      return null;
    });
    messenger.setMockMethodCallHandler(bluetoothChannel, (call) async => null);
    addTearDown(() {
      messenger.setMockMethodCallHandler(escChannel, null);
      messenger.setMockMethodCallHandler(bluetoothChannel, null);
    });

    await PrinterService(
      logoLoader: (url) async => Uint8List.fromList([7, 8, 9]),
    ).printReceipt({
      'store': {
        'printer_size': '58',
        'store_name': 'BASIK PGMTA',
        'invoice_logo': '/uploads/logo.png',
      },
      'invoice_no': 'INV-0001',
      'grand_total': 10000,
    });

    final methods = calls.map((call) => call.method).toList();
    expect(methods, contains('image'));
    final image = calls.firstWhere((call) => call.method == 'image');
    expect((image.arguments as Map)['maxWidth'], 124);
    final feedIndex = methods.indexOf('print');
    final cutIndex = methods.indexOf('cutPaper');
    expect(feedIndex, greaterThan(-1));
    expect(cutIndex, greaterThan(feedIndex));
    expect((calls[feedIndex].arguments as Map)['feedLines'], 4);
  });

  test('uses the compact logo cap for 80mm receipts', () async {
    final calls = <MethodCall>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const escChannel = MethodChannel('bluetooth_print_plus_esc');
    const bluetoothChannel = MethodChannel('bluetooth_print_plus/methods');
    messenger.setMockMethodCallHandler(escChannel, (call) async {
      calls.add(call);
      if (call.method == 'getCommand') return Uint8List.fromList([1]);
      return null;
    });
    messenger.setMockMethodCallHandler(bluetoothChannel, (call) async => null);
    addTearDown(() {
      messenger.setMockMethodCallHandler(escChannel, null);
      messenger.setMockMethodCallHandler(bluetoothChannel, null);
    });

    await PrinterService(
      logoLoader: (url) async => Uint8List.fromList([7, 8, 9]),
    ).printReceipt({
      'store': {
        'printer_size': '80',
        'store_name': 'BASIK PGMTA',
        'invoice_logo': '/uploads/logo.png',
      },
      'invoice_no': 'INV-0001',
      'grand_total': 10000,
    });

    final image = calls.firstWhere((call) => call.method == 'image');
    expect((image.arguments as Map)['maxWidth'], 179);
  });

  test('continues printing when the invoice logo cannot be loaded', () async {
    final methods = <String>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const escChannel = MethodChannel('bluetooth_print_plus_esc');
    const bluetoothChannel = MethodChannel('bluetooth_print_plus/methods');
    messenger.setMockMethodCallHandler(escChannel, (call) async {
      methods.add(call.method);
      if (call.method == 'getCommand') return Uint8List.fromList([1]);
      return null;
    });
    messenger.setMockMethodCallHandler(bluetoothChannel, (call) async => null);
    addTearDown(() {
      messenger.setMockMethodCallHandler(escChannel, null);
      messenger.setMockMethodCallHandler(bluetoothChannel, null);
    });

    await PrinterService(
      logoLoader: (url) async => throw StateError('logo unavailable'),
    ).printReceipt({
      'store': {
        'printer_size': '80',
        'store_name': 'BASIK PGMTA',
        'store_logo': '/uploads/logo.png',
      },
      'invoice_no': 'INV-0001',
      'grand_total': 10000,
    });

    expect(methods, contains('text'));
    expect(methods, contains('print'));
    expect(methods, contains('cutPaper'));
    expect(methods, isNot(contains('image')));
  });

  test('prints expenses and income in the closing report', () async {
    final texts = <String>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const escChannel = MethodChannel('bluetooth_print_plus_esc');
    const bluetoothChannel = MethodChannel('bluetooth_print_plus/methods');
    messenger.setMockMethodCallHandler(escChannel, (call) async {
      if (call.method == 'text') {
        final args = call.arguments as Map<dynamic, dynamic>;
        texts.add('${args['content']}');
      }
      if (call.method == 'getCommand') return Uint8List.fromList([1]);
      return null;
    });
    messenger.setMockMethodCallHandler(bluetoothChannel, (call) async => null);
    addTearDown(() {
      messenger.setMockMethodCallHandler(escChannel, null);
      messenger.setMockMethodCallHandler(bluetoothChannel, null);
    });

    await PrinterService().printClosing({
      'store': {'printer_size': '58', 'store_name': 'BASIK PGMTA'},
      'date': '2026-11-08',
      'expenses': 30000,
      'income': 10000,
      'expected_total': 80000,
      'methods': <String, dynamic>{},
    });

    expect(texts.any((value) => value.contains('Pengeluaran')), isTrue);
    expect(texts.any((value) => value.contains('Pemasukan')), isTrue);
  });

  test('prints report detail rows with a thermal-safe header and cut',
      () async {
    final texts = <String>[];
    final methods = <String>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const escChannel = MethodChannel('bluetooth_print_plus_esc');
    const bluetoothChannel = MethodChannel('bluetooth_print_plus/methods');
    messenger.setMockMethodCallHandler(escChannel, (call) async {
      methods.add(call.method);
      if (call.method == 'text') {
        final args = call.arguments as Map<dynamic, dynamic>;
        texts.add('${args['content']}');
      }
      if (call.method == 'getCommand') return Uint8List.fromList([1]);
      return null;
    });
    messenger.setMockMethodCallHandler(bluetoothChannel, (call) async => null);
    addTearDown(() {
      messenger.setMockMethodCallHandler(escChannel, null);
      messenger.setMockMethodCallHandler(bluetoothChannel, null);
    });

    await PrinterService().printReport(
      title: 'Produk',
      lines: [
        ['Kemeja Denim', '48 pcs', 'Kategori Kemeja · Laba Rp1.000.000'],
      ],
    );

    expect(texts, contains('ANYOSTORE'));
    expect(texts, contains('PRODUK'));
    expect(texts, contains('Kemeja Denim'));
    expect(texts, contains('48 pcs'));
    expect(texts, contains('Kategori Kemeja · Laba Rp1.000.000'));
    expect(methods, contains('print'));
    expect(methods, contains('cutPaper'));
  });
}
