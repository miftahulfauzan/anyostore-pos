import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'src/api_client.dart';
import 'src/auth_store.dart';
import 'src/branch_scope.dart';
import 'src/backup_service.dart';
import 'src/login_page.dart';
import 'src/notification_service.dart';
import 'src/pos_page.dart';
import 'src/theme_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
    systemNavigationBarColor: Colors.transparent,
    systemNavigationBarIconBrightness:
        ThemeController.mode.value == ThemeMode.dark
            ? Brightness.light
            : Brightness.dark,
    systemStatusBarContrastEnforced: false,
    systemNavigationBarContrastEnforced: false,
  ));
  final auth = AuthStore(ApiClient());
  await auth.restore();
  await ThemeController.load();
  await BranchScope.load();
  await NotificationService.init();
  if (auth.isAuthenticated) {
    // Cek stok menipis + backup otomatis + pengingat harian saat app dibuka.
    unawaited(BackupService.checkLowStock(auth.api));
    unawaited(_autoBackup(auth.api));
    unawaited(NotificationService.scheduleDailyReminder());
  }
  runApp(
    ChangeNotifierProvider.value(
      value: auth,
      child: const PosMobileApp(),
    ),
  );
}

Future<void> _autoBackup(ApiClient api) async {
  try {
    if (!await BackupService.shouldAutoBackup()) return;
    final file = await BackupService.runBackup(api);
    if (file != null) {
      await NotificationService.showBackupDone(file.path.split('/').last);
    }
  } catch (_) {
    // Backup gagal (offline/izin) — coba lagi besok.
  }
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
        position: Tween(begin: const Offset(0, 0.025), end: Offset.zero)
            .animate(curved),
        child: child,
      ),
    );
  }
}

ThemeData _buildTheme({Brightness brightness = Brightness.light}) {
  final dark = brightness == Brightness.dark;
  const seed = Color(0xff1E3A5F);
  final scheme = ColorScheme.fromSeed(
    seedColor: seed,
    brightness: brightness,
    surface: dark ? const Color(0xff1A1F27) : const Color(0xffffffff),
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
    scaffoldBackgroundColor:
        dark ? const Color(0xff12151B) : const Color(0xffF5F1EA),
    fontFamily: 'sans-serif',
    appBarTheme: AppBarTheme(
      backgroundColor: dark ? const Color(0xff1A1F27) : Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: dark ? const Color(0xffE7ECF4) : const Color(0xff1E3A5F)),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: dark ? const Color(0xff1A1F27) : Colors.white,
      surfaceTintColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
            color: dark ? const Color(0xff2A3140) : const Color(0xffE7E0D6)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: dark ? const Color(0xff1A1F27) : Colors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: dark ? const Color(0xff26303F) : const Color(0xffF5E8DC),
      elevation: 0,
      height: 68,
      labelTextStyle: const WidgetStatePropertyAll(
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
      fillColor: dark ? const Color(0xff1F2530) : Colors.white,
      border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(
              color: dark ? const Color(0xff2A3140) : const Color(0xffE7E0D6))),
      enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(
              color: dark ? const Color(0xff2A3140) : const Color(0xffE7E0D6))),
      focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: seed, width: 1.5)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: dark ? const Color(0xF21A1F27) : const Color(0xEEFFFFFF),
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: dark ? const Color(0xF21A1F27) : const Color(0xF2FFFFFF),
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
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: ThemeController.mode,
      builder: (context, themeMode, _) {
        // Area di luar area desain diisi warna tema (bukan hitam) supaya
        // tidak ada garis hitam di HP dengan rasio layar lebih tinggi.
        final band = themeMode == ThemeMode.dark
            ? const Color(0xff12151B)
            : const Color(0xffF5F1EA);
        return ColoredBox(
            color: band,
            child: LayoutBuilder(builder: (context, constraints) {
              final mq = MediaQuery.of(context);
              final scale = math
                  .min(constraints.maxWidth / designW,
                      constraints.maxHeight / designH)
                  .clamp(0.8, 1.35);
              // Rata ke ATAS: warna AppBar/halaman bisa memenuhi area status bar
              // (dulu Center menyisakan pita atas yang warnanya beda -> status
              // bar setengah warna lain di halaman beraksen hijau/oranye).
              return Align(
                alignment: Alignment.topCenter,
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
                        theme: _buildTheme(brightness: Brightness.light),
                        darkTheme: _buildTheme(brightness: Brightness.dark),
                        themeMode: themeMode,
                        home: Consumer<AuthStore>(
                          builder: (_, auth, __) => auth.isAuthenticated
                              // Key userId: saat ganti akun, PosPage dibuat ulang
                              // supaya data (produk/toko/laporan) fresh.
                              ? PosPage(key: ValueKey(auth.userId))
                              : const LoginPage(),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }));
      },
    );
  }
}
