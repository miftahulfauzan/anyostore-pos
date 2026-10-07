import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/auth_store.dart';

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

void main() {
  test('401 yang tidak bisa di-refresh memberi sinyal sesi berakhir', () async {
    final transport = _QueueClient([
      http.Response('{"message":"token expired"}', 401),
    ]);
    final api =
        ApiClient(baseUrl: 'https://example.test/api', httpClient: transport);
    var refreshCalls = 0;
    var expiredCalls = 0;
    api.refreshHandler = () async {
      refreshCalls++;
      return false;
    };
    api.sessionExpiredHandler = () async => expiredCalls++;

    await expectLater(
      api.get('/protected'),
      throwsA(isA<ApiException>()
          .having((error) => error.statusCode, 'statusCode', 401)),
    );
    expect(refreshCalls, 1);
    expect(expiredCalls, 1);
    expect(transport.calls, 1);
  });

  test('refresh yang menghasilkan 401 tidak memanggil refresh secara rekursif',
      () async {
    final transport = _QueueClient([
      http.Response('{"message":"access expired"}', 401),
      http.Response('{"message":"refresh expired"}', 401),
    ]);
    final api =
        ApiClient(baseUrl: 'https://example.test/api', httpClient: transport);
    var refreshCalls = 0;
    var expiredCalls = 0;
    api.refreshHandler = () async {
      refreshCalls++;
      try {
        await api.postNoRefresh('/auth/mobile-refresh', {});
        return true;
      } on ApiException {
        return false;
      }
    };
    api.sessionExpiredHandler = () async => expiredCalls++;

    await expectLater(api.get('/protected'), throwsA(isA<ApiException>()));
    expect(refreshCalls, 1);
    expect(expiredCalls, 1);
    expect(transport.calls, 2);
  });

  test('AuthStore memasang handler logout otomatis pada ApiClient', () {
    final api = ApiClient(baseUrl: 'https://example.test/api');
    AuthStore(api);
    expect(api.sessionExpiredHandler, isNotNull);
  });
}
