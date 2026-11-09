import 'dart:async';

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
import 'src/font_scale_controller.dart';
import 'src/theme_controller.dart';
import 'src/task_ui.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  PaintingBinding.instance.imageCache
    ..maximumSize = 160
    ..maximumSizeBytes = 48 << 20;
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
  await FontScaleController.load();
  await BranchScope.load();
  await NotificationService.init();
  if (auth.isAuthenticated) {
    // Cek stok menipis + backup otomatis + pengingat harian saat app dibuka.
    // /reports/overview dibatasi untuk owner/manager/admin, jadi role gudang
    // (dan kasir) tidak boleh memanggilnya agar tidak muncul "Akses ditolak".
    final role = auth.role;
    final canReadReports =
        role == 'owner' || role == 'manager' || role == 'admin';
    if (canReadReports) {
      unawaited(BackupService.checkLowStock(auth.api));
    }
    // /backup hanya untuk owner.
    if (role == 'owner') {
      unawaited(_autoBackup(auth.api));
    }
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
  const fontFamily = 'Plus Jakarta Sans';
  final primary = dark ? kTaskAccentDark : kTaskDark;
  final accent = dark ? kTaskAccentDark : kTaskAccent;
  final scheme = ColorScheme.fromSeed(
    seedColor: kTaskDark,
    brightness: brightness,
    surface: dark ? kTaskDarkSurface : kTaskSurface,
  ).copyWith(
    primary: primary,
    onPrimary: dark ? kTaskDarkBg : Colors.white,
    secondary: accent,
    onSecondary: dark ? kTaskDarkBg : Colors.white,
    tertiary: dark ? kTaskDarkSurface : kTaskSurfaceMuted,
    onTertiary: dark ? kTaskDarkInk : kTaskInk,
    error: dark ? const Color(0xffFCA5A5) : const Color(0xffB42318),
    outline: dark ? kTaskDarkBorder : kTaskBorder,
    outlineVariant: dark ? kTaskDarkBorder : kTaskBorder,
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
          fontSize: 16, height: 1.35, color: dark ? kTaskDarkInk : kTaskInk),
      bodyMedium: TextStyle(
          fontSize: 14, height: 1.35, color: dark ? kTaskDarkInk : kTaskInk),
      bodySmall: TextStyle(
          fontSize: 12,
          height: 1.35,
          color: dark ? kTaskDarkSecondary : kTaskSecondary),
      labelLarge: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          color: dark ? kTaskDarkInk : kTaskInk),
      titleMedium: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: dark ? kTaskDarkInk : kTaskInk),
      titleLarge: TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w800,
          color: dark ? kTaskDarkInk : kTaskInk),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: kTaskDark,
      foregroundColor: Colors.white,
      systemOverlayStyle: SystemUiOverlayStyle.light,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(
          fontSize: 19, fontWeight: FontWeight.w700, color: Colors.white),
      iconTheme: IconThemeData(color: Colors.white),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: dark ? kTaskDarkSurface : kTaskSurface,
      surfaceTintColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: dark ? kTaskDarkBorder : kTaskBorder),
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
      indicatorColor: dark ? kTaskDarkBorder : kTaskSurfaceMuted,
      elevation: 0,
      height: 68,
      labelTextStyle: const WidgetStatePropertyAll(
          TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        minimumSize: const Size(0, 50),
        textStyle: const TextStyle(
            fontSize: 15, fontWeight: FontWeight.w700, fontFamily: fontFamily),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: dark ? scheme.primary : kTaskDark,
        side: BorderSide(color: dark ? kTaskDarkBorder : kTaskBorder),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        minimumSize: const Size(0, 48),
        textStyle: const TextStyle(
            fontSize: 15, fontWeight: FontWeight.w700, fontFamily: fontFamily),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: dark ? scheme.primary : kTaskDark,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(
            fontWeight: FontWeight.w600, fontFamily: fontFamily),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? kTaskDarkSurface : kTaskSurfaceMuted,
      hintStyle: TextStyle(color: dark ? kTaskDarkSecondary : kTaskSecondary),
      border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: dark ? kTaskDarkBorder : kTaskBorder)),
      enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: dark ? kTaskDarkBorder : kTaskBorder)),
      focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: accent, width: 2)),
      errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: scheme.error)),
      focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: scheme.error, width: 2)),
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
    dividerTheme: DividerThemeData(
      color: dark ? kTaskDarkBorder : kTaskBorder,
      thickness: 1,
      space: 20,
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: accent,
      selectionColor: accent.withValues(alpha: .22),
      selectionHandleColor: accent,
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((states) =>
          states.contains(WidgetState.selected) ? scheme.onPrimary : null),
      trackColor: WidgetStateProperty.resolveWith((states) =>
          states.contains(WidgetState.selected) ? scheme.primary : null),
    ),
    checkboxTheme: CheckboxThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
      side: BorderSide(color: dark ? kTaskDarkBorder : kTaskBorder, width: 1.5),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
  );
}

class PosMobileApp extends StatelessWidget {
  const PosMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: ThemeController.mode,
      builder: (context, themeMode, _) {
        return ValueListenableBuilder<double>(
          valueListenable: FontScaleController.scale,
          builder: (context, fontScale, _) => MaterialApp(
            title: 'Anyostore App',
            debugShowCheckedModeBanner: false,
            theme: buildAnyostoreTheme(brightness: Brightness.light),
            darkTheme: buildAnyostoreTheme(brightness: Brightness.dark),
            themeMode: themeMode,
            builder: (context, child) {
              final media = MediaQuery.maybeOf(context);
              if (media == null) return child ?? const SizedBox.shrink();
              final systemScale = media.textScaler.scale(1);
              final effective = FontScaleController.effectiveScale(
                  fontScale * systemScale, media.size.width);
              return MediaQuery(
                key: const ValueKey('font-scale-media-query'),
                data: media.copyWith(
                  textScaler: TextScaler.linear(effective),
                ),
                child: child ?? const SizedBox.shrink(),
              );
            },
            home: Consumer<AuthStore>(
              builder: (_, auth, __) => auth.isAuthenticated
                  ? PosPage(key: ValueKey(auth.userId))
                  : const LoginPage(),
            ),
          ),
        );
      },
    );
  }
}
