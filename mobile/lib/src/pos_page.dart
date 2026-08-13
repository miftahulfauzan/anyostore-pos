import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
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
import 'printer_service.dart';
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
  bool _barVisible = true;
  String? _error;

  /// Dipakai sheet keranjang untuk me-refresh dirinya saat _cart/_preview
  /// berubah dari halaman POS (showModalBottomSheet tidak rebuild otomatis).
  StateSetter? _sheetRefresh;
  String? _cartError;
  String? _lastProductsSync;

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
    PrinterService.setActiveBranch(branch);

    // Buka aplikasi (bukan refresh): kalau sudah disinkron hari ini,
    // langsung pakai cache lokal tanpa menyentuh server.
    if (!silent && _products.isEmpty) {
      try {
        final cached = await OfflineStore.loadProductsCache(branch);
        if (cached != null && cached['sync_date'] == todayWib()) {
          final payload = cached['payload'] as Map<String, dynamic>;
          if (mounted) {
            setState(() {
              _applyStoreData(payload);
              _error = null;
              _loading = false;
            });
          }
          _lastProductsSync = cached['updated_at']?.toString() ?? '';
          return;
        }
      } catch (_) {}
    }

    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    } else if (_products.isNotEmpty && _lastProductsSync != null) {
      // Cek versi dulu: kalau tidak ada perubahan, pakai data & gambar dari cache.
      try {
        final v = await _client.productsVersion(branchId: branch);
        final ts = v['updated_at']?.toString() ?? '';
        if (ts.isNotEmpty && ts == _lastProductsSync) return;
      } catch (_) {}
    }
    if (!mounted) return;
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
      final storePayload = {
        'products': results[0],
        'warehouses': results[1],
        'customers': results[2],
        'settings': results[3],
        if (isOwner) 'branches': results[4],
      };
      setState(() => _applyStoreData(storePayload));
      try {
        final v = await _client.productsVersion(branchId: branch);
        _lastProductsSync = v['updated_at']?.toString() ?? '';
        await OfflineStore.saveProductsCache(branch,
            jsonEncode(storePayload), _lastProductsSync ?? '', todayWib());
      } catch (_) {}
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted && !silent) setState(() => _loading = false);
    }
  }

  /// Terapkan data produk/gudang/pelanggan/pengaturan (dari server atau cache lokal).
  void _applyStoreData(Map<String, dynamic> payload) {
    _products =
        ((payload['products'] as List?) ?? []).cast<Map<String, dynamic>>();
    _visible = List.of(_products);
    _warehouses =
        ((payload['warehouses'] as List?) ?? []).cast<Map<String, dynamic>>();
    _customers =
        ((payload['customers'] as List?) ?? []).cast<Map<String, dynamic>>();
    final settings = (payload['settings'] as Map<String, dynamic>?) ?? {};
    _autoPrint =
        settings['auto_print'] == '1' || settings['auto_print'] == true;
    if (_warehouseId.isEmpty && _warehouses.isNotEmpty) {
      _warehouseId = '${_warehouses.first['id']}';
    }
    final branches =
        ((payload['branches'] as List?) ?? []).cast<Map<String, dynamic>>();
    if (branches.isNotEmpty) {
      _branches = branches;
      _posBranchId ??= _branchId;
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
      if (mounted) {
        setState(() => _preview = preview);
        _sheetRefresh?.call(() {});
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _cartError = e.message);
    }
  }

  double get _cartTotal =>
      _cart.fold(0, (sum, c) => sum + (c.priceOverride ?? c.price) * c.qty);

  Future<void> _holdCart() async {
    if (_cart.isEmpty) return;
    final branch = _posBranchId ?? _branchId;
    final preview = _preview;
    final items = _cart
        .map((c) => {
              'product_id': c.productId,
              if (c.variantId != null) 'variant_id': c.variantId,
              'quantity': c.qty,
              'price': c.priceOverride ?? c.price,
              if (c.priceOverride != null) 'price_override': c.priceOverride,
              'name': c.name,
              if (c.variantLabel != null) 'variant_label': c.variantLabel,
              if (c.photo != null) 'photo': c.photo,
            })
        .toList();
    try {
      await _client.holdTransaction({
        'branch_id': branch,
        'items': items,
        'subtotal': asNum(preview?['subtotal'] ?? _cartTotal),
        'discount_type': preview?['discount_type'] ?? 'none',
        'discount_value': asNum(preview?['discount'] ?? 0),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Transaksi ditahan. Bisa dilanjutkan kapan saja.')));
      setState(() {
        _cart.clear();
        _preview = null;
        _promoCode = '';
        _customerId = null;
      });
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _resumeCart() async {
    try {
      final branch = _posBranchId ?? _branchId;
      final pending = await _client.pendingTransactions(branchId: branch);
      if (!mounted) return;
      if (pending.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Tidak ada transaksi yang ditahan')));
        return;
      }
      final picked = await showDialog<int>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Transaksi Ditahan'),
          content: SizedBox(
            width: double.maxFinite,
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final p in pending)
                  ListTile(
                    dense: true,
                    title: Text('${(p['items'] is List ? (p['items'] as List).length : 0).toString()} item'),
                    subtitle: Text('Total ${fmtRp(asNum(p['subtotal']))}'),
                    onTap: () => Navigator.pop(
                        ctx, int.tryParse(p['id'].toString())),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Batal')),
          ],
        ),
      );
      if (picked == null || !mounted) return;
      final resumed = await _client.resumeTransaction(picked,
          branchId: _posBranchId ?? _branchId);
      if (!mounted) return;
      final items =
          ((resumed['items'] as List?) ?? []).cast<Map<String, dynamic>>();
      final cart = <CartItem>[];
      for (final it in items) {
        final vidRaw = it['variant_id'];
        cart.add(CartItem(
          productId: int.tryParse(it['product_id'].toString()) ?? 0,
          variantId:
              vidRaw != null ? int.tryParse(vidRaw.toString()) : null,
          name: it['name']?.toString() ?? 'Produk',
          variantLabel: it['variant_label']?.toString(),
          photo: it['photo']?.toString(),
          price: asNum(it['price'] ?? it['price_override']),
          priceOverride: it['price_override'] != null
              ? asNum(it['price_override'])
              : null,
          qty: int.tryParse(it['quantity'].toString()) ?? 1,
        ));
      }
      setState(() {
        _cart
          ..clear()
          ..addAll(cart);
        _customerId = int.tryParse(resumed['customer_id']?.toString() ?? '');
        _promoCode = '';
        _preview = null;
      });
      _schedulePreview();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _openCart() async {
    setState(() => _cartError = null);
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => StatefulBuilder(
        builder: (context, setSheetState) {
          _sheetRefresh = setSheetState;
          return _CartSheet(
        cart: _cart,
        customers: _customers,
        customerId: _customerId,
        promoCode: _promoCode,
        preview: _preview,
        error: _cartError,
        saving: _saving,
        onCustomerChanged: (id) {
          setState(() => _customerId = id);
          _sheetRefresh?.call(() {});
          _schedulePreview();
        },
        onPromoChanged: (code) {
          setState(() => _promoCode = code);
          _sheetRefresh?.call(() {});
          _schedulePreview();
        },
        onQtyChanged: (item, delta) {
          setState(() => item.qty = math.max(1, item.qty + delta));
          _sheetRefresh?.call(() {});
          _schedulePreview();
        },
        onQtySet: (item, value) {
          setState(() => item.qty = math.max(1, value));
          _sheetRefresh?.call(() {});
          _schedulePreview();
        },
        onHold: _holdCart,
        onResume: _resumeCart,
        onRemove: (item) {
          setState(() => _cart.remove(item));
          _sheetRefresh?.call(() {});
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
            _sheetRefresh?.call(() {});
            _schedulePreview();
          }
        },
        onPay: () => _checkout(),
      );
        },
      ),
    );
    _sheetRefresh = null;
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
      final isNetwork = e is ApiException && e.isNetwork ||
          e is SocketException ||
          e is TimeoutException ||
          e is http.ClientException;
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
      appBar: _AutoHideAppBar(
        visible: _barVisible,
        child: AppBar(
          // Header gaya Instagram: logo kiri, judul di tengah, aksi kanan.
          leadingWidth: 52,
          leading: Padding(
            padding: const EdgeInsets.only(left: 10),
            child: BrandLogo(api: _api, size: 34, radius: 11),
          ),
          title: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Anyostore App',
                  style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: Color(0xff1E3A5F))),
              if (auth.userName != null)
                Text(auth.userName!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                        color: Color(0xff8A857C))),
            ],
          ),
          bottom: const PreferredSize(
            preferredSize: Size.fromHeight(0.5),
            child: Divider(height: 0.5, thickness: 0.5, color: Color(0xffE7E0D6)),
          ),
          actions: [
            IconButton(
              onPressed: () => auth.logout(),
              icon: const Icon(Icons.logout),
              tooltip: 'Keluar',
            ),
          ],
        ),
      ),
      body: Stack(
        children: [
          NotificationListener<ScrollNotification>(
            onNotification: (n) {
              if (n.metrics.axis != Axis.vertical) return false;
              final double delta;
              if (n is ScrollUpdateNotification) {
                delta = n.scrollDelta ?? 0;
              } else if (n is OverscrollNotification) {
                delta = n.overscroll;
              } else {
                return false;
              }
              final px = n.metrics.pixels;
              if (_barVisible && delta > 0 && px > 40) {
                setState(() => _barVisible = false);
              } else if (!_barVisible && delta < 0 && px < 160) {
                setState(() => _barVisible = true);
              }
              return false;
            },
            child: IndexedStack(index: _tab, children: pages),
          ),
          // Navbar overlay: area di luar pil benar-benar transparan,
          // konten halaman tetap terlihat/mengalir di belakangnya.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: GlassNavBar(
              current: _tab,
              onSelect: (i) => setState(() {
                _tab = i;
                if (_tab == 0) _loadData(silent: true);
              }),
              items: const [
                (icon: Icons.shopping_bag_outlined, activeIcon: Icons.shopping_bag, label: 'POS'),
                (icon: Icons.receipt_long_outlined, activeIcon: Icons.receipt_long, label: 'Riwayat'),
                (icon: Icons.inventory_2_outlined, activeIcon: Icons.inventory_2, label: 'Stok'),
                (icon: Icons.bar_chart_outlined, activeIcon: Icons.bar_chart, label: 'Laporan'),
                (icon: Icons.more_horiz, activeIcon: Icons.more_horiz, label: 'Lainnya'),
              ],
            ),
          ),
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
    final bottomPad = MediaQuery.of(context).padding.bottom;
    return Stack(
      children: [
        Positioned.fill(
          child: RefreshIndicator(
            onRefresh: () => _loadData(silent: true),
            color: kTaskDark,
            child: CustomScrollView(
              keyboardDismissBehavior:
                  ScrollViewKeyboardDismissBehavior.onDrag,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                    child: _PosHeaderRow(
                      isOwner: context.read<AuthStore>().role == 'owner',
                      branches: _branches,
                      posBranchId: _posBranchId,
                      onBranchChanged: (v) {
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
                      warehouses: _warehouses,
                      warehouseId: _warehouseId,
                      onWarehouseChanged: (v) =>
                          setState(() => _warehouseId = v),
                      searchController: _search,
                      onSearchChanged: (_) => _applyFilter(),
                      onScan: _openScanner,
                    ),
                  ),
                ),
                if (_visible.isEmpty)
                  const SliverToBoxAdapter(
                    child: SizedBox(
                      height: 220,
                      child: Center(child: Text('Produk tidak ditemukan')),
                    ),
                  )
                else
                  SliverPadding(
                    padding:
                        EdgeInsets.fromLTRB(12, 12, 12, 178 + bottomPad),
                    sliver: SliverGrid(
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        childAspectRatio: 0.62,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (_, i) => _ProductCard(
                          product: _visible[i],
                          mediaUrl: _mediaUrl,
                          onTap: () => _addProduct(_visible[i]),
                        ),
                        childCount: _visible.length,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (_cart.isNotEmpty)
          Positioned(
            left: 12,
            right: 12,
            bottom: 98 + bottomPad,
            child: AnimatedScale(
              scale: 1,
              duration: const Duration(milliseconds: 180),
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52)),
                onPressed: _openCart,
                icon: const Icon(Icons.shopping_cart),
                label: Text(
                    'Keranjang ${_cart.length} item · ${fmtRp(_cartTotal)}'),
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
                  : CachedNetworkImage(
                      imageUrl: photo,
                      fit: BoxFit.cover,
                      placeholder: (_, __) => Container(
                        color: Colors.grey.shade200,
                        alignment: Alignment.center,
                        child: const Icon(Icons.image_not_supported,
                            color: Colors.grey),
                      ),
                      errorWidget: (_, __, ___) => Container(
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
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Expanded(
                        child: Text(name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 11.5, fontWeight: FontWeight.w700)),
                      ),
                      const SizedBox(width: 6),
                      Text(fmtRp(price),
                          maxLines: 1,
                          style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w800,
                              color: Theme.of(context).colorScheme.primary)),
                    ],
                  ),
                  Text(
                      variantCount > 0
                          ? '$variantCount varian · stok $stock'
                          : 'Stok $stock',
                      style: TextStyle(
                          fontSize: 10.8,
                          color: Theme.of(context).colorScheme.outline)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _PosHeaderRow extends StatefulWidget {
  const _PosHeaderRow(
      {
      required this.isOwner,
      required this.branches,
      required this.posBranchId,
      required this.onBranchChanged,
      required this.warehouses,
      required this.warehouseId,
      required this.onWarehouseChanged,
      required this.searchController,
      required this.onSearchChanged,
      required this.onScan});
  final bool isOwner;
  final List<Map<String, dynamic>> branches;
  final int? posBranchId;
  final ValueChanged<int?> onBranchChanged;
  final List<Map<String, dynamic>> warehouses;
  final String warehouseId;
  final ValueChanged<String> onWarehouseChanged;
  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onScan;

  @override
  State<_PosHeaderRow> createState() => _PosHeaderRowState();
}

class _PosHeaderRowState extends State<_PosHeaderRow> {
  String? _active; // 'branch' | 'search' | null
  final _searchFocus = FocusNode();

  bool get _hasBranch => widget.isOwner && widget.branches.length > 1;

  @override
  void initState() {
    super.initState();
    _searchFocus.addListener(_onSearchFocus);
  }

  @override
  void dispose() {
    _searchFocus.dispose();
    super.dispose();
  }

  void _onSearchFocus() {
    if (_searchFocus.hasFocus) {
      if (_active != 'search') setState(() => _active = 'search');
    } else if (_active == 'search') {
      setState(() => _active = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final total = c.maxWidth;
      const gap = 10.0;
      final double branchW;
      if (!_hasBranch) {
        branchW = 0;
      } else if (_active == 'search') {
        branchW = 0;
      } else if (_active == 'branch') {
        branchW = total - gap;
      } else {
        branchW = total * 0.36;
      }
      final searchW = total - gap - branchW;

      final branchName = widget.branches
          .firstWhere((b) => int.tryParse('${b['id']}') == widget.posBranchId,
              orElse: () => const {})
          ['name']?.toString();

      final Widget branchArea;
      if (_active == 'branch') {
        branchArea = Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButtonFormField<int?>(
              initialValue: widget.posBranchId,
              style: const TextStyle(fontSize: 12.5, color: Color(0xff1E3A5F)),
              decoration: const InputDecoration(
                  labelText: 'Toko / Gudang',
                  labelStyle: TextStyle(color: Color(0xff8A857C)),
                  prefixIcon: Icon(Icons.store, size: 18, color: Color(0xff1E3A5F)),
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(),
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 12, vertical: 13)),
              items: [
                for (final b in widget.branches)
                  DropdownMenuItem<int?>(
                      value: int.tryParse('${b['id']}'),
                      child: Text(b['name']?.toString() ?? '')),
              ],
              onChanged: (v) {
                widget.onBranchChanged(v);
                setState(() => _active = null);
              },
            ),
            if (widget.warehouses.length > 1) ...[
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue:
                    widget.warehouseId.isEmpty ? null : widget.warehouseId,
                style: const TextStyle(fontSize: 12.5, color: Color(0xff1E3A5F)),
                decoration: const InputDecoration(
                    labelText: 'Gudang',
                    labelStyle: TextStyle(color: Color(0xff8A857C)),
                    filled: true,
                    fillColor: Colors.white,
                    border: OutlineInputBorder(),
                    contentPadding:
                        EdgeInsets.symmetric(horizontal: 12, vertical: 13)),
                items: [
                  for (final w in widget.warehouses)
                    DropdownMenuItem(
                        value: '${w['id']}',
                        child: Text(w['name']?.toString() ?? '')),
                ],
                onChanged: (v) => widget.onWarehouseChanged(v ?? ''),
              ),
            ],
          ],
        );
      } else {
        branchArea = Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => setState(() => _active = 'branch'),
            child: Container(
              height: 48,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0xffE7E0D6)),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.store, size: 17, color: Color(0xff1E3A5F)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(branchName ?? 'Toko / Gudang',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 12.5, color: Color(0xff1E3A5F))),
                  ),
                  const Icon(Icons.expand_more,
                      size: 18, color: Color(0xff8A857C)),
                ],
              ),
            ),
          ),
        );
      }

      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_hasBranch)
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeInOut,
              width: branchW,
              child: AnimatedSize(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeInOut,
                child: branchArea,
              ),
            ),
          if (_hasBranch) const SizedBox(width: gap),
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeInOut,
            width: searchW,
            child: TextField(
              controller: widget.searchController,
              focusNode: _searchFocus,
              onChanged: widget.onSearchChanged,
              onTap: () => setState(() => _active = 'search'),
              style: const TextStyle(fontSize: 12.5),
              decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: 'Cari nama / SKU / barcode',
                  border: const OutlineInputBorder(),
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 13),
                  suffixIcon: IconButton(
                    onPressed: widget.onScan,
                    icon: const Icon(Icons.qr_code_scanner),
                    tooltip: 'Scan barcode',
                  )),
            ),
          ),
        ],
      );
    });
  }
}

class _QtyInput extends StatefulWidget {
  const _QtyInput({required this.value, required this.onChanged});
  final int value;
  final ValueChanged<int> onChanged;

  @override
  State<_QtyInput> createState() => _QtyInputState();
}

class _QtyInputState extends State<_QtyInput> {
  late final TextEditingController _c;

  @override
  void initState() {
    super.initState();
    _c = TextEditingController(text: '${widget.value}');
  }

  @override
  void didUpdateWidget(_QtyInput oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value && _c.text != '${widget.value}') {
      _c.text = '${widget.value}';
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 48,
      child: TextField(
        controller: _c,
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
        decoration: InputDecoration(
          isDense: true,
          filled: true,
          fillColor: const Color(0xFFF0F4F9),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xffB9C9DC))),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xff1E3A5F), width: 1.4)),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        ),
        onChanged: (t) {
          final v = int.tryParse(t);
          if (v != null && v >= 1) widget.onChanged(v);
        },
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
    required this.onQtySet,
    required this.onRemove,
    required this.onEditPrice,
    required this.onPay,
    required this.onHold,
    required this.onResume,
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
  final void Function(CartItem, int) onQtySet;
  final ValueChanged<CartItem> onRemove;
  final ValueChanged<CartItem> onEditPrice;
  final VoidCallback onPay;
  final VoidCallback onHold;
  final VoidCallback onResume;

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
                                  Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.baseline,
                                    textBaseline: TextBaseline.alphabetic,
                                    children: [
                                      Expanded(
                                        child: Text(item.name,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w700)),
                                      ),
                                      const SizedBox(width: 6),
                                      Text(fmtRp(item.priceOverride ?? item.price),
                                          style: const TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w800,
                                              color: Color(0xff1E3A5F))),
                                    ],
                                  ),
                                  if (item.variantLabel != null)
                                    Text(item.variantLabel!,
                                        style: TextStyle(
                                            fontSize: 11,
                                            color: Theme.of(context)
                                                .colorScheme
                                                .outline)),
                                ],
                              ),
                            ),
                            IconButton(
                              onPressed: () => onQtyChanged(item, -1),
                              icon: const Icon(Icons.remove_circle_outline),
                            ),
                            _QtyInput(
                              value: item.qty,
                              onChanged: (v) => onQtySet(item, v),
                            ),
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
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onHold,
                    icon: const Icon(Icons.pause_circle_outline, size: 18),
                    label: const Text('Tahan'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onResume,
                    icon: const Icon(Icons.play_circle_outline, size: 18),
                    label: const Text('Ambil Tahan'),
                  ),
                ),
              ],
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


/// AppBar yang otomatis menghilang saat konten di-scroll ke bawah
/// dan muncul lagi saat scroll ke atas (menyusut mulus).
class _AutoHideAppBar extends StatelessWidget implements PreferredSizeWidget {
  const _AutoHideAppBar({required this.visible, required this.child});
  final bool visible;
  final AppBar child;

  // Header punya hairline 0.5px di bawahnya.
  static const _full = kToolbarHeight + 0.5;

  @override
  Size get preferredSize => Size.fromHeight(visible ? _full : 0);

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      height: visible ? _full : 0,
      clipBehavior: Clip.hardEdge,
      decoration: const BoxDecoration(color: Colors.white),
      alignment: Alignment.topCenter,
      child: visible ? child : const SizedBox.shrink(),
    );
  }
}
