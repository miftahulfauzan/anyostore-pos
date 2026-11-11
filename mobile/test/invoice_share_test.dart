import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/invoice_share.dart';

InvoicePayload _payload({String storeName = 'BASIK PGMTA'}) => InvoicePayload(
      storeName: storeName,
      storeAddress: 'LANTAI 6 blok B no 116',
      storePhones: const ['0812-3456-7890', '0857-0000-1111'],
      instagram: invoiceInstagram(storeName),
      invoiceNo: 'INV-20261110-B1-0012',
      dateText: '10 Nov 2026 · 14.25',
      cashier: 'Resti',
      customerLabel: 'Ibu Ani · Grosir Seri',
      items: const [
        InvoiceLine(name: 'Celana Baggy A104', variant: 'M · Biru', qty: 2, price: 185000, subtotal: 370000),
      ],
      subtotal: 370000,
      discount: 10000,
      total: 360000,
    );

void main() {
  test('toko BASIK tanpa ANYOSTORE, toko lain tetap ANYOSTORE', () {
    expect(invoiceShowsBrand('BASIK PGMTA'), isFalse);
    expect(invoiceShowsBrand('basik metro'), isFalse);
    expect(invoiceShowsBrand('BLOK B'), isTrue);
    expect(invoiceShowsBrand('Anyostore Metro'), isTrue);
  });

  test('instagram hanya untuk toko BASIK', () {
    expect(invoiceInstagram('BASIK PGMTA'), '@basik.pgmta');
    expect(invoiceInstagram('TOKO B'), '@anyostore');
    expect(invoiceInstagram('Toko B', 'Blok B lantai LG los F no 107'), '@anyostore');
    expect(invoiceInstagram('Gudang Anyostore Metro'), isNull);
  });

  test('label tipe harga pelanggan', () {
    expect(invoiceCustomerTierLabel('semi_grosir'), 'Semi Grosir');
    expect(invoiceCustomerTierLabel('grosir_seri'), 'Grosir Seri');
    expect(invoiceCustomerTierLabel(null), 'Reguler');
  });

  testWidgets('invoice BASIK memuat rekening dan tanpa stempel LUNAS', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: InvoiceImage(payload: _payload()))),
    ));
    expect(find.text('BASIK PGMTA'), findsOneWidget);
    expect(find.text('ANYOSTORE'), findsNothing);
    expect(find.text('REKENING'), findsOneWidget);
    expect(find.text('0042813603'), findsOneWidget);
    expect(find.text('1640000929465'), findsOneWidget);
    expect(find.text('a.n $invoiceBankHolder'), findsOneWidget);
    expect(find.text('LUNAS'), findsNothing);
    expect(find.text('Celana Baggy A104'), findsOneWidget);
    expect(find.text('Rp 360.000'), findsOneWidget);
    // Tabel barang satu baris 4 kolom: BARANG | HARGA/PCS | QTY | JUMLAH.
    expect(find.text('BARANG'), findsOneWidget);
    expect(find.text('HARGA/PCS'), findsOneWidget);
    expect(find.text('QTY'), findsOneWidget);
    expect(find.text('JUMLAH'), findsOneWidget);
    // Harga per pcs ikut tampil di baris barang dengan format "Rp 185.000/pcs".
    expect(find.text('Rp 185.000/pcs'), findsOneWidget);
    // Muncul di baris barang dan di ringkasan subtotal.
    expect(find.text('Rp 370.000'), findsNWidgets(2));
    // Invoice penagihan: metode bayar & kembalian tidak ditampilkan.
    expect(find.text('Tunai'), findsNothing);
    expect(find.text('Kembalian'), findsNothing);
    expect(find.textContaining('Simpan invoice'), findsNothing);
    // Catatan bawah sesuai permintaan.
    expect(find.textContaining('cek produk kami lainnya anyostore.my.id'), findsOneWidget);
    // Header: dua nomor HP + Instagram khusus BASIK.
    expect(find.text('LANTAI 6 blok B no 116'), findsOneWidget);
    expect(find.text('0812-3456-7890'), findsOneWidget);
    expect(find.text('0857-0000-1111'), findsOneWidget);
    expect(find.text('@basik.pgmta'), findsOneWidget);
    // Catatan penukaran sudah dihapus.
    expect(find.textContaining('tidak dapat ditukar'), findsNothing);
  });

  testWidgets('invoice toko Blok B menampilkan ANYOSTORE', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: InvoiceImage(payload: _payload(storeName: 'BLOK B')))),
    ));
    expect(find.text('ANYOSTORE'), findsOneWidget);
    expect(find.text('BLOK B'), findsOneWidget);
    expect(find.text('@anyostore'), findsOneWidget);
  });
}
