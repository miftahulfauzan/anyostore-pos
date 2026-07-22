# 21. Setup Flutter Mobile App

## 21.1 Prerequisites

| Tool | Version | Keterangan |
|------|---------|------------|
| Flutter SDK | 3.22+ | `flutter --version` |
| Dart SDK | 3.4+ | Included with Flutter |
| Android Studio | latest | Untuk Android emulator |
| Xcode | 15+ | Untuk iOS simulator (macOS only) |
| VS Code | latest | dengan Flutter extension |

## 21.2 Instalasi Flutter

```bash
# macOS
brew install flutter

# Atau download manual
https://docs.flutter.dev/get-started/install

# Verify installation
flutter doctor

# Setup Android
flutter doctor --android-licenses

# Setup iOS (macOS only)
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
```

## 21.3 Buat Project Baru

```bash
# Buat project
flutter create --org com.tokopakaian pos_pakaian_mobile

# Masuk ke project
cd pos_pakaian_mobile

# Jalankan untuk test
flutter run
```

## 21.4 Struktur Folder

```
pos_pakaian_mobile/
├── lib/
│   ├── main.dart
│   ├── app.dart
│   ├── config/
│   │   ├── api.dart
│   │   ├── theme.dart
│   │   └── constants.dart
│   ├── models/
│   │   ├── product.dart
│   │   ├── transaction.dart
│   │   ├── user.dart
│   │   ├── cart_item.dart
│   │   └── customer.dart
│   ├── services/
│   │   ├── api_service.dart
│   │   ├── auth_service.dart
│   │   ├── bluetooth_service.dart
│   │   ├── database_service.dart
│   │   └── sync_service.dart
│   ├── providers/
│   │   ├── auth_provider.dart
│   │   ├── cart_provider.dart
│   │   ├── product_provider.dart
│   │   └── settings_provider.dart
│   ├── screens/
│   │   ├── splash_screen.dart
│   │   ├── login_screen.dart
│   │   ├── pin_screen.dart
│   │   ├── home_screen.dart
│   │   ├── pos/
│   │   │   ├── pos_screen.dart
│   │   │   ├── payment_screen.dart
│   │   │   └── success_screen.dart
│   │   ├── products/
│   │   │   ├── product_list_screen.dart
│   │   │   └── product_detail_screen.dart
│   │   ├── warehouse/
│   │   │   ├── stock_opname_screen.dart
│   │   │   └── transfer_screen.dart
│   │   ├── expenses/
│   │   │   ├── expense_list_screen.dart
│   │   │   └── expense_form_screen.dart
│   │   └── profile/
│   │       └── profile_screen.dart
│   ├── widgets/
│   │   ├── product_card.dart
│   │   ├── cart_item_tile.dart
│   │   ├── barcode_scanner.dart
│   │   ├── payment_method_card.dart
│   │   └── custom_button.dart
│   └── utils/
│       ├── formatters.dart
│       ├── validators.dart
│       └── helpers.dart
├── android/
├── ios/
├── assets/
│   ├── images/
│   └── fonts/
├── pubspec.yaml
└── README.md
```

## 21.5 Dependencies (pubspec.yaml)

```yaml
name: pos_pakaian_mobile
description: Aplikasi POS Pakaian Mobile
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.4.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  
  # State Management
  provider: ^6.1.1
  
  # HTTP & API
  http: ^1.2.0
  dio: ^5.4.0
  
  # Local Storage
  shared_preferences: ^2.2.2
  sqflite: ^2.3.0
  path: ^1.8.3
  
  # UI
  cupertino_icons: ^1.0.6
  google_fonts: ^6.1.0
  flutter_svg: ^2.0.9
  badge: ^3.0.3
  
  # Barcode Scanner
  mobile_scanner: ^3.5.5
  
  # Bluetooth Printer
  flutter_bluetooth_printer: ^1.0.0
  esc_pos_utils: ^1.1.0
  esc_pos_bluetooth: ^0.4.0
  
  # Permissions
  permission_handler: ^11.1.0
  
  # Image
  image_picker: ^1.0.7
  image: ^4.1.3
  
  # Connectivity
  connectivity_plus: ^5.0.2
  
  # QR Code
  qr_flutter: ^4.1.0
  
  # PDF
  printing: ^5.12.0
  pdf: ^3.10.7
  
  # Date & Time
  intl: ^0.19.0
  
  # UUID
  uuid: ^4.2.1

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.1
  build_runner: ^2.4.7

flutter:
  uses-material-design: true
  
  assets:
    - assets/images/
  
  fonts:
    - family: PlusJakartaSans
      fonts:
        - asset: assets/fonts/PlusJakartaSans-Regular.ttf
        - asset: assets/fonts/PlusJakartaSans-Medium.ttf
          weight: 500
        - asset: assets/fonts/PlusJakartaSans-SemiBold.ttf
          weight: 600
        - asset: assets/fonts/PlusJakartaSans-Bold.ttf
          weight: 700
```

## 21.6 Config API

```dart
// lib/config/api.dart
class ApiConfig {
  static const String baseUrl = 'http://localhost:3001/api';
  static const Duration timeout = Duration(seconds: 30);
  
  static const Map<String, String> headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}
```

## 21.7 Main Entry

```dart
// lib/main.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'app.dart';
import 'providers/auth_provider.dart';
import 'providers/cart_provider.dart';
import 'providers/product_provider.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => CartProvider()),
        ChangeNotifierProvider(create: (_) => ProductProvider()),
      ],
      child: const PosPakaianApp(),
    ),
  );
}
```

## 21.8 App Root

```dart
// lib/app.dart
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/splash_screen.dart';

class PosPakaianApp extends StatelessWidget {
  const PosPakaianApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'POS Pakaian',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF2563EB),
          brightness: Brightness.light,
        ),
        textTheme: GoogleFonts.plusJakartaSansTextTheme(),
        appBarTheme: const AppBarTheme(
          centerTitle: false,
          elevation: 0,
        ),
      ),
      home: const SplashScreen(),
    );
  }
}
```

## 21.9 API Service

```dart
// lib/services/api_service.dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api.dart';

class ApiService {
  String? _token;
  
  void setToken(String token) {
    _token = token;
  }
  
  Map<String, String> get _headers => {
    ...ApiConfig.headers,
    if (_token != null) 'Authorization': 'Bearer $_token',
  };
  
  Future<dynamic> get(String endpoint, {Map<String, String>? queryParams}) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$endpoint')
        .replace(queryParameters: queryParams);
    
    final response = await http.get(uri, headers: _headers)
        .timeout(ApiConfig.timeout);
    
    return _handleResponse(response);
  }
  
  Future<dynamic> post(String endpoint, {dynamic body}) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$endpoint');
    
    final response = await http.post(
      uri,
      headers: _headers,
      body: jsonEncode(body),
    ).timeout(ApiConfig.timeout);
    
    return _handleResponse(response);
  }
  
  Future<dynamic> put(String endpoint, {dynamic body}) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$endpoint');
    
    final response = await http.put(
      uri,
      headers: _headers,
      body: body != null ? jsonEncode(body) : null,
    ).timeout(ApiConfig.timeout);
    
    return _handleResponse(response);
  }
  
  dynamic _handleResponse(http.Response response) {
    final body = jsonDecode(response.body);
    
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    } else {
      throw Exception(body['message'] ?? 'Terjadi kesalahan');
    }
  }
}
```

## 21.10 Auth Provider

```dart
// lib/providers/auth_provider.dart
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  
  Map<String, dynamic>? _user;
  String? _token;
  bool _isLoading = false;
  
  Map<String, dynamic>? get user => _user;
  String? get token => _token;
  bool get isLoading => _isLoading;
  bool get isAuthenticated => _token != null;
  
  Future<void> login(String email, String password) async {
    _isLoading = true;
    notifyListeners();
    
    try {
      final response = await _api.post('/auth/login', body: {
        'email': email,
        'password': password,
      });
      
      _token = response['token'];
      _user = response['user'];
      
      _api.setToken(_token!);
      
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('token', _token!);
      
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      notifyListeners();
      rethrow;
    }
  }
  
  Future<bool> loginWithPin(String pin) async {
    _isLoading = true;
    notifyListeners();
    
    try {
      final response = await _api.post('/auth/login-pin', body: {
        'pin': pin,
      });
      
      _token = response['token'];
      _user = response['user'];
      
      _api.setToken(_token!);
      
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('token', _token!);
      
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }
  
  Future<void> logout() async {
    _token = null;
    _user = null;
    
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    
    notifyListeners();
  }
}
```

## 21.11 Cart Provider

```dart
// lib/providers/cart_provider.dart
import 'package:flutter/material.dart';
import '../models/cart_item.dart';

class CartProvider extends ChangeNotifier {
  final List<CartItem> _items = [];
  
  List<CartItem> get items => _items;
  
  int get itemCount => _items.length;
  
  double get subtotal => _items.fold(0, (sum, item) => sum + item.subtotal);
  
  double get discount => _items.fold(0, (sum, item) => sum + item.discount);
  
  double get total => subtotal - discount;
  
  double get grandTotal => total; // tambah pajak/logik lain di sini jika perlu
  
  Map<String, dynamic>? _customer;
  Map<String, dynamic>? get customer => _customer;
  int? get customerId => _customer?['id'];
  
  void addItem(CartItem item) {
    final existingIndex = _items.indexWhere(
      (i) => i.productId == item.productId && i.variantId == item.variantId,
    );
    
    if (existingIndex >= 0) {
      _items[existingIndex].quantity += 1;
    } else {
      _items.add(item);
    }
    
    notifyListeners();
  }
  
  void updateQuantity(int index, int quantity) {
    if (quantity <= 0) {
      _items.removeAt(index);
    } else {
      _items[index].quantity = quantity;
    }
    notifyListeners();
  }
  
  void removeItem(int index) {
    _items.removeAt(index);
    notifyListeners();
  }
  
  void clearCart() {
    _items.clear();
    notifyListeners();
  }
  
  void setCustomer(Map<String, dynamic>? customer) {
    _customer = customer;
    notifyListeners();
  }
}
```

## 21.12 Cart Item Model

```dart
// lib/models/cart_item.dart
class CartItem {
  final int productId;
  final int? variantId;
  final String productName;
  final String productSku;
  final String? variantDetail;
  final double price;
  int quantity;
  double discount;
  
  CartItem({
    required this.productId,
    this.variantId,
    required this.productName,
    required this.productSku,
    this.variantDetail,
    required this.price,
    this.quantity = 1,
    this.discount = 0,
  });
  
  double get subtotal => (price * quantity) - discount;
  
  Map<String, dynamic> toJson() => {
    'product_id': productId,
    'variant_id': variantId,
    'product_name': productName,
    'product_sku': productSku,
    'variant_detail': variantDetail,
    'quantity': quantity,
    'unit_price': price,
    'discount': discount,
  };
}
```

## 21.13 Login Screen

```dart
// lib/screens/login_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo
                const Icon(
                  Icons.checkroom,
                  size: 80,
                  color: Color(0xFF2563EB),
                ),
                const SizedBox(height: 16),
                Text(
                  'POS Pakaian',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 48),
                
                // Email Field
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: InputDecoration(
                    labelText: 'Email',
                    prefixIcon: const Icon(Icons.email_outlined),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                
                // Password Field
                TextField(
                  controller: _passwordController,
                  obscureText: _obscurePassword,
                  decoration: InputDecoration(
                    labelText: 'Password',
                    prefixIcon: const Icon(Icons.lock_outlined),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePassword ? Icons.visibility : Icons.visibility_off,
                      ),
                      onPressed: () {
                        setState(() => _obscurePassword = !_obscurePassword);
                      },
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                
                // Login Button
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: auth.isLoading ? null : _handleLogin,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2563EB),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: auth.isLoading
                        ? const CircularProgressIndicator(color: Colors.white)
                        : const Text(
                            'LOGIN',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                  ),
                ),
                const SizedBox(height: 16),
                
                // PIN Login
                TextButton(
                  onPressed: () {
                    Navigator.pushReplacement(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const PinScreen(),
                      ),
                    );
                  },
                  child: const Text('Login dengan PIN'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
  
  Future<void> _handleLogin() async {
    final auth = context.read<AuthProvider>();
    
    try {
      await auth.login(
        _emailController.text.trim(),
        _passwordController.text,
      );
      
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const HomeScreen()),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString()),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
```

## 21.14 POS Screen

```dart
// lib/screens/pos/pos_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/cart_provider.dart';
import '../../widgets/product_card.dart';
import '../../services/api_service.dart';

class PosScreen extends StatefulWidget {
  const PosScreen({super.key});

  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _searchController = TextEditingController();
  
  List<dynamic> _products = [];
  List<dynamic> _categories = [];
  bool _isLoading = false;
  String _selectedCategory = 'all';
  
  @override
  void initState() {
    super.initState();
    _loadProducts();
    _loadCategories();
  }
  
  Future<void> _loadProducts() async {
    setState(() => _isLoading = true);
    
    try {
      final response = await _api.get('/products', queryParams: {
        'search': _searchController.text,
        if (_selectedCategory != 'all') 'category': _selectedCategory,
      });
      
      setState(() {
        _products = response['data'];
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }
  
  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('POS'),
        actions: [
          IconButton(
            icon: const Icon(Icons.qr_code_scanner),
            onPressed: _scanBarcode,
          ),
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: () {},
          ),
        ],
      ),
      body: Row(
        children: [
          // Product Grid
          Expanded(
            flex: 3,
            child: Column(
              children: [
                // Search & Filter
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _searchController,
                          decoration: InputDecoration(
                            hintText: 'Cari produk...',
                            prefixIcon: const Icon(Icons.search),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          onChanged: (_) => _loadProducts(),
                        ),
                      ),
                      const SizedBox(width: 16),
                      DropdownButton<String>(
                        value: _selectedCategory,
                        items: [
                          const DropdownMenuItem(
                            value: 'all',
                            child: Text('Semua'),
                          ),
                          ..._categories.map((c) => DropdownMenuItem(
                            value: c['id'].toString(),
                            child: Text(c['name']),
                          )),
                        ],
                        onChanged: (value) {
                          setState(() => _selectedCategory = value!);
                          _loadProducts();
                        },
                      ),
                    ],
                  ),
                ),
                
                // Product Grid
                Expanded(
                  child: _isLoading
                      ? const Center(child: CircularProgressIndicator())
                      : GridView.builder(
                          padding: const EdgeInsets.all(16),
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 4,
                            childAspectRatio: 0.8,
                            crossAxisSpacing: 12,
                            mainAxisSpacing: 12,
                          ),
                          itemCount: _products.length,
                          itemBuilder: (context, index) {
                            final product = _products[index];
                            return ProductCard(
                              product: product,
                              onTap: () => _addToCart(product),
                            );
                          },
                        ),
                ),
              ],
            ),
          ),
          
          // Cart Panel
          Container(
            width: 350,
            decoration: BoxDecoration(
              color: Colors.grey[50],
              border: Border(
                left: BorderSide(color: Colors.grey[300]!),
              ),
            ),
            child: Column(
              children: [
                // Cart Header
                Container(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      const Icon(Icons.shopping_cart),
                      const SizedBox(width: 8),
                      Text(
                        'Keranjang (${cart.itemCount})',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                
                // Cart Items
                Expanded(
                  child: cart.items.isEmpty
                      ? const Center(
                          child: Text(
                            'Keranjang kosong',
                            style: TextStyle(color: Colors.grey),
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: cart.items.length,
                          itemBuilder: (context, index) {
                            final item = cart.items[index];
                            return CartItemTile(
                              item: item,
                              onUpdateQty: (qty) => cart.updateQuantity(index, qty),
                              onRemove: () => cart.removeItem(index),
                            );
                          },
                        ),
                ),
                
                // Cart Summary
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border(
                      top: BorderSide(color: Colors.grey[300]!),
                    ),
                  ),
                  child: Column(
                    children: [
                      _buildSummaryRow('Subtotal', cart.subtotal),
                      _buildSummaryRow('Diskon', -cart.discount),
                      const Divider(),
                      _buildSummaryRow('TOTAL', cart.total, isBold: true),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        height: 56,
                        child: ElevatedButton(
                          onPressed: cart.items.isEmpty ? null : () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const PaymentScreen(),
                              ),
                            );
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF16A34A),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text(
                            'BAYAR',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
  
  Widget _buildSummaryRow(String label, double value, {bool isBold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
              fontSize: isBold ? 18 : 14,
            ),
          ),
          Text(
            'Rp ${value.toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]}.')}',
            style: TextStyle(
              fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
              fontSize: isBold ? 18 : 14,
            ),
          ),
        ],
      ),
    );
  }
  
  void _addToCart(Map<String, dynamic> product) {
    final cart = context.read<CartProvider>();
    
    cart.addItem(CartItem(
      productId: product['id'],
      variantId: product['variant_id'],
      productName: product['name'],
      productSku: product['sku'],
      variantDetail: product['variant_detail'],
      price: double.parse(product['price'].toString()),
    ));
  }
  
  void _scanBarcode() {
    // Implement barcode scanner
  }
}
```

## 21.15 Bluetooth Printer Service

```dart
// lib/services/bluetooth_service.dart
import 'dart:typed_data';
import 'package:flutter_bluetooth_printer/flutter_bluetooth_printer.dart';
import 'package:esc_pos_utils/esc_pos_utils.dart';

class BluetoothPrinterService {
  final FlutterBluetoothPrinter _printer = FlutterBluetoothPrinter();
  
  Future<List<BluetoothDevice>> scanDevices() async {
    return await _printer.scan();
  }
  
  Future<void> connect(String address) async {
    await _printer.connect(address);
  }
  
  Future<void> disconnect() async {
    await _printer.disconnect();
  }
  
  Future<void> printReceipt(Map<String, dynamic> transaction) async {
    final profile = await CapabilityProfile.load();
    final generator = Generator(PaperSize.mm80, profile);
    
    final bytes = <int>[];
    
    // Header
    bytes += generator.reset();
    bytes += generator.setStyles(Styles(align: PosAlign.center, bold: true, height: PosTextSize.size2));
    bytes += generator.text(transaction['store_name']);
    bytes += generator.setStyles(Styles(align: PosAlign.center, bold: false, height: PosTextSize.size1));
    bytes += generator.text(transaction['store_address']);
    bytes += generator.text('Telp: ${transaction['store_phone']}');
    bytes += generator.hr();
    
    // Transaction Info
    bytes += generator.setStyles(Styles(align: PosAlign.left));
    bytes += generator.text('Invoice: ${transaction['invoice_no']}');
    bytes += generator.text('Kasir: ${transaction['cashier']}');
    bytes += generator.text('Tgl: ${transaction['datetime']}');
    bytes += generator.hr();
    
    // Items
    bytes += generator.setStyles(Styles(bold: true));
    bytes += generator.text('Item              Qty    Total');
    bytes += generator.setStyles(Styles(bold: false));
    bytes += generator.hr();
    
    for (final item in transaction['items']) {
      final name = (item['name'] ?? '').padRight(18).substring(0, 18);
      final qty = '${item['qty']}'.padLeft(4);
      final total = 'Rp${item['total']}'.padLeft(10);
      bytes += generator.text('$name $qty $total');
    }
    
    bytes += generator.hr();
    
    // Summary
    bytes += generator.setStyles(Styles(bold: true));
    bytes += generator.text('Subtotal: Rp${transaction['subtotal']}');
    if (transaction['discount'] > 0) {
      bytes += generator.text('Diskon:  -Rp${transaction['discount']}');
    }
    bytes += generator.text('TOTAL:    Rp${transaction['grand_total']}');
    bytes += generator.setStyles(Styles(bold: false));
    bytes += generator.hr();
    
    // Payment
    bytes += generator.text('${transaction['payment_method']}: Rp${transaction['paid']}');
    bytes += generator.text('Kembali:  Rp${transaction['change']}');
    bytes += generator.hr();
    
    // Footer
    bytes += generator.setStyles(Styles(align: PosAlign.center, bold: true));
    bytes += generator.text('TERIMA KASIH');
    bytes += generator.setStyles(Styles(bold: false));
    bytes += generator.text('Barang yang sudah dibeli');
    bytes += generator.text('tidak dapat ditukar/dikembalikan');
    bytes += generator.feed(2);
    bytes += generator.cut();
    
    // Print
    await _printer.writeBytes(Uint8List.fromList(bytes));
  }
}
```

## 21.16 Barcode Scanner Widget

```dart
// lib/widgets/barcode_scanner.dart
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

class BarcodeScanner extends StatefulWidget {
  final Function(String) onScanned;
  
  const BarcodeScanner({super.key, required this.onScanned});

  @override
  State<BarcodeScanner> createState() => _BarcodeScannerState();
}

class _BarcodeScannerState extends State<BarcodeScanner> {
  MobileScannerController? _controller;
  bool _isProcessing = false;
  
  @override
  void initState() {
    super.initState();
    _controller = MobileScannerController(
      detectionSpeed: DetectionSpeed.normal,
      facing: CameraFacing.back,
    );
  }
  
  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan Barcode'),
        actions: [
          IconButton(
            icon: const Icon(Icons.flash_on),
            onPressed: () => _controller?.toggleTorch(),
          ),
        ],
      ),
      body: MobileScanner(
        controller: _controller,
        onDetect: (capture) {
          if (_isProcessing) return;
          
          final barcode = capture.barcodes.first;
          if (barcode.rawValue != null) {
            _isProcessing = true;
            widget.onScanned(barcode.rawValue!);
            Navigator.pop(context);
          }
        },
      ),
    );
  }
}
```

## 21.17 Run Commands

```bash
# Install dependencies
flutter pub get

# Run on Android emulator
flutter run -d android

# Run on iOS simulator
flutter run -d ios

# Run on connected device
flutter run -d <device-id>

# Build APK
flutter build apk --release

# Build IPA (macOS only)
flutter build ios --release

# Run tests
flutter test
```

## 21.18 Build Release

```bash
# Android APK
flutter build apk --release --obfuscate --split-debug-info=build/debug-info

# Android App Bundle
flutter build appbundle --release

# iOS (macOS only)
flutter build ios --release --obfuscate --split-debug-info=build/debug-info

# Then archive in Xcode
open ios/Runner.xcworkspace
```

## 21.19 Theme Provider

```dart
// lib/providers/theme_provider.dart
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ThemeProvider extends ChangeNotifier {
  ThemeMode _themeMode = ThemeMode.light;
  
  ThemeMode get themeMode => _themeMode;
  
  ThemeProvider() {
    _loadTheme();
  }
  
  Future<void> _loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    final mode = prefs.getString('theme_mode') ?? 'light';
    _themeMode = mode == 'dark' ? ThemeMode.dark : ThemeMode.light;
    notifyListeners();
  }
  
  Future<void> setThemeMode(ThemeMode mode) async {
    _themeMode = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('theme_mode', mode == ThemeMode.dark ? 'dark' : 'light');
    notifyListeners();
  }
  
  void toggleTheme() {
    setThemeMode(_themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark);
  }
}
```

## 21.20 Product Provider

```dart
// lib/providers/product_provider.dart
import 'package:flutter/material.dart';
import '../models/product.dart';
import '../services/api_service.dart';

class ProductProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  
  List<Product> _products = [];
  List<Product> _filteredProducts = [];
  bool _isLoading = false;
  String _searchQuery = '';
  int _currentPage = 1;
  int _totalPages = 1;
  
  List<Product> get products => _filteredProducts;
  bool get isLoading => _isLoading;
  int get totalPages => _totalPages;
  
  Future<void> loadProducts({String? search, int? categoryId}) async {
    _isLoading = true;
    notifyListeners();
    
    try {
      final response = await _api.get('/products', query: {
        'search': search ?? '',
        'category': categoryId?.toString() ?? '',
        'page': _currentPage.toString(),
        'limit': '20',
      });
      
      _products = (response['data'] as List)
          .map((json) => Product.fromJson(json))
          .toList();
      _filteredProducts = _products;
      _totalPages = response['totalPages'] ?? 1;
    } catch (e) {
      debugPrint('Error loading products: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
  
  void search(String query) {
    _searchQuery = query.toLowerCase();
    _filteredProducts = _products.where((p) =>
      p.name.toLowerCase().contains(_searchQuery) ||
      (p.sku?.toLowerCase().contains(_searchQuery) ?? false) ||
      (p.barcode?.contains(_searchQuery) ?? false)
    ).toList();
    notifyListeners();
  }
  
  Product? findByBarcode(String barcode) {
    try {
      return _products.firstWhere((p) => p.barcode == barcode);
    } catch (_) {
      return null;
    }
  }
}
```

## 21.21 Splash Screen

```dart
// lib/screens/splash_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});
  
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _checkAuth();
  }
  
  Future<void> _checkAuth() async {
    await Future.delayed(const Duration(seconds: 2));
    
    if (!mounted) return;
    
    final auth = context.read<AuthProvider>();
    
    if (auth.isAuthenticated) {
      Navigator.pushReplacementNamed(context, '/home');
    } else {
      Navigator.pushReplacementNamed(context, '/login');
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.storefront,
              size: 80,
              color: Theme.of(context).primaryColor,
            ),
            const SizedBox(height: 16),
            Text(
              'POS Pakaian',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 24),
            const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
```

## 21.22 PIN Screen

```dart
// lib/screens/pin_screen.dart
import 'package:flutter/material.dart';
import 'package:pin_code_fields/pin_code_fields.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';

class PinScreen extends StatefulWidget {
  const PinScreen({super.key});
  
  @override
  State<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends State<PinScreen> {
  final TextEditingController _pinController = TextEditingController();
  bool _isLoading = false;
  String? _error;
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              Icon(
                Icons.lock_outline,
                size: 64,
                color: Theme.of(context).primaryColor,
              ),
              const SizedBox(height: 16),
              Text(
                'Masukkan PIN',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(
                'PIN 6 digit untuk login cepat',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.grey,
                ),
              ),
              const SizedBox(height: 32),
              PinCodeTextField(
                appContext: context,
                length: 6,
                controller: _pinController,
                obscureText: true,
                animationType: AnimationType.fade,
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() => _error = null),
                onCompleted: (pin) => _loginWithPin(pin),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
              const Spacer(),
              TextButton(
                onPressed: () => Navigator.pushReplacementNamed(context, '/login'),
                child: const Text('Gunakan Email & Password'),
              ),
            ],
          ),
        ),
      ),
    );
  }
  
  Future<void> _loginWithPin(String pin) async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    
    final auth = context.read<AuthProvider>();
    final success = await auth.loginWithPin(pin);
    
    if (success) {
      Navigator.pushReplacementNamed(context, '/home');
    } else {
      setState(() {
        _error = 'PIN salah';
        _pinController.clear();
      });
    }
    
    setState(() => _isLoading = false);
  }
}
```

## 21.23 Home Screen

```dart
// lib/screens/home_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/cart_provider.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('POS Pakaian'),
        actions: [
          IconButton(
            icon: const Icon(Icons.shopping_cart),
            onPressed: () => Navigator.pushNamed(context, '/pos'),
          ),
          IconButton(
            icon: const Icon(Icons.person),
            onPressed: () => Navigator.pushNamed(context, '/profile'),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Halo, ${user?.name ?? 'User'}!',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 24),
            Expanded(
              child: GridView.count(
                crossAxisCount: 2,
                mainAxisSpacing: 16,
                crossAxisSpacing: 16,
                children: [
                  _MenuCard(
                    icon: Icons.point_of_sale,
                    title: 'POS',
                    onTap: () => Navigator.pushNamed(context, '/pos'),
                  ),
                  _MenuCard(
                    icon: Icons.inventory_2,
                    title: 'Produk',
                    onTap: () => Navigator.pushNamed(context, '/products'),
                  ),
                  _MenuCard(
                    icon: Icons.warehouse,
                    title: 'Gudang',
                    onTap: () => Navigator.pushNamed(context, '/warehouse'),
                  ),
                  _MenuCard(
                    icon: Icons.receipt_long,
                    title: 'Biaya',
                    onTap: () => Navigator.pushNamed(context, '/expenses'),
                  ),
                  _MenuCard(
                    icon: Icons.assessment,
                    title: 'Laporan',
                    onTap: () => Navigator.pushNamed(context, '/reports'),
                  ),
                  _MenuCard(
                    icon: Icons.people,
                    title: 'Pelanggan',
                    onTap: () => Navigator.pushNamed(context, '/customers'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MenuCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;
  
  const _MenuCard({
    required this.icon,
    required this.title,
    required this.onTap,
  });
  
  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 48, color: Theme.of(context).primaryColor),
            const SizedBox(height: 8),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
          ],
        ),
      ),
    );
  }
}
```

## 21.24 Payment Screen

```dart
// lib/screens/pos/payment_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/cart_provider.dart';
import '../../utils/formatters.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key});
  
  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  String _selectedMethod = 'cash';
  final TextEditingController _amountController = TextEditingController();
  
  final List<Map<String, dynamic>> _paymentMethods = [
    {'id': 'cash', 'icon': Icons.money, 'label': 'Cash'},
    {'id': 'qris', 'icon': Icons.qr_code, 'label': 'QRIS'},
    {'id': 'debit', 'icon': Icons.credit_card, 'label': 'Debit'},
    {'id': 'transfer', 'icon': Icons.account_balance, 'label': 'Transfer'},
  ];
  
  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    final total = cart.grandTotal;
    
    return Scaffold(
      appBar: AppBar(title: const Text('Pembayaran')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Total Bayar', style: Theme.of(context).textTheme.titleMedium),
                    Text(
                      FormatUtils.currency(total),
                      style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).primaryColor,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('Metode Bayar', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: _paymentMethods.map((method) {
                final isSelected = _selectedMethod == method['id'];
                return ChoiceChip(
                  label: Text(method['label']),
                  selected: isSelected,
                  onSelected: (_) => setState(() => _selectedMethod = method['id']),
                );
              }).toList(),
            ),
            const SizedBox(height: 16),
            if (_selectedMethod == 'cash') ...[
              TextField(
                controller: _amountController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Jumlah Bayar',
                  prefixText: 'Rp ',
                  border: OutlineInputBorder(),
                ),
                onChanged: (value) => setState(() {}),
              ),
              const SizedBox(height: 8),
              if (_amountController.text.isNotEmpty) ...[
                Text(
                  'Kembalian: ${FormatUtils.currency(
                    (int.tryParse(_amountController.text.replaceAll('.', '')) ?? 0) - total
                  )}',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.green,
                  ),
                ),
              ],
            ],
            const Spacer(),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: _canPay ? () => _processPayment() : null,
                child: const Text('Bayar', style: TextStyle(fontSize: 18)),
              ),
            ),
          ],
        ),
      ),
    );
  }
  
  bool get _canPay {
    if (_selectedMethod == 'cash') {
      final amount = int.tryParse(_amountController.text.replaceAll('.', '')) ?? 0;
      return amount >= context.read<CartProvider>().grandTotal;
    }
    return true;
  }
  
  void _processPayment() {
    Navigator.pushReplacementNamed(context, '/success');
  }
}
```

## 21.25 Product List Screen

```dart
// lib/screens/products/product_list_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/product_provider.dart';
import '../../widgets/product_card.dart';

class ProductListScreen extends StatefulWidget {
  const ProductListScreen({super.key});
  
  @override
  State<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends State<ProductListScreen> {
  final _searchController = TextEditingController();
  
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ProductProvider>().loadProducts();
    });
  }
  
  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ProductProvider>();
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('Produk'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => Navigator.pushNamed(context, '/products/add'),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Cari produk...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              onChanged: (value) => provider.search(value),
            ),
          ),
          Expanded(
            child: provider.isLoading
                ? const Center(child: CircularProgressIndicator())
                : GridView.builder(
                    padding: const EdgeInsets.all(16),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 0.8,
                    ),
                    itemCount: provider.products.length,
                    itemBuilder: (context, index) {
                      return ProductCard(product: provider.products[index]);
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
```

## 21.26 Utils: Formatters

```dart
// lib/utils/formatters.dart
import 'package:intl/intl.dart';

class FormatUtils {
  static String currency(int amount) {
    return NumberFormat.currency(
      locale: 'id_ID',
      symbol: 'Rp ',
      decimalDigits: 0,
    ).format(amount);
  }
  
  static String date(DateTime date) {
    return DateFormat('dd MMM yyyy', 'id_ID').format(date);
  }
  
  static String dateTime(DateTime date) {
    return DateFormat('dd MMM yyyy, HH:mm', 'id_ID').format(date);
  }
  
  static String invoiceNo(String prefix, DateTime date, int seq) {
    final dateStr = DateFormat('yyyyMMdd').format(date);
    return '$prefix-$dateStr-${seq.toString().padLeft(4, '0')}';
  }
}
```
