import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'src/api_client.dart';
import 'src/auth_store.dart';
import 'src/login_page.dart';
import 'src/pos_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final auth = AuthStore(ApiClient());
  await auth.restore();
  runApp(
    ChangeNotifierProvider.value(
      value: auth,
      child: const PosMobileApp(),
    ),
  );
}

class PosMobileApp extends StatelessWidget {
  const PosMobileApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Anyostore POS',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          brightness: Brightness.light,
          colorSchemeSeed: const Color(0xff1e3a5f),
          scaffoldBackgroundColor: const Color(0xfff6f8fb),
          fontFamily: 'sans-serif',
        ),
        themeMode: ThemeMode.light,
        home: Consumer<AuthStore>(
          builder: (_, auth, __) =>
              auth.isAuthenticated ? const PosPage() : const LoginPage(),
        ),
      );
}
