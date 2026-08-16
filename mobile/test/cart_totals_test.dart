import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/pos_page.dart';

void main() {
  CartItem item(String name, {int qty = 1, double price = 95000}) =>
      CartItem(productId: 1, name: name, price: price, qty: qty);

  group('cartSubtotal & cartTotalPcs', () {
    test('TEST 1: 1 produk x 4 x Rp95.000 -> 4 pcs, Rp380.000', () {
      final cart = [item('A104', qty: 4)];
      expect(cartTotalPcs(cart), 4);
      expect(cartSubtotal(cart), 380000);
    });

    test('TEST 2: 2 produk x 4 x Rp95.000 -> 8 pcs, Rp760.000', () {
      final cart = [
        item('A104', qty: 4),
        item('A105', qty: 4),
      ];
      expect(cartTotalPcs(cart), 8);
      expect(cartSubtotal(cart), 760000);
    });

    test('TEST 3: 3 produk x 4 x Rp95.000 -> 12 pcs, Rp1.140.000', () {
      final cart = [
        item('A104', qty: 4),
        item('A105', qty: 4),
        item('AB07', qty: 4),
      ];
      expect(cartTotalPcs(cart), 12);
      expect(cartSubtotal(cart), 1140000);
    });

    test('TEST 4: ubah A104 qty 4 -> 5 -> 13 pcs, Rp1.235.000', () {
      final cart = [
        item('A104', qty: 4),
        item('A105', qty: 4),
        item('AB07', qty: 4),
      ];
      cart[0].qty = 5;
      expect(cartTotalPcs(cart), 13);
      expect(cartSubtotal(cart), 1235000);
    });

    test('TEST 5: hapus A104 -> 8 pcs, Rp760.000', () {
      final cart = [
        item('A104', qty: 4),
        item('A105', qty: 4),
        item('AB07', qty: 4),
      ];
      cart.removeAt(0);
      expect(cartTotalPcs(cart), 8);
      expect(cartSubtotal(cart), 760000);
    });

    test('priceOverride ikut dihitung (ubah harga -> subtotal dinamis)', () {
      final cart = [item('A104', qty: 4)..priceOverride = 90000];
      expect(cartSubtotal(cart), 360000);
    });
  });
}
