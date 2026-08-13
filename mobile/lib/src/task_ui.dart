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


/// Entrance: fade + slide-up halus (Corporate motion). Delay untuk stagger.
class Entrance extends StatelessWidget {
  const Entrance(
      {super.key,
      required this.child,
      this.delay = Duration.zero,
      this.duration = const Duration(milliseconds: 320),
      this.offset = 12});
  final Widget child;
  final Duration delay;
  final Duration duration;
  final double offset;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeDisableAnimationsOf(context) == true) return child;
    final total = duration + delay;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: total,
      curve: Interval(
        delay.inMilliseconds / total.inMilliseconds,
        1,
        curve: Curves.easeOutCubic,
      ),
      builder: (context, v, child) => Opacity(
        opacity: v,
        child: Transform.translate(
          offset: Offset(0, offset * (1 - v)),
          child: child,
        ),
      ),
      child: child,
    );
  }
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

  Widget _pill(({String value, IconData icon, String label}) t,
      bool centered) {
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

class _SoftBlobsState extends State<SoftBlobs>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    final reduced = MediaQuery.maybeDisableAnimationsOf(context) == true;
    _c = AnimationController(
        vsync: this,
        duration: const Duration(seconds: 7),
        lowerBound: 0,
        upperBound: 1);
    if (!reduced) _c.repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, child) {
          final t = Curves.easeInOutSine.transform(_c.value);
          final drift = (t - 0.5) * 10; // -5..5 px pelan
          return Transform.translate(
            offset: Offset(drift, -drift * 0.6),
            child: child,
          );
        },
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
      ),
    );
  }
}

/// Logo toko dari pengaturan (store_logo), dengan cache. Fallback: ikon keranjang.
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
      this.onTap});
  final Widget child;
  final double radius;
  final EdgeInsets padding;
  final double? height;
  final bool dark;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final inner = Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(radius),
        child: Padding(padding: padding, child: child),
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(radius),
            gradient: LinearGradient(
              colors: dark
                  ? [
                      const Color(0xF01E3A5F),
                      const Color(0xC92E5D8F),
                    ]
                  : [
                      Colors.white.withValues(alpha: .78),
                      Colors.white.withValues(alpha: .42),
                    ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            border: Border.all(
                color: dark
                    ? Colors.white.withValues(alpha: .28)
                    : Colors.white.withValues(alpha: .55)),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x1A1E3A5F),
                  blurRadius: 20,
                  offset: Offset(0, 8)),
            ],
          ),
          child: height == null
              ? inner
              : SizedBox(height: height, child: inner),
        ),
      ),
    );
  }
}

/// Bottom nav Liquid Glass (iOS 26 style, diadaptasi dari
/// QWEA0/Liquid-Glass-Android): backdrop blur + saturation, rim highlight
/// dengan chromatic dispersion (pinggir merah/cyan), specular sweep dari
/// "sumber cahaya" yang bergeser, dan FAB tengah seperti tetesan kaca.
class GlassNavBar extends StatefulWidget {
  const GlassNavBar(
      {super.key,
      required this.current,
      required this.onSelect,
      required this.items});
  final int current;
  final ValueChanged<int> onSelect;
  final List<({IconData icon, IconData activeIcon, String label})> items;

  @override
  State<GlassNavBar> createState() => _GlassNavBarState();
}

class _GlassNavBarState extends State<GlassNavBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _light =
      AnimationController(vsync: this, duration: const Duration(seconds: 7))
        ..repeat();

  @override
  void dispose() {
    _light.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final bottomPad = MediaQuery.of(context).padding.bottom;
    return Entrance(
      offset: 18,
      duration: const Duration(milliseconds: 420),
      delay: const Duration(milliseconds: 120),
      child: SizedBox(
        height: 84 + bottomPad,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.bottomCenter,
          children: [
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: ClipRRect(
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(36)),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                  child: ColorFiltered(
                    // Naikkan saturasi backdrop, ala Liquid Glass "vibrancy".
                    colorFilter: const ColorFilter.matrix([
                      1.25, 0, 0, 0, 0,
                      0, 1.25, 0, 0, 0,
                      0, 0, 1.25, 0, 0,
                      0, 0, 0, 1, 0,
                    ]),
                    child: Container(
                      height: 84 + bottomPad,
                      padding: EdgeInsets.only(
                          top: 8, left: 10, right: 10, bottom: bottomPad + 4),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: dark
                              ? const [
                                  Color(0x80FFFFFF),
                                  Color(0x30FFFFFF),
                                  Color(0x14FFFFFF),
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
                          // Specular: kilau lebar yang bergeser pelan.
                          AnimatedBuilder(
                            animation: _light,
                            builder: (context, _) {
                              final x = -0.35 + 1.7 * _light.value;
                              return Positioned(
                                left: x * MediaQuery.of(context).size.width,
                                top: -18,
                                child: Container(
                                  width: 190,
                                  height: 110,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: RadialGradient(
                                      colors: [
                                        Colors.white.withValues(alpha: .34),
                                        Colors.white.withValues(alpha: .10),
                                        Colors.white.withValues(alpha: 0),
                                      ],
                                      stops: const [0, .45, 1],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                          // Inner bevel di tepi atas (refraction ring).
                          Positioned(
                            top: 0,
                            left: 0,
                            right: 0,
                            child: Container(
                              height: 26,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Colors.white.withValues(
                                        alpha: dark ? .16 : .32),
                                    Colors.white.withValues(alpha: 0),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          _LiquidRim(
                            dark: dark,
                            t: _light,
                          ),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              for (var i = 0; i < widget.items.length; i++)
                                i == 2
                                    ? const SizedBox(width: 64)
                                    : _navIcon(i),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            // FAB tengah: tetesan kaca dengan highlight ikut "cahaya".
            Positioned(
              bottom: 34 + bottomPad,
              child: _FabPress(
                onTap: () => widget.onSelect(2),
                child: AnimatedBuilder(
                  animation: _light,
                  builder: (context, _) {
                    final lx = 0.18 + 0.64 * _light.value;
                    final ly = 0.16 + 0.48 * _light.value;
                    return Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          center: Alignment(lx - .5, ly - .5),
                          radius: 1.1,
                          colors: const [
                            Color(0xFF9FC3E8),
                            kTaskOrangeLight,
                            kTaskOrange,
                          ],
                          stops: const [0, .48, 1],
                        ),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: .95),
                          width: 3,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: kTaskOrange.withValues(alpha: .55),
                            blurRadius: 18,
                            offset: const Offset(0, 7),
                          ),
                          BoxShadow(
                            color: Colors.white.withValues(alpha: .45),
                            blurRadius: 8,
                            spreadRadius: -1,
                          ),
                        ],
                      ),
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          // Specular dot kecil di permukaan kaca.
                          Align(
                            alignment: Alignment(lx * 2 - 1, ly * 2 - 1),
                            child: Container(
                              width: 26,
                              height: 26,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                gradient: RadialGradient(
                                  colors: [
                                    Colors.white.withValues(alpha: .75),
                                    Colors.white.withValues(alpha: 0),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          const Icon(Icons.shopping_bag_outlined,
                              size: 27, color: Colors.white),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),
            // Home indicator
            Positioned(
              bottom: bottomPad + 6,
              child: Container(
                width: 120,
                height: 4,
                decoration: BoxDecoration(
                  color: kTaskDark.withValues(alpha: .85),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _navIcon(int i) {
    final item = widget.items[i];
    final active = widget.current == i;
    return Semantics(
      label: item.label,
      button: true,
      selected: active,
      child: GestureDetector(
        onTap: () => widget.onSelect(i),
        behavior: HitTestBehavior.opaque,
        child: SizedBox(
          width: 56,
          height: 60,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    transitionBuilder: (child, anim) => FadeTransition(
                      opacity: anim,
                      child: ScaleTransition(
                          scale: Tween(begin: 0.6, end: 1.0).animate(anim),
                          child: child),
                    ),
                    child: Icon(
                        active ? item.activeIcon : item.icon,
                        key: ValueKey(active),
                        size: 23,
                        color: active ? kTaskOrange : kTaskGray),
                  ),
                  const SizedBox(height: 3),
                  Text(item.label,
                      style: TextStyle(
                          fontSize: 9,
                          fontWeight:
                              active ? FontWeight.w700 : FontWeight.w500,
                          color: active ? kTaskOrange : kTaskGray)),
                ],
              ),
              AnimatedScale(
                scale: active ? 1.0 : 0.0,
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOutBack,
                child: Container(
                  width: 5,
                  height: 5,
                  decoration: const BoxDecoration(
                      color: kTaskOrange, shape: BoxShape.circle),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Rim atas navbar: garis terang (refraction ring) + chromatic dispersion
/// tipis merah/sian yang ikut arah cahaya, memudar di kedua ujung.
class _LiquidRim extends StatelessWidget {
  const _LiquidRim({required this.dark, required this.t});
  final bool dark;
  final Animation<double> t;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: IgnorePointer(
        child: AnimatedBuilder(
          animation: t,
          builder: (context, _) {
            final dx = (-0.5 + t.value).clamp(-1.0, 1.0);
            return CustomPaint(
              size: Size(MediaQuery.of(context).size.width, 6),
              painter: _LiquidRimPainter(dark: dark, dx: dx),
            );
          },
        ),
      ),
    );
  }
}

class _LiquidRimPainter extends CustomPainter {
  _LiquidRimPainter({required this.dark, required this.dx});
  final bool dark;
  final double dx;

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
    canvas.drawLine(Offset(dx * 2, 1.2), Offset(w + dx * 2, 1.2), red);

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
    canvas.drawLine(Offset(-dx * 2, 4.0), Offset(w - dx * 2, 4.0), cyan);
  }

  @override
  bool shouldRepaint(_LiquidRimPainter old) =>
      old.dark != dark || old.dx != dx;
}

class _FabPress extends StatefulWidget {
  const _FabPress({required this.onTap, required this.child});
  final VoidCallback onTap;
  final Widget child;

  @override
  State<_FabPress> createState() => _FabPressState();
}

class _FabPressState extends State<_FabPress> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _down = true),
      onTapUp: (_) => setState(() => _down = false),
      onTapCancel: () => setState(() => _down = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _down ? 0.88 : 1.0,
        duration: const Duration(milliseconds: 130),
        curve: Curves.easeOutCubic,
        child: widget.child,
      ),
    );
  }
}
