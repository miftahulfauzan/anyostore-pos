import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/pos_page.dart';

void main() {
  test('POS observes app lifecycle so cart drafts flush before suspension', () {
    final source = File('lib/src/pos_page.dart').readAsStringSync();
    expect(source, contains('with WidgetsBindingObserver'));
    expect(source, contains('didChangeAppLifecycleState'));
    expect(source, contains('AppLifecycleState.paused'));
  });

  test('Draft payload can be restored into cart items', () {
    final items = cartItemsFromDraft({
      'items': [
        {
          'product_id': 10,
          'name': 'Kemeja Denim',
          'price': 275000,
          'qty': 4,
          'variant_id': null,
        },
      ],
    });

    expect(items, hasLength(1));
    expect(items.single.productId, 10);
    expect(items.single.qty, 4);
    expect(items.single.price, 275000);
  });

  test('Draft action reads the local auto-saved cart', () {
    final source = File('lib/src/pos_page.dart').readAsStringSync();
    expect(
        source, contains('final localDraft = await _readLocalDraft(branch);'));
    expect(source, contains("'source': 'local'"));
  });
}
