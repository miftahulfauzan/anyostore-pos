import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'src/auth_store.dart';
import 'src/api_client.dart';
import 'src/login_page.dart';
import 'src/pos_page.dart';

void main() {
  runApp(
    ChangeNotifierProvider(
      create: (_) => AuthStore(ApiClient()),
      child: const PosMobileApp(),
    ),
  );
}

class PosMobileApp extends StatelessWidget {
  const PosMobileApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'POS Pakaian',
        theme: ThemeData(
            colorSchemeSeed: const Color(0xff1d5b43), useMaterial3: true),
        home: Consumer<AuthStore>(
          builder: (_, auth, __) =>
              auth.isAuthenticated ? const PosPage() : const LoginPage(),
        ),
      );
}
