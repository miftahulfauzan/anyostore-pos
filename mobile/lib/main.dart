import 'dart:math' as math;

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

/// Transisi antar halaman: fade + slide halus (Corporate motion).
class _FadeSlideTransitionsBuilder extends PageTransitionsBuilder {
  const _FadeSlideTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
      PageRoute<T> route,
      BuildContext context,
      Animation<double> animation,
      Animation<double> secondaryAnimation,
      Widget child) {
    final curved = CurvedAnimation(
      parent: animation,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position:
            Tween(begin: const Offset(0, 0.025), end: Offset.zero).animate(curved),
        child: child,
      ),
    );
  }
}

ThemeData _buildTheme() {
  const seed = Color(0xff1E3A5F);
  final scheme = ColorScheme.fromSeed(
    seedColor: seed,
    brightness: Brightness.light,
    surface: const Color(0xffffffff),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: _FadeSlideTransitionsBuilder(),
        TargetPlatform.iOS: _FadeSlideTransitionsBuilder(),
        TargetPlatform.macOS: _FadeSlideTransitionsBuilder(),
        TargetPlatform.windows: _FadeSlideTransitionsBuilder(),
        TargetPlatform.linux: _FadeSlideTransitionsBuilder(),
      },
    ),
    scaffoldBackgroundColor: const Color(0xffF5F1EA),
    fontFamily: 'sans-serif',
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
          fontSize: 18, fontWeight: FontWeight.w700, color: Color(0xff1E3A5F)),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: Colors.white,
      surfaceTintColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xffE7E0D6)),
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: Color(0xffF5E8DC),
      elevation: 0,
      height: 68,
      labelTextStyle: WidgetStatePropertyAll(
          TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        minimumSize: const Size(0, 48),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        minimumSize: const Size(0, 46),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xffE7E0D6))),
      enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xffE7E0D6))),
      focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: seed, width: 1.5)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Color(0xEEFFFFFF),
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: const Color(0xF2FFFFFF),
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: const Color(0xff1E3A5F),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );
}

class PosMobileApp extends StatelessWidget {
  const PosMobileApp({super.key});

  static const double designW = 390;
  static const double designH = 844;

  @override
  Widget build(BuildContext context) {
    // Skala responsif: di HP kecil UI ikut mengecil, di HP besar ikut membesar.
    return LayoutBuilder(builder: (context, constraints) {
      final mq = MediaQuery.of(context);
      final scale = math
          .min(constraints.maxWidth / designW, constraints.maxHeight / designH)
          .clamp(0.8, 1.35);
      return Center(
        child: SizedBox(
          width: designW * scale,
          height: designH * scale,
          child: Transform.scale(
            scale: scale,
            child: MediaQuery(
              data: mq.copyWith(
                size: const Size(designW, designH),
                devicePixelRatio: mq.devicePixelRatio / scale,
              ),
              child: MaterialApp(
                title: 'Anyostore App',
                debugShowCheckedModeBanner: false,
                theme: _buildTheme(),
                themeMode: ThemeMode.light,
                home: Consumer<AuthStore>(
                  builder: (_, auth, __) => auth.isAuthenticated
                      ? const PosPage()
                      : const LoginPage(),
                ),
              ),
            ),
          ),
        ),
      );
    });
  }
}
