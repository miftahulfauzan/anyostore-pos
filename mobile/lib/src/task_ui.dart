import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

const kTaskBg = Color(0xffF5F1EA);
const kTaskDark = Color(0xff213F33);
const kTaskOrange = Color(0xffD47E4D);
const kTaskOrangeLight = Color(0xffF4A261);
const kTaskPurple = Color(0xff9D4EDD);
const kTaskGray = Color(0xff8A857C);
const kTaskBorder = Color(0xffE7E0D6);

/// Tab pil ala Task Dashboard: aktif oranye, nonaktif putih.
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
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: tabs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final t = tabs[i];
          final active = t.value == selected;
          return Material(
            color: active ? kTaskOrange : Colors.white,
            borderRadius: BorderRadius.circular(14),
            elevation: active ? 3 : 1,
            shadowColor: active
                ? kTaskOrange.withValues(alpha: .45)
                : const Color(0x14000000),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => onChanged(t.value),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                child: Row(
                  children: [
                    Icon(t.icon,
                        size: 16,
                        color: active ? Colors.white : kTaskGray),
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
          );
        },
      ),
    );
  }
}

/// Blob dekoratif lembut di latar (ungu & oranye).
class SoftBlobs extends StatelessWidget {
  const SoftBlobs({super.key});

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

/// Bottom nav kaca ala Task Dashboard: ikon + FAB tengah oranye.
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
    final bottomPad = MediaQuery.of(context).padding.bottom;
    return SizedBox(
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
                  const BorderRadius.vertical(top: Radius.circular(32)),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                child: Container(
                  height: 84 + bottomPad,
                  padding: EdgeInsets.only(
                      top: 8, left: 10, right: 10, bottom: bottomPad + 4),
                  decoration: const BoxDecoration(
                    color: Color(0xD9FFFFFF),
                    border: Border(top: BorderSide(color: Colors.white)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      for (var i = 0; i < items.length; i++)
                        i == 2 ? const SizedBox(width: 64) : _navIcon(i),
                    ],
                  ),
                ),
              ),
            ),
          ),
          // FAB tengah
          Positioned(
            bottom: 34 + bottomPad,
            child: GestureDetector(
              onTap: () => onSelect(2),
              child: Container(
                width: 62,
                height: 62,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    colors: [kTaskOrangeLight, kTaskOrange],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  boxShadow: [
                    BoxShadow(
                        color: kTaskOrange.withValues(alpha: .5),
                        blurRadius: 16,
                        offset: const Offset(0, 6)),
                  ],
                  border: Border.all(color: Colors.white, width: 4),
                ),
                child: const Text('POS',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.4)),
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
    );
  }

  Widget _navIcon(int i) {
    final item = items[i];
    final active = current == i;
    return Semantics(
      label: item.label,
      button: true,
      selected: active,
      child: GestureDetector(
        onTap: () => onSelect(i),
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
                  Icon(active ? item.activeIcon : item.icon,
                      size: 23, color: active ? kTaskOrange : kTaskGray),
                  const SizedBox(height: 3),
                  Text(item.label,
                      style: TextStyle(
                          fontSize: 9,
                          fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                          color: active ? kTaskOrange : kTaskGray)),
                ],
              ),
              if (active)
                Positioned(
                  bottom: 0,
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
