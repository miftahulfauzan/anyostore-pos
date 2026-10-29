import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
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
import 'src/task_ui.dart';

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
    if (MediaQuery.disableAnimationsOf(context)) return child;
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

ThemeData buildAnyostoreTheme({Brightness brightness = Brightness.light}) {
  final dark = brightness == Brightness.dark;
  final fontFamily = defaultTargetPlatform == TargetPlatform.iOS
      ? 'CupertinoSystemText'
      : 'Roboto';
  const seed = kTaskDark;
  final scheme = ColorScheme.fromSeed(
    seedColor: seed,
    brightness: brightness,
    surface: dark ? kTaskDarkSurface : kTaskSurface,
  ).copyWith(
    primary: dark ? const Color(0xff7FA8CF) : kTaskDark,
    onPrimary: dark ? kTaskDarkBg : Colors.white,
    secondary: dark ? const Color(0xff45B6A2) : kTaskTeal,
    onSecondary: Colors.white,
    tertiary: dark ? const Color(0xffF2B8A5) : kTaskTerracotta,
    error: dark ? const Color(0xffF2B8A5) : kTaskTerracotta,
    outline: const Color(0xff64748B),
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
    scaffoldBackgroundColor: dark ? kTaskDarkBg : kTaskBg,
    fontFamily: fontFamily,
    textTheme: TextTheme(
      bodyLarge: TextStyle(
          fontSize: 16,
          height: 1.35,
          color: dark ? const Color(0xffE7ECF4) : kTaskInk),
      bodyMedium: TextStyle(
          fontSize: 14,
          height: 1.35,
          color: dark ? const Color(0xffCBD5E1) : kTaskInk),
      bodySmall: TextStyle(
          fontSize: 12,
          height: 1.35,
          color: dark ? const Color(0xffA7B4C7) : kTaskGray),
      labelLarge: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          color: dark ? const Color(0xffF1F5FB) : kTaskInk),
      titleMedium: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w800,
          color: dark ? const Color(0xffF1F5FB) : kTaskInk),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: dark ? kTaskDarkSurface : kTaskSurface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: dark ? const Color(0xffF1F5F9) : kTaskInk),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: dark ? kTaskDarkSurface : kTaskSurface,
      surfaceTintColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: dark ? const Color(0xff334155) : kTaskBorder),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        minimumSize: const Size(48, 48),
        tapTargetSize: MaterialTapTargetSize.padded,
        padding: const EdgeInsets.all(12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    listTileTheme: ListTileThemeData(
      minVerticalPadding: 8,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: dark ? kTaskDarkSurface : kTaskSurface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: dark ? kTaskDark : kTaskSand,
      elevation: 0,
      height: 68,
      labelTextStyle: const WidgetStatePropertyAll(
          TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        minimumSize: const Size(0, 48),
        textStyle: TextStyle(
            fontSize: 15, fontWeight: FontWeight.w700, fontFamily: fontFamily),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        minimumSize: const Size(0, 46),
        textStyle: TextStyle(
            fontSize: 15, fontWeight: FontWeight.w700, fontFamily: fontFamily),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle:
            TextStyle(fontWeight: FontWeight.w600, fontFamily: fontFamily),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? const Color(0xff263241) : kTaskSurface,
      border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide:
              BorderSide(color: dark ? const Color(0xff334155) : kTaskBorder)),
      enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xff64748B))),
      focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.primary, width: 2)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: dark ? kTaskDarkSurface : kTaskSurface,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: dark ? kTaskDarkSurface : kTaskSurface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: kTaskDark,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    tooltipTheme: TooltipThemeData(
      waitDuration: const Duration(milliseconds: 450),
      showDuration: const Duration(seconds: 3),
      decoration: BoxDecoration(
        color: dark ? const Color(0xffE7ECF4) : kTaskInk,
        borderRadius: BorderRadius.circular(8),
      ),
      textStyle: TextStyle(
          color: dark ? kTaskInk : Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w600),
    ),
  );
}

class PosMobileApp extends StatelessWidget {
  const PosMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: ThemeController.mode,
      builder: (context, themeMode, _) {
        return MaterialApp(
          title: 'Anyostore App',
          debugShowCheckedModeBanner: false,
          theme: buildAnyostoreTheme(brightness: Brightness.light),
          darkTheme: buildAnyostoreTheme(brightness: Brightness.dark),
          themeMode: themeMode,
          home: Consumer<AuthStore>(
            builder: (_, auth, __) => auth.isAuthenticated
                ? PosPage(key: ValueKey(auth.userId))
                : const LoginPage(),
          ),
        );
      },
    );
  }
}
