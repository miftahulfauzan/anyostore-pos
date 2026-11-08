import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:pos_pakaian_mobile/src/api_client.dart';

class _QueueClient extends http.BaseClient {
  _QueueClient(this.responses);

  final List<http.Response> responses;
  int calls = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final response = responses[calls++];
    return http.StreamedResponse(
      Stream<List<int>>.value(utf8.encode(response.body)),
      response.statusCode,
      headers: response.headers,
      request: request,
    );
  }
}

class _CaptureClient extends http.BaseClient {
  Uri? requestUri;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requestUri = request.url;
    return http.StreamedResponse(
      Stream<List<int>>.value(utf8.encode('{"success":true,"data":{}}')),
      200,
      request: request,
    );
  }
}

void main() {
  test('createOpname menerima respons sukses tanpa body', () async {
    final transport = _QueueClient([http.Response('', 201)]);
    final api = ApiClient(
      baseUrl: 'https://example.test/api',
      httpClient: transport,
    );

    final response = await api.createOpname({
      'warehouse_id': 1,
      'items': [
        {
          'product_id': 10,
          'physical_stock': 5,
          'expected_stock': 4,
          'expected_revision': '7',
        },
      ],
    });

    expect(response, isEmpty);
    expect(transport.calls, 1);
  });

  test('resume draft mengirim cabang terpilih di query', () async {
    final transport = _CaptureClient();
    final api = ApiClient(
      baseUrl: 'https://example.test/api',
      httpClient: transport,
    );

    await api.resumeTransaction(17, branchId: 4);

    expect(transport.requestUri?.queryParameters['branch_id'], '4');
  });

  test('resume draft mengembalikan item dari payload data API', () async {
    final transport = _QueueClient([
      http.Response(
        '{"success":true,"data":{"items":[{"product_id":10,"quantity":4}]}}',
        200,
      ),
    ]);
    final api = ApiClient(
      baseUrl: 'https://example.test/api',
      httpClient: transport,
    );

    final resumed = await api.resumeTransaction(17, branchId: 4);

    expect(resumed['items'], hasLength(1));
    expect(resumed['items'].single['product_id'], 10);
  });
}
