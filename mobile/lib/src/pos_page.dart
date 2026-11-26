import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';

import 'app_ui.dart';
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
import 'reports_page.dart';
import 'sales_dashboard_page.dart';
import 'format.dart';
import 'history_tab.dart';
import 'invoice_share.dart';
import 'payment_defaults.dart';
import 'payment_sheet.dart';
import 'printer_service.dart';
import 'printer_setup.dart';
import 'barcode_scanner_page.dart';
import 'dashboard_page.dart';
import 'finance_page.dart';
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

String _draftProductName(
  int productId,
  Object? rawName,
  Map<int, String> productNames,
) {
  final name = rawName?.toString().trim() ?? '';
  if (name.isNotEmpty && name.toLowerCase() != 'produk') return name;
  return productNames[productId] ?? (name.isNotEmpty ? name : 'Produk');
}

/// Decode the cart snapshot written to the local draft cache.
///
/// Keep this parser independent from the widget; the catalog is optional so
/// callers that restore a draft can fill in names missing from older drafts.
List<CartItem> cartItemsFromDraft(
  Map<String, dynamic>? draft, {
  Map<int, String> productNames = const <int, String>{},
}) {
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
      name: _draftProductName(
          productId, row['name'] ?? row['product_name'], productNames),
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

/// Gabungkan draft perangkat dengan draft server untuk dialog "Buka Draft".
///
/// Draft server yang berasal dari auto-hold snapshot lokal yang sama
/// (client_hold_id sama) tidak ditampilkan dua kali. Snapshot lokal
/// didahulukan karena tetap bisa dipakai saat perangkat offline.
List<Map<String, dynamic>> draftChoices({
  Map<String, dynamic>? localDraft,
  List<Map<String, dynamic>> localDrafts = const [],
  List<dynamic> pending = const [],
}) {
  final locals = <Map<String, dynamic>>[
    ...localDrafts,
    if (localDraft != null) localDraft,
  ];
  final matchedPendingIds = <String>{};
  final choices = <Map<String, dynamic>>[];
  for (final local in locals) {
    final holdId = local['client_hold_id']?.toString().trim();
    final pendingId = local['pending_transaction_id']?.toString();
    Map<String, dynamic>? match;
    for (final raw in pending) {
      if (raw is! Map) continue;
      final serverDraft = Map<String, dynamic>.from(raw);
      final samePending = pendingId != null &&
          pendingId.isNotEmpty &&
          serverDraft['id']?.toString() == pendingId;
      final sameHold = holdId != null &&
          holdId.isNotEmpty &&
          serverDraft['client_hold_id']?.toString().trim() == holdId;
      if (samePending || sameHold) {
        match = serverDraft;
        break;
      }
    }
    final draft = <String, dynamic>{
      ...local,
      if (local['pending_transaction_id'] == null && match != null)
        'pending_transaction_id': match['id'],
    };
    if (match != null) matchedPendingIds.add('${match['id']}');
    choices.add({'source': 'local', 'draft': draft});
  }
  for (final raw in pending) {
    if (raw is! Map) continue;
    final serverDraft = Map<String, dynamic>.from(raw);
    if (!matchedPendingIds.contains('${serverDraft['id']}')) {
      choices.add({'source': 'server', 'pending': serverDraft});
    }
  }
  return choices;
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
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  late final ApiClient _api;
  int _tab = 0;
  final List<int> _visitedTabs = [0];
  final _search = TextEditingController();
  final List<CartItem> _cart = [];
  // Dibaca pemilih toko di sidebar untuk konfirmasi sebelum pindah cabang.
  int _pendingCartCount() => cartTotalPcs(_cart);
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

  /// URL absolut logo kepala invoice (`invoice_logo`, fallback `store_logo`).
  String _invoiceLogoUrl = '';

  /// Setelan struk cabang terakhir (template + nomor WA + logo) dipakai saat
  /// menyusun struk transaksi offline tanpa server.
  Map<String, dynamic> _receiptSettings = const {};
  bool _allowNegativeStock = true;
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
  String? _localDraftId;
  int? _pendingDraftId;
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
    BranchScope.pendingCartCount = _pendingCartCount;
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
    if (BranchScope.pendingCartCount == _pendingCartCount) {
      BranchScope.pendingCartCount = null;
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
        _localDraftId = null;
        _pendingDraftId = null;
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

  Map<int, String> _catalogProductNames() {
    final names = <int, String>{};
    for (final product in _products) {
      final id = int.tryParse('${product['id']}');
      final name = product['name']?.toString().trim() ?? '';
      if (id != null && name.isNotEmpty) names[id] = name;
    }
    return names;
  }

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
    _invoiceLogoUrl = _invoiceLogoUrlFrom(settings);
    _allowNegativeStock =
        (settings['allow_negative_stock']?.toString().trim().toLowerCase() ??
                '') !=
            'false';
    _storePhones = _collectStorePhones(settings);
    _receiptSettings = Map<String, dynamic>.from(settings);
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
    // POS selalu dibuka dengan keranjang KOSONG. Draft terakhir (lokal maupun
    // server) tetap tersimpan dan hanya dimuat lewat aksi "Buka Draft" supaya
    // kasir mulai transaksi baru tanpa keranjang "hantu" dari sesi sebelumnya.
    final branch = _posBranchId ?? _branchId;
    if (_draftBranch != branch) _draftBranch = branch;
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
      'cart-drafts-v2-${context.read<AuthStore>().userId}-$branch';

  String _legacyDraftKey(int branch) =>
      'cart-draft-${context.read<AuthStore>().userId}-$branch';

  String _legacyDraftId(int branch) =>
      'legacy-${context.read<AuthStore>().userId}-$branch';

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
      if (_pendingDraftId != null) 'pending_transaction_id': _pendingDraftId,
      if (_customerId != null) 'customer_id': _customerId,
      'items': _serverDraftItems(),
      'subtotal': asNum(preview?['subtotal'] ?? _cartTotal),
      'discount_type': preview?['discount_type'] ??
          (_manualDiscount > 0 ? 'nominal' : 'none'),
      'discount_value': asNum(preview?['discount'] ?? _manualDiscount),
      if (_notesCtrl.text.trim().isNotEmpty) 'notes': _notesCtrl.text.trim(),
    };
  }

  Future<void> _clearLocalDraft({
    required int branch,
    String? localDraftId,
    String? clientHoldId,
    int? pendingId,
  }) {
    if (context.read<AuthStore>().userId == null || branch <= 0) {
      return Future<void>.value();
    }
    if (localDraftId == null && clientHoldId == null && pendingId == null) {
      return Future<void>.value();
    }
    final write = _draftWrite.then<void>((_) async {
      final drafts = await _readLocalDrafts(branch);
      drafts.removeWhere((draft) =>
          (localDraftId != null && draft['local_draft_id'] == localDraftId) ||
          (clientHoldId != null && draft['client_hold_id'] == clientHoldId) ||
          (pendingId != null &&
              int.tryParse('${draft['pending_transaction_id']}') == pendingId));
      await OfflineStore.cacheSet(
          _draftKey(branch), jsonEncode({'drafts': drafts}));
      await OfflineStore.cacheSet(_legacyDraftKey(branch),
          jsonEncode({'items': <Map<String, dynamic>>[]}));
    });
    _draftWrite = write.catchError((Object _) {});
    return _draftWrite;
  }

  Future<void> _saveDraft() {
    final branch = _posBranchId ?? _branchId;
    if (context.read<AuthStore>().userId == null ||
        branch <= 0 ||
        _cart.isEmpty) {
      return Future<void>.value();
    }
    _clientHoldId ??= _newClientHoldId();
    _localDraftId ??= _clientHoldId;
    final clientHoldId = _clientHoldId!;
    final localDraftId = _localDraftId!;
    final payload = <String, dynamic>{
      'local_draft_id': localDraftId,
      'pending_transaction_id': _pendingDraftId,
      'client_hold_id': clientHoldId,
      'warehouse_id': _warehouseId,
      'customer_id': _customerId,
      'manual_discount': _discountCtrl.text,
      'notes': _notesCtrl.text,
      'transaction_date': _transactionDate,
      'subtotal': asNum(_preview?['subtotal'] ?? _cartTotal),
      'saved_at': DateTime.now().toIso8601String(),
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
    };
    final write = _draftWrite.then<void>((_) async {
      final drafts = await _readLocalDrafts(branch);
      final index = drafts.indexWhere((draft) =>
          draft['local_draft_id'] == localDraftId ||
          draft['client_hold_id'] == clientHoldId);
      if (index < 0) {
        drafts.add(payload);
      } else {
        drafts[index] = payload;
      }
      await OfflineStore.cacheSet(
          _draftKey(branch), jsonEncode({'drafts': drafts}));
      await OfflineStore.cacheSet(_legacyDraftKey(branch),
          jsonEncode({'items': <Map<String, dynamic>>[]}));
    });
    _draftWrite = write.catchError((Object _) {});
    return _draftWrite;
  }

  Future<List<Map<String, dynamic>>> _readLocalDrafts(int branch) async {
    try {
      final drafts = <Map<String, dynamic>>[];
      final saved = await OfflineStore.cacheGet(_draftKey(branch));
      final payload = saved?['payload'];
      final rawDrafts = payload is Map ? payload['drafts'] : null;
      if (rawDrafts is List) {
        for (final raw in rawDrafts) {
          if (raw is! Map) continue;
          final draft = Map<String, dynamic>.from(raw);
          if (cartItemsFromDraft(draft).isEmpty) continue;
          draft['local_draft_id'] ??=
              draft['client_hold_id']?.toString() ?? _legacyDraftId(branch);
          drafts.add(draft);
        }
      }
      final legacy = await OfflineStore.cacheGet(_legacyDraftKey(branch));
      final legacyPayload = legacy?['payload'];
      if (legacyPayload is Map) {
        final draft = Map<String, dynamic>.from(legacyPayload);
        if (cartItemsFromDraft(draft).isNotEmpty) {
          draft['local_draft_id'] ??=
              draft['client_hold_id']?.toString() ?? _legacyDraftId(branch);
          final id = draft['local_draft_id'];
          if (!drafts.any((row) => row['local_draft_id'] == id)) {
            drafts.add(draft);
          }
        }
      }
      drafts.sort((a, b) => (b['saved_at']?.toString() ?? '')
          .compareTo(a['saved_at']?.toString() ?? ''));
      return drafts;
    } catch (_) {
      return <Map<String, dynamic>>[];
    }
  }

  Future<void> _reconcileLocalDrafts(int branch, List<dynamic> pending) async {
    final serverDrafts = pending
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList();
    final write = _draftWrite.then<void>((_) async {
      final drafts = await _readLocalDrafts(branch);
      final kept = <Map<String, dynamic>>[];
      for (final draft in drafts) {
        final pendingId = draft['pending_transaction_id']?.toString();
        final holdId = draft['client_hold_id']?.toString().trim();
        Map<String, dynamic>? match;
        for (final serverDraft in serverDrafts) {
          final samePending = pendingId != null &&
              pendingId.isNotEmpty &&
              serverDraft['id']?.toString() == pendingId;
          final sameHold = holdId != null &&
              holdId.isNotEmpty &&
              serverDraft['client_hold_id']?.toString().trim() == holdId;
          if (samePending || sameHold) {
            match = serverDraft;
            break;
          }
        }
        if (match != null) {
          draft['pending_transaction_id'] = match['id'];
          kept.add(draft);
        } else if (pendingId == null || pendingId.isEmpty) {
          // Draft lokal yang belum pernah tersimpan di server tetap bisa
          // dipakai saat offline.
          kept.add(draft);
        }
        // Mirror server yang tidak lagi ada sudah dibayar/dihapus dari
        // perangkat lain, jadi jangan munculkan kembali dari cache lokal.
      }
      await OfflineStore.cacheSet(
          _draftKey(branch), jsonEncode({'drafts': kept}));
      await OfflineStore.cacheSet(_legacyDraftKey(branch),
          jsonEncode({'items': <Map<String, dynamic>>[]}));
    });
    _draftWrite = write.catchError((Object _) {});
    await _draftWrite;
  }

  Future<bool> _restoreDraftPayload(
      int branch, Map<String, dynamic> draft) async {
    if (!mounted || _draftBranch != branch || _cart.isNotEmpty || _saving) {
      return false;
    }
    final items = cartItemsFromDraft(
      draft,
      productNames: _catalogProductNames(),
    );
    if (items.isEmpty) return false;
    setState(() {
      _cart.addAll(items);
      _clientHoldId = draft['client_hold_id']?.toString();
      _localDraftId = draft['local_draft_id']?.toString() ?? _clientHoldId;
      _pendingDraftId = int.tryParse('${draft['pending_transaction_id']}');
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
    // POS menjual produk; varian hanya pembeda gambar di katalog/web,
    // jadi kasir tidak diminta memilih warna.
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
      final held = await request;
      _pendingDraftId =
          int.tryParse('${held['data']?['id']}') ?? _pendingDraftId;
      _autoHeldClientHoldId = clientHoldId;
      // Simpan id server agar pembayaran draft lokal juga menghapus salinan server.
      if (mounted) await _saveDraft();
      // Snapshot lokal tetap tersimpan dan muncul di daftar "Buka Draft".
      // Draft server ditautkan ke snapshot ini agar tidak muncul dua kali.
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
    final branch = _posBranchId ?? _branchId;
    final localDraftId = _localDraftId;
    final clientHoldId = _clientHoldId;
    final pendingId = _pendingDraftId;
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
        _localDraftId = null;
        _pendingDraftId = null;
        _autoHeldClientHoldId = null;
      });
      await _clearLocalDraft(
        branch: branch,
        localDraftId: localDraftId,
        clientHoldId: clientHoldId,
        pendingId: pendingId,
      );
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
      final localDrafts = await _readLocalDrafts(branch);
      List<dynamic> pending = const [];
      var serverDraftsLoaded = false;
      try {
        pending = await _client.pendingTransactions(branchId: branch);
        await _reconcileLocalDrafts(branch, pending);
        serverDraftsLoaded = true;
      } on ApiException {
        // A locally saved draft remains usable when the server is offline.
        if (localDrafts.isEmpty) rethrow;
      }
      if (!mounted) return;
      final reconciledDrafts =
          serverDraftsLoaded ? await _readLocalDrafts(branch) : localDrafts;
      if (!mounted) return;
      final choices =
          draftChoices(localDrafts: reconciledDrafts, pending: pending);
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
                  final localDraft = isLocal
                      ? choice['draft'] as Map<String, dynamic>
                      : const <String, dynamic>{};
                  final p = isLocal
                      ? const <String, dynamic>{}
                      : (choice['pending'] as Map<String, dynamic>);
                  final heldAt = DateTime.tryParse(
                          '${isLocal ? localDraft['saved_at'] : p['held_at']}')
                      ?.toLocal();
                  final heldLabel = heldAt == null
                      ? 'Tanggal draft tidak tersedia'
                      : '${heldAt.day.toString().padLeft(2, '0')}/${heldAt.month.toString().padLeft(2, '0')}/${heldAt.year} · ${heldAt.hour.toString().padLeft(2, '0')}:${heldAt.minute.toString().padLeft(2, '0')}';
                  final itemCount = isLocal
                      ? cartItemsFromDraft(localDraft).length
                      : p['items'] is List
                          ? (p['items'] as List).length
                          : 0;
                  final subtotal =
                      asNum(isLocal ? localDraft['subtotal'] : p['subtotal']);
                  return Card(
                    margin: EdgeInsets.zero,
                    child: ListTile(
                      dense: true,
                      leading: CircleAvatar(
                        radius: 17,
                        child: Text('$itemCount',
                            style: const TextStyle(fontSize: 12)),
                      ),
                      title: Text('$itemCount item · ${fmtRp(subtotal)}',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(isLocal
                          ? 'Draft perangkat · $heldLabel'
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
      final productNames = _catalogProductNames();
      for (final it in items) {
        final vidRaw = it['variant_id'];
        final productId = int.tryParse(it['product_id'].toString()) ?? 0;
        cart.add(CartItem(
          productId: productId,
          variantId: vidRaw != null ? int.tryParse(vidRaw.toString()) : null,
          name: _draftProductName(
              productId, it['name'] ?? it['product_name'], productNames),
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
        _localDraftId = 'server-$id';
        _pendingDraftId = id;
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
      final isLocal = choice['source'] == 'local';
      final local = isLocal
          ? choice['draft'] as Map<String, dynamic>
          : const <String, dynamic>{};
      final pending = isLocal
          ? const <String, dynamic>{}
          : choice['pending'] as Map<String, dynamic>;
      final pendingId = int.tryParse(
          '${isLocal ? local['pending_transaction_id'] : pending['id']}');
      final localDraftId = local['local_draft_id']?.toString();
      final clientHoldId =
          (isLocal ? local['client_hold_id'] : pending['client_hold_id'])
              ?.toString();
      if (pendingId != null) {
        try {
          await _client.deletePendingTransaction(pendingId, branchId: branch);
        } on ApiException catch (e) {
          if (e.statusCode != 404) rethrow;
        }
      }
      await _clearLocalDraft(
        branch: branch,
        localDraftId: localDraftId,
        clientHoldId: clientHoldId,
        pendingId: pendingId,
      );
      final deletingCurrent =
          (localDraftId != null && localDraftId == _localDraftId) ||
              (clientHoldId != null && clientHoldId == _clientHoldId) ||
              (pendingId != null && pendingId == _pendingDraftId);
      if (deletingCurrent && mounted) {
        _previewTimer?.cancel();
        setState(() {
          _cart.clear();
          _preview = null;
          _customerId = null;
          _discountCtrl.clear();
          _notesCtrl.clear();
          _localDraftId = null;
          _clientHoldId = null;
          _pendingDraftId = null;
          _autoHeldClientHoldId = null;
        });
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

  /// URL logo kepala invoice dari setelan cabang. Kosong bila logo dimatikan
  /// (`show_logo = false`) atau belum di-upload; gambar invoice lalu memakai
  /// inisial nama toko.
  String _invoiceLogoUrlFrom(Map<String, dynamic> settings) {
    if ((settings['show_logo'] ?? '').toString().toLowerCase() == 'false') {
      return '';
    }
    final path = (settings['invoice_logo'] ?? settings['store_logo'] ?? '')
        .toString()
        .trim();
    return path.isEmpty ? '' : _client.mediaUrl(path);
  }

  /// Info toko terbaru dari server, dipakai saat mencetak invoice supaya
  /// perubahan nama/alamat/telepon toko langsung terpakai tanpa membuka ulang
  /// aplikasi (server menyimpan identitas toko di tabel branches).
  Future<({String name, String address, String phone})>
      _freshInvoiceStore() async {
    final fallback = _invoiceStore();
    try {
      final fresh = await _client.storeSettings();
      final name = fresh['store_name']?.toString().trim() ?? '';
      final address = fresh['store_address']?.toString().trim() ?? '';
      final phone = fresh['store_phone']?.toString().trim() ?? '';
      final phones = _collectStorePhones(fresh);
      if (name.isNotEmpty) _storeName = name;
      if (address.isNotEmpty) _storeAddress = address;
      if (phone.isNotEmpty) _storePhone = phone;
      if (phones.isNotEmpty) _storePhones = phones;
      _invoiceLogoUrl = _invoiceLogoUrlFrom(fresh);
      return (
        name: name.isNotEmpty ? name : fallback.name,
        address: address.isNotEmpty ? address : fallback.address,
        phone: phone.isNotEmpty ? phone : fallback.phone,
      );
    } catch (_) {
      return fallback;
    }
  }

  /// Nomor telepon pada header invoice: daftar dari pengaturan web, atau
  /// nomor cabang bila pengaturan belum diisi.
  List<String> _invoicePhones(String fallback) {
    if (_storePhones.isNotEmpty) return _storePhones;
    final text = fallback.trim();
    return text.isEmpty ? const [] : [text];
  }

  Map<String, dynamic>? get _invoiceCustomer {
    for (final customer in _customers) {
      if ('${customer['id']}' == '$_customerId') return customer;
    }
    return null;
  }

  String _invoiceCustomerLabel() {
    final customer = _invoiceCustomer;
    if (customer == null) return 'Umum';
    final name = customer['name']?.toString().trim() ?? '';
    if (name.isEmpty) return 'Umum';
    return '$name · ${invoiceCustomerTierLabel(customer['price_tier'])}';
  }

  /// Data pelanggan terbaru dari server. Dipakai saat membagikan invoice agar
  /// ekspedisi/alamat yang baru diubah di CRM tidak tertinggal di salinan POS.
  Future<Map<String, dynamic>?> _freshInvoiceCustomer() async {
    final selected = _customerId;
    if (selected == null) return null;
    try {
      final rows = await _client.customers();
      final customers = rows.cast<Map<String, dynamic>>();
      if (mounted) setState(() => _customers = customers);
      for (final customer in customers) {
        if ('${customer['id']}' == '$selected') return customer;
      }
    } on ApiException catch (_) {
      // Offline: pakai daftar yang sudah dimuat.
    }
    return _invoiceCustomer;
  }

  /// Bagikan invoice gambar dari keranjang (sebelum dibayar) supaya pembeli
  /// bisa langsung transfer.
  Future<void> _shareCartInvoice() async {
    if (_cart.isEmpty) return;
    final subtotal = _previewFresh ? asNum(_preview?['subtotal']) : _cartTotal;
    final discount =
        _previewFresh ? asNum(_preview?['discount']) : _manualDiscount;
    final grand = _previewFresh && _preview?['grand_total'] != null
        ? asNum(_preview?['grand_total'])
        : (subtotal - discount);
    final store = await _freshInvoiceStore();
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
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Nomor invoice gagal dibuat: $error')));
        return;
      }
    }
    if (invoiceNo == null || invoiceNo.isEmpty) return;
    if (!mounted) return;
    final customer = await _freshInvoiceCustomer();
    if (!mounted) return;
    final payload = InvoicePayload(
      storeName: store.name,
      storeAddress: store.address,
      storePhones: _invoicePhones(store.phone),
      storeLogoUrl: _invoiceLogoUrl,
      instagram: invoiceInstagram(store.name, store.address),
      invoiceNo: invoiceNo,
      dateText: invoiceDateText(DateTime.now().toIso8601String()),
      cashier: context.read<AuthStore>().userName ?? '-',
      customerLabel: _invoiceCustomerLabel(),
      customerName: customer?['name']?.toString() ?? '',
      customerPhone: customer?['phone']?.toString() ?? '',
      customerAddress: customer?['address']?.toString() ?? '',
      expedition: customer?['expedition']?.toString() ?? '',
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
      note: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
    );
    try {
      await shareInvoiceImage(context, payload);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gagal membagikan invoice: $error')));
    }
  }

  /// Bagikan invoice final dari transaksi tersimpan.
  Future<void> _shareReceiptInvoice(int id) async {
    try {
      final data = await loadReceiptForPrint(_client, id);
      if (!mounted) return;
      final store = (data['store'] as Map<String, dynamic>?) ?? const {};
      final rawItems =
          ((data['items'] as List?) ?? const []).cast<Map<String, dynamic>>();
      final storeName =
          (store['store_name'] ?? _storeName ?? 'Anyostore').toString();
      final receiptPhone = (store['store_phone'] ?? _storePhone).toString();
      final payload = InvoicePayload(
        storeName: storeName,
        storeAddress: (store['store_address'] ?? _storeAddress).toString(),
        storePhones: _invoicePhones(receiptPhone),
        storeLogoUrl: _invoiceLogoUrlFrom(store),
        instagram: invoiceInstagram(
            storeName, (store['store_address'] ?? _storeAddress).toString()),
        invoiceNo: (data['invoice_no'] ?? '-').toString(),
        dateText:
            invoiceDateText(data['created_at'] ?? data['transaction_date']),
        cashier: (data['cashier'] ?? context.read<AuthStore>().userName ?? '-')
            .toString(),
        customerLabel:
            (data['customer_name']?.toString().trim().isNotEmpty ?? false)
                ? data['customer_name'].toString()
                : 'Umum',
        customerName: (data['customer_name'] ?? '').toString(),
        customerPhone: (data['customer_phone'] ?? '').toString(),
        customerAddress: (data['customer_address'] ?? '').toString(),
        expedition: (data['customer_expedition'] ?? '').toString(),
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
        note: (data['notes'] ?? '').toString().trim().isEmpty
            ? null
            : data['notes'].toString().trim(),
      );
      await shareInvoiceImage(context, payload);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gagal membagikan invoice: $error')));
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
      builder: (_) {
        final store = _invoiceStore();
        return PaymentSheet(
          grandTotal: grandTotal,
          defaultMethod: defaultPaymentMethod(store.name, store.address),
        );
      },
    );
    if (payment == null || !mounted) return;
    final lowStock = _cart
        .where((c) => c.stockAvailable != null && c.stockAvailable! < c.qty)
        .toList();
    if (lowStock.isNotEmpty && !_allowNegativeStock) {
      final first = lowStock.first;
      final label = first.name +
          (first.variantLabel != null ? ' (${first.variantLabel})' : '');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              'Stok $label kurang (tersedia ${first.stockAvailable}, diminta ${first.qty}). Toko ini tidak mengizinkan transaksi melebihi stok.')));
      return;
    }
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
      Map<String, dynamic> result;
      try {
        result = await _client.createTransaction(payload);
      } on ApiException catch (e) {
        // Server bisa menemukan stok kurang walau cache HP masih cukup
        // (stok berubah dari perangkat lain). Bila toko mengizinkan jual
        // melebihi stok, beri tombol Lanjutkan untuk kirim ulang.
        if (e.isNetwork || !_isStockError(e.message) || !_allowNegativeStock) {
          rethrow;
        }
        final proceed = await _confirmOversell(e.message);
        if (proceed != true || !mounted) return;
        payload['allow_negative_stock'] = true;
        result = await _client.createTransaction(payload);
      }
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
                    printReceiptNow(
                        context, () => loadReceiptForPrint(_client, id));
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
        printReceiptNow(context, () => loadReceiptForPrint(_client, id));
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

  /// Pesan server saat stok tidak mencukupi.
  bool _isStockError(String message) {
    final text = message.toLowerCase();
    return text.contains('tidak mencukupi') ||
        text.contains('tidak mengizinkan transaksi melebihi stok');
  }

  /// Konfirmasi jual melebihi stok (stok jadi minus) setelah server menolak.
  Future<bool?> _confirmOversell(String message) => showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Stok kurang'),
          content: Text(
              '${message.trim()}\n\nLanjutkan transaksi dengan stok minus?'),
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

  /// Struk lokal untuk transaksi offline. Nomor sementara OFF- dipakai apa
  /// adanya (nanti diganti nomor resmi saat sync), dan barisnya disusun dari
  /// setelan cabang terakhir yang tersimpan di HP.
  Map<String, dynamic> _offlineReceiptPayload({
    required Map<String, dynamic> payload,
    required String invoiceNo,
    required double grandTotal,
    required double discount,
    required String customerLabel,
    required String cashier,
  }) {
    final paid = asNum(payload['amount_paid']) > 0
        ? asNum(payload['amount_paid'])
        : grandTotal;
    final payments = payload['payments'];
    return <String, dynamic>{
      'store': <String, dynamic>{
        ..._receiptSettings,
        'store_name': _storeName ?? 'Anyostore',
        'store_address': _storeAddress,
        'store_phone': _storePhone,
        'store_tax_id': _receiptSettings['store_tax_id'] ?? '',
      },
      'invoice_no': invoiceNo,
      'offline_invoice_no': invoiceNo,
      'transaction_date': payload['transaction_date'] ?? todayWib(),
      'created_at': DateTime.now().toUtc().toIso8601String(),
      'cashier': cashier,
      'customer_name': customerLabel,
      'notes': (payload['notes'] ?? '').toString(),
      'items': [
        for (final line in _cart)
          {
            'product_name': line.name,
            'quantity': line.qty,
            'price': line.priceOverride ?? line.price,
            'subtotal': (line.priceOverride ?? line.price) * line.qty,
          },
      ],
      'subtotal': asNum(payload['subtotal']),
      'discount': discount,
      'grand_total': grandTotal,
      'payments': payments is List && payments.isNotEmpty
          ? payments
          : [
              {
                'payment_method': payload['payment_method'] ?? 'cash',
                'amount': grandTotal,
              },
            ],
      'amount_paid': paid,
      'change': paid > grandTotal ? paid - grandTotal : 0,
    };
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
    // Struk disusun sebelum keranjang dikosongkan; dicetak langsung kalau
    // auto print aktif, dan tetap bisa dicetak lewat aksi snackbar.
    final receiptPayload = _offlineReceiptPayload(
      payload: payload,
      invoiceNo: tempInvoice,
      grandTotal: offlineTotal,
      discount: discount,
      customerLabel: _invoiceCustomerLabel(),
      cashier: context.read<AuthStore>().userName ?? '-',
    );
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
            'Transaksi disimpan offline ($tempInvoice). Akan otomatis sync saat internet kembali.'),
        action: SnackBarAction(
          label: 'Cetak Struk',
          onPressed: () {
            if (!mounted) return;
            printReceiptNow(context, () async => receiptPayload);
          },
        )));
    if (_autoPrint) {
      printReceiptNow(context, () async => receiptPayload);
    }
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
    final scaffold = Scaffold(
      key: _scaffoldKey,
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
      // Sidebar juga bisa dibuka dengan geser dari tepi kiri layar. Zona geser
      // dilebarkan dari 20 px bawaan Flutter karena 20 px pertama di Android
      // dipakai gesture Back sistem, sehingga geseran justru keluar aplikasi.
      drawerEnableOpenDragGesture: true,
      drawerEdgeDragWidth: 40,
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
    // Di Android 16 (targetSdk 36) predictive back aktif default: event Back
    // hanya sampai ke Flutter bila ada PopScope di pohon widget. Halaman root
    // ini memakai Back untuk membuka/menutup sidebar, supaya geser dari tepi
    // kiri layar membuka menu dan tidak menutup aplikasi. (Alternatif
    // systemGestureExclusionRects tidak bisa: Android hanya 200dp per sisi.)
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        final state = _scaffoldKey.currentState;
        if (state == null) return;
        if (state.isDrawerOpen) {
          state.closeDrawer();
        } else {
          state.openDrawer();
        }
      },
      child: scaffold,
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
                      onBranchChanged: (v) =>
                          unawaited(BranchScope.request(context, v)),
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
            // Mode gelap: foto berlatar putih di-inset supaya tidak jadi
            // blok putih yang menempel penuh ke tepi kartu.
            Builder(builder: (context) {
              final isDark = Theme.of(context).brightness == Brightness.dark;
              final photoWidget = AspectRatio(
                aspectRatio: 1,
                child: UiProductPhoto(
                  path: photo,
                  baseUrl: '',
                  fit: BoxFit.cover,
                  label: 'Foto $name',
                ),
              );
              if (!isDark) return photoWidget;
              return Padding(
                padding: const EdgeInsets.all(6),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: photoWidget,
                ),
              );
            }),
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
            AppSelectField<int?>(
              value: widget.posBranchId,
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
                      child: Text(
                          '${b['type'] == 'gudang' ? 'Gudang' : 'Toko'} · ${b['name']}')),
              ],
              onChanged: (v) {
                widget.onBranchChanged(v);
                setState(() => _active = null);
              },
            ),
            if (widget.warehouses.length > 1) ...[
              const SizedBox(height: 8),
              AppSelectField<String>(
                value: widget.warehouseId.isEmpty ? null : widget.warehouseId,
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

      // Accordion satu baris: default = pill cabang + field cari berbagi satu
      // baris; ketuk salah satu memanjang penuh menutup yang lain.
      if (_active == 'branch') {
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: branchArea),
            const SizedBox(width: 4),
            IconButton(
              onPressed: () => setState(() => _active = null),
              icon: const Icon(Icons.close_rounded),
              tooltip: 'Tutup pemilih cabang',
            ),
          ],
        );
      }

      final searchField = TextField(
        controller: widget.searchController,
        focusNode: _searchFocus,
        onChanged: widget.onSearchChanged,
        onTap: () => setState(() => _active = 'search'),
        decoration: InputDecoration(
          labelText: 'Cari produk',
          hintText: _active == 'search' ? 'Nama / SKU / barcode' : null,
          prefixIcon: _active == 'search' ? const Icon(Icons.search) : null,
          suffixIcon: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_active == 'search')
                IconButton(
                  onPressed: () {
                    widget.searchController.clear();
                    widget.onSearchChanged('');
                    _searchFocus.unfocus();
                    setState(() => _active = null);
                  },
                  icon: const Icon(Icons.close_rounded),
                  tooltip: 'Tutup pencarian',
                ),
              IconButton(
                onPressed: widget.onScan,
                icon: const Icon(Icons.qr_code_scanner),
                tooltip: 'Scan barcode',
              ),
            ],
          ),
        ),
      );

      if (_active == 'search' || !_hasBranch) {
        return searchField;
      }

      return Row(
        children: [
          Expanded(child: branchArea),
          const SizedBox(width: 8),
          Expanded(child: searchField),
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
  double get _discount => _parseDiscount();

  String get _notes => widget.notesController.text.trim();

  bool get _hasActiveOptions =>
      _discount > 0 || _notes.isNotEmpty || _customerName().isNotEmpty;

  /// Lembar "Opsi transaksi": pelanggan, diskon, catatan, dan tahan dalam satu
  /// bottom sheet — menggantikan panel opsi lama + dialog Catatan terpisah.
  Future<void> _openOptions() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: taskSurface(context),
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          // Nilai pada sheet dihitung ulang dari controller induk, jadi
          // perubahan langsung tercermin di ringkasan di bawah.
          void refresh(VoidCallback change) {
            change();
            setSheetState(() {});
            setState(() {});
          }

          return Padding(
            padding: EdgeInsets.only(
                bottom: MediaQuery.of(context).viewInsets.bottom),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 38,
                      height: 4,
                      decoration: BoxDecoration(
                          color: const Color(0xFFCBD5E1),
                          borderRadius: BorderRadius.circular(999)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text('Opsi transaksi',
                      style:
                          TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text('Perubahan langsung tersimpan.',
                      style: TextStyle(
                          fontSize: TaskTypography.micro,
                          color: taskMuted(context))),
                  const SizedBox(height: 8),
                  if (widget.customers.isNotEmpty)
                    _optionField(
                      icon: Icons.person_outline,
                      tint: kTaskBlueLight,
                      tintInk: kTaskAccent,
                      title: 'Pelanggan',
                      subtitle: 'Untuk komisi dan riwayat pembeli',
                      child: AppSelectField<int?>(
                        value: widget.customerId,
                        decoration: const InputDecoration(
                            isDense: true, border: OutlineInputBorder()),
                        items: [
                          const DropdownMenuItem<int?>(
                              value: null, child: Text('Tanpa pelanggan')),
                          for (final c in widget.customers)
                            DropdownMenuItem<int?>(
                                value: int.tryParse('${c['id']}'),
                                child: Text('${c['name']}')),
                        ],
                        onChanged: (value) =>
                            refresh(() => widget.onCustomerChanged(value)),
                      ),
                    ),
                  _optionField(
                    icon: Icons.local_offer_outlined,
                    tint: kTaskOrangeLight,
                    tintInk: kTaskTerracotta,
                    title: 'Diskon',
                    subtitle: 'Potongan dari subtotal',
                    trailing: _discount > 0 ? 'Hapus' : null,
                    onTrailing: _discount > 0
                        ? () => refresh(() {
                              widget.discountController.clear();
                              widget.onDiscountChanged('');
                            })
                        : null,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextField(
                          controller: widget.discountController,
                          keyboardType: TextInputType.number,
                          onChanged: (value) =>
                              refresh(() => widget.onDiscountChanged(value)),
                          decoration: const InputDecoration(
                            isDense: true,
                            prefixText: 'Rp ',
                            hintText: '0',
                            border: OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            for (final amount in const [
                              5000,
                              10000,
                              20000,
                              50000
                            ])
                              ChoiceChip(
                                label: Text('${amount ~/ 1000}rb'),
                                selected: _discount == amount,
                                onSelected: (_) => refresh(() {
                                  widget.discountController.text = '$amount';
                                  widget.onDiscountChanged('$amount');
                                }),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  _optionField(
                    icon: Icons.notes_outlined,
                    tint: kTaskStockGoodSurface,
                    tintInk: kTaskStockGood,
                    title: 'Catatan',
                    subtitle: 'Langsung di sini, tanpa dialog',
                    child: TextField(
                      controller: widget.notesController,
                      maxLines: 2,
                      textInputAction: TextInputAction.newline,
                      onChanged: (value) =>
                          refresh(() => widget.onNotesChanged(value)),
                      decoration: const InputDecoration(
                        isDense: true,
                        hintText: 'Contoh: kirim ke toko cabang',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  _optionField(
                    icon: Icons.pause_circle_outline,
                    tint: kTaskPurpleLight,
                    tintInk: kTaskPurple,
                    title: 'Tahan transaksi',
                    subtitle: 'Simpan keranjang, lanjutkan nanti',
                    trailing: widget.cart.isEmpty ? null : 'Tahan',
                    onTrailing: widget.cart.isEmpty
                        ? null
                        : () {
                            Navigator.of(sheetContext).pop();
                            widget.onHold();
                          },
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(48)),
                    onPressed: () => Navigator.of(sheetContext).pop(),
                    child: const Text('Selesai'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _optionField({
    required IconData icon,
    required Color tint,
    required Color tintInk,
    required String title,
    String? subtitle,
    String? trailing,
    VoidCallback? onTrailing,
    Widget? child,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                    color: tint, borderRadius: BorderRadius.circular(9)),
                child: Icon(icon, size: 16, color: tintInk),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w700)),
                    if (subtitle != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 1),
                        child: Text(subtitle,
                            style: TextStyle(
                                fontSize: TaskTypography.micro,
                                color: taskMuted(context))),
                      ),
                  ],
                ),
              ),
              if (trailing != null)
                TextButton(
                  onPressed: onTrailing,
                  style: TextButton.styleFrom(
                    minimumSize: const Size(0, 36),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  child: Text(trailing,
                      style: const TextStyle(
                          fontSize: TaskTypography.secondary,
                          fontWeight: FontWeight.w800)),
                ),
            ],
          ),
          if (child != null) ...[
            const SizedBox(height: 8),
            child,
          ],
        ],
      ),
    );
  }

  Widget _optionTag(String label, VoidCallback onClear) {
    return Container(
      height: 30,
      padding: const EdgeInsets.only(left: 11, right: 4),
      decoration: BoxDecoration(
          color: const Color(0xFFEEF3FB),
          borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label,
              style: const TextStyle(
                  fontSize: TaskTypography.micro,
                  fontWeight: FontWeight.w700,
                  color: kTaskDark)),
          const SizedBox(width: 2),
          InkWell(
            onTap: onClear,
            borderRadius: BorderRadius.circular(999),
            child: const Padding(
              padding: EdgeInsets.all(4),
              child: Icon(Icons.close, size: 13, color: kTaskDark),
            ),
          ),
        ],
      ),
    );
  }

  Widget _activeOptionsCard() {
    final tags = <Widget>[
      if (_discount > 0)
        _optionTag('Diskon ${fmtRp(_discount)}', () {
          widget.discountController.clear();
          widget.onDiscountChanged('');
          setState(() {});
        }),
      if (_notes.isNotEmpty)
        _optionTag('Catatan', () {
          widget.notesController.clear();
          widget.onNotesChanged('');
          setState(() {});
        }),
      if (_customerName().isNotEmpty)
        _optionTag(_customerName(), () {
          widget.onCustomerChanged(null);
          setState(() {});
        }),
    ];
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: taskSurface(context),
        border: Border.all(color: taskBorder(context)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('OPSI AKTIF',
              style: TextStyle(
                  fontSize: TaskTypography.micro,
                  letterSpacing: .8,
                  fontWeight: FontWeight.w800,
                  color: taskMuted(context))),
          const SizedBox(height: 8),
          Wrap(spacing: 6, runSpacing: 6, children: tags),
        ],
      ),
    );
  }

  double _parseDiscount() =>
      asNum(widget.discountController.text.replaceAll(RegExp(r'[^0-9]'), ''));

  String _dateLabel(String value) => formatWibDate(value);

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
                  Tooltip(
                    message: 'Opsi transaksi',
                    child: TextButton.icon(
                      onPressed: () => _openOptions(),
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        minimumSize: const Size(0, 44),
                      ),
                      icon:
                          const Icon(Icons.tune, color: Colors.white, size: 19),
                      label: const Text('Opsi',
                          style: TextStyle(
                              fontSize: TaskTypography.secondary,
                              fontWeight: FontWeight.w700)),
                    ),
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
                            : () => _openOptions(),
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
                ],
              ),
            ),
            if (_hasActiveOptions)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
                child: _activeOptionsCard(),
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
                  if (discount > 0) ...[
                    Text('Subtotal ${fmtRp(subtotal)}',
                        style: TextStyle(color: taskMuted(context))),
                    Text('Diskon: -${fmtRp(discount)}',
                        style: TextStyle(color: taskMuted(context))),
                  ],
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
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2))
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
                                      fontSize: TaskTypography.micro,
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
                child: Tooltip(
                  message: 'Opsi ${item.name}: ubah harga atau hapus',
                  child: AppSelectField<String>(
                    value: null,
                    transparentField: true,
                    showChevron: false,
                    fieldChild: Icon(Icons.more_vert, color: ink(context)),
                    items: const [
                      DropdownMenuItem<String>(
                          value: 'price', child: Text('Ubah harga')),
                      DropdownMenuItem<String>(
                          value: 'remove', child: Text('Hapus item')),
                    ],
                    itemBuilder: (context, option, _) {
                      final remove = option.value == 'remove';
                      final color = remove
                          ? Theme.of(context).colorScheme.error
                          : Theme.of(context).colorScheme.primary;
                      return Row(
                        children: [
                          Icon(
                              remove
                                  ? Icons.delete_outline
                                  : Icons.edit_outlined,
                              size: 19,
                              color: color),
                          const SizedBox(width: 10),
                          Text((option.child as Text).data ?? '',
                              style: TextStyle(
                                  color: remove ? color : ink(context),
                                  fontWeight: FontWeight.w700)),
                        ],
                      );
                    },
                    onChanged: (value) {
                      if (value == 'price') onEditPrice(item);
                      if (value == 'remove') onRemove(item);
                    },
                  ),
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
