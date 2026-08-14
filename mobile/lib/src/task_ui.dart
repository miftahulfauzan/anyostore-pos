import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

const kTaskBg = Color(0xffF5F1EA);
const kTaskDark = Color(0xff1E3A5F);
const kTaskOrange = Color(0xff2E5D8F);
const kTaskOrangeLight = Color(0xff5A8BBF);
const kTaskPurple = Color(0xff3B6EA5);
const kTaskGray = Color(0xff8A857C);
const kTaskBorder = Color(0xffE7E0D6);

/// Warna latar halaman yang ikut mode terang/gelap.
Color pageBg(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? const Color(0xff12151B)
        : kTaskBg;

/// Warna teks/ikon utama yang ikut mode terang/gelap.
Color ink(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? const Color(0xffE7ECF4)
        : kTaskDark;

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

/// Tab pil: aktif biru denim, nonaktif putih.
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
                Expanded(child: _pill(tabs[i], true)),
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
        itemBuilder: (_, i) => _pill(tabs[i], false),
      ),
    );
  }

  Widget _pill(({String value, IconData icon, String label}) t, bool centered) {
    final active = t.value == selected;
    return AnimatedScale(
      scale: active ? 1.02 : 1.0,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeInOutCubic,
        decoration: BoxDecoration(
          color: active ? kTaskOrange : Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
                color: active
                    ? kTaskOrange.withValues(alpha: .45)
                    : const Color(0x14000000),
                blurRadius: active ? 6 : 1,
                offset: const Offset(0, 1)),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => onChanged(t.value),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                mainAxisAlignment: centered
                    ? MainAxisAlignment.center
                    : MainAxisAlignment.start,
                children: [
                  Icon(t.icon,
                      size: 16, color: active ? Colors.white : kTaskGray),
                  const SizedBox(width: 6),
                  Text(t.label,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: active ? Colors.white : kTaskGray)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Blob dekoratif lembut di latar (biru denim) dengan gerakan ambient pelan.
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
                    kTaskPurple.withValues(alpha: .22),
                    kTaskPurple.withValues(alpha: 0),
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
                    kTaskOrange.withValues(alpha: .18),
                    kTaskOrange.withValues(alpha: 0),
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
        color: const Color(0x141E3A5F),
        borderRadius: BorderRadius.circular(widget.radius),
        border: Border.all(color: kTaskBorder),
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

/// Kartu liquid glass: frosted translucent dengan blur dan border tipis.
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
        gradient: LinearGradient(
          colors: isDark
              ? [
                  const Color(0xFF262F3D),
                  const Color(0xFF1D2430),
                ]
              : [
                  Colors.white.withValues(alpha: .78),
                  Colors.white.withValues(alpha: .42),
                ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(
            color: isDark
                ? Colors.white.withValues(alpha: .16)
                : Colors.white.withValues(alpha: .55)),
        boxShadow: const [
          BoxShadow(
              color: Color(0x1A1E3A5F), blurRadius: 20, offset: Offset(0, 8)),
        ],
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

/// Bottom nav Liquid Glass MELAYANG (statis, tanpa animasi): pil kaca
/// mengambang dengan 5 item sebaris — POS (keranjang) paling kiri, lalu
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
            child: ClipRRect(
              borderRadius: BorderRadius.circular(28),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                child: ColorFiltered(
                  colorFilter: const ColorFilter.matrix([
                    1.25,
                    0,
                    0,
                    0,
                    0,
                    0,
                    1.25,
                    0,
                    0,
                    0,
                    0,
                    0,
                    1.25,
                    0,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                  ]),
                  child: Container(
                    height: 62,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: dark
                            ? const [
                                Color(0x3DFFFFFF),
                                Color(0x1FFFFFFF),
                                Color(0x0AFFFFFF),
                              ]
                            : const [
                                Color(0xB3FFFFFF),
                                Color(0x73FFFFFF),
                                Color(0x2EFFFFFF),
                              ],
                      ),
                    ),
                    child: Stack(
                      children: [
                        _LiquidRim(dark: dark),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            for (var i = 0; i < items.length; i++)
                              _navIcon(i, dark: dark),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
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
    final idleColor = dark ? const Color(0xffF1F5FB) : const Color(0xff403C36);
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
          height: 54,
          margin: const EdgeInsets.symmetric(vertical: 1),
          decoration: BoxDecoration(
            color: active
                ? (dark ? const Color(0xff1E3A5F) : kTaskDark)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(active ? item.activeIcon : item.icon,
                  size: 21, color: active ? activeColor : idleColor),
              const SizedBox(height: 2),
              Text(item.label,
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: active ? FontWeight.w800 : FontWeight.w700,
                      color: active ? activeColor : idleColor)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Rim atas navbar (statis): garis terang (refraction ring) + chromatic
/// dispersion tipis merah/sian, memudar di kedua ujung.
class _LiquidRim extends StatelessWidget {
  const _LiquidRim({required this.dark});
  final bool dark;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: IgnorePointer(
        child: CustomPaint(
          size: Size(MediaQuery.of(context).size.width, 6),
          painter: _LiquidRimPainter(dark: dark),
        ),
      ),
    );
  }
}

class _LiquidRimPainter extends CustomPainter {
  _LiquidRimPainter({required this.dark});
  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    // Fade horizontal: transparan di ujung, terang di tengah.
    LinearGradient fade(double alpha) => LinearGradient(
          colors: [
            Colors.white.withValues(alpha: 0),
            Colors.white.withValues(alpha: alpha),
            Colors.white.withValues(alpha: 0),
          ],
          stops: const [0, .5, 1],
        );

    final core = Paint()
      ..shader = fade(dark ? .45 : .8).createShader(Offset.zero & size)
      ..strokeWidth = 1.4
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(const Offset(0, 2.6), Offset(w, 2.6), core);

    // Chromatic dispersion: garis merah bergeser sedikit + biru/sian.
    final red = Paint()
      ..shader = LinearGradient(
        colors: [
          Colors.transparent,
          const Color(0xFFFF7A6B).withValues(alpha: .34),
          const Color(0xFFFF7A6B).withValues(alpha: .34),
          Colors.transparent,
        ],
        stops: const [0, .35, .65, 1],
      ).createShader(Offset.zero & size)
      ..strokeWidth = 1;
    canvas.drawLine(const Offset(0, 1.2), Offset(w, 1.2), red);

    final cyan = Paint()
      ..shader = LinearGradient(
        colors: [
          Colors.transparent,
          const Color(0xFF6BD8FF).withValues(alpha: .30),
          const Color(0xFF6BD8FF).withValues(alpha: .30),
          Colors.transparent,
        ],
        stops: const [0, .35, .65, 1],
      ).createShader(Offset.zero & size)
      ..strokeWidth = 1;
    canvas.drawLine(const Offset(0, 4.0), Offset(w, 4.0), cyan);
  }

  @override
  bool shouldRepaint(_LiquidRimPainter old) => old.dark != dark;
}
