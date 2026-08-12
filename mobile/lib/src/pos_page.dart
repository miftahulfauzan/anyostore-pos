import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import 'api_client.dart';
import 'auth_store.dart';
import 'inventory_page.dart';
import 'more_page.dart';
import 'offline_store.dart';
import 'reports_page.dart';
import 'format.dart';
import 'history_tab.dart';
import 'payment_sheet.dart';
import 'printer_setup.dart';
import 'barcode_scanner_page.dart';
import 'variant_picker.dart';
import 'task_ui.dart';

class CartItem {
  CartItem({
    required this.productId,
    required this.name,
    required this.price,
    required this.qty,
    this.variantId,
    this.variantLabel,
    this.photo,
    this.priceOverride,
    this.stockAvailable,
  });

  final int productId;
  final int? variantId;
  final String name;
  final int? stockAvailable;
  final String? variantLabel;
  String? photo;
  double price;
  int qty;
  double? priceOverride;
}

class PosPage extends StatefulWidget {
  /// Tab yang diminta halaman lain (misal Dashboard -> Kasir).
  static final ValueNotifier<int> requestTab = ValueNotifier<int>(0);
  const PosPage({super.key});

  @override
  State<PosPage> createState() => _PosPageState();
}

class _PosPageState extends State<PosPage> {
  late final ApiClient _api;
  int _tab = 0;
  final _search = TextEditingController();
  final List<CartItem> _cart = [];
  Timer? _previewTimer;
  Timer? _syncTimer;

  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _visible = [];
  List<Map<String, dynamic>> _warehouses = [];
  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _branches = [];
  int? _posBranchId;
  String _warehouseId = '';
  int? _customerId;
  String _promoCode = '';
  Map<String, dynamic>? _preview;
  bool _loading = true;
  bool _saving = false;
  bool _autoPrint = false;
  String? _error;
  String? _cartError;

  ApiClient get _client {
    final auth = context.read<AuthStore>();
    _api.setToken(auth.token);
    return _api;
  }

  @override
  void initState() {
    super.initState();
    _api = context.read<AuthStore>().api;
    PosPage.requestTab.addListener(_onExternalTab);
    _loadData();
    _syncPending();
    // Sinkronisasi berkala: perubahan produk via web ikut ter-refresh.
    _syncTimer = Timer.periodic(const Duration(seconds: 60), (_) {
      if (mounted) _loadData(silent: true);
    });
  }

  Future<void> _syncPending() async {
    final n = await syncOfflineTransactions(_client);
    if (n > 0 && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('$n transaksi offline berhasil disinkronkan')));
    }
  }

  @override
  void dispose() {
    _previewTimer?.cancel();
    _syncTimer?.cancel();
    PosPage.requestTab.removeListener(_onExternalTab);
    _search.dispose();
    super.dispose();
  }

  void _onExternalTab() {
    if (mounted) setState(() => _tab = PosPage.requestTab.value);
  }

  String _mediaUrl(String? path) => path == null || path.isEmpty
      ? ''
      : '${_api.baseUrl.replaceAll(RegExp(r'/api$'), '')}$path';

  int get _branchId => context.read<AuthStore>().branchId ?? 0;

  Future<void> _loadData({bool silent = false}) async {
    final branch = _posBranchId ?? _branchId;
    if (branch == 0) return;
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final isOwner = context.read<AuthStore>().role == 'owner';
      final results = await Future.wait([
        _client.products(branchId: branch),
        _client.warehouses(branch),
        _client.customers(),
        _client.storeSettings(),
        if (isOwner) _client.branches(),
      ]);
      if (!mounted) return;
      if (isOwner) {
        final branches = (results[4] as List).cast<Map<String, dynamic>>();
        setState(() {
          _branches = branches;
          _posBranchId ??= _branchId;
        });
      }
      if (!mounted) return;
      setState(() {
        _products = (results[0] as List).cast<Map<String, dynamic>>();
        _visible = List.of(_products);
        _warehouses = (results[1] as List).cast<Map<String, dynamic>>();
        _customers = (results[2] as List).cast<Map<String, dynamic>>();
        final settings = results[3] as Map<String, dynamic>;
        _autoPrint = settings['auto_print'] == '1' || settings['auto_print'] == true;
        if (_warehouseId.isEmpty && _warehouses.isNotEmpty) {
          _warehouseId = '${_warehouses.first['id']}';
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted && !silent) setState(() => _loading = false);
    }
  }

  void _applyFilter() {
    final q = _search.text.trim().toLowerCase();
    setState(() {
      _visible = q.isEmpty
          ? List.of(_products)
          : _products.where((p) {
              final name = (p['name'] ?? '').toString().toLowerCase();
              final sku = (p['sku'] ?? '').toString().toLowerCase();
              final barcode = (p['barcode'] ?? '').toString().toLowerCase();
              return name.contains(q) || sku.contains(q) || barcode.contains(q);
            }).toList();
    });
  }

  Future<void> _addProduct(Map<String, dynamic> product) async {
    final variantCount = int.tryParse('${product['variant_count'] ?? 0}') ?? 0;
    int? variantId;
    int qty = 1;
    if (variantCount > 0) {
      try {
        final detail = await _client.product(int.parse('${product['id']}'),
            branchId: _posBranchId ?? _branchId);
        if (!mounted) return;
        final variants =
            ((detail['variants'] as List?) ?? []).cast<Map<String, dynamic>>();
        final result = await showDialog<Map<String, dynamic>>(
          context: context,
          builder: (_) => VariantPicker(product: detail, variants: variants),
        );
        if (result == null) return;
        variantId = result['variant_id'] as int?;
        qty = (result['qty'] as int?) ?? 1;
        final selectedVariants =
            variants.where((v) => v['id'] == variantId).toList();
        final selectedVariant =
            selectedVariants.isEmpty ? null : selectedVariants.first;
        _addToCart(
          productId: int.parse('${product['id']}'),
          name: product['name']?.toString() ?? '',
          price: asNum(detail['price']),
          variantId: variantId,
          variantLabel: selectedVariant == null
              ? null
              : [selectedVariant['color'], selectedVariant['size']]
                  .where((e) => e != null && e.toString().isNotEmpty)
                  .join(' / '),
          photo: selectedVariant?['photo_path']?.toString(),
          qty: qty,
          stockAvailable:
              int.tryParse('${selectedVariant?['stock'] ?? 0}') ?? 0,
        );
      } on ApiException catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(e.message)));
        }
        return;
      }
    } else {
      _addToCart(
        productId: int.parse('${product['id']}'),
        name: product['name']?.toString() ?? '',
        price: asNum(product['price']),
        variantId: null,
        variantLabel: null,
        photo: product['photo_path']?.toString(),
        qty: 1,
        stockAvailable: int.tryParse('${product['stock'] ?? 0}') ?? 0,
      );
    }
    setState(() {});
    _schedulePreview();
  }

  void _addToCart({
    required int productId,
    required String name,
    required double price,
    required int? variantId,
    required String? variantLabel,
    required String? photo,
    required int qty,
    int? stockAvailable,
  }) {
    final existing = _cart
        .where((c) => c.productId == productId && c.variantId == variantId);
    if (existing.isNotEmpty) {
      existing.first.qty += qty;
    } else {
      _cart.add(CartItem(
        productId: productId,
        name: name,
        price: price,
        variantId: variantId,
        variantLabel: variantLabel,
        photo: photo,
        qty: qty,
        stockAvailable: stockAvailable,
      ));
    }
  }

  void _schedulePreview() {
    _previewTimer?.cancel();
    _previewTimer = Timer(const Duration(milliseconds: 350), _doPreview);
  }

  Future<void> _doPreview() async {
    if (_cart.isEmpty) {
      if (mounted) setState(() => _preview = null);
      return;
    }
    try {
      final items = _cart
          .map((c) => {
                'product_id': c.productId,
                if (c.variantId != null) 'variant_id': c.variantId,
                'quantity': c.qty,
                if (c.priceOverride != null) 'price_override': c.priceOverride,
              })
          .toList();
      final preview = await _client.previewTransaction({
        'branch_id': _posBranchId ?? _branchId,
        'customer_id': _customerId,
        'items': items,
        if (_promoCode.trim().isNotEmpty) 'promo_code': _promoCode.trim(),
      });
      if (mounted) setState(() => _preview = preview);
    } on ApiException catch (e) {
      if (mounted) setState(() => _cartError = e.message);
    }
  }

  double get _cartTotal =>
      _cart.fold(0, (sum, c) => sum + (c.priceOverride ?? c.price) * c.qty);

  Future<void> _openCart() async {
    setState(() => _cartError = null);
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _CartSheet(
        cart: _cart,
        customers: _customers,
        customerId: _customerId,
        promoCode: _promoCode,
        preview: _preview,
        error: _cartError,
        saving: _saving,
        onCustomerChanged: (id) {
          setState(() => _customerId = id);
          _schedulePreview();
        },
        onPromoChanged: (code) {
          setState(() => _promoCode = code);
          _schedulePreview();
        },
        onQtyChanged: (item, delta) {
          setState(() => item.qty = math.max(1, item.qty + delta));
          _schedulePreview();
        },
        onRemove: (item) {
          setState(() => _cart.remove(item));
          _schedulePreview();
        },
        onEditPrice: (item) async {
          final controller = TextEditingController(
              text: item.priceOverride?.toStringAsFixed(0) ??
                  item.price.toStringAsFixed(0));
          final result = await showDialog<double>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Ubah harga'),
              content: TextField(
                controller: controller,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(prefixText: 'Rp '),
              ),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Batal')),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx,
                      double.tryParse(controller.text.replaceAll('.', ''))),
                  child: const Text('Simpan'),
                ),
              ],
            ),
          );
          if (result != null) {
            setState(() => item.priceOverride = result);
            _schedulePreview();
          }
        },
        onPay: () => _checkout(),
      ),
    );
  }

  Future<void> _checkout() async {
    final branch = _posBranchId ?? _branchId;
    if (_cart.isEmpty) return;
    if (branch == 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content:
              Text('Sesi toko tidak ditemukan. Keluar lalu login ulang.')));
      return;
    }
    if (_warehouseId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Gudang belum dipilih. Muat ulang data toko.')));
      return;
    }
    final grandTotal = asNum(_preview?['grand_total'] ?? _cartTotal);
    final payment = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => PaymentSheet(grandTotal: grandTotal),
    );
    if (payment == null || !mounted) return;
    final lowStock = _cart
        .where((c) => c.stockAvailable != null && c.stockAvailable! < c.qty)
        .toList();
    if (lowStock.isNotEmpty) {
      final first = lowStock.first;
      final label = first.name +
          (first.variantLabel != null ? ' (${first.variantLabel})' : '');
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Stok kurang'),
          content: Text(
              'Stok $label kurang - tersedia ${first.stockAvailable}, diminta ${first.qty}. Lanjutkan transaksi?'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Kembali')),
            FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Lanjutkan')),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    // Tutup sheet keranjang dulu supaya pesan sukses/error tampil di halaman utama.
    Navigator.of(context).pop();
    if (!mounted) return;
    final allowNegativeStock = lowStock.isNotEmpty;
    final warehouseId = int.tryParse(_warehouseId);
    if (warehouseId == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Gudang belum dipilih')));
      return;
    }
    setState(() => _saving = true);
    final clientTransactionId = uuidV4();
    final items = _cart
        .map((c) => {
              'product_id': c.productId,
              if (c.variantId != null) 'variant_id': c.variantId,
              'quantity': c.qty,
              // Harga ikut HP: penting untuk mode offline.
              'price': c.priceOverride ?? c.price,
              if (c.priceOverride != null) 'price_override': c.priceOverride,
            })
        .toList();
    final payload = <String, dynamic>{
      'branch_id': branch,
      'warehouse_id': warehouseId,
      'items': items,
      'client_transaction_id': clientTransactionId,
      'allow_negative_stock': allowNegativeStock,
      ...payment,
      if (_customerId != null) 'customer_id': _customerId,
      if (_promoCode.trim().isNotEmpty) 'promo_code': _promoCode.trim(),
    };
    try {
      final result = await _client.createTransaction(payload);
      if (!mounted) return;
      final id = int.tryParse('${result['id']}');
      _cart.clear();
      _preview = null;
      _promoCode = '';
      _customerId = null;
      await showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Transaksi Berhasil'),
          content: Text(
              '${result['invoice_no']}\n\nTotal: ${fmtRp(asNum(result['grand_total']))}\nKembalian: ${fmtRp(asNum(result['change']))}'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Selesai')),
            FilledButton.icon(
              onPressed: () {
                Navigator.pop(ctx);
                if (id != null) {
                  printReceiptNow(context, () => _client.receipt(id));
                }
              },
              icon: const Icon(Icons.print),
              label: const Text('Cetak Struk'),
            ),
          ],
        ),
      );
      if (!mounted) return;
      if (_autoPrint && id != null) {
        printReceiptNow(context, () => _client.receipt(id));
      }
      _loadData();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (e) {
      final isNetwork =
          e is SocketException || e is TimeoutException || e is http.ClientException;
      if (isNetwork) {
        // Simpan offline: total & harga ikut HP, stok dipaksa negatif, sync otomatis nanti.
        final tempInvoice = 'OFF-$branch-${DateTime.now().millisecondsSinceEpoch}';
        payload['offline'] = true;
        payload['offline_invoice_no'] = tempInvoice;
        payload['allow_negative_stock'] = true;
        payload['subtotal'] = asNum(_preview?['subtotal'] ?? _cartTotal);
        payload['discount'] = asNum(_preview?['discount'] ?? 0);
        final offlineTotal = asNum(_preview?['grand_total'] ?? _cartTotal);
        await OfflineStore.insert(payload, tempInvoice,
            grandTotal: offlineTotal);
        if (!mounted) return;
        _cart.clear();
        _preview = null;
        _promoCode = '';
        _customerId = null;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(
                'Transaksi disimpan offline ($tempInvoice). Akan otomatis sync saat internet kembali.')));
        _loadData();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Gagal memproses pembayaran: $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthStore>();
    final pages = <Widget>[
      _buildKasir(),
      HistoryTab(api: _client, role: auth.role),
      InventoryPage(api: _client, branchId: _branchId, role: auth.role),
      ReportsPage(api: _client),
      MorePage(api: _client, branchId: _branchId, role: auth.role),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text('Anyostore App'
            '${auth.userName != null ? ' · ${auth.userName}' : ''}'),
        actions: [
          IconButton(
            onPressed: () => auth.logout(),
            icon: const Icon(Icons.logout),
            tooltip: 'Keluar',
          ),
        ],
      ),
      body: IndexedStack(index: _tab, children: pages),
      bottomNavigationBar: GlassNavBar(
        current: switch (_tab) {
          0 => 2,
          1 => 0,
          2 => 1,
          _ => _tab,
        },
        onSelect: (i) => setState(() {
          _tab = switch (i) {
            0 => 1,
            1 => 2,
            2 => 0,
            _ => i,
          };
          if (_tab == 0) _loadData(silent: true);
        }),
        items: const [
          (icon: Icons.receipt_long_outlined, activeIcon: Icons.receipt_long, label: 'Riwayat'),
          (icon: Icons.inventory_2_outlined, activeIcon: Icons.inventory_2, label: 'Stok'),
          (icon: Icons.add, activeIcon: Icons.add, label: 'Kasir'),
          (icon: Icons.bar_chart_outlined, activeIcon: Icons.bar_chart, label: 'Laporan'),
          (icon: Icons.more_horiz, activeIcon: Icons.more_horiz, label: 'Lainnya'),
        ],
      ),
    );
  }

  Future<void> _openScanner() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const BarcodeScannerPage()),
    );
    if (code == null || !mounted) return;
    setState(() => _search.text = code);
    _applyFilter();
  }

  Widget _buildKasir() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!),
              const SizedBox(height: 12),
              FilledButton(
                  onPressed: _loadData, child: const Text('Coba lagi')),
            ],
          ),
        ),
      );
    }
    return Column(
      children: [
        if (context.read<AuthStore>().role == 'owner' && _branches.length > 1)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
            child: DropdownButtonFormField<int?>(
              initialValue: _posBranchId,
              decoration: const InputDecoration(
                  isDense: true,
                  labelText: 'Toko / Gudang',
                  prefixIcon: Icon(Icons.store, size: 18),
                  border: OutlineInputBorder()),
              items: [
                for (final b in _branches)
                  DropdownMenuItem<int?>(
                      value: int.tryParse('${b['id']}'),
                      child: Text(b['name']?.toString() ?? '')),
              ],
              onChanged: (v) {
                setState(() {
                  _posBranchId = v;
                  _warehouseId = '';
                  _cart.clear();
                  _preview = null;
                  _customerId = null;
                  _promoCode = '';
                });
                _loadData();
              },
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: Row(
            children: [
              if (_warehouses.length > 1) ...[
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _warehouseId.isEmpty ? null : _warehouseId,
                    decoration: const InputDecoration(
                        isDense: true,
                        labelText: 'Gudang',
                        border: OutlineInputBorder()),
                    items: [
                      for (final w in _warehouses)
                        DropdownMenuItem(
                            value: '${w['id']}',
                            child: Text(w['name']?.toString() ?? '')),
                    ],
                    onChanged: (v) => setState(() => _warehouseId = v ?? ''),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                flex: 2,
                child: TextField(
                  controller: _search,
                  onChanged: (_) => _applyFilter(),
                  decoration: InputDecoration(
                      prefixIcon: const Icon(Icons.search),
                      isDense: true,
                      hintText: 'Cari nama / SKU / barcode',
                      border: const OutlineInputBorder(),
                      suffixIcon: IconButton(
                        onPressed: _openScanner,
                        icon: const Icon(Icons.qr_code_scanner),
                        tooltip: 'Scan barcode',
                      )),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _loadData(silent: true),
            color: kTaskDark,
            child: _visible.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      SizedBox(height: 220),
                      Center(child: Text('Produk tidak ditemukan')),
                    ],
                  )
                : GridView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(12),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      childAspectRatio: 0.62,
                    ),
                    itemCount: _visible.length,
                    itemBuilder: (_, i) => _ProductCard(
                      product: _visible[i],
                      mediaUrl: _mediaUrl,
                      onTap: () => _addProduct(_visible[i]),
                    ),
                  ),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52)),
              onPressed: _cart.isEmpty ? null : _openCart,
              icon: const Icon(Icons.shopping_cart),
              label:
                  Text('Keranjang ${_cart.length} item · ${fmtRp(_cartTotal)}'),
            ),
          ),
        ),
      ],
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.product,
    required this.mediaUrl,
    required this.onTap,
  });

  final Map<String, dynamic> product;
  final String Function(String?) mediaUrl;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name = product['name']?.toString() ?? '';
    final price = asNum(product['price']);
    final stock = int.tryParse('${product['stock'] ?? 0}') ?? 0;
    final variantCount = int.tryParse('${product['variant_count'] ?? 0}') ?? 0;
    final photo = mediaUrl(product['photo_path']?.toString());
    return GlassCard(
      radius: 20,
      padding: EdgeInsets.zero,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
            Expanded(
              child: photo.isEmpty
                  ? Container(
                      color: Colors.grey.shade200,
                      alignment: Alignment.center,
                      child: const Icon(Icons.image_not_supported,
                          color: Colors.grey),
                    )
                  : Image.network(
                      photo,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        color: Colors.grey.shade200,
                        alignment: Alignment.center,
                        child: const Icon(Icons.image_not_supported,
                            color: Colors.grey),
                      ),
                    ),
            ),
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(fmtRp(price),
                      style: TextStyle(
                          fontWeight: FontWeight.w800,
                          color: Theme.of(context).colorScheme.primary)),
                  Text(
                      variantCount > 0
                          ? '$variantCount varian · stok $stock'
                          : 'Stok $stock',
                      style: TextStyle(
                          fontSize: 12,
                          color: Theme.of(context).colorScheme.outline)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _CartSheet extends StatelessWidget {
  const _CartSheet({
    required this.cart,
    required this.customers,
    required this.customerId,
    required this.promoCode,
    required this.preview,
    required this.error,
    required this.saving,
    required this.onCustomerChanged,
    required this.onPromoChanged,
    required this.onQtyChanged,
    required this.onRemove,
    required this.onEditPrice,
    required this.onPay,
  });

  final List<CartItem> cart;
  final List<Map<String, dynamic>> customers;
  final int? customerId;
  final String promoCode;
  final Map<String, dynamic>? preview;
  final String? error;
  final bool saving;
  final ValueChanged<int?> onCustomerChanged;
  final ValueChanged<String> onPromoChanged;
  final void Function(CartItem, int) onQtyChanged;
  final ValueChanged<CartItem> onRemove;
  final ValueChanged<CartItem> onEditPrice;
  final VoidCallback onPay;

  @override
  Widget build(BuildContext context) {
    final subtotal = asNum(preview?['subtotal'] ??
        cart.fold(0.0, (s, c) => s + (c.priceOverride ?? c.price) * c.qty));
    final discount = asNum(preview?['discount'] ?? 0);
    final grandTotal = asNum(preview?['grand_total'] ?? subtotal);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Keranjang (${cart.length})',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            if (customers.isNotEmpty)
              DropdownButtonFormField<int?>(
                initialValue: customerId,
                decoration: const InputDecoration(
                    isDense: true,
                    labelText: 'Pelanggan (opsional)',
                    border: OutlineInputBorder()),
                items: [
                  const DropdownMenuItem<int?>(
                      value: null, child: Text('Tanpa pelanggan')),
                  for (final c in customers)
                    DropdownMenuItem<int?>(
                        value: int.tryParse('${c['id']}'),
                        child: Text(
                            '${c['name']}${c['phone'] != null && (c['phone'] as String).isNotEmpty ? ' · ${c['phone']}' : ''}')),
                ],
                onChanged: onCustomerChanged,
              ),
            const SizedBox(height: 10),
            TextField(
              decoration: const InputDecoration(
                  isDense: true,
                  labelText: 'Kode promo (opsional)',
                  border: OutlineInputBorder()),
              onChanged: onPromoChanged,
            ),
            const SizedBox(height: 8),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final item in cart)
                    GlassCard(
                      padding: EdgeInsets.zero,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 6),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(item.name,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w700)),
                                  if (item.variantLabel != null)
                                    Text(item.variantLabel!,
                                        style: TextStyle(
                                            fontSize: 12,
                                            color: Theme.of(context)
                                                .colorScheme
                                                .outline)),
                                  Text(fmtRp(item.priceOverride ?? item.price)),
                                ],
                              ),
                            ),
                            IconButton(
                              onPressed: () => onQtyChanged(item, -1),
                              icon: const Icon(Icons.remove_circle_outline),
                            ),
                            Text('${item.qty}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800)),
                            IconButton(
                              onPressed: () => onQtyChanged(item, 1),
                              icon: const Icon(Icons.add_circle_outline),
                            ),
                            IconButton(
                              onPressed: () => onEditPrice(item),
                              icon: const Icon(Icons.edit_outlined),
                              tooltip: 'Ubah harga',
                            ),
                            IconButton(
                              onPressed: () => onRemove(item),
                              icon: const Icon(Icons.delete_outline),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text('Subtotal: ${fmtRp(subtotal)}'),
            if (discount > 0) Text('Diskon: -${fmtRp(discount)}'),
            Text('Total: ${fmtRp(grandTotal)}',
                style:
                    const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            if (error != null) ...[
              const SizedBox(height: 6),
              Text(error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 10),
            FilledButton(
              style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(50)),
              onPressed: saving || cart.isEmpty ? null : onPay,
              child: saving
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Bayar'),
            ),
          ],
        ),
      ),
    );
  }
}
