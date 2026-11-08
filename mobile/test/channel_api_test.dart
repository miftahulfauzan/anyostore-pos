import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:pos_pakaian_mobile/src/api_client.dart';

class _ChannelRequestClient extends http.BaseClient {
  String? lastBody;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    if (request is http.Request) lastBody = request.body;
    return http.StreamedResponse(
      Stream<List<int>>.value(utf8.encode('{"success":true}')),
      201,
      request: request,
    );
  }
}

void main() {
  test('createChannel sends the backend value and display name', () async {
    final transport = _ChannelRequestClient();
    final api = ApiClient(
      baseUrl: 'https://example.test/api',
      httpClient: transport,
    );

    await api.createChannel('Penjualan Offline');

    expect(jsonDecode(transport.lastBody!), {
      'value': 'penjualan_offline',
      'name': 'Penjualan Offline',
    });
  });
}
