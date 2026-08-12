import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({String? baseUrl})
      : baseUrl = baseUrl ??
            const String.fromEnvironment('API_URL',
                defaultValue: 'https://anyostore.my.id/api');

  final String baseUrl;
  String? _token;

  /// Dipanggil saat API mengembalikan 401 untuk mencoba refresh token.
  Future<bool> Function()? refreshHandler;

  void setToken(String? token) => _token = token;
  String? get token => _token;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$baseUrl$path').replace(queryParameters: query);

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) =>
      _request(() =>
          http.post(_uri(path), headers: _headers, body: jsonEncode(body)));

  Future<Map<String, dynamic>> put(String path, Map<String, dynamic> body) =>
      _request(() =>
          http.put(_uri(path), headers: _headers, body: jsonEncode(body)));

  Future<Map<String, dynamic>> delete(String path) =>
      _request(() => http.delete(_uri(path), headers: _headers));

  Future<Map<String, dynamic>> get(String path, [Map<String, String>? query]) =>
      _request(() => http.get(_uri(path, query), headers: _headers));

  Future<Map<String, dynamic>> _request(
    Future<http.Response> Function() run, {
    bool retried = false,
  }) async {
    final res = await run().timeout(const Duration(seconds: 30));
    if (res.statusCode == 401 && !retried && refreshHandler != null) {
      final ok = await refreshHandler!();
      if (ok) return _request(run, retried: true);
    }
    return _decode(res);
  }

  Map<String, dynamic> _decode(http.Response res) {
    Map<String, dynamic> data;
    try {
      data = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException('Respons server tidak valid',
          statusCode: res.statusCode);
    }
    if (res.statusCode >= 400) {
      throw ApiException(
          data['message']?.toString() ?? 'Permintaan gagal (${res.statusCode})',
          statusCode: res.statusCode);
    }
    return data;
  }

  // ===== Auth =====
  Future<Map<String, dynamic>> loginPassword(String email, String password) =>
      post('/auth/login?mobile=1', {'email': email, 'password': password});

  Future<Map<String, dynamic>> loginPin(String email, String pin) =>
      post('/auth/login-pin?mobile=1', {'email': email, 'pin': pin});

  Future<Map<String, dynamic>> me() => get('/auth/me');

  // ===== Katalog & data toko =====
  /// Cek versi produk (MAX updated_at) tanpa mengunduh daftar lengkap.
  Future<Map<String, dynamic>> productsVersion({required int branchId}) async {
    final res = await get('/products/version', {'branch_id': '$branchId'});
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  Future<List<dynamic>> products({
    required int branchId,
    String search = '',
  }) async {
    final res = await get('/products', {
      'limit': '500',
      'include_wholesale': '1',
      'branch_id': '$branchId',
      if (search.isNotEmpty) 'search': search,
    });
    return (res['data'] as List?) ?? [];
  }

  Future<List<dynamic>> productCategories() async {
    final res = await get('/products/categories');
    return (res['data'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> createProduct(Map<String, dynamic> body) =>
      post('/products', body);

  Future<Map<String, dynamic>> updateProduct(
          int id, Map<String, dynamic> body) =>
      put('/products/$id', body);

  Future<Map<String, dynamic>> deleteProduct(int id) =>
      delete('/products/$id');

  Future<Map<String, dynamic>> uploadProductMedia(
          int id, String mime, String base64) =>
      post('/products/$id/media-data', {
        'content_type': mime,
        'filename': 'media',
        'data_url': 'data:$mime;base64,$base64',
      });

  Future<Map<String, dynamic>> uploadVariantPhoto(
          int productId, int variantId, String mime, String base64) =>
      post('/products/$productId/variants/$variantId/photo-data', {
        'content_type': mime,
        'filename': 'variant',
        'data_url': 'data:$mime;base64,$base64',
      });

  Future<List<dynamic>> activityLogs({String search = ''}) async {
    final res = await get('/activity-logs', {
      if (search.isNotEmpty) 'search': search,
    });
    return (res['data'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> backupNow() => get('/backup');

  Future<Map<String, dynamic>> deleteProductMedia(int id, int mediaId) =>
      delete('/products/$id/media/$mediaId');

  Future<Map<String, dynamic>> product(int id, {required int branchId}) async {
    final res = await get('/products/$id', {'branch_id': '$branchId'});
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  Future<List<dynamic>> warehouses(int branchId) async {
    final res = await get('/inventory/warehouses', {'branch_id': '$branchId'});
    return (res['data'] as List?) ?? [];
  }

  Future<List<dynamic>> customers({String search = ''}) async {
    final res =
        await get('/customers', {if (search.isNotEmpty) 'search': search});
    return (res['data'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> createCustomer(Map<String, dynamic> body) =>
      post('/customers', body);

  Future<Map<String, dynamic>> updateCustomer(
          int id, Map<String, dynamic> body) =>
      put('/customers/$id', body);

  Future<Map<String, dynamic>> deleteCustomer(int id) =>
      delete('/customers/$id');

  // ===== Transaksi =====
  Future<Map<String, dynamic>> previewTransaction(
      Map<String, dynamic> body) async {
    final res = await post('/transactions/preview', body);
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  Future<Map<String, dynamic>> createTransaction(
      Map<String, dynamic> body) async {
    final res = await post('/transactions', body);
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  Future<Map<String, dynamic>> cancelTransaction(
    int id,
    List<Map<String, dynamic>> items,
    String reason,
  ) =>
      put('/transactions/$id/cancel', {'items': items, 'reason': reason});

  Future<(List<dynamic>, int)> transactionsPage({
    int page = 1,
    int limit = 50,
    String? dateFrom,
    String? dateTo,
    String? status,
    String? search,
  }) async {
    final res = await get('/transactions', {
      'page': '$page',
      'limit': '$limit',
      if (dateFrom != null) 'date_from': dateFrom,
      if (dateTo != null) 'date_to': dateTo,
      if (status != null && status.isNotEmpty) 'status': status,
      if (search != null && search.isNotEmpty) 'search': search,
    });
    final totalPages = int.tryParse('${res['totalPages']}') ?? 1;
    return ((res['data'] as List?) ?? [], totalPages);
  }

  Future<Map<String, dynamic>> transactionDetail(int id) async {
    final res = await get('/transactions/$id');
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  Future<Map<String, dynamic>> receipt(int id) async {
    final res = await get('/printer/invoice/$id');
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  // ===== Retur =====
  Future<List<dynamic>> returnsList() async {
    final res = await get('/returns');
    return (res['data'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> createReturn(Map<String, dynamic> body) =>
      post('/returns', body);

  Future<Map<String, dynamic>> approveReturn(int id, int warehouseId) =>
      put('/returns/$id/approve', {'warehouse_id': warehouseId});

  // ===== Laci kas =====
  Future<Map<String, dynamic>> cashDrawerOpen(double openingAmount) =>
      post('/cash-drawer/open', {'opening_amount': openingAmount});

  Future<Map<String, dynamic>> cashDrawerInOut(
          String type, double amount, String reason) =>
      post('/cash-drawer/$type', {'amount': amount, 'reason': reason});

  Future<Map<String, dynamic>> cashDrawerSummary() =>
      get('/cash-drawer/summary');

  Future<Map<String, dynamic>> cashDrawerClose(
          double actualCash, String notes) =>
      put('/cash-drawer/close', {'actual_cash': actualCash, 'notes': notes});

  // ===== Dashboard =====
  Future<Map<String, dynamic>> dashboard() async {
    final res = await get('/dashboard');
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  // ===== Pegawai & pengaturan =====
  Future<List<dynamic>> users({int? branchId}) async {
    final res =
        await get('/users', {if (branchId != null) 'branch_id': '$branchId'});
    return (res['data'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> createUser(Map<String, dynamic> body) =>
      post('/users', body);

  Future<Map<String, dynamic>> updateUser(int id, Map<String, dynamic> body) =>
      put('/users/$id', body);

  Future<Map<String, dynamic>> resetPassword(int id, String newPassword) =>
      put('/users/$id/password', {'new_password': newPassword});

  Future<Map<String, dynamic>> setPin(int id, String pin) =>
      put('/users/$id/pin', {'pin': pin});

  Future<Map<String, dynamic>> toggleUser(int id) =>
      put('/users/$id/toggle-active', {});

  Future<List<dynamic>> branches() async {
    final res = await get('/settings/branches');
    return (res['data'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> createBranch(Map<String, dynamic> body) =>
      post('/settings/branches', body);

  Future<Map<String, dynamic>> deleteBranch(int id) =>
      delete('/settings/branches/$id');

  Future<Map<String, dynamic>> storeSettings() async {
    final res = await get('/settings');
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  Future<Map<String, dynamic>> updateStoreSettings(Map<String, dynamic> body) =>
      put('/settings', body);

  /// Rekap stok masuk/keluar per batch (backend: GET /inventory/mutation-report).
  Future<Map<String, dynamic>> mutationReport({
    required String type,
    String? start,
    String? end,
  }) =>
      get('/inventory/mutation-report', {
        'type': type,
        if (start != null) 'start': start,
        if (end != null) 'end': end,
      });

  Future<Map<String, dynamic>> updateProfile(
          {required String name, required String email, String? username}) =>
      put('/users/profile', {
        'name': name,
        'email': email,
        if (username != null && username.isNotEmpty) 'username': username,
      });

  Future<Map<String, dynamic>> changePassword(
          {required String current, required String next}) =>
      put('/users/profile/password',
          {'current_password': current, 'new_password': next});

  /// Upload logo via data-url (key: store_logo = logo aplikasi, invoice_logo = logo kepala invoice).
  Future<Map<String, dynamic>> uploadLogo(String mime, String base64,
          {String key = 'store_logo'}) =>
      post('/settings/logo-data', {
        'content_type': mime,
        'filename': 'logo',
        'data_url': 'data:$mime;base64,$base64',
        'key': key,
      });

  // ===== Komisi =====
  Future<Map<String, dynamic>> commissions() async {
    final res = await get('/commissions');
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  Future<Map<String, dynamic>> createCommissionRule(
          Map<String, dynamic> body) =>
      post('/commissions/rules', body);

  Future<Map<String, dynamic>> deleteCommissionRule(int id) =>
      delete('/commissions/rules/$id');

  Future<Map<String, dynamic>> generateCommissions(Map<String, dynamic> body) =>
      post('/commissions/generate', body);

  Future<Map<String, dynamic>> commissionMine({
    required String start,
    required String end,
  }) async {
    final res = await get('/commissions/mine', {'start': start, 'end': end});
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  Future<Map<String, dynamic>> commissionReport({
    required String start,
    required String end,
  }) async {
    final res = await get('/commissions/report', {'start': start, 'end': end});
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  // ===== Promo =====
  Future<List<dynamic>> promotions() async {
    final res = await get('/promotions');
    return (res['data'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> createPromotion(Map<String, dynamic> body) =>
      post('/promotions', body);

  Future<Map<String, dynamic>> togglePromotion(int id) =>
      put('/promotions/$id/toggle-active', {});

  // ===== Keuangan =====
  Future<List<dynamic>> expenseCategories() async {
    final res = await get('/finance/expense-categories');
    return (res['data'] as List?) ?? [];
  }

  Future<List<dynamic>> expenses({String type = 'expense'}) async {
    final res = await get('/finance/expenses', {'type': type});
    return (res['data'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> createExpense(Map<String, dynamic> body) =>
      post('/finance/expenses', body);

  Future<Map<String, dynamic>> approveExpense(int id) =>
      put('/finance/expenses/$id/approve', {});

  Future<Map<String, dynamic>> profitLoss({
    required String start,
    required String end,
  }) async {
    final res = await get('/finance/profit-loss', {'start': start, 'end': end});
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  // ===== Inventory =====
  Future<Map<String, dynamic>> stockTotal({
    required int branchId,
    String search = '',
    bool allBranches = false,
  }) async {
    final res = await get('/inventory/stock-total', {
      'branch_id': allBranches ? 'all' : '$branchId',
      if (search.isNotEmpty) 'search': search,
    });
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  Future<List<dynamic>> incomingProducts({
    required int branchId,
    int? warehouseId,
  }) async {
    final res = await get('/inventory/incoming/products', {
      'branch_id': '$branchId',
      if (warehouseId != null) 'warehouse_id': '$warehouseId',
    });
    return (res['data'] as List?) ?? [];
  }

  Future<List<dynamic>> channels() async {
    final res = await get('/inventory/channels');
    return (res['data'] as List?) ?? [];
  }

  Future<List<dynamic>> mutations({
    int page = 1,
    int limit = 50,
    String? type,
    String? dateFrom,
    String? dateTo,
  }) async {
    final res = await get('/inventory/mutations', {
      'page': '$page',
      'limit': '$limit',
      if (type != null && type.isNotEmpty) 'type': type,
      if (dateFrom != null) 'date_from': dateFrom,
      if (dateTo != null) 'date_to': dateTo,
    });
    return (res['data'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> createIncoming(Map<String, dynamic> body) =>
      post('/inventory/incoming', body);

  Future<Map<String, dynamic>> createOutgoing(Map<String, dynamic> body) =>
      post('/inventory/outgoing', body);

  Future<Map<String, dynamic>> createTransfer(Map<String, dynamic> body) =>
      post('/inventory-control/transfers', body);

  Future<List<dynamic>> storeTargets() async {
    final res = await get('/inventory-control/store-targets');
    return (res['data'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> createInterStoreTransfer(
          Map<String, dynamic> body) =>
      post('/inventory-control/transfers/inter-store', body);

  Future<Map<String, dynamic>> createOpname(Map<String, dynamic> body) =>
      post('/inventory-control/opnames', body);

  Future<List<dynamic>> barcodeItems({String search = ''}) async {
    final res = await get(
        '/inventory/barcode-items', {if (search.isNotEmpty) 'search': search});
    return (res['data'] as List?) ?? [];
  }

  // ===== Laporan & Pajak =====
  Future<Map<String, dynamic>> reportSales({
    required String start,
    required String end,
  }) async {
    final res = await get('/reports/sales', {'start': start, 'end': end});
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  Future<Map<String, dynamic>> reportOverview({
    required String start,
    required String end,
  }) async {
    final res = await get('/reports/overview', {'start': start, 'end': end});
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  Future<Map<String, dynamic>> reportDailyClosing(
      {required String date}) async {
    final res = await get('/reports/daily-closing', {'date': date});
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }

  Future<Map<String, dynamic>> taxReport({
    required String start,
    required String end,
  }) async {
    final res = await get('/tax/report', {'start': start, 'end': end});
    return (res['data'] as Map<String, dynamic>?) ?? {};
  }
}
