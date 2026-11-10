import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import 'api_client.dart';
import 'auth_store.dart';
import 'branch_scope.dart';
import 'category_visuals.dart';
import 'inventory_page.dart';
import 'more_page.dart';
import 'offline_status.dart';
import 'offline_store.dart';
import 'prefetch_service.dart';
import 'reports_page.dart';
import 'sales_dashboard_page.dart';
import 'format.dart';
import 'history_tab.dart';
import 'invoice_share.dart';
import 'payment_sheet.dart';
import 'printer_service.dart';
import 'printer_setup.dart';
import 'barcode_scanner_page.dart';
import 'dashboard_page.dart';
import 'finance_page.dart';
import 'variant_picker.dart';
import 'task_ui.dart';
import 'ui_kit.dart';

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

/// Decode the cart snapshot written to the local draft cache.
///
/// Keep this parser independent from the widget so both automatic restore on
/// startup and the Draft quick action use exactly the same data rules.
List<CartItem> cartItemsFromDraft(Map<String, dynamic>? draft) {
  final rawItems = draft?['items'];
  if (rawItems is! List) return <CartItem>[];
  final items = <CartItem>[];
  for (final raw in rawItems) {
    if (raw is! Map) continue;
    final row = Map<String, dynamic>.from(raw);
    final productId = int.tryParse('${row['product_id']}');
    final qty = int.tryParse('${row['qty']}');
    if (productId == null || productId <= 0 || qty == null || qty <= 0) {
      continue;
    }
    items.add(CartItem(
      productId: productId,
      variantId: int.tryParse('${row['variant_id']}'),
      name: row['name']?.toString() ?? 'Produk',
      price: asNum(row['price']),
      qty: qty,
      priceOverride:
          row['price_override'] == null ? null : asNum(row['price_override']),
      variantLabel: row['variant_label']?.toString(),
      photo: row['photo']?.toString(),
      stockAvailable: int.tryParse('${row['stock_available']}'),
    ));
  }
  return items;
}

/// Satu-satunya sumber hitungan subtotal keranjang (harga satuan x qty,
/// SEMUA item wajib masuk). Dipakai POS dan sheet keranjang supaya angka
/// tidak mungkin beda.
double cartSubtotal(List<CartItem> cart) =>
    cart.fold(0.0, (sum, c) => sum + (c.priceOverride ?? c.price) * c.qty);

/// Satu-satunya sumber hitungan total pcs keranjang.
int cartTotalPcs(List<CartItem> cart) =>
    cart.fold<int>(0, (sum, c) => sum + c.qty);

class PosPage extends StatefulWidget {
  /// Tab yang diminta halaman lain (misal Dashboard -> Kasir).
  static final ValueNotifier<int> requestTab = ValueNotifier<int>(0);
  const PosPage({super.key, this.runStartupBackgroundTasks = true});

  /// Disable startup loading and offline/connectivity work in isolated widget tests.
  final bool runStartupBackgroundTasks;

  @override
  State<PosPage> createState() => _PosPageState();
}

class _PosPageState extends State<PosPage> with WidgetsBindingObserver {
  late final ApiClient _api;
  int _tab = 0;
  final List<int> _visitedTabs = [0];
  final _search = TextEditingController();
  final List<CartItem> _cart = [];
  Timer? _previewTimer;
  // Versi keranjang vs preview: total tampil dari preview hanya kalau masih
  // FRESH (mengikuti perubahan qty/isi keranjang terakhir).
  int _cartVersion = 0;
  int _previewVersion = -1;

  bool get _previewFresh =>
      _preview != null && _cartError == null && _previewVersion == _cartVersion;
  StreamSubscription<List<ConnectivityResult>>? _connSub;
  bool _listeningToBranchScope = false;

  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _visible = [];
  List<Map<String, dynamic>> _categoryCatalog = [];
  List<Map<String, dynamic>> _warehouses = [];
  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _branches = [];
  String? _storeName;
  String _storeAddress = '';
  String _storePhone = '';
  List<String> _storePhones = const [];
  /// Nomor invoice yang sudah direservasi + id transaksi klien yang dipakai
  /// ulang saat pembayaran supaya nomor pada invoice tidak berubah.
  String? _shareClientTxId;
  String? _reservedInvoiceNo;
  int? _posBranchId;
  String _warehouseId = '';
  int? _customerId;
  final _discountCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  String _transactionDate = '';
  String? _category;
  int? _draftBranch;
  Future<void> _draftWrite = Future<void>.value();
  Map<String, dynamic>? _preview;
  bool _loading = true;
  bool _saving = false;
  bool _autoPrint = true;
  String? _clientHoldId;
  String? _autoHeldClientHoldId;
  Future<void>? _serverHoldInFlight;
  String? _error;

  /// Dipakai sheet keranjang untuk me-refresh dirinya saat _cart/_preview
  /// berubah dari halaman POS (showModalBottomSheet tidak rebuild otomatis).
  StateSetter? _sheetRefresh;
  String? _cartError;
  String? _lastProductsSync;
  int _loadGeneration = 0;

  ApiClient get _client {
    final auth = context.read<AuthStore>();
    _api.setToken(auth.token);
    return _api;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _transactionDate = todayWib();
    _api = context.read<AuthStore>().api;
    if (_isOwner) {
      final branch = BranchScope.active.value ?? _branchId;
      _posBranchId = branch > 0 ? branch : null;
      _api.activeBranchId = _posBranchId;
      BranchScope.active.addListener(_onBranchScopeChanged);
      _listeningToBranchScope = true;
    }
    PosPage.requestTab.addListener(_onExternalTab);
    categoryCatalogRevision.addListener(_onCategoryCatalogChanged);
    if (!widget.runStartupBackgroundTasks) return;
    _loadData();
    _syncPending();
    _connSub = Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online && OfflineStatus.offline.value) {
        OfflineStatus.notifyOnline();
        _syncPending();
        _loadData(silent: true);
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.hidden ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      // The local write is queued so the cart survives the app being put in
      // the background before the process is reclaimed by Android.
      unawaited(_saveDraft());
    }
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      // Server hold is best-effort. The local snapshot above remains the
      // fallback when Android kills the process before the request finishes.
      unawaited(_autoHoldServerDraft());
    }
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
    WidgetsBinding.instance.removeObserver(this);
    _previewTimer?.cancel();
    _searchDebounce?.cancel();
    _connSub?.cancel();
    PosPage.requestTab.removeListener(_onExternalTab);
    categoryCatalogRevision.removeListener(_onCategoryCatalogChanged);
    if (_listeningToBranchScope) {
      BranchScope.active.removeListener(_onBranchScopeChanged);
    }
    _search.dispose();
    _discountCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  void _onExternalTab() {
    final isGudang = context.read<AuthStore>().role == 'gudang';
    _selectTab(PosPage.requestTab.value, isGudang: isGudang);
  }

  void _onCategoryCatalogChanged() {
    if (!mounted || !widget.runStartupBackgroundTasks) return;
    unawaited(_loadData(silent: true, force: true));
  }

  void _selectTab(int index, {bool? isGudang}) {
    if (!mounted) return;
    final warehouseRole =
        isGudang ?? context.read<AuthStore>().role == 'gudang';
    final lastTab = warehouseRole ? 2 : 3;
    final nextTab = index.clamp(0, lastTab).toInt();
    setState(() {
      _tab = nextTab;
      _visitedTabs
        ..remove(nextTab)
        ..add(nextTab);
      while (_visitedTabs.length > 2) {
        _visitedTabs.remove(_visitedTabs.firstWhere((tab) => tab != 0));
      }
    });
    if (nextTab == 0 && !warehouseRole) {
      _loadData(silent: true);
    } else if (nextTab == 1 && !warehouseRole) {
      ReportsPage.reloadTick.value++;
    } else if (nextTab == 2 && !warehouseRole) {
      HistoryTab.reloadTick.value++;
    } else if (nextTab == 3 && !warehouseRole) {
      FinancePage.reloadTick.value++;
    }
  }

  String _pageTitle(String? role) {
    if (role == 'gudang') {
      return switch (_tab) {
        1 => 'Stok Produk',
        2 => 'Mutasi Stok',
        _ => 'Dashboard Gudang',
      };
    }
    return switch (_tab) {
      1 => 'Dashboard',
      2 => 'Riwayat Transaksi',
      3 => 'Keuangan',
      _ => 'POS',
    };
  }

  void _onBranchScopeChanged() {
    if (!_isOwner || !mounted) return;
    final branch = BranchScope.active.value ?? _branchId;
    _api.activeBranchId = branch > 0 ? branch : null;
    if (branch > 0 && branch != _posBranchId) {
      if (BranchScope.active.value != null) unawaited(_saveDraft());
      setState(() {
        _posBranchId = branch;
        _warehouseId = '';
        _cart.clear();
        _preview = null;
        _customerId = null;
        _discountCtrl.clear();
        _notesCtrl.clear();
        _transactionDate = todayWib();
        _clientHoldId = null;
        _autoHeldClientHoldId = null;
        _draftBranch = null;
        _category = null;
        _search.clear();
      });
      _previewTimer?.cancel();
      _loadData();
    }
  }

  String _mediaUrl(String? path) => path == null || path.isEmpty
      ? ''
      : '${_api.baseUrl.replaceAll(RegExp(r'/api$'), '')}$path';

  int get _branchId => context.read<AuthStore>().branchId ?? 0;
  bool get _isOwner => context.read<AuthStore>().role == 'owner';
  String? get _activeBranchName {
    final branchId = _posBranchId ?? _branchId;
    final branch = _branches.cast<Map<String, dynamic>?>().firstWhere(
        (row) => int.tryParse('${row?['id']}') == branchId,
        orElse: () => null);
    final name = branch?['name']?.toString().trim();
    if (name != null && name.isNotEmpty) return name;
    final storeName = _storeName?.trim();
    if (storeName != null && storeName.isNotEmpty) return storeName;
    for (final warehouse in _warehouses) {
      final warehouseBranch = warehouse['branch_name']?.toString().trim();
      if (warehouseBranch != null && warehouseBranch.isNotEmpty) {
        return warehouseBranch;
      }
    }
    return null;
  }

  bool get _isMetro {
    final name = _activeBranchName?.toLowerCase().trim() ?? '';
    final normalized = name.replaceAll(RegExp(r'[^a-z0-9]'), '');
    return normalized.endsWith('metro') ||
        normalized.startsWith('tokobasik') ||
        normalized.startsWith('basik');
  }

  int get _defaultCartQty => _isMetro ? 4 : 1;

  double get _manualDiscount =>
      asNum(_discountCtrl.text.replaceAll(RegExp(r'[^0-9]'), ''));

  Future<void> _loadData({bool silent = false, bool force = false}) async {
    final branch = _isOwner
        ? (BranchScope.active.value ?? _posBranchId ?? _branchId)
        : (_posBranchId ?? _branchId);
    if (branch == 0) return;
    final generation = ++_loadGeneration;
    bool isCurrent() => mounted && generation == _loadGeneration;
    _api.activeBranchId = _isOwner ? branch : null;
    await PrinterService.setActiveBranch(branch);

    // Buka aplikasi (bukan refresh): kalau sudah disinkron hari ini,
    // langsung pakai cache lokal tanpa menyentuh server.
    if (!silent && _products.isEmpty) {
      try {
        final cached = await OfflineStore.loadProductsCache(branch);
        if (cached != null) {
          if (!isCurrent()) return;
          final payload = cached['payload'] as Map<String, dynamic>;
          setState(() {
            _applyStoreData(payload);
            _error = null;
            _loading = false;
          });
          _lastProductsSync = cached['updated_at']?.toString() ?? '';
          // Produk boleh tetap dari cache hari ini, tetapi urutan/warna kategori
          // harus selalu disegarkan karena pengaturan kategori tidak mengubah
          // products.updated_at.
          if (cached['sync_date'] == todayWib()) {
            final categories = await _fetchCategoryRows();
            if (!isCurrent()) return;
            if (categories != null) {
              setState(() => _applyCategoryRows(categories));
            }
            return;
          }
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
    } else if (!force && _products.isNotEmpty && _lastProductsSync != null) {
      // Kategori punya sumber penyimpanan sendiri. Ambil dulu sebelum cek versi
      // produk karena reorder/warna tidak mengubah products.updated_at.
      final categories = await _fetchCategoryRows();
      if (!isCurrent()) return;
      if (categories != null) {
        setState(() => _applyCategoryRows(categories));
      }
      // Cek versi produk setelah katalog kategori terbaru diterapkan.
      try {
        final v = await _client.productsVersion(branchId: branch);
        if (!isCurrent()) return;
        final ts = v['updated_at']?.toString() ?? '';
        if (ts.isNotEmpty && ts == _lastProductsSync) return;
      } catch (_) {}
    }
    if (!mounted) return;
    try {
      final isOwner = context.read<AuthStore>().role == 'owner';
      final results = await Future.wait([
        _client.products(branchId: branch),
        _client.productCategories(),
        _client.warehouses(branch),
        _client.customers(),
        _client.storeSettings(),
        if (isOwner) _client.branches(),
      ]);
      if (!isCurrent()) return;
      if (isOwner) {
        final branches = (results[5] as List).cast<Map<String, dynamic>>();
        setState(() {
          _branches = branches;
          _posBranchId ??= _branchId;
        });
      }
      if (!mounted) return;
      final storePayload = {
        'products': results[0],
        'categories': results[1],
        'warehouses': results[2],
        'customers': results[3],
        'settings': results[4],
        if (isOwner) 'branches': results[5],
      };
      setState(() => _applyStoreData(storePayload));
      try {
        final v = await _client.productsVersion(branchId: branch);
        if (!isCurrent()) return;
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
            if (!isCurrent()) return;
            final payload = cached['payload'] as Map<String, dynamic>;
            setState(() {
              _applyStoreData(payload);
              _error = null;
              _loading = false;
            });
            _lastProductsSync = cached['updated_at']?.toString() ?? '';
            return;
          }
        } catch (_) {}
      }
      if (isCurrent()) setState(() => _error = e.message);
    } finally {
      if (isCurrent() && !silent) setState(() => _loading = false);
    }
  }

  /// Terapkan data produk/gudang/pelanggan/pengaturan (dari server atau cache lokal).
  void _applyStoreData(Map<String, dynamic> payload) {
    final rawProducts =
        ((payload['products'] as List?) ?? []).cast<Map<String, dynamic>>();
    final categoryRows = _categoryRowsFrom(payload['categories']);
    _categoryCatalog = categoryRows;
    _products = _mergeProductsWithCategorySettings(rawProducts, categoryRows);
    _visible = _filteredProducts();
    _warehouses =
        ((payload['warehouses'] as List?) ?? []).cast<Map<String, dynamic>>();
    _customers =
        ((payload['customers'] as List?) ?? []).cast<Map<String, dynamic>>();
    final settings = (payload['settings'] as Map<String, dynamic>?) ?? {};
    final storeName = settings['store_name']?.toString().trim();
    _storeName = storeName == null || storeName.isEmpty ? null : storeName;
    _storeAddress = settings['store_address']?.toString().trim() ?? '';
    _storePhone = settings['store_phone']?.toString().trim() ?? '';
    _storePhones = _collectStorePhones(settings);
    final autoPrint = settings['auto_print'];
    _autoPrint = autoPrint == null ||
        autoPrint == '1' ||
        autoPrint == true ||
        autoPrint == 'true';
    if (_warehouseId.isEmpty && _warehouses.isNotEmpty) {
      _warehouseId = '${_warehouses.first['id']}';
    }
    final branches =
        ((payload['branches'] as List?) ?? []).cast<Map<String, dynamic>>();
    if (branches.isNotEmpty) {
      _branches = branches;
      _posBranchId ??= _branchId;
    }
    final branch = _posBranchId ?? _branchId;
    if (_draftBranch != branch) {
      _draftBranch = branch;
      unawaited(_restoreDraft(branch));
    }
  }

  List<Map<String, dynamic>> _categoryRowsFrom(dynamic raw) =>
      (raw as List?)
          ?.whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList() ??
      <Map<String, dynamic>>[];

  Future<List<Map<String, dynamic>>?> _fetchCategoryRows() async {
    try {
      return _categoryRowsFrom(await _client.productCategories());
    } catch (_) {
      // Category refresh is supplemental; cached products remain usable
      // when the device is offline or the server is temporarily unavailable.
      return null;
    }
  }

  void _applyCategoryRows(List<Map<String, dynamic>> rows) {
    _categoryCatalog =
        rows.map((category) => Map<String, dynamic>.from(category)).toList();
    _products = _mergeProductsWithCategorySettings(_products, _categoryCatalog);
    _visible = _filteredProducts();
  }

  List<Map<String, dynamic>> _mergeProductsWithCategorySettings(
      List<Map<String, dynamic>> products,
      List<Map<String, dynamic>> categoryRows) {
    final categoriesById = <int, Map<String, dynamic>>{};
    final categoriesByName = <String, Map<String, dynamic>>{};
    for (final category in categoryRows) {
      final id = int.tryParse('${category['id']}');
      final name = category['name']?.toString().trim().toLowerCase();
      if (id != null) categoriesById[id] = category;
      if (name != null && name.isNotEmpty) categoriesByName[name] = category;
    }
    return products.map((product) {
      final categoryId = int.tryParse('${product['category_id']}');
      final productCategoryName =
          product['category_name']?.toString().trim().toLowerCase();
      final category =
          (categoryId == null ? null : categoriesById[categoryId]) ??
              (productCategoryName == null
                  ? null
                  : categoriesByName[productCategoryName]);
      if (category == null) return Map<String, dynamic>.from(product);
      return {
        ...product,
        if (category.containsKey('name')) 'category_name': category['name'],
        if (category.containsKey('color')) 'category_color': category['color'],
        if (category.containsKey('sort_order'))
          'category_sort_order': category['sort_order'],
      };
    }).toList();
  }

  String _draftKey(int branch) =>
      'cart-draft-${context.read<AuthStore>().userId}-$branch';

  String _newClientHoldId() {
    final random = math.Random();
    return 'android-${DateTime.now().microsecondsSinceEpoch}-${random.nextInt(1 << 32)}';
  }

  List<Map<String, dynamic>> _serverDraftItems() => _cart
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

  Map<String, dynamic> _serverDraftPayload() {
    final preview = _preview;
    final clientHoldId = _clientHoldId ??= _newClientHoldId();
    return {
      'branch_id': _posBranchId ?? _branchId,
      'client_hold_id': clientHoldId,
      if (_customerId != null) 'customer_id': _customerId,
      'items': _serverDraftItems(),
      'subtotal': asNum(preview?['subtotal'] ?? _cartTotal),
      'discount_type': preview?['discount_type'] ??
          (_manualDiscount > 0 ? 'nominal' : 'none'),
      'discount_value': asNum(preview?['discount'] ?? _manualDiscount),
      if (_notesCtrl.text.trim().isNotEmpty) 'notes': _notesCtrl.text.trim(),
    };
  }

  Future<void> _clearLocalDraft() {
    final branch = _posBranchId ?? _branchId;
    if (context.read<AuthStore>().userId == null || branch <= 0) {
      return Future<void>.value();
    }
    final key = _draftKey(branch);
    final write = _draftWrite.then<void>((_) => OfflineStore.cacheSet(
        key, jsonEncode({'items': <Map<String, dynamic>>[]})));
    _draftWrite = write.catchError((Object _) {});
    return _draftWrite;
  }

  Future<void> _saveDraft() {
    final branch = _posBranchId ?? _branchId;
    if (context.read<AuthStore>().userId == null || branch <= 0) {
      return Future<void>.value();
    }
    final key = _draftKey(branch);
    final payload = jsonEncode({
      'warehouse_id': _warehouseId,
      'customer_id': _customerId,
      'manual_discount': _discountCtrl.text,
      'notes': _notesCtrl.text,
      'transaction_date': _transactionDate,
      'client_hold_id': _clientHoldId,
      'items': [
        for (final item in _cart)
          {
            'product_id': item.productId,
            'variant_id': item.variantId,
            'name': item.name,
            'price': item.price,
            'qty': item.qty,
            'price_override': item.priceOverride,
            'variant_label': item.variantLabel,
            'photo': item.photo,
            'stock_available': item.stockAvailable,
          }
      ],
    });
    final write =
        _draftWrite.then<void>((_) => OfflineStore.cacheSet(key, payload));
    _draftWrite = write.catchError((Object _) {});
    return _draftWrite;
  }

  Future<Map<String, dynamic>?> _readLocalDraft(int branch) async {
    try {
      final saved = await OfflineStore.cacheGet(_draftKey(branch));
      final draft = saved?['payload'];
      if (draft is! Map) return null;
      final normalized = Map<String, dynamic>.from(draft);
      return cartItemsFromDraft(normalized).isEmpty ? null : normalized;
    } catch (_) {
      return null;
    }
  }

  Future<bool> _restoreDraftPayload(
      int branch, Map<String, dynamic> draft) async {
    if (!mounted || _draftBranch != branch || _cart.isNotEmpty || _saving) {
      return false;
    }
    final items = cartItemsFromDraft(draft);
    if (items.isEmpty) return false;
    setState(() {
      _cart.addAll(items);
      _clientHoldId = draft['client_hold_id']?.toString();
      _customerId = int.tryParse('${draft['customer_id']}');
      _discountCtrl.text = draft['manual_discount']?.toString() ?? '';
      _notesCtrl.text = draft['notes']?.toString() ?? '';
      final draftDate = draft['transaction_date']?.toString();
      _transactionDate = draftDate != null &&
              DateTime.tryParse(draftDate) != null &&
              draftDate.compareTo(todayWib()) <= 0
          ? draftDate
          : todayWib();
      final warehouse = draft['warehouse_id']?.toString();
      if (_warehouses.any((row) => '${row['id']}' == warehouse)) {
        _warehouseId = warehouse!;
      }
    });
    _schedulePreview();
    return true;
  }

  Future<bool> _restoreDraft(int branch) async {
    try {
      final draft = await _readLocalDraft(branch);
      if (draft == null) return false;
      return await _restoreDraftPayload(branch, draft);
    } catch (_) {
      // An unreadable draft must not prevent catalogue loading.
      return false;
    }
  }

  Timer? _searchDebounce;

  void _applyFilterDebounced() {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 180), _applyFilter);
  }

  void _applyFilter() {
    setState(() => _visible = _filteredProducts());
  }

  List<Map<String, dynamic>> _filteredProducts() {
    final q = _search.text.trim().toLowerCase();
    return _products.where((p) {
      if (_category != null && p['category_name']?.toString() != _category) {
        return false;
      }
      final name = (p['name'] ?? '').toString().toLowerCase();
      final sku = (p['sku'] ?? '').toString().toLowerCase();
      final barcode = (p['barcode'] ?? '').toString().toLowerCase();
      return q.isEmpty ||
          name.contains(q) ||
          sku.contains(q) ||
          barcode.contains(q);
    }).toList();
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
              product: d,
              variants: variants,
              mediaUrl: _mediaUrl,
              initialQty: _defaultCartQty),
        );
        if (result == null) return;
        variantId = result['variant_id'] as int?;
        qty = (result['qty'] as int?) ?? _defaultCartQty;
        final selectedVariants =
            variants.where((v) => v['id'] == variantId).toList();
        final selectedVariant =
            selectedVariants.isEmpty ? null : selectedVariants.first;
        // Harga varian dipakai kalau > 0; harga 0/NULL mengikuti harga produk
        // (sama dengan basis harga server) supaya total lokal = total server.
        final variantPrice = asNum(selectedVariant?['price']);
        _addToCart(
          productId: int.parse('${product['id']}'),
          name: product['name']?.toString() ?? '',
          price: variantPrice > 0 ? variantPrice : asNum(d['price']),
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
        qty: _defaultCartQty,
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
    unawaited(_saveDraft());
    _autoHeldClientHoldId = null;
    // Perubahan keranjang menandai preview lama TIDAK fresh sampai yang baru datang.
    _cartVersion++;
    _previewTimer?.cancel();
    _previewTimer = Timer(const Duration(milliseconds: 150), _doPreview);
  }

  Future<void> _doPreview() async {
    if (_cart.isEmpty) {
      if (mounted) setState(() => _preview = null);
      return;
    }
    // Snapshot versi keranjang saat request dikirim. Hasil request LAMA tidak
    // boleh menimpa preview baru kalau urutan selesainya berbalik (mis. request
    // 2 item selesai setelah request 3 item) - itu penyebab total basi seperti
    // 12 pcs masih tampil Rp760.000.
    final requestVersion = _cartVersion;
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
        'discount_type': _manualDiscount > 0 ? 'nominal' : 'none',
        'discount_value': _manualDiscount,
      });
      if (mounted && requestVersion == _cartVersion) {
        setState(() {
          _preview = preview;
          _previewVersion = requestVersion;
          _cartError = null;
        });
        _sheetRefresh?.call(() {});
      }
    } on ApiException catch (e) {
      if (mounted && requestVersion == _cartVersion) {
        setState(() => _cartError = e.message);
      }
    }
  }

  double get _cartTotal => cartSubtotal(_cart);

  Future<void> _autoHoldServerDraft() async {
    if (_cart.isEmpty || _serverHoldInFlight != null) return;
    final clientHoldId = _clientHoldId ??= _newClientHoldId();
    if (_autoHeldClientHoldId == clientHoldId) return;
    final request = _client.holdTransaction(_serverDraftPayload());
    final inFlight = request.then<void>((_) {});
    _serverHoldInFlight = inFlight;
    try {
      await inFlight;
      _autoHeldClientHoldId = clientHoldId;
      if (mounted) await _clearLocalDraft();
    } on ApiException {
      // Keep the local snapshot when the server cannot be reached.
    } finally {
      if (identical(_serverHoldInFlight, inFlight)) {
        _serverHoldInFlight = null;
      }
    }
  }

  Future<void> _holdCart() async {
    if (_cart.isEmpty) return;
    try {
      await _client.holdTransaction(_serverDraftPayload());
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Draft disimpan. Bisa dilanjutkan kapan saja.')));
      setState(() {
        _cart.clear();
        _preview = null;
        _discountCtrl.clear();
        _notesCtrl.clear();
        _customerId = null;
        _transactionDate = todayWib();
        _clientHoldId = null;
        _autoHeldClientHoldId = null;
      });
      await _saveDraft();
      if (!mounted) return;
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
      final localDraft = await _readLocalDraft(branch);
      List<dynamic> pending = const [];
      try {
        pending = await _client.pendingTransactions(branchId: branch);
      } on ApiException {
        // A locally saved draft remains usable when the server is offline.
        if (localDraft == null) rethrow;
      }
      if (!mounted) return;
      final choices = <Map<String, dynamic>>[
        if (localDraft != null)
          {
            'source': 'local',
            'draft': localDraft,
          },
        for (final raw in pending)
          if (raw is Map)
            {
              'source': 'server',
              'pending': Map<String, dynamic>.from(raw),
            },
      ];
      if (choices.isEmpty) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Tidak ada draft')));
        return;
      }
      final picked = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, setDialogState) => AlertDialog(
            title: const Text('Draft'),
            content: SizedBox(
              width: double.maxFinite,
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: choices.length,
                separatorBuilder: (_, __) => const SizedBox(height: 6),
                itemBuilder: (_, index) {
                  final choice = choices[index];
                  final isLocal = choice['source'] == 'local';
                  final p = isLocal
                      ? const <String, dynamic>{}
                      : (choice['pending'] as Map<String, dynamic>);
                  final heldAt =
                      DateTime.tryParse('${p['held_at']}')?.toLocal();
                  final heldLabel = heldAt == null
                      ? 'Tanggal draft tidak tersedia'
                      : '${heldAt.day.toString().padLeft(2, '0')}/${heldAt.month.toString().padLeft(2, '0')}/${heldAt.year} · ${heldAt.hour.toString().padLeft(2, '0')}:${heldAt.minute.toString().padLeft(2, '0')}';
                  final itemCount = isLocal
                      ? cartItemsFromDraft(
                              choice['draft'] as Map<String, dynamic>)
                          .length
                      : p['items'] is List
                          ? (p['items'] as List).length
                          : 0;
                  return Card(
                    margin: EdgeInsets.zero,
                    child: ListTile(
                      dense: true,
                      leading: CircleAvatar(
                        radius: 17,
                        child: Text('$itemCount',
                            style: const TextStyle(fontSize: 12)),
                      ),
                      title: Text(
                          isLocal
                              ? '$itemCount item · Draft perangkat'
                              : '$itemCount item · ${fmtRp(asNum(p['subtotal']))}',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(isLocal
                          ? 'Tersimpan otomatis saat aplikasi ditutup'
                          : 'Draft $heldLabel'),
                      trailing: IconButton(
                        tooltip: 'Hapus draft',
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => _deleteDraftChoice(
                          dialogContext: ctx,
                          setDialogState: setDialogState,
                          choices: choices,
                          index: index,
                          branch: branch,
                        ),
                      ),
                      onTap: () => Navigator.pop(ctx, choice),
                    ),
                  );
                },
              ),
            ),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Batal')),
            ],
          ),
        ),
      );
      if (picked == null || !mounted) return;
      if (picked['source'] == 'local') {
        _draftBranch = branch;
        final restored = await _restoreDraftPayload(
            branch, picked['draft'] as Map<String, dynamic>);
        if (restored && mounted) {
          await _openCart();
        }
        return;
      }
      final serverPending = picked['pending'] as Map<String, dynamic>;
      final id = int.tryParse('${serverPending['id']}');
      if (id == null) return;
      final resumed = await _client.resumeTransaction(id,
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
        _clientHoldId = serverPending['client_hold_id']?.toString() ??
            resumed['client_hold_id']?.toString();
        _customerId = int.tryParse(resumed['customer_id']?.toString() ?? '');
        _discountCtrl.text =
            asNum(resumed['discount_value']).toStringAsFixed(0);
        _notesCtrl.text = resumed['notes']?.toString() ?? '';
        _transactionDate = todayWib();
        _preview = null;
      });
      _schedulePreview();
      if (mounted) await _openCart();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _deleteDraftChoice({
    required BuildContext dialogContext,
    required StateSetter setDialogState,
    required List<Map<String, dynamic>> choices,
    required int index,
    required int branch,
  }) async {
    final choice = choices[index];
    final confirmed = await showDialog<bool>(
      context: dialogContext,
      builder: (confirmContext) => AlertDialog(
        title: const Text('Hapus draft?'),
        content:
            const Text('Draft ini akan dihapus dan tidak dapat dipulihkan.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(confirmContext, false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(confirmContext, true),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      if (choice['source'] == 'local') {
        await _clearLocalDraft();
      } else {
        final pending = choice['pending'] as Map<String, dynamic>;
        final id = int.tryParse('${pending['id']}');
        if (id == null) throw ApiException('ID draft tidak valid');
        await _client.deletePendingTransaction(id, branchId: branch);
      }
      choices.removeAt(index);
      if (!dialogContext.mounted) return;
      setDialogState(() {});
      if (choices.isEmpty) Navigator.pop(dialogContext);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _openCart() async {
    setState(() => _cartError = null);
    final topInset = MediaQuery.of(context).padding.top;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) {
        return DraggableScrollableSheet(
          expand: true,
          initialChildSize: 1.0,
          minChildSize: 1.0,
          maxChildSize: 1.0,
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
                    topInset: topInset,
                    cart: _cart,
                    customers: _customers,
                    customerId: _customerId,
                    discountController: _discountCtrl,
                    notesController: _notesCtrl,
                    isOwner: _isOwner,
                    transactionDate: _transactionDate,
                    preview: _preview,
                    previewFresh: _previewFresh,
                    error: _cartError,
                    saving: _saving,
                    onCustomerChanged: (id) {
                      setState(() => _customerId = id);
                      _sheetRefresh?.call(() {});
                      _schedulePreview();
                    },
                    onDiscountChanged: (_) {
                      _schedulePreview();
                      _sheetRefresh?.call(() {});
                    },
                    onNotesChanged: (_) {
                      unawaited(_saveDraft());
                      _sheetRefresh?.call(() {});
                    },
                    onTransactionDateChanged: (date) {
                      setState(() => _transactionDate = date);
                      _sheetRefresh?.call(() {});
                      unawaited(_saveDraft());
                    },
                    onQtySet: (item, value) {
                      setState(() => item.qty = math.max(1, value));
                      _sheetRefresh?.call(() {});
                      _schedulePreview();
                    },
                    onHold: _holdCart,
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
                    onShare: () => _shareCartInvoice(),
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

  /// Nomor HP/WhatsApp dari pengaturan web: bisa satu kolom, tiga kolom, atau
  /// daftar JSON `whatsapp_numbers`. Semua nomor yang ada ditampilkan.
  List<String> _collectStorePhones(Map<String, dynamic> settings) {
    final phones = <String>[];
    void add(Object? value) {
      final text = value?.toString().trim() ?? '';
      if (text.isEmpty) return;
      if (!phones.contains(text)) phones.add(text);
    }

    final rawList = settings['whatsapp_numbers'];
    if (rawList is String && rawList.trim().startsWith('[')) {
      try {
        final decoded = jsonDecode(rawList);
        if (decoded is List) {
          for (final item in decoded) {
            add(item);
          }
        }
      } catch (_) {
        // Daftar tidak valid: jatuh ke kolom tunggal di bawah.
      }
    } else if (rawList is List) {
      for (final item in rawList) {
        add(item);
      }
    }
    add(settings['whatsapp_number']);
    add(settings['whatsapp_number_2']);
    add(settings['whatsapp_number_3']);
    add(settings['store_phone']);
    return phones;
  }

  /// Nama toko + alamat/kontak untuk kepala invoice.
  ({String name, String address, String phone}) _invoiceStore() {
    final branch = _posBranchId ?? _branchId;
    Map<String, dynamic> row = const {};
    for (final b in _branches) {
      if ('${b['id']}' == '$branch') {
        row = b;
        break;
      }
    }
    final name = (_storeName ?? row['name']?.toString() ?? 'Anyostore').trim();
    final address = _storeAddress.isNotEmpty
        ? _storeAddress
        : (row['address']?.toString().trim() ?? '');
    final phone = _storePhone.isNotEmpty
        ? _storePhone
        : (row['phone']?.toString().trim() ?? '');
    return (name: name, address: address, phone: phone);
  }

  /// Nomor telepon pada header invoice: daftar dari pengaturan web, atau
  /// nomor cabang bila pengaturan belum diisi.
  List<String> _invoicePhones(String fallback) {
    if (_storePhones.isNotEmpty) return _storePhones;
    final text = fallback.trim();
    return text.isEmpty ? const [] : [text];
  }

  String _invoiceCustomerLabel() {
    if (_customerId == null) return 'Umum';
    for (final customer in _customers) {
      if ('${customer['id']}' == '$_customerId') {
        final name = customer['name']?.toString().trim() ?? '';
        if (name.isEmpty) return 'Umum';
        return '$name · ${invoiceCustomerTierLabel(customer['price_tier'])}';
      }
    }
    return 'Umum';
  }

  /// Bagikan invoice gambar dari keranjang (sebelum dibayar) supaya pembeli
  /// bisa langsung transfer.
  Future<void> _shareCartInvoice() async {
    if (_cart.isEmpty) return;
    final subtotal = _previewFresh ? asNum(_preview?['subtotal']) : _cartTotal;
    final discount = _previewFresh ? asNum(_preview?['discount']) : _manualDiscount;
    final grand = _previewFresh && _preview?['grand_total'] != null
        ? asNum(_preview?['grand_total'])
        : (subtotal - discount);
    final store = _invoiceStore();
    // Nomor invoice direservasi di server supaya gambar yang dikirim ke pembeli
    // memakai nomor resmi dan tetap sama saat transaksi diselesaikan.
    _shareClientTxId ??= uuidV4();
    var invoiceNo = _reservedInvoiceNo;
    if (invoiceNo == null) {
      try {
        final reservation = await _client.invoicePreview(
          clientTransactionId: _shareClientTxId!,
          branchId: _posBranchId ?? _branchId,
          transactionDate: _isOwner ? _transactionDate : null,
        );
        invoiceNo = reservation['invoice_no']?.toString();
        _reservedInvoiceNo = invoiceNo;
      } catch (error) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Nomor invoice gagal dibuat: $error')));
        return;
      }
    }
    if (invoiceNo == null || invoiceNo.isEmpty) return;
    if (!mounted) return;
    final payload = InvoicePayload(
      storeName: store.name,
      storeAddress: store.address,
      storePhones: _invoicePhones(store.phone),
      instagram: invoiceInstagram(store.name),
      invoiceNo: invoiceNo,
      dateText: invoiceDateText(DateTime.now().toIso8601String()),
      cashier: context.read<AuthStore>().userName ?? '-',
      customerLabel: _invoiceCustomerLabel(),
      items: [
        for (final line in _cart)
          InvoiceLine(
            name: line.name,
            variant: line.variantLabel ?? '',
            qty: line.qty,
            price: line.priceOverride ?? line.price,
            subtotal: (line.priceOverride ?? line.price) * line.qty,
          ),
      ],
      subtotal: subtotal,
      discount: discount,
      total: grand,
    );
    try {
      await shareInvoiceImage(context, payload);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Gagal membagikan invoice: $error')));
    }
  }

  /// Bagikan invoice final dari transaksi tersimpan.
  Future<void> _shareReceiptInvoice(int id) async {
    try {
      final data = await _client.receipt(id);
      if (!mounted) return;
      final store = (data['store'] as Map<String, dynamic>?) ?? const {};
      final rawItems = ((data['items'] as List?) ?? const []).cast<Map<String, dynamic>>();
      final storeName = (store['store_name'] ?? _storeName ?? 'Anyostore').toString();
      final receiptPhone = (store['store_phone'] ?? _storePhone).toString();
      final payload = InvoicePayload(
        storeName: storeName,
        storeAddress: (store['store_address'] ?? _storeAddress).toString(),
        storePhones: _invoicePhones(receiptPhone),
        instagram: invoiceInstagram(storeName),
        invoiceNo: (data['invoice_no'] ?? '-').toString(),
        dateText: invoiceDateText(data['created_at'] ?? data['transaction_date']),
        cashier: (data['cashier'] ?? context.read<AuthStore>().userName ?? '-').toString(),
        customerLabel: (data['customer_name']?.toString().trim().isNotEmpty ?? false)
            ? data['customer_name'].toString()
            : 'Umum',
        items: [
          for (final item in rawItems)
            InvoiceLine(
              name: (item['name'] ?? '-').toString(),
              variant: (item['variant_detail'] ?? '').toString(),
              qty: asNum(item['quantity']).toInt(),
              price: asNum(item['price']),
              subtotal: asNum(item['subtotal']),
            ),
        ],
        subtotal: asNum(data['subtotal']),
        discount: asNum(data['discount']),
        total: asNum(data['grand_total']),
      );
      await shareInvoiceImage(context, payload);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Gagal membagikan invoice: $error')));
    }
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
    if (!_previewFresh) {
      await _doPreview();
      if (!mounted) return;
    }
    if (!_previewFresh && !OfflineStatus.offline.value) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content:
              Text(_cartError ?? 'Tunggu harga keranjang selesai dihitung')));
      return;
    }
    final estimatedSubtotal =
        _previewFresh ? asNum(_preview?['subtotal']) : _cartTotal;
    if (_manualDiscount > estimatedSubtotal) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Diskon tidak boleh melebihi subtotal')));
      return;
    }
    final grandTotal = _previewFresh
        ? asNum(_preview?['grand_total'])
        : math.max(0, estimatedSubtotal - _manualDiscount).toDouble();
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
    final clientTransactionId = _shareClientTxId ?? uuidV4();
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
      if (_notesCtrl.text.trim().isNotEmpty) 'notes': _notesCtrl.text.trim(),
      'discount_type': _manualDiscount > 0 ? 'nominal' : 'none',
      'discount_value': _manualDiscount,
      if (_isOwner) 'transaction_date': _transactionDate,
    };
    try {
      final result = await _client.createTransaction(payload);
      if (!mounted) return;
      final id = int.tryParse('${result['id']}');
      _cart.clear();
      _shareClientTxId = null;
      _reservedInvoiceNo = null;
      _preview = null;
      _discountCtrl.clear();
      _notesCtrl.clear();
      _customerId = null;
      _transactionDate = todayWib();
      await _saveDraft();
      if (!mounted) return;
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
            TextButton.icon(
              onPressed: () {
                Navigator.pop(ctx);
                if (id != null) {
                  unawaited(_shareReceiptInvoice(id));
                }
              },
              icon: const Icon(Icons.ios_share, size: 18),
              label: const Text('Bagikan'),
            ),
            if (!_autoPrint)
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
    // Guard _previewFresh: jika qty baru berubah dan preview belum selesai,
    // jangan pakai angka stale — fallback ke hitungan lokal.
    final usePreview = _previewFresh;
    payload['subtotal'] =
        usePreview ? asNum(_preview?['subtotal']) : _cartTotal;
    final discount =
        usePreview ? asNum(_preview?['discount']) : _manualDiscount;
    payload['discount_type'] = discount > 0 ? 'nominal' : 'none';
    payload['discount_value'] = discount;
    payload['discount'] = discount;
    if (_isOwner) payload['transaction_date'] = _transactionDate;
    final offlineTotal = usePreview
        ? asNum(_preview?['grand_total'])
        : math.max(0, _cartTotal - discount).toDouble();
    await OfflineStore.insert(payload, tempInvoice, grandTotal: offlineTotal);
    if (!mounted) return;
    _cart.clear();
    _preview = null;
    _discountCtrl.clear();
    _notesCtrl.clear();
    _customerId = null;
    _transactionDate = todayWib();
    await _saveDraft();
    if (!mounted) return;
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
    // Gudang tetap memakai alur stok; peran penjualan mendapat Dashboard dan Keuangan.
    final isGudang = auth.role == 'gudang';
    final pages = isGudang
        ? <Widget>[
            DashboardPage(api: _client),
            if (_visitedTabs.contains(1))
              InventoryPage(
                  api: _client,
                  branchId: _branchId,
                  role: auth.role,
                  initialSection: 'stok')
            else
              const SizedBox.shrink(),
            if (_visitedTabs.contains(2))
              InventoryPage(
                  api: _client,
                  branchId: _branchId,
                  role: auth.role,
                  initialSection: 'mutasi')
            else
              const SizedBox.shrink(),
          ]
        : <Widget>[
            _buildKasir(),
            if (_visitedTabs.contains(1))
              SalesDashboardPage(api: _client, role: auth.role)
            else
              const SizedBox.shrink(),
            if (_visitedTabs.contains(2))
              HistoryTab(api: _client, role: auth.role)
            else
              const SizedBox.shrink(),
            if (_visitedTabs.contains(3))
              FinancePage(api: _client, role: auth.role)
            else
              const SizedBox.shrink(),
          ];
    return Scaffold(
      appBar: AppBar(
        title: Text(_pageTitle(auth.role),
            style: const TextStyle(fontWeight: FontWeight.w700)),
        centerTitle: true,
        backgroundColor: kTaskDark,
        foregroundColor: Colors.white,
        titleTextStyle: const TextStyle(
            fontSize: 19, fontWeight: FontWeight.w700, color: Colors.white),
        iconTheme: const IconThemeData(color: Colors.white),
        systemOverlayStyle: SystemUiOverlayStyle.light,
        surfaceTintColor: Colors.transparent,
        actions: [
          if (!isGudang && _tab == 0)
            Tooltip(
              message: 'Buka Draft',
              child: IconButton(
                onPressed: _resumeCart,
                icon: const Icon(Icons.description_outlined, size: 18),
              ),
            ),
        ],
      ),
      drawer: Drawer(
        width: math.min(MediaQuery.sizeOf(context).width * .84, 340.0),
        // Drawer selalu memakai permukaan denim seperti sidebar web.
        backgroundColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.only(
            topRight: Radius.circular(24),
            bottomRight: Radius.circular(24),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        surfaceTintColor: Colors.transparent,
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              stops: const [0, .42, 1],
              colors: Theme.of(context).brightness == Brightness.dark
                  ? const [kDrawerTopDark, kDrawerMidDark, kDrawerBottomDark]
                  : const [kDrawerTop, kDrawerMid, kDrawerBottom],
            ),
          ),
          child: Theme(
            data: Theme.of(context).copyWith(
              brightness: Brightness.dark,
              colorScheme: Theme.of(context)
                  .colorScheme
                  .copyWith(brightness: Brightness.dark),
            ),
            child: SafeArea(
              child: MorePage(
                api: _client,
                branchId: _branchId,
                role: auth.role,
                currentTab: _tab,
                onNavigateTab: (index) => _selectTab(index, isGudang: isGudang),
              ),
            ),
          ),
        ),
      ),
      body: SafeArea(
        top: false,
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
                        message: 'Offline. Memakai data tersimpan',
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: kTaskSand,
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
    final categoriesByName = <String, Map<String, dynamic>>{};
    final productCategoryNames = _products
        .map((product) => product['category_name']?.toString().trim() ?? '')
        .where((name) => name.isNotEmpty)
        .toSet();
    for (var index = 0; index < _categoryCatalog.length; index++) {
      final category = _categoryCatalog[index];
      final name = category['name']?.toString().trim() ?? '';
      if (name.isEmpty || !productCategoryNames.contains(name)) continue;
      categoriesByName[name] = {
        'name': name,
        // /products/categories already returns rows in the saved settings
        // order. Preserve that response order instead of trusting stale or
        // duplicated sort_order values on cached rows.
        'sort': index,
        'color': category['color']?.toString(),
      };
    }
    for (final product in _products) {
      final name = product['category_name']?.toString().trim() ?? '';
      if (name.isEmpty) continue;
      final sortOrder =
          int.tryParse('${product['category_sort_order']}') ?? 1 << 30;
      final storedColor = product['category_color']?.toString();
      final existing = categoriesByName[name];
      // If the category endpoint has this category, its order and color are
      // authoritative. Product fields are only a compatibility fallback for
      // cached/legacy product rows whose category is missing from the catalog.
      if (existing == null) {
        categoriesByName[name] = {
          'name': name,
          'sort': sortOrder,
          'color': storedColor,
        };
      }
    }
    final categories = categoriesByName.values.toList()
      ..sort((a, b) {
        final order = (a['sort'] as int).compareTo(b['sort'] as int);
        if (order != 0) return order;
        return (a['name'] as String).compareTo(b['name'] as String);
      });
    final width = MediaQuery.sizeOf(context).width;
    final columns = width < 600
        ? 3
        : width < 900
            ? 3
            : 4;
    final cardWidth = (width - 24 - (columns - 1) * 10) / columns;
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    // Reserve the 4 px category accent without adding a visible blank block.
    final footerHeight = 44.0 * textScale + 16.0;
    return Stack(
      children: [
        Positioned.fill(
          child: RefreshIndicator(
            onRefresh: () => _loadData(silent: true, force: true),
            color: Theme.of(context).colorScheme.primary,
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
                      onBranchChanged: (v) => unawaited(BranchScope.set(v)),
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
                if (categories.isNotEmpty)
                  SliverToBoxAdapter(
                      child: SizedBox(
                          height: 48,
                          child: ListView(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            children: [
                              for (final option in <Map<String, dynamic>?>[
                                null,
                                ...categories
                              ])
                                Builder(builder: (context) {
                                  final name = option?['name']?.toString();
                                  final color = name == null
                                      ? kTaskDark
                                      : categoryColorFor(
                                          name: name,
                                          storedHex:
                                              option?['color']?.toString());
                                  final selected = _category == name;
                                  return Padding(
                                    padding: const EdgeInsets.only(right: 8),
                                    child: ChoiceChip(
                                      key: ValueKey(
                                          'pos-category-chip-${name ?? 'all'}'),
                                      label: Text(name ?? 'Semua'),
                                      selected: selected,
                                      selectedColor: color,
                                      backgroundColor:
                                          color.withValues(alpha: .10),
                                      side: BorderSide(
                                          color: color.withValues(alpha: .38)),
                                      labelStyle: TextStyle(
                                        color: selected ? Colors.white : color,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                      ),
                                      onSelected: (_) {
                                        _category = name;
                                        _applyFilter();
                                      },
                                    ),
                                  );
                                }),
                            ],
                          ))),
                if (_visible.isEmpty)
                  const SliverToBoxAdapter(
                    child: SizedBox(
                      height: 220,
                      child: Center(child: Text('Produk tidak ditemukan')),
                    ),
                  )
                else
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(
                        12, 12, 12, (_cart.isNotEmpty ? 148 : 16) + bottomPad),
                    sliver: SliverGrid(
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: columns,
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        // Foto tetap persegi; footer mengikuti lebar kartu dan
                        // skala font supaya tidak menyisakan ruang kosong besar.
                        mainAxisExtent: cardWidth + footerHeight,
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
            bottom: 12 + bottomPad,
            child: GlassCard(
              padding: const EdgeInsets.all(12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(children: [
                    Expanded(
                        child: Text('Keranjang · ${cartTotalPcs(_cart)} pcs',
                            style: TextStyle(color: taskMuted(context)))),
                    Text(fmtRp(_cartTotal),
                        style: TextStyle(
                            color: ink(context), fontWeight: FontWeight.w800)),
                  ]),
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(48)),
                    onPressed: _openCart,
                    icon: const Icon(Icons.shopping_cart_outlined),
                    label: const Text('Bayar'),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

Color _posStockColor(BuildContext context, int stock) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  if (stock <= 0) {
    return dark ? const Color(0xffFCA5A5) : kTaskStockEmpty;
  }
  if (stock < 5) {
    return dark ? const Color(0xffFDBA74) : kTaskStockLow;
  }
  return dark ? const Color(0xff86EFAC) : kTaskStockGood;
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
    final name = productDisplayName(product);
    final price = asNum(product['price']);
    final stock = int.tryParse('${product['stock'] ?? 0}') ?? 0;
    final categoryAccent = categoryColorFor(
      name: product['category_name']?.toString(),
      storedHex: product['category_color']?.toString(),
    );
    final stockColor = _posStockColor(context, stock);
    final photo = mediaUrl(product['photo_path']?.toString());
    return DecoratedBox(
      key: ValueKey('pos-product-card-decoration-${product['id']}'),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(
              color: Color(0x220F172A), blurRadius: 10, offset: Offset(0, 3)),
        ],
      ),
      child: GlassCard(
        radius: 12,
        padding: EdgeInsets.zero,
        onTap: onTap,
        // Grid = puluhan kartu sekaligus; blur per kartu bikin scroll berat.
        frosted: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              key: ValueKey('pos-product-category-accent-${product['id']}'),
              height: 4,
              color: categoryAccent,
            ),
            AspectRatio(
              aspectRatio: 1,
              child: UiProductPhoto(
                path: photo,
                baseUrl: '',
                fit: BoxFit.cover,
                label: 'Foto $name',
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
                      style: const TextStyle(
                          fontSize: TaskTypography.label,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: Text(fmtRp(price),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: TaskTypography.cardTitle,
                                fontWeight: FontWeight.w800,
                                color: ink(context))),
                      ),
                      const SizedBox(width: 4),
                      Text('$stock',
                          key: ValueKey('pos-product-stock-${product['id']}'),
                          style: TextStyle(
                              fontSize: TaskTypography.secondary,
                              fontWeight: FontWeight.w700,
                              color: stockColor)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
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
              isExpanded: true,
              style: TextStyle(fontSize: 14, color: ink(context)),
              decoration: InputDecoration(
                  labelText: 'Toko / Gudang',
                  labelStyle: TextStyle(color: taskMuted(context)),
                  prefixIcon: Icon(Icons.store,
                      size: 18, color: Theme.of(context).colorScheme.primary),
                  filled: true,
                  border: const OutlineInputBorder(),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 13)),
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
                isExpanded: true,
                style: TextStyle(fontSize: 14, color: ink(context)),
                decoration: InputDecoration(
                    labelText: 'Gudang',
                    labelStyle: TextStyle(color: taskMuted(context)),
                    filled: true,
                    border: const OutlineInputBorder(),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 13)),
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
          color: taskSurface(context),
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => setState(() => _active = 'branch'),
            child: Container(
              height: 48,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(
                border: Border.all(color: taskBorder(context)),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(Icons.store,
                      size: 17, color: Theme.of(context).colorScheme.primary),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(branchName ?? 'Toko / Gudang',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: ink(context))),
                  ),
                  Icon(Icons.expand_more, size: 18, color: taskMuted(context)),
                ],
              ),
            ),
          ),
        );
      }

      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_hasBranch) ...[
            branchArea,
            const SizedBox(height: 12),
          ],
          TextField(
            controller: widget.searchController,
            focusNode: _searchFocus,
            onChanged: widget.onSearchChanged,
            onTap: () => setState(() => _active = 'search'),
            decoration: InputDecoration(
              labelText: 'Cari produk',
              hintText: 'Nama / SKU / barcode',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: IconButton(
                onPressed: widget.onScan,
                icon: const Icon(Icons.qr_code_scanner),
                tooltip: 'Scan barcode',
              ),
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
    return Container(
      width: 44,
      height: 36,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: taskSurface(context),
        border: Border.all(color: taskBorder(context)),
        borderRadius: BorderRadius.circular(9),
      ),
      child: TextField(
        controller: _c,
        focusNode: _fn,
        keyboardType: TextInputType.number,
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => _fn.unfocus(),
        textAlign: TextAlign.center,
        cursorHeight: 16,
        style: TextStyle(
            fontSize: TaskTypography.quantity,
            fontWeight: FontWeight.w800,
            color: ink(context)),
        decoration: const InputDecoration(
          isDense: true,
          filled: false,
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          contentPadding: EdgeInsets.zero,
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
    required this.topInset,
    required this.cart,
    required this.customers,
    required this.customerId,
    required this.discountController,
    required this.notesController,
    required this.isOwner,
    required this.transactionDate,
    required this.preview,
    required this.previewFresh,
    required this.error,
    required this.saving,
    required this.onCustomerChanged,
    required this.onDiscountChanged,
    required this.onNotesChanged,
    required this.onTransactionDateChanged,
    required this.onQtySet,
    required this.onRemove,
    required this.onEditPrice,
    required this.onPay,
    required this.onShare,
    required this.onHold,
  });

  final ScrollController? scrollController;
  final double topInset;
  final List<CartItem> cart;
  final List<Map<String, dynamic>> customers;
  final int? customerId;
  final TextEditingController discountController;
  final TextEditingController notesController;
  final bool isOwner;
  final String transactionDate;
  final Map<String, dynamic>? preview;
  final bool previewFresh;
  final String? error;
  final bool saving;
  final ValueChanged<int?> onCustomerChanged;
  final ValueChanged<String> onDiscountChanged;
  final ValueChanged<String> onNotesChanged;
  final ValueChanged<String> onTransactionDateChanged;
  final void Function(CartItem, int) onQtySet;
  final ValueChanged<CartItem> onRemove;
  final ValueChanged<CartItem> onEditPrice;
  final VoidCallback onPay;
  final VoidCallback onShare;
  final VoidCallback onHold;

  @override
  State<_CartSheet> createState() => _CartSheetState();
}

class _CartSheetState extends State<_CartSheet> {
  bool _showOptions = false;
  bool _showActions = false;

  double _parseDiscount() =>
      asNum(widget.discountController.text.replaceAll(RegExp(r'[^0-9]'), ''));

  String _dateLabel(String value) {
    final date = DateTime.tryParse(value);
    if (date == null) return value;
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  Future<void> _pickTransactionDate() async {
    final today = DateTime.parse(todayWib());
    final current = DateTime.tryParse(widget.transactionDate) ?? today;
    final selected = await showDatePicker(
      context: context,
      initialDate: current.isAfter(today) ? today : current,
      firstDate: DateTime(2020),
      lastDate: today,
    );
    if (selected == null) return;
    final value =
        '${selected.year.toString().padLeft(4, '0')}-${selected.month.toString().padLeft(2, '0')}-${selected.day.toString().padLeft(2, '0')}';
    widget.onTransactionDateChanged(value);
  }

  String _customerName() {
    for (final c in widget.customers) {
      if ('${c['id']}' == '${widget.customerId}') {
        return c['name']?.toString() ?? '';
      }
    }
    return '';
  }

  Future<void> _editNotes() async {
    final controller = TextEditingController(text: widget.notesController.text);
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Catatan transaksi'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 3,
          textInputAction: TextInputAction.newline,
          decoration: const InputDecoration(
            hintText: 'Contoh: kirim ke toko cabang',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(controller.text),
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (value == null || !mounted) return;
    widget.notesController.text = value.trim();
    widget.onNotesChanged(widget.notesController.text);
    setState(() {});
  }

  Widget _actionButton({
    required IconData icon,
    required String label,
    required VoidCallback? onPressed,
  }) {
    final color = onPressed == null ? taskMuted(context) : kTaskDark;
    return Expanded(
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: color,
          side: BorderSide(
              color: onPressed == null ? taskBorder(context) : kTaskDark),
          minimumSize: const Size(0, 60),
          padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 5),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 19),
            const SizedBox(height: 3),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(label,
                  maxLines: 1,
                  style: const TextStyle(fontSize: TaskTypography.secondary)),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cart = widget.cart;
    final localSubtotal = cartSubtotal(cart);
    final subtotal = asNum(
        widget.previewFresh ? (widget.preview?['subtotal']) : localSubtotal);
    final discount = asNum(widget.previewFresh
        ? (widget.preview == null ? null : widget.preview!['discount'])
        : _parseDiscount());
    final grandTotal = asNum(widget.previewFresh
        ? (widget.preview == null ? null : widget.preview!['grand_total'])
        : math.max(0, subtotal - discount));
    final customerName = _customerName();
    final invalidDiscount = discount > subtotal;
    final totalPcs = cartTotalPcs(cart);

    // Geser sheet ke atas saat keyboard muncul supaya input qty tetap terlihat.
    return AnimatedPadding(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              key: const ValueKey('cart-sheet-header'),
              color: kTaskDark,
              padding: EdgeInsets.fromLTRB(4, widget.topInset + 6, 14, 8),
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Tutup keranjang',
                    onPressed: () => Navigator.of(context).pop(),
                    padding: EdgeInsets.zero,
                    constraints:
                        const BoxConstraints.tightFor(width: 40, height: 48),
                    icon: const Icon(Icons.arrow_back, color: Colors.white),
                  ),
                  const Expanded(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text('Keranjang',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.w800)),
                    ),
                  ),
                  IconButton(
                    tooltip: _showActions
                        ? 'Sembunyikan menu aksi'
                        : 'Tampilkan menu aksi',
                    onPressed: () =>
                        setState(() => _showActions = !_showActions),
                    padding: EdgeInsets.zero,
                    constraints:
                        const BoxConstraints.tightFor(width: 40, height: 48),
                    icon: Icon(
                        _showActions ? Icons.expand_less : Icons.expand_more,
                        color: Colors.white),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                controller: widget.scrollController,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                children: [
                  if (customerName.isNotEmpty) ...[
                    Material(
                      color: taskSurface(context),
                      shape: RoundedRectangleBorder(
                        side: BorderSide(color: taskBorder(context)),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: widget.customers.isEmpty
                            ? null
                            : () => setState(() => _showOptions = true),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 12),
                          child: Row(
                            children: [
                              const Icon(Icons.person_outline,
                                  color: kTaskDark, size: 22),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(customerName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700)),
                              ),
                              if (widget.customers.isNotEmpty)
                                Icon(Icons.expand_more,
                                    color: taskMuted(context)),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                    decoration: BoxDecoration(
                      color: taskSurface(context),
                      border: Border(
                        top: BorderSide(color: taskBorder(context)),
                        bottom: BorderSide(color: taskBorder(context)),
                      ),
                    ),
                    child: const Row(
                      children: [
                        Expanded(
                            flex: 5,
                            child: Text('Nama',
                                style: TextStyle(fontWeight: FontWeight.w800))),
                        SizedBox(
                            width: 58,
                            child: Text('Qty',
                                textAlign: TextAlign.center,
                                style: TextStyle(fontWeight: FontWeight.w800))),
                        SizedBox(
                            width: 82,
                            child: Text('Total',
                                textAlign: TextAlign.right,
                                style: TextStyle(fontWeight: FontWeight.w800))),
                        SizedBox(width: 44),
                      ],
                    ),
                  ),
                  for (final item in cart)
                    _CartLine(
                      item: item,
                      onQtySet: widget.onQtySet,
                      onRemove: widget.onRemove,
                      onEditPrice: widget.onEditPrice,
                    ),
                  if (widget.isOwner) ...[
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _pickTransactionDate,
                      icon: const Icon(Icons.calendar_today_outlined, size: 18),
                      label: Text(
                          'Tanggal transaksi: ${_dateLabel(widget.transactionDate)}'),
                    ),
                  ],
                  if (_showOptions) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: taskSurface(context),
                        border: Border.all(color: taskBorder(context)),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (widget.customers.isNotEmpty)
                            DropdownButtonFormField<int?>(
                              initialValue: widget.customerId,
                              decoration: const InputDecoration(
                                  isDense: true,
                                  labelText: 'Pelanggan (opsional)',
                                  border: OutlineInputBorder()),
                              items: [
                                const DropdownMenuItem<int?>(
                                    value: null,
                                    child: Text('Tanpa pelanggan')),
                                for (final c in widget.customers)
                                  DropdownMenuItem<int?>(
                                      value: int.tryParse('${c['id']}'),
                                      child: Text('${c['name']}')),
                              ],
                              onChanged: widget.onCustomerChanged,
                            ),
                          if (widget.customers.isNotEmpty)
                            const SizedBox(height: 8),
                          TextField(
                            controller: widget.discountController,
                            keyboardType: TextInputType.number,
                            onChanged: widget.onDiscountChanged,
                            decoration: const InputDecoration(
                              isDense: true,
                              labelText: 'Diskon (Rp)',
                              prefixText: 'Rp ',
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (_showActions)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                child: Row(
                  children: [
                    _actionButton(
                        icon: Icons.local_offer_outlined,
                        label: 'Diskon',
                        onPressed: () => setState(() => _showOptions = true)),
                    const SizedBox(width: 4),
                    _actionButton(
                        icon: Icons.notes_outlined,
                        label: 'Catatan',
                        onPressed: _editNotes),
                    const SizedBox(width: 4),
                    _actionButton(
                        icon: Icons.pause_circle_outline,
                        label: 'Tahan',
                        onPressed: cart.isEmpty ? null : widget.onHold),
                    const SizedBox(width: 4),
                    _actionButton(
                        icon: Icons.more_horiz,
                        label: 'Lainnya',
                        onPressed: () =>
                            setState(() => _showOptions = !_showOptions)),
                  ],
                ),
              ),
            Container(
              key: const ValueKey('cart-summary-footer'),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              decoration: BoxDecoration(
                color: taskSurface(context),
                border: Border(top: BorderSide(color: taskBorder(context))),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Text('$totalPcs pcs',
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w800)),
                    ],
                  ),
                  if (discount > 0)
                    Text('Diskon: -${fmtRp(discount)}',
                        style: TextStyle(color: taskMuted(context))),
                  if (invalidDiscount)
                    Text('Diskon melebihi subtotal',
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error)),
                  if (widget.error != null) ...[
                    const SizedBox(height: 4),
                    Text(widget.error!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error)),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton(
                          style: FilledButton.styleFrom(
                              minimumSize: const Size.fromHeight(52)),
                          onPressed: widget.saving ||
                                  cart.isEmpty ||
                                  invalidDiscount ||
                                  widget.error != null
                              ? null
                              : widget.onPay,
                          child: widget.saving
                              ? const SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2))
                              : Text('Bayar · ${fmtRp(grandTotal)}',
                                  style: const TextStyle(
                                      fontSize: 17,
                                      fontWeight: FontWeight.w800)),
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 62,
                        height: 52,
                        child: OutlinedButton(
                          onPressed: cart.isEmpty || widget.saving
                              ? null
                              : widget.onShare,
                          style: OutlinedButton.styleFrom(
                            padding: EdgeInsets.zero,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.ios_share, size: 18),
                              SizedBox(height: 2),
                              Text('Bagikan',
                                  style: TextStyle(
                                      fontSize: 8.5,
                                      fontWeight: FontWeight.w800)),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CartLine extends StatelessWidget {
  const _CartLine({
    required this.item,
    required this.onQtySet,
    required this.onRemove,
    required this.onEditPrice,
  });

  final CartItem item;
  final void Function(CartItem, int) onQtySet;
  final ValueChanged<CartItem> onRemove;
  final ValueChanged<CartItem> onEditPrice;

  Widget _info(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(item.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: TaskTypography.label,
                  fontWeight: FontWeight.w700,
                  height: 1.2)),
          Text(
              '${fmtRp(item.priceOverride ?? item.price)}${item.variantLabel != null && item.variantLabel!.isNotEmpty ? ' · ${item.variantLabel}' : ''}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: TaskTypography.secondary,
                  fontWeight: FontWeight.w700,
                  color: taskMuted(context))),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final lineTotal = (item.priceOverride ?? item.price) * item.qty;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(flex: 5, child: _info(context)),
              SizedBox(
                width: 58,
                child: Center(
                  child: _QtyInput(
                    value: item.qty,
                    onChanged: (value) => onQtySet(item, value),
                  ),
                ),
              ),
              SizedBox(
                width: 82,
                child: Align(
                  alignment: Alignment.centerRight,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerRight,
                    child: Text(fmtRp(lineTotal),
                        textAlign: TextAlign.right,
                        style: TextStyle(
                            fontWeight: FontWeight.w800, color: ink(context))),
                  ),
                ),
              ),
              const SizedBox(width: 2),
              SizedBox(
                key: const ValueKey('cart-line-menu-hit-area'),
                width: 44,
                height: 44,
                child: PopupMenuButton<String>(
                  tooltip: 'Opsi ${item.name}: ubah harga atau hapus',
                  padding: EdgeInsets.zero,
                  iconSize: 22,
                  icon: Icon(Icons.more_vert, color: ink(context)),
                  color: taskSurface(context),
                  onSelected: (value) {
                    if (value == 'price') onEditPrice(item);
                    if (value == 'remove') onRemove(item);
                  },
                  itemBuilder: (_) => [
                    PopupMenuItem(
                      value: 'price',
                      height: 48,
                      child: Row(children: [
                        Icon(Icons.edit_outlined,
                            size: 19,
                            color: Theme.of(context).colorScheme.primary),
                        const SizedBox(width: 10),
                        Text('Ubah harga',
                            style: TextStyle(
                                color: ink(context),
                                fontWeight: FontWeight.w700)),
                      ]),
                    ),
                    PopupMenuItem(
                      value: 'remove',
                      height: 48,
                      child: Row(children: [
                        Icon(Icons.delete_outline,
                            size: 19,
                            color: Theme.of(context).colorScheme.error),
                        const SizedBox(width: 10),
                        Text('Hapus item',
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                                fontWeight: FontWeight.w700)),
                      ]),
                    ),
                  ],
                ),
              ),
            ],
          ),
          Divider(height: 8, thickness: 1, color: taskBorder(context)),
        ],
      ),
    );
  }
}
