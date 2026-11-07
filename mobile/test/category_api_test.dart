import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:pos_pakaian_mobile/src/api_client.dart';

class _RequestClient extends http.BaseClient {
  http.BaseRequest? lastRequest;
  String? lastBody;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    lastRequest = request;
    if (request is http.Request) lastBody = request.body;
    return http.StreamedResponse(
      Stream<List<int>>.value(utf8.encode('{"success":true}')),
      200,
      request: request,
    );
  }
}

void main() {
  test('category writes send color and reorder uses PATCH', () async {
    final transport = _RequestClient();
    final api = ApiClient(
      baseUrl: 'https://example.test/api',
      httpClient: transport,
    );

    await api.updateCategory(7, 'Kemeja', color: '#7C3AED');
    expect(transport.lastRequest?.method, 'PUT');
    expect(jsonDecode(transport.lastBody!), {
      'name': 'Kemeja',
      'color': '#7C3AED',
    });

    await api.reorderCategories([7, 3]);
    expect(transport.lastRequest?.method, 'PATCH');
    expect(jsonDecode(transport.lastBody!), {
      'order': [7, 3],
    });
  });
}
