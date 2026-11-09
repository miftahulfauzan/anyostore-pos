import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/prefetch_service.dart';

class _PrefetchApi extends ApiClient {
  int active = 0;
  int peak = 0;
  final requested = <int>[];

  @override
  Future<List<dynamic>> products(
          {required int branchId, String search = ''}) async =>
      List.generate(20, (i) => {'id': i + 1, 'variant_count': 1});

  @override
  Future<Map<String, dynamic>> product(int id, {required int branchId}) async {
    requested.add(id);
    active++;
    if (active > peak) peak = active;
    await Future<void>.delayed(const Duration(milliseconds: 5));
    active--;
    throw ApiException('offline');
  }
}

void main() {
  test('prefetch limits concurrent product requests and continues after errors',
      () async {
    final api = _PrefetchApi();
    await PrefetchService.prefetchProductVariants(api, branchId: 12);
    expect(api.requested, hasLength(20));
    expect(api.peak, 3);
  });
}
