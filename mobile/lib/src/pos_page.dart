import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import 'api_client.dart';
import 'auth_store.dart';
import 'inventory_page.dart';
import 'more_page.dart';
import 'offline_status.dart';
import 'offline_store.dart';
import 'prefetch_service.dart';
import 'reports_page.dart';
import 'format.dart';
import 'history_tab.dart';
import 'payment_sheet.dart';
import 'printer_service.dart';
import 'printer_setup.dart';
import 'barcode_scanner_page.dart';
import 'dashboard_page.dart';
import 'mutation_report_page.dart';
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
  StreamSubscription<List<ConnectivityResult>>? _connSub;

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
    _prefetchVariants();
    _connSub = Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online && OfflineStatus.offline.value) {
        OfflineStatus.notifyOnline();
        _syncPending();
        _loadData(silent: true);
        _prefetchVariants();
      }
    });
  }

  /// Unduh detail + varian semua produk cabang aktif ke cache lokal
  /// supaya offline langsung bisa pilih varian tanpa klik produk satu per satu.
  Future<void> _prefetchVariants() async {
    final branch = _posBranchId ?? _branchId;
    await PrefetchService.prefetchProductVariants(_client, branchId: branch);
  }

  Future<void> _syncPending() async {
    final n = await syncOfflineTransactions(_client);
    final m = await syncOfflineExpenses(_client);
    final total = n + m;
    if (total > 0 && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$total data offline berhasil disinkronkan')));
    }
  }

  @override
  void dispose() {
    _previewTimer?.cancel();
    _searchDebounce?.cancel();
    _connSub?.cancel();
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
    // POS punya pilihan toko sendiri; nonaktifkan scope owner dari Lainnya.
    _api.activeBranchId = null;
    PrinterService.setActiveBranch(branch);

    // Buka aplikasi (bukan refresh): kalau sudah disinkron hari ini,
    // langsung pakai cache lokal tanpa menyentuh server.
    if (!silent && _products.isEmpty) {
      try {
        final cached = await OfflineStore.loadProductsCache(branch);
        if (cached != null) {
          final payload = cached['payload'] as Map<String, dynamic>;
          if (mounted) {
            setState(() {
              _applyStoreData(payload);
              _error = null;
              _loading = false;
            });
          }
          _lastProductsSync = cached['updated_at']?.toString() ?? '';
          // Cache hari ini: langsung tampil tanpa sentuh server.
          if (cached['sync_date'] == todayWib()) return;
          // Cache lama: tampil dulu (instant), refresh dari server di background.
          silent = true;
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
        await OfflineStore.saveProductsCache(branch, jsonEncode(storePayload),
            _lastProductsSync ?? '', todayWib());
      } catch (_) {}
      // Unduh varian produk cabang aktif untuk offline (tidak mengganggu UI).
      _prefetchVariants();
    } on ApiException catch (e) {
      if (e.isNetwork) {
        // Offline: pakai cache produk berapa pun tanggalnya supaya POS tetap
        // bisa dipakai (keranjang & checkout offline berjalan).
        try {
          final cached = await OfflineStore.loadProductsCache(branch);
          if (cached != null) {
            final payload = cached['payload'] as Map<String, dynamic>;
            if (mounted) {
              setState(() {
                _applyStoreData(payload);
                _error = null;
                _loading = false;
              });
              _lastProductsSync = cached['updated_at']?.toString() ?? '';
            }
            return;
          }
        } catch (_) {}
      }
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

  Timer? _searchDebounce;

  void _applyFilterDebounced() {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 180), _applyFilter);
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
      final productId = int.parse('${product['id']}');
      final branch = _posBranchId ?? _branchId;
      final cacheKey = 'product-$branch-$productId';
      Map<String, dynamic>? detail;
      // Cache dulu (prefetch saat buka app sudah mengisi) supaya dialog
      // varian langsung muncul tanpa nunggu jaringan.
      try {
        final cached = await OfflineStore.cacheGet(cacheKey);
        detail = cached?['payload'] as Map<String, dynamic>?;
      } catch (_) {}
      if (detail != null) {
        // Tampilkan segera; versi terbaru di-refresh di background.
        unawaited(() async {
          try {
            final fresh = await _client.product(productId, branchId: branch);
            await OfflineStore.cacheSet(cacheKey, jsonEncode(fresh));
          } catch (_) {}
        }());
      } else {
        try {
          detail = await _client.product(productId, branchId: branch);
          await OfflineStore.cacheSet(cacheKey, jsonEncode(detail));
        } on ApiException catch (e) {
          if (!e.isNetwork) rethrow;
        }
      }
      if (detail == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text(
                  'Detail produk belum tersimpan offline. Buka produk ini sekali saat online.')));
        }
        return;
      }
      if (!mounted) return;
      final d = detail;
      try {
        final variants =
            ((d['variants'] as List?) ?? []).cast<Map<String, dynamic>>();
        final result = await showDialog<Map<String, dynamic>>(
          context: context,
          builder: (_) => VariantPicker(
              product: d, variants: variants, mediaUrl: _mediaUrl),
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
          price: asNum(d['price']),
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
    _previewTimer = Timer(const Duration(milliseconds: 150), _doPreview);
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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Transaksi ditahan. Bisa dilanjutkan kapan saja.')));
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
                    title: Text(
                        '${(p['items'] is List ? (p['items'] as List).length : 0).toString()} item'),
                    subtitle: Text('Total ${fmtRp(asNum(p['subtotal']))}'),
                    onTap: () =>
                        Navigator.pop(ctx, int.tryParse(p['id'].toString())),
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
          variantId: vidRaw != null ? int.tryParse(vidRaw.toString()) : null,
          name: it['name']?.toString() ?? 'Produk',
          variantLabel: it['variant_label']?.toString(),
          photo: it['photo']?.toString(),
          price: asNum(it['price'] ?? it['price_override']),
          priceOverride:
              it['price_override'] != null ? asNum(it['price_override']) : null,
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
    // Pakai MediaQuery halaman POS, BUKAN context sheet: route bottom sheet
    // memakai MediaQuery.removePadding sehingga padding di dalam sheet = 0.
    // Ini kunci supaya max tinggi benar-benar berhenti di bawah Dynamic Island.
    final media = MediaQuery.of(context);
    final topRatio = media.padding.top / media.size.height;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.55,
          minChildSize: 0.38,
          maxChildSize: (1 - topRatio).clamp(0.6, 1.0),
          builder: (context, scrollController) => StatefulBuilder(
            builder: (context, setSheetState) {
              _sheetRefresh = setSheetState;
              return ClipRRect(
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(24)),
                child: Material(
                  color: Theme.of(context).colorScheme.surface,
                  child: _CartSheet(
                    scrollController: scrollController,
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
                            decoration:
                                const InputDecoration(prefixText: 'Rp '),
                          ),
                          actions: [
                            TextButton(
                                onPressed: () => Navigator.pop(ctx),
                                child: const Text('Batal')),
                            FilledButton(
                              onPressed: () => Navigator.pop(
                                  ctx,
                                  double.tryParse(
                                      controller.text.replaceAll('.', ''))),
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
                  ),
                ),
              );
            },
          ),
        );
      },
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
      // ApiException network JUG tertangkap di sini (bukan catch umum),
      // jadi offline harus ditangani di sini.
      if (e.isNetwork) {
        await _saveOffline(payload, branch);
      } else if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (e) {
      final isNetwork = e is SocketException ||
          e is TimeoutException ||
          e is http.ClientException;
      if (isNetwork) {
        await _saveOffline(payload, branch);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Gagal memproses pembayaran: $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Simpan transaksi ke antrean offline (harga/total ikut HP, sync nanti).
  Future<void> _saveOffline(Map<String, dynamic> payload, int branch) async {
    final tempInvoice = 'OFF-$branch-${DateTime.now().millisecondsSinceEpoch}';
    payload['offline'] = true;
    payload['offline_invoice_no'] = tempInvoice;
    payload['allow_negative_stock'] = true;
    payload['subtotal'] = asNum(_preview?['subtotal'] ?? _cartTotal);
    payload['discount'] = asNum(_preview?['discount'] ?? 0);
    final offlineTotal = asNum(_preview?['grand_total'] ?? _cartTotal);
    await OfflineStore.insert(payload, tempInvoice, grandTotal: offlineTotal);
    if (!mounted) return;
    _cart.clear();
    _preview = null;
    _promoCode = '';
    _customerId = null;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
            'Transaksi disimpan offline ($tempInvoice). Akan otomatis sync saat internet kembali.')));
    _loadData();
    // Segarkan Riwayat supaya transaksi offline (kuning) langsung muncul.
    HistoryTab.reloadTick.value++;
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthStore>();
    // Role gudang tidak butuh POS/Riwayat: diganti Dashboard & Keuangan.
    final isGudang = auth.role == 'gudang';
    final pages = <Widget>[
      if (isGudang) DashboardPage(api: _client) else _buildKasir(),
      if (isGudang)
        MutationReportPage(api: _client)
      else
        HistoryTab(api: _client, role: auth.role),
      InventoryPage(api: _client, branchId: _branchId, role: auth.role),
      // Role gudang tidak pakai Laporan (backend menolak) -> tab dihapus.
      if (!isGudang) ReportsPage(api: _client, role: auth.role),
      MorePage(api: _client, branchId: _branchId, role: auth.role),
    ];
    return Scaffold(
      // Tanpa AppBar utama (header dihapus).
      body: SafeArea(
        top: true,
        bottom: false,
        child: Column(
          children: [
            // Indikator offline: satu titik kuning kecil di atas (tanpa teks).
            ValueListenableBuilder<bool>(
              valueListenable: OfflineStatus.offline,
              builder: (context, offline, _) => offline
                  ? const Padding(
                      padding: EdgeInsets.only(top: 6),
                      child: Tooltip(
                        message: 'Offline — memakai data tersimpan',
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Color(0xFFF2C230),
                          ),
                          child: SizedBox(width: 10, height: 10),
                        ),
                      ),
                    )
                  : const SizedBox.shrink(),
            ),
            Expanded(
              child: Stack(
                children: [
                  IndexedStack(index: _tab, children: pages),
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
                        if (_tab == 0 && !isGudang) {
                          _loadData(silent: true);
                        } else if (_tab == 1 && !isGudang) {
                          // Riwayat di-refresh (tetap simpan filter).
                          HistoryTab.reloadTick.value++;
                        } else if (_tab == 3 && !isGudang) {
                          // Laporan ikut di-refresh (ringkasan/penutupan).
                          ReportsPage.reloadTick.value++;
                        }
                      }),
                      items: isGudang
                          ? const [
                              (
                                icon: Icons.dashboard_outlined,
                                activeIcon: Icons.dashboard,
                                label: 'Dashboard'
                              ),
                              (
                                icon: Icons.swap_vert,
                                activeIcon: Icons.swap_vert,
                                label: 'M/K Stok'
                              ),
                              (
                                icon: Icons.inventory_2_outlined,
                                activeIcon: Icons.inventory_2,
                                label: 'Stok'
                              ),
                              (
                                icon: Icons.more_horiz,
                                activeIcon: Icons.more_horiz,
                                label: 'Lainnya'
                              ),
                            ]
                          : const [
                              (
                                icon: Icons.shopping_bag_outlined,
                                activeIcon: Icons.shopping_bag,
                                label: 'POS'
                              ),
                              (
                                icon: Icons.receipt_long_outlined,
                                activeIcon: Icons.receipt_long,
                                label: 'Riwayat'
                              ),
                              (
                                icon: Icons.inventory_2_outlined,
                                activeIcon: Icons.inventory_2,
                                label: 'Stok'
                              ),
                              (
                                icon: Icons.bar_chart_outlined,
                                activeIcon: Icons.bar_chart,
                                label: 'Laporan'
                              ),
                              (
                                icon: Icons.more_horiz,
                                activeIcon: Icons.more_horiz,
                                label: 'Lainnya'
                              ),
                            ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
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
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
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
                      onSearchChanged: (_) => _applyFilterDebounced(),
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
                    padding: EdgeInsets.fromLTRB(12, 12, 12, 178 + bottomPad),
                    sliver: SliverGrid(
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        childAspectRatio: 0.62,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (_, i) => RepaintBoundary(
                          child: _ProductCard(
                            product: _visible[i],
                            mediaUrl: _mediaUrl,
                            onTap: () => _addProduct(_visible[i]),
                          ),
                        ),
                        childCount: _visible.length,
                        // Kartu jauh di luar layar dibuang, gambar tetap dari cache.
                        addAutomaticKeepAlives: false,
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
      // Grid = puluhan kartu sekaligus; blur per kartu bikin scroll berat.
      frosted: false,
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
                    memCacheWidth: 420,
                    fadeInDuration: Duration.zero,
                    fadeOutDuration: Duration.zero,
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
      {required this.isOwner,
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
              orElse: () => const {})['name']
          ?.toString();

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
                  prefixIcon:
                      Icon(Icons.store, size: 18, color: Color(0xff1E3A5F)),
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
                style:
                    const TextStyle(fontSize: 12.5, color: Color(0xff1E3A5F)),
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
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
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
  late final FocusNode _fn;

  @override
  void initState() {
    super.initState();
    _c = TextEditingController(text: '${widget.value}');
    _fn = FocusNode()..addListener(_selectAll);
  }

  void _selectAll() {
    if (_fn.hasFocus) {
      _c.selection = TextSelection(baseOffset: 0, extentOffset: _c.text.length);
    }
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
    _fn.dispose();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 40,
      child: TextField(
        controller: _c,
        focusNode: _fn,
        keyboardType: TextInputType.number,
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => _fn.unfocus(),
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
        decoration: InputDecoration(
          isDense: true,
          filled: true,
          fillColor: Theme.of(context).brightness == Brightness.dark
              ? const Color(0xff1F2530)
              : const Color(0xFFF0F4F9),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? const Color(0xff2A3140)
                      : const Color(0xffB9C9DC))),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? const Color(0xff7FA8CF)
                      : const Color(0xff1E3A5F),
                  width: 1.4)),
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

class _CartSheet extends StatefulWidget {
  const _CartSheet({
    this.scrollController,
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

  final ScrollController? scrollController;
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
  State<_CartSheet> createState() => _CartSheetState();
}

class _CartSheetState extends State<_CartSheet> {
  bool _showOptions = false;

  String _customerName() {
    for (final c in widget.customers) {
      if ('${c['id']}' == '${widget.customerId}') {
        return c['name']?.toString() ?? '';
      }
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final cart = widget.cart;
    final subtotal = asNum(widget.preview?['subtotal'] ??
        cart.fold(0.0, (s, c) => s + (c.priceOverride ?? c.price) * c.qty));
    final discount = asNum(widget.preview?['discount'] ?? 0);
    final grandTotal = asNum(widget.preview?['grand_total'] ?? subtotal);
    final customerName = _customerName();
    final hasExtra = customerName.isNotEmpty || widget.promoCode.isNotEmpty;
    final totalPcs = cart.fold<int>(0, (sum, c) => sum + c.qty);

    final keyboardOpen = MediaQuery.of(context).viewInsets.bottom > 0;
    // Geser sheet ke atas saat keyboard muncul supaya Bayar tidak tertutup.
    return AnimatedPadding(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Judul: fokus daftar barang + jumlah item aktif.
              Row(
                children: [
                  Expanded(
                    child: Text('Keranjang (${cart.length} item)',
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800)),
                  ),
                  if (keyboardOpen)
                    TextButton(
                      onPressed: () =>
                          FocusManager.instance.primaryFocus?.unfocus(),
                      child: const Text('Selesai'),
                    ),
                  TextButton.icon(
                    onPressed: () =>
                        setState(() => _showOptions = !_showOptions),
                    icon: Icon(_showOptions ? Icons.expand_less : Icons.tune),
                    label: Text(_showOptions ? 'Tutup Opsi' : 'Opsi'),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              // Opsi (pelanggan/promo/tahan) hanya muncul saat dibuka.
              if (_showOptions) ...[
                if (widget.customers.isNotEmpty)
                  DropdownButtonFormField<int?>(
                    initialValue: widget.customerId,
                    decoration: const InputDecoration(
                        isDense: true,
                        labelText: 'Pelanggan (opsional)',
                        border: OutlineInputBorder()),
                    items: [
                      const DropdownMenuItem<int?>(
                          value: null, child: Text('Tanpa pelanggan')),
                      for (final c in widget.customers)
                        DropdownMenuItem<int?>(
                            value: int.tryParse('${c['id']}'),
                            child: Text(
                                '${c['name']}${c['phone'] != null && (c['phone'] as String).isNotEmpty ? ' · ${c['phone']}' : ''}')),
                    ],
                    onChanged: widget.onCustomerChanged,
                  ),
                const SizedBox(height: 8),
                TextField(
                  decoration: const InputDecoration(
                      isDense: true,
                      labelText: 'Kode promo (opsional)',
                      border: OutlineInputBorder()),
                  onChanged: widget.onPromoChanged,
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: widget.onHold,
                        icon: const Icon(Icons.pause_circle_outline, size: 18),
                        label: const Text('Tahan'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: widget.onResume,
                        icon: const Icon(Icons.play_circle_outline, size: 18),
                        label: const Text('Ambil Tahan'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
              ] else if (hasExtra)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (customerName.isNotEmpty)
                        Chip(
                          avatar: const Icon(Icons.person_outline, size: 15),
                          label: Text(customerName,
                              style: const TextStyle(fontSize: 11)),
                          visualDensity: VisualDensity.compact,
                        ),
                      if (widget.promoCode.isNotEmpty)
                        Chip(
                          avatar:
                              const Icon(Icons.local_offer_outlined, size: 15),
                          label: Text(widget.promoCode,
                              style: const TextStyle(fontSize: 11)),
                          visualDensity: VisualDensity.compact,
                        ),
                    ],
                  ),
                ),
              Expanded(
                child: ListView(
                  controller: widget.scrollController,
                  children: [
                    for (final item in cart)
                      GlassCard(
                        padding: EdgeInsets.zero,
                        frosted: false,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6),
                          child: Row(
                            children: [
                              // Setengah kiri: nama (penuh), harga, varian.
                              Expanded(
                                flex: 3,
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(item.name,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w700,
                                            height: 1.2)),
                                    const SizedBox(height: 2),
                                    Text(
                                        fmtRp(item.priceOverride ?? item.price),
                                        style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w800,
                                            color: ink(context))),
                                    if (item.variantLabel != null)
                                      Text(item.variantLabel!,
                                          style: TextStyle(
                                              fontSize: 10,
                                              color: Theme.of(context)
                                                  .colorScheme
                                                  .outline)),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 6),
                              // Setengah kanan: kontrol - qty + edit hapus.
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    onPressed: () =>
                                        widget.onQtyChanged(item, -1),
                                    visualDensity: VisualDensity.compact,
                                    padding: EdgeInsets.zero,
                                    constraints: const BoxConstraints.tightFor(
                                        width: 26, height: 34),
                                    icon: const Icon(
                                        Icons.remove_circle_outline,
                                        size: 18),
                                  ),
                                  _QtyInput(
                                    value: item.qty,
                                    onChanged: (v) => widget.onQtySet(item, v),
                                  ),
                                  IconButton(
                                    onPressed: () =>
                                        widget.onQtyChanged(item, 1),
                                    visualDensity: VisualDensity.compact,
                                    padding: EdgeInsets.zero,
                                    constraints: const BoxConstraints.tightFor(
                                        width: 26, height: 34),
                                    icon: const Icon(Icons.add_circle_outline,
                                        size: 18),
                                  ),
                                  IconButton(
                                    onPressed: () => widget.onEditPrice(item),
                                    visualDensity: VisualDensity.compact,
                                    padding: EdgeInsets.zero,
                                    constraints: const BoxConstraints.tightFor(
                                        width: 26, height: 34),
                                    icon: const Icon(Icons.edit_outlined,
                                        size: 16),
                                    tooltip: 'Ubah harga',
                                  ),
                                  IconButton(
                                    onPressed: () => widget.onRemove(item),
                                    visualDensity: VisualDensity.compact,
                                    padding: EdgeInsets.zero,
                                    constraints: const BoxConstraints.tightFor(
                                        width: 26, height: 34),
                                    icon: const Icon(Icons.delete_outline,
                                        size: 17),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Text('Total pcs: $totalPcs pcs',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              if (discount > 0) Text('Diskon: -${fmtRp(discount)}'),
              if (widget.error != null) ...[
                const SizedBox(height: 6),
                Text(widget.error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 10),
              // Tombol bayar = jumlah total orderan (tap tetap lanjut bayar).
              FilledButton(
                style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52)),
                onPressed: widget.saving || cart.isEmpty ? null : widget.onPay,
                child: widget.saving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(fmtRp(grandTotal),
                        style: const TextStyle(
                            fontSize: 17, fontWeight: FontWeight.w800)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
