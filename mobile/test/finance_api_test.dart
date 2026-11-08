import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:pos_pakaian_mobile/src/api_client.dart';

class _FinanceRequestClient extends http.BaseClient {
  Uri? lastUri;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    lastUri = request.url;
    return http.StreamedResponse(
      Stream<List<int>>.value(utf8.encode(
          '{"success":true,"data":[],"page":2,"limit":20,"total":0,"totalPages":1}')),
      200,
      request: request,
    );
  }
}

void main() {
  test('expensesPage sends the shared finance filter contract', () async {
    final transport = _FinanceRequestClient();
    final api = ApiClient(
      baseUrl: 'https://example.test/api',
      httpClient: transport,
    );

    final result = await api.expensesPage(
      type: 'income',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-09',
      categoryId: 7,
      paymentMethod: 'transfer',
      search: 'sewa',
      page: 2,
      limit: 20,
    );

    expect(result['page'], 2);
    expect(transport.lastUri!.queryParameters, {
      'type': 'income',
      'date_from': '2026-11-01',
      'date_to': '2026-11-09',
      'category_id': '7',
      'payment_method': 'transfer',
      'search': 'sewa',
      'page': '2',
      'limit': '20',
    });
  });

  test('transactionsPage sends an explicit all-branch owner scope', () async {
    final transport = _FinanceRequestClient();
    final api = ApiClient(
      baseUrl: 'https://example.test/api',
      httpClient: transport,
    );

    await api.transactionsPage(
      page: 1,
      limit: 20,
      allBranches: true,
      dateFrom: '2026-11-01',
      dateTo: '2026-11-09',
    );

    expect(transport.lastUri!.path, '/api/transactions');
    expect(transport.lastUri!.queryParameters['branch_id'], 'all');
    expect(transport.lastUri!.queryParameters['limit'], '20');
  });
}
