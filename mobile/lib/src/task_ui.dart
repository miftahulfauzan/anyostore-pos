import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

// Anyostore cream and denim design system.
// Green and orange remain reserved for semantic stock and transaction states.
const kTaskBg = Color(0xffF5F1EA);
const kTaskDarkBg = Color(0xff12151B);
const kTaskDarkSurface = Color(0xff1F2937);
const kTaskSurface = Color(0xffffffff);
const kTaskInk = Color(0xff1E3A5F);
const kTaskDark = Color(0xff1E3A5F);
const kTaskSecondary = Color(0xff2E5D8F);
const kTaskBlueLight = Color(0xff5A8BBF);
const kTaskTeal = Color(0xff246B45);
const kTaskTerracotta = Color(0xff9A3412);
const kTaskSand = Color(0xffE7E0D6);
const kTaskGray = Color(0xff475569);
const kTaskBorder = Color(0xffE7E0D6);

// Status stok mengikuti mockup mobile: tersedia (teal), menipis (oranye),
// dan habis (merah). Teks status tetap ditampilkan sehingga warna bukan satu-
// satunya penanda kondisi.
const kTaskStockGood = Color(0xff246B45);
const kTaskStockGoodSurface = Color(0xffDDF2E5);
const kTaskStockLow = Color(0xff9A3412);
const kTaskStockLowSurface = Color(0xffFCE4D6);
const kTaskStockEmpty = Color(0xffB42318);
const kTaskStockEmptySurface = Color(0xffFBE4E4);

// Compatibility aliases for feature pages that still use the old semantic
// names. New UI should prefer the explicit tokens above.
const kTaskOrange = kTaskDark;
const kTaskOrangeLight = kTaskSecondary;
const kTaskPurple = kTaskTeal;

/// Warna latar halaman yang ikut mode terang/gelap.
Color pageBg(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? kTaskDarkBg : kTaskBg;

/// Warna teks/ikon utama yang ikut mode terang/gelap.
Color ink(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? const Color(0xffF1F5F9)
        : kTaskInk;

Color taskSurface(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? kTaskDarkSurface
        : kTaskSurface;

Color taskMuted(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? const Color(0xffCBD5E1)
        : kTaskSecondary;

Color taskBorder(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? const Color(0xff334155)
        : kTaskBorder;

/// Entrance: fade + slide-up halus (Corporate motion). Delay untuk stagger.
class Entrance extends StatelessWidget {
  const Entrance(
      {super.key,
      required this.child,
      this.delay = Duration.zero,
      this.duration = const Duration(milliseconds: 1),
      this.offset = 0});
  final Widget child;
  final Duration delay;
  final Duration duration;
  final double offset;

  @override
  Widget build(BuildContext context) => child;
}

/// Tab pil: aktif denim, nonaktif surface netral.
class PillTabs extends StatelessWidget {
  const PillTabs(
      {super.key,
      required this.tabs,
      required this.selected,
      required this.onChanged});
  final List<({String value, IconData icon, String label})> tabs;
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    if (tabs.length <= 3) {
      // 2-3 menu: satu baris, lebar dibagi rata.
      return SizedBox(
        height: 44,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              for (var i = 0; i < tabs.length; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(child: _pill(context, tabs[i], true)),
              ],
            ],
          ),
        ),
      );
    }
    // 4+ menu: tetap bisa di-slide ke samping.
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: tabs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) => _pill(context, tabs[i], false),
      ),
    );
  }

  Widget _pill(BuildContext context,
      ({String value, IconData icon, String label}) t, bool centered) {
    final active = t.value == selected;
    return AnimatedScale(
      scale: active ? 1.02 : 1.0,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeInOutCubic,
        decoration: BoxDecoration(
          color: active ? kTaskDark : taskSurface(context),
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
                color: active
                    ? kTaskDark.withValues(alpha: .18)
                    : const Color(0x120F172A),
                blurRadius: active ? 4 : 2,
                offset: const Offset(0, 2)),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => onChanged(t.value),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              child: Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(t.icon,
                        size: 16,
                        color: active ? Colors.white : taskMuted(context)),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(t.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color:
                                  active ? Colors.white : taskMuted(context))),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Blob dekoratif sangat lembut agar halaman tetap fokus pada data.
class SoftBlobs extends StatefulWidget {
  const SoftBlobs({super.key});

  @override
  State<SoftBlobs> createState() => _SoftBlobsState();
}

class _SoftBlobsState extends State<SoftBlobs> {
  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        children: [
          Positioned(
            top: -90,
            right: -70,
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    kTaskSecondary.withValues(alpha: .10),
                    kTaskSecondary.withValues(alpha: 0),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: -70,
            left: -60,
            child: Container(
              width: 220,
              height: 220,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    kTaskBlueLight.withValues(alpha: .08),
                    kTaskBlueLight.withValues(alpha: 0),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class BrandLogo extends StatefulWidget {
  const BrandLogo({super.key, this.api, this.size = 44, this.radius = 14});
  final ApiClient? api;
  final double size;
  final double radius;

  @override
  State<BrandLogo> createState() => _BrandLogoState();
}

class _BrandLogoState extends State<BrandLogo> {
  static String? _cached;
  String? _path;

  static Future<String?> _readCache() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('pos_store_logo');
  }

  static Future<void> _writeCache(String path) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('pos_store_logo', path);
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    _path = _cached ?? await _readCache();
    if (mounted) setState(() {});
    final api = widget.api;
    if (api == null) return;
    try {
      final settings = await api.storeSettings();
      final p = settings['store_logo']?.toString() ?? '';
      if (p.isNotEmpty && p != _path) {
        _cached = p;
        await _writeCache(p);
        if (mounted) setState(() => _path = p);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final size = widget.size;
    final path = _path ?? '';
    Widget fallback = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: kTaskSand,
        borderRadius: BorderRadius.circular(widget.radius),
        border: Border.all(color: taskBorder(context)),
      ),
      child: Icon(Icons.shopping_bag_outlined,
          size: size * 0.52, color: kTaskDark),
    );
    if (path.isEmpty) return fallback;
    final base = (widget.api?.baseUrl ?? '').split('/api').first;
    final url = path.startsWith('http') ? path : base + path;
    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.radius),
      child: Image.network(
        url,
        width: size,
        height: size,
        fit: BoxFit.cover,
        cacheWidth: 200,
        errorBuilder: (_, __, ___) => fallback,
      ),
    );
  }
}

/// Kartu data solid dengan border; elevation disimpan untuk lapisan overlay.
class GlassCard extends StatelessWidget {
  const GlassCard(
      {super.key,
      required this.child,
      this.radius = 24,
      this.padding = const EdgeInsets.all(16),
      this.height,
      this.dark = false,
      this.onTap,
      // Default TANPA blur: BackdropFilter per kartu mahal di device lama.
      // Nyalakan eksplisit (frosted: true) hanya untuk kartu hero tunggal.
      this.frosted = false});
  final Widget child;
  final double radius;
  final EdgeInsets padding;
  final double? height;
  final bool dark;
  final VoidCallback? onTap;

  /// true = aktifkan BackdropFilter (blur). Default false: blur per kartu
  /// mahal banget di device lama & bikin scroll berat. Efek kaca tetap ada
  /// lewat gradien + border tipis tanpa blur.
  final bool frosted;

  @override
  Widget build(BuildContext context) {
    final isDark = dark || Theme.of(context).brightness == Brightness.dark;
    final inner = Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(radius),
        child: Padding(padding: padding, child: child),
      ),
    );
    final card = Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        color: isDark ? kTaskDarkSurface : kTaskSurface,
        border:
            Border.all(color: isDark ? const Color(0xff334155) : kTaskBorder),
      ),
      child: height == null ? inner : SizedBox(height: height, child: inner),
    );
    if (!frosted) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: card,
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: card,
      ),
    );
  }
}

/// Bottom nav melayang (statis): panel solid yang mudah dibaca
/// dengan 5 item sebaris — POS (keranjang) paling kiri, lalu
/// Riwayat, Stok, Laporan, Lainnya. Kontras teks dinaikkan supaya jelas.
class GlassNavBar extends StatelessWidget {
  const GlassNavBar(
      {super.key,
      required this.current,
      required this.onSelect,
      required this.items});
  final int current;
  final ValueChanged<int> onSelect;
  final List<({IconData icon, IconData activeIcon, String label})> items;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final bottomPad = MediaQuery.of(context).padding.bottom;
    return SizedBox(
      height: 78 + bottomPad,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.bottomCenter,
        children: [
          Positioned(
            left: 14,
            right: 14,
            bottom: 14 + bottomPad,
            child: Container(
              height: 62,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: dark ? kTaskDarkSurface : kTaskSurface,
                borderRadius: BorderRadius.circular(28),
                border: Border.all(
                    color: dark ? const Color(0xff334155) : kTaskBorder),
                boxShadow: const [
                  BoxShadow(
                      color: Color(0x1A0F172A),
                      blurRadius: 16,
                      offset: Offset(0, 6)),
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  for (var i = 0; i < items.length; i++)
                    _navIcon(i, dark: dark),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _navIcon(int i, {required bool dark}) {
    final item = items[i];
    final active = current == i;
    final idleColor = dark ? const Color(0xffE2E8F0) : kTaskSecondary;
    const activeColor = Colors.white;
    return Semantics(
      label: item.label,
      button: true,
      selected: active,
      child: GestureDetector(
        onTap: () => onSelect(i),
        behavior: HitTestBehavior.opaque,
        child: Container(
          width: 62,
          height: 48,
          decoration: BoxDecoration(
            color: active ? kTaskDark : Colors.transparent,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(active ? item.activeIcon : item.icon,
                  size: 20, color: active ? activeColor : idleColor),
              const SizedBox(height: 1),
              Text(item.label,
                  style: TextStyle(
                      fontSize: 9.5,
                      height: 1.0,
                      fontWeight: active ? FontWeight.w800 : FontWeight.w700,
                      color: active ? activeColor : idleColor)),
            ],
          ),
        ),
      ),
    );
  }
}
