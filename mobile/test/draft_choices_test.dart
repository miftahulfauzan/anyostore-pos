import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/pos_page.dart';

void main() {
  test('draft server yang sama dengan snapshot lokal tidak diduplikasi', () {
    final local = <String, dynamic>{
      'client_hold_id': 'hold-1',
      'items': [
        {'product_id': 10, 'name': 'A104', 'price': 145000, 'qty': 2},
      ],
    };
    final choices = draftChoices(
      localDraft: local,
      pending: [
        {'id': 7, 'client_hold_id': 'hold-1', 'items': []},
        {'id': 8, 'client_hold_id': 'hold-2', 'items': []},
      ],
    );

    expect(choices, hasLength(2));
    expect(choices.first['source'], 'local');
    expect(choices.last['source'], 'server');
    expect((choices.last['pending'] as Map)['id'], 8);
  });

  test('tanpa snapshot lokal semua draft server tetap tampil', () {
    final choices = draftChoices(
      pending: [
        {'id': 7, 'client_hold_id': 'hold-1'},
        {'id': 8, 'client_hold_id': 'hold-2'},
      ],
    );
    expect(choices, hasLength(2));
    expect(choices.every((row) => row['source'] == 'server'), isTrue);
  });

  test('draft lokal tanpa client_hold_id tidak menyembunyikan draft server',
      () {
    final choices = draftChoices(
      localDraft: <String, dynamic>{
        'items': [
          {'product_id': 10, 'name': 'A104', 'price': 145000, 'qty': 2},
        ],
      },
      pending: [
        {'id': 8, 'client_hold_id': 'hold-2'},
      ],
    );
    expect(choices, hasLength(2));
  });
}
