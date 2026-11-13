import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/transfer_history_page.dart';

Map<String, dynamic> _transfer({int itemCount = 6}) => <String, dynamic>{
      'id': 185,
      'number': 'TRF-20261111-0185',
      'status': 'completed',
      'created_at': '2026-11-11 09:56:00',
      'notes': 'made',
      'product_count': itemCount,
      'total_qty': itemCount * 12,
      'admin': 'Resti',
      'source': {
        'branch_name': 'Gudang Utama',
        'warehouse_name': 'Gudang Utama'
      },
      'destination': {
        'branch_name': 'BASIK PGMTA',
        'warehouse_name': 'Gudang BASIK'
      },
      'details': {
        'from': [
          for (var i = 1; i <= itemCount; i++)
            {
              'name': 'PRODUK-$i',
              'variant_color': i.isEven ? 'Biru' : null,
              'qty': 12
            },
        ],
      },
    };

Future<void> _pumpSheet(
    WidgetTester tester, Map<String, dynamic> transfer) async {
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(body: TransferDetailSheet(transfer: transfer)),
  ));
  await tester.pump();
}

void main() {
  test('label tanggal memakai format hari/bulan/tahun jam:menit', () {
    expect(transferDateLabel('2026-11-11 09:56:00'), '11/11/2026 09:56');
    expect(transferDateLabel('bukan tanggal'), 'bukan tanggal');
  });

  testWidgets('detail transfer menampilkan SEMUA produk, bukan hanya 5',
      (tester) async {
    await _pumpSheet(tester, _transfer(itemCount: 6));
    expect(find.text('Detail Transfer'), findsOneWidget);
    for (var i = 1; i <= 6; i++) {
      expect(find.textContaining('PRODUK-$i'), findsOneWidget,
          reason: 'produk $i harus tampil');
    }
    expect(
        find.byKey(const ValueKey('transfer-detail-item-5')), findsOneWidget);
    expect(find.text('Daftar produk (6)'), findsOneWidget);
  });

  testWidgets('detail menampilkan rute, status, admin, dan catatan',
      (tester) async {
    await _pumpSheet(tester, _transfer());
    expect(find.textContaining('Gudang Utama'), findsOneWidget);
    expect(find.textContaining('BASIK PGMTA'), findsOneWidget);
    expect(find.textContaining('Selesai'), findsOneWidget);
    expect(find.textContaining('Resti'), findsOneWidget);
    expect(find.textContaining('Catatan: made'), findsOneWidget);
  });

  testWidgets('transfer tanpa rincian produk tetap informatif', (tester) async {
    final transfer = _transfer(itemCount: 0);
    transfer['details'] = {'from': <Map<String, dynamic>>[]};
    await _pumpSheet(tester, transfer);
    expect(find.text('Tidak ada rincian produk.'), findsOneWidget);
  });
}
