import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:pos_pakaian_mobile/src/api_client.dart';

class _CaptureClient extends http.BaseClient {
  Uri? requestUri;
  String? requestMethod;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requestUri = request.url;
    requestMethod = request.method;
    return http.StreamedResponse(
      Stream<List<int>>.value(utf8.encode('{"success":true}')),
      200,
      request: request,
    );
  }
}

void main() {
  test('deleteInvoiceLogo mengirim key dan cabang sebagai query', () async {
    final transport = _CaptureClient();
    final api = ApiClient(
      baseUrl: 'https://example.test/api',
      httpClient: transport,
    )..activeBranchId = 4;

    await api.deleteInvoiceLogo();

    expect(transport.requestMethod, 'DELETE');
    expect(transport.requestUri?.path, '/api/settings/logo');
    expect(transport.requestUri?.queryParameters['key'], 'invoice_logo');
    expect(transport.requestUri?.queryParameters['branch_id'], '4');
  });
}
