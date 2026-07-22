import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'auth_store.dart';
import 'printer_service.dart';

class PosPage extends StatefulWidget {
  const PosPage({super.key});

  @override
  State<PosPage> createState() => _PosPageState();
}

class _PosPageState extends State<PosPage> {
  final scan = TextEditingController();
  final cart = <Map<String, dynamic>>[];
  String? message;

  // Hardware barcode scanners normally send keyboard input plus Enter. A camera
  // scanner adapter can call this method without changing the POS cart logic.
  void addBarcode(String barcode) {
    if (barcode.trim().isEmpty) return;
    setState(() => message =
        'Barcode $barcode diterima. Sambungkan lookup produk pada langkah integrasi berikutnya.');
    scan.clear();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('POS Pakaian'),
          actions: [
            IconButton(
                onPressed: () => context.read<AuthStore>().logout(),
                icon: const Icon(Icons.logout))
          ],
        ),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              TextField(
                controller: scan,
                onSubmitted: addBarcode,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.qr_code_scanner),
                  labelText: 'Scan barcode atau cari SKU',
                  suffixIcon: IconButton(
                      icon: const Icon(Icons.camera_alt),
                      onPressed: () => setState(() => message =
                          'Adapter kamera barcode belum dikonfigurasi.')),
                ),
              ),
              if (message != null)
                Padding(
                    padding: const EdgeInsets.all(12), child: Text(message!)),
              Expanded(
                  child: cart.isEmpty
                      ? const Center(child: Text('Keranjang kosong'))
                      : ListView()),
              FilledButton.icon(
                onPressed: () => PrinterService().printReceipt(
                    {'message': 'Hubungkan printer Bluetooth di Settings'}),
                icon: const Icon(Icons.print),
                label: const Text('Cetak Struk'),
              ),
            ],
          ),
        ),
      );
}
