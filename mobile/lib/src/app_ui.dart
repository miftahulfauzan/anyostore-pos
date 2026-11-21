// ignore_for_file: prefer_const_constructors

import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'task_ui.dart';

/// Dekorasi field standar Batch 1: rounded, filled, ikon abu.
/// Warna permukaan menu dropdown yang konsisten di mode terang/gelap.
Color appDropdownColor(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF162132)
        : Colors.white;

InputDecoration appFieldDecoration(
  BuildContext context, {
  String? label,
  String? hint,
  IconData? icon,
  String? helper,
  Widget? suffix,
}) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  final border = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: BorderSide(color: taskBorder(context)),
  );
  return InputDecoration(
    labelText: label,
    hintText: hint,
    helperText: helper,
    isDense: true,
    filled: true,
    fillColor: dark ? const Color(0xFF162132) : const Color(0xFFFBFCFE),
    prefixIcon:
        icon == null ? null : Icon(icon, size: 18, color: taskMuted(context)),
    suffixIcon: suffix,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
    border: border,
    enabledBorder: border,
    focusedBorder: border.copyWith(
        borderSide: BorderSide(
            color: Theme.of(context).colorScheme.primary, width: 1.6)),
    labelStyle: TextStyle(fontSize: 12, color: taskMuted(context)),
    hintStyle: TextStyle(
        fontSize: 12, color: taskMuted(context).withValues(alpha: .72)),
    helperStyle: TextStyle(fontSize: 10, color: taskMuted(context)),
  );
}

class AppField extends StatelessWidget {
  const AppField({
    super.key,
    required this.controller,
    required this.label,
    this.hint,
    this.icon,
    this.maxLines = 1,
    this.keyboard,
    this.formatters,
    this.helper,
    this.onChanged,
    this.obscure = false,
    this.suffix,
    this.textInputAction,
  });

  final TextEditingController controller;
  final String label;
  final String? hint;
  final IconData? icon;
  final int maxLines;
  final TextInputType? keyboard;
  final List<TextInputFormatter>? formatters;
  final String? helper;
  final ValueChanged<String>? onChanged;
  final bool obscure;
  final Widget? suffix;
  final TextInputAction? textInputAction;

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        minLines: 1,
        maxLines: maxLines,
        keyboardType: keyboard,
        inputFormatters: formatters,
        onChanged: onChanged,
        obscureText: obscure,
        textInputAction: textInputAction,
        style: TextStyle(fontSize: 13, color: ink(context)),
        decoration: appFieldDecoration(context,
            label: label,
            hint: hint,
            icon: icon,
            helper: helper,
            suffix: suffix),
      );
}

class AppSearchField extends StatelessWidget {
  const AppSearchField({
    super.key,
    required this.controller,
    required this.hint,
    this.onSubmitted,
    this.onClear,
    this.textInputAction = TextInputAction.search,
  });

  final TextEditingController controller;
  final String hint;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onClear;
  final TextInputAction textInputAction;

  @override
  Widget build(BuildContext context) =>
      ValueListenableBuilder<TextEditingValue>(
        valueListenable: controller,
        builder: (context, value, _) => TextField(
          controller: controller,
          textInputAction: textInputAction,
          onSubmitted: onSubmitted,
          style: TextStyle(fontSize: 13, color: ink(context)),
          decoration: appFieldDecoration(context,
              hint: hint,
              icon: Icons.search_rounded,
              suffix: value.text.isEmpty
                  ? null
                  : IconButton(
                      onPressed: () {
                        controller.clear();
                        onClear?.call();
                      },
                      icon: const Icon(Icons.close_rounded, size: 18),
                      tooltip: 'Hapus pencarian',
                    )),
        ),
      );
}

class AppSectionCard extends StatelessWidget {
  const AppSectionCard({
    super.key,
    required this.icon,
    required this.color,
    required this.title,
    this.hint,
    required this.children,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String? hint;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => GlassCard(
        child: Padding(
          padding: const EdgeInsets.all(13),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: .12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(icon, size: 14, color: color),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                  ),
                  if (hint != null)
                    Flexible(
                      child: Text(hint!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w600,
                              color: taskMuted(context))),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              ...children,
            ],
          ),
        ),
      );
}

/// Satu pilihan untuk [AppSelectField].
class AppSelectField<T> extends StatefulWidget {
  const AppSelectField({
    super.key,
    required this.value,
    required this.items,
    required this.onChanged,
    this.decoration,
    this.enabled = true,
    this.fieldChild,
    this.itemBuilder,
    this.darkMenu = false,
    this.transparentField = false,
    this.maxMenuHeight = 340,
    this.style,
    this.labelBuilder,
  });

  final T? value;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?>? onChanged;
  final InputDecoration? decoration;
  final bool enabled;
  final Widget? fieldChild;
  final Widget Function(BuildContext, DropdownMenuItem<T>, bool)? itemBuilder;
  final bool darkMenu;
  final bool transparentField;
  final double maxMenuHeight;
  final TextStyle? style;
  final String Function(DropdownMenuItem<T>)? labelBuilder;

  @override
  State<AppSelectField<T>> createState() => _AppSelectFieldState<T>();
}

class _AppSelectFieldState<T> extends State<AppSelectField<T>> {
  String _labelOf(DropdownMenuItem<T> item) {
    if (widget.labelBuilder != null) return widget.labelBuilder!(item);
    final child = item.child;
    if (child is Text) return child.data ?? '';
    return item.value?.toString() ?? '';
  }

  DropdownMenuItem<T>? get _selected {
    for (final item in widget.items) {
      if (item.value == widget.value) return item;
    }
    return null;
  }

  bool get _isDark => Theme.of(context).brightness == Brightness.dark;

  Future<void> _open() async {
    if (!widget.enabled || widget.onChanged == null || widget.items.isEmpty) {
      return;
    }
    final box = context.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return;
    final overlay =
        Overlay.of(context).context.findRenderObject() as RenderBox?;
    if (overlay == null) return;
    final origin = box.localToGlobal(Offset.zero, ancestor: overlay);
    final screen = overlay.size;
    final insets = MediaQuery.viewInsetsOf(context).bottom;
    final visibleBottom = screen.height - insets - 10;
    final maxWidth = screen.width - 24;
    final width =
        (box.size.width < 240 ? 240.0 : box.size.width).clamp(180.0, maxWidth);
    final left = origin.dx.clamp(12.0, screen.width - width - 12);
    const rowHeight = 48.0;
    final contentHeight = widget.items.length * rowHeight + 8;
    final maxHeight = widget.maxMenuHeight.clamp(160.0, screen.height * .64);
    final menuHeight = contentHeight < maxHeight ? contentHeight : maxHeight;
    const gap = 6.0;
    final below = origin.dy + box.size.height + gap;
    final above = origin.dy - menuHeight - gap;
    final openAbove = below + menuHeight > visibleBottom && above > 12;
    final top = openAbove ? above : below;

    final selectedValue = widget.value;
    await showDialog<void>(
      context: context,
      barrierColor: Colors.transparent,
      barrierDismissible: true,
      useSafeArea: false,
      builder: (dialogContext) => _AppSelectOverlay<T>(
        left: left,
        top: top,
        width: width,
        height: menuHeight,
        items: widget.items,
        selectedValue: selectedValue,
        darkMenu: widget.darkMenu,
        itemBuilder: widget.itemBuilder,
        labelOf: _labelOf,
        onPick: (value) {
          Navigator.of(dialogContext).pop();
          widget.onChanged?.call(value);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    final disabled = !widget.enabled || widget.onChanged == null;
    final base = widget.decoration;
    final rounded = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: taskBorder(context)),
    );
    final decoration = (base ?? const InputDecoration()).copyWith(
      isDense: true,
      filled: true,
      fillColor: _isDark ? const Color(0xFF162132) : const Color(0xFFFBFCFE),
      contentPadding: base?.contentPadding ??
          const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
      border: rounded,
      enabledBorder: rounded,
      disabledBorder: rounded,
      focusedBorder: rounded.copyWith(
        borderSide: BorderSide(
            color: Theme.of(context).colorScheme.primary, width: 1.6),
      ),
      suffixIcon: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (base?.suffixIcon != null) base!.suffixIcon!,
          Icon(Icons.keyboard_arrow_down_rounded,
              size: 20,
              color: disabled
                  ? taskMuted(context).withValues(alpha: .5)
                  : taskMuted(context)),
          const SizedBox(width: 6),
        ],
      ),
      suffixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
    );

    final label = selected == null ? '' : _labelOf(selected);
    Widget field = InputDecorator(
      decoration: decoration,
      isEmpty: false,
      child: widget.fieldChild ??
          Text(
            label.isEmpty ? (widget.decoration?.hintText ?? '') : label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: widget.style ??
                TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: label.isEmpty
                      ? taskMuted(context).withValues(alpha: .72)
                      : ink(context),
                ),
          ),
    );
    if (widget.transparentField) {
      field = Row(
        children: [
          Expanded(child: widget.fieldChild ?? field),
          Icon(Icons.keyboard_arrow_down_rounded,
              size: 20,
              color: disabled
                  ? taskMuted(context).withValues(alpha: .5)
                  : taskMuted(context)),
        ],
      );
    }

    return Semantics(
      button: true,
      enabled: !disabled,
      label: widget.decoration?.labelText,
      child: Opacity(
        opacity: disabled ? .6 : 1,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: disabled ? null : _open,
            borderRadius: BorderRadius.circular(12),
            child: field,
          ),
        ),
      ),
    );
  }
}

class _AppSelectOverlay<T> extends StatelessWidget {
  const _AppSelectOverlay({
    required this.left,
    required this.top,
    required this.width,
    required this.height,
    required this.items,
    required this.selectedValue,
    required this.darkMenu,
    required this.itemBuilder,
    required this.labelOf,
    required this.onPick,
  });

  final double left;
  final double top;
  final double width;
  final double height;
  final List<DropdownMenuItem<T>> items;
  final T? selectedValue;
  final bool darkMenu;
  final Widget Function(BuildContext, DropdownMenuItem<T>, bool)? itemBuilder;
  final String Function(DropdownMenuItem<T>) labelOf;
  final ValueChanged<T?> onPick;

  @override
  Widget build(BuildContext context) {
    final dark = darkMenu || Theme.of(context).brightness == Brightness.dark;
    final surface = dark ? const Color(0xFF162132) : Colors.white;
    final accent = dark ? const Color(0xFF5EEAD4) : const Color(0xFF0F766E);
    final fg = dark ? Colors.white : const Color(0xFF0F172A);
    final sub = dark ? const Color(0xB3FFFFFF) : const Color(0xFF64748B);
    final border = dark ? const Color(0x24FFFFFF) : const Color(0xE6FFFFFF);
    final screen = MediaQuery.sizeOf(context);
    final animate = !MediaQuery.disableAnimationsOf(context);

    Widget content = ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          decoration: BoxDecoration(
            color: surface.withValues(alpha: .95),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: border, width: 1),
            boxShadow: [
              BoxShadow(
                color: dark ? const Color(0x66000000) : const Color(0x2E1E3A5F),
                blurRadius: 28,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: Scrollbar(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final item in items)
                    _row(context, item, accent, fg, sub),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    if (animate) {
      content = TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOutCubic,
        builder: (context, value, child) => Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, -4 * (1 - value)),
            child: child,
          ),
        ),
        child: content,
      );
    }

    return SizedBox(
      width: screen.width,
      height: screen.height,
      child: Stack(
        children: [
          Positioned(
            left: left,
            top: top,
            width: width,
            height: height,
            child: content,
          ),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, DropdownMenuItem<T> item, Color accent,
      Color fg, Color sub) {
    final selected = item.value == selectedValue;
    final enabled = item.enabled;
    final custom = itemBuilder?.call(context, item, selected);
    final Widget child = custom ??
        (item.child is Text
            ? Text(
                labelOf(item),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                  color: enabled ? fg : sub,
                ),
              )
            : item.child);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      child: Material(
        color: selected ? accent.withValues(alpha: .10) : Colors.transparent,
        borderRadius: BorderRadius.circular(13),
        child: InkWell(
          onTap: enabled ? () => onPick(item.value) : null,
          borderRadius: BorderRadius.circular(13),
          child: Container(
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(13),
              border: Border.all(
                color: selected
                    ? accent.withValues(alpha: .32)
                    : Colors.transparent,
              ),
            ),
            child: Row(
              children: [
                Expanded(child: child),
                if (selected)
                  Container(
                    width: 22,
                    height: 22,
                    decoration:
                        BoxDecoration(color: accent, shape: BoxShape.circle),
                    child: Icon(Icons.check_rounded,
                        size: 14,
                        color: accent == const Color(0xFF5EEAD4)
                            ? const Color(0xFF0F3B2E)
                            : Colors.white),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class AppStatusPill extends StatelessWidget {
  const AppStatusPill({
    super.key,
    required this.label,
    required this.fg,
    required this.bg,
    this.icon,
  });

  final String label;
  final Color fg;
  final Color bg;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(99),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 10, color: fg),
              const SizedBox(width: 3),
            ],
            Text(label,
                style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    letterSpacing: .02,
                    color: fg)),
          ],
        ),
      );
}

class AppAvatar extends StatelessWidget {
  const AppAvatar({
    super.key,
    required this.text,
    required this.fg,
    required this.bg,
    this.size = 38,
    this.radius = 11,
  });

  final String text;
  final Color fg;
  final Color bg;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(radius),
        ),
        child: Text(text,
            style: TextStyle(
                fontSize: size * .36, fontWeight: FontWeight.w800, color: fg)),
      );
}

class AppListCard extends StatelessWidget {
  const AppListCard({
    super.key,
    required this.child,
    this.onTap,
    this.tint,
    this.margin = const EdgeInsets.only(bottom: 6),
  });

  final Widget child;
  final VoidCallback? onTap;
  final Color? tint;
  final EdgeInsets margin;

  @override
  Widget build(BuildContext context) => Padding(
        padding: margin,
        child: Material(
          color: tint ?? taskSurface(context),
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.fromLTRB(9, 8, 6, 8),
              decoration: BoxDecoration(
                border: Border.all(color: taskBorder(context)),
                borderRadius: BorderRadius.circular(12),
                color: tint,
              ),
              child: child,
            ),
          ),
        ),
      );
}

class AppEmptyState extends StatelessWidget {
  const AppEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: GlassCard(
          radius: 16,
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: primary.withValues(alpha: .1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, size: 24, color: primary),
              ),
              const SizedBox(height: 10),
              Text(title,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: ink(context))),
              if (message != null) ...[
                const SizedBox(height: 4),
                Text(message!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 11, height: 1.45, color: taskMuted(context))),
              ],
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: onAction,
                  icon: const Icon(Icons.add, size: 18),
                  label: Text(actionLabel!),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 42),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class AppKebab extends StatelessWidget {
  const AppKebab(
      {super.key,
      required this.onSelected,
      required this.items,
      this.tooltip = 'Aksi'});

  final ValueChanged<String> onSelected;
  final List<PopupMenuEntry<String>> items;
  final String tooltip;

  @override
  Widget build(BuildContext context) => PopupMenuButton<String>(
        tooltip: tooltip,
        padding: EdgeInsets.zero,
        icon: Icon(Icons.more_vert, size: 18, color: taskMuted(context)),
        onSelected: onSelected,
        itemBuilder: (_) => items,
      );
}

String appInitial(String value) {
  final text = value.trim();
  return text.isEmpty ? '?' : text.characters.first.toUpperCase();
}

const _blueFg = Color(0xFF1D4ED8);
const _blueBg = Color(0xFFDBEAFE);
const _blueFgDark = Color(0xFF93C5FD);
const _amberFg = Color(0xFFB45309);
const _amberBg = Color(0xFFFEF3C7);
const _amberFgDark = Color(0xFFFCD34D);
const _purpleFg = Color(0xFF6D28D9);
const _purpleBg = Color(0xFFEDE9FE);
const _purpleFgDark = Color(0xFFC4B5FD);
const _greenFg = Color(0xFF137A43);
const _greenBg = Color(0xFFDCFCE7);
const _greenFgDark = Color(0xFF86EFAC);
const _redFg = Color(0xFFBE123C);
const _redBg = Color(0xFFFFE4E6);
const _redFgDark = Color(0xFFFDA4AF);
const _slateFg = Color(0xFF334155);
const _slateBg = Color(0xFFE2E8F0);
const _slateFgDark = Color(0xFFCBD5E1);

bool _isDark(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark;

({String label, Color fg, Color bg}) appTierStyle(
    BuildContext context, Object? tier) {
  final dark = _isDark(context);
  return switch ('$tier') {
    'semi_grosir' => (
        label: 'Semi Grosir',
        fg: dark ? _amberFgDark : _amberFg,
        bg: dark ? const Color(0x2EFCD34D) : _amberBg,
      ),
    'grosir_seri' => (
        label: 'Grosir Seri',
        fg: dark ? _purpleFgDark : _purpleFg,
        bg: dark ? const Color(0x2EC4B5FD) : _purpleBg,
      ),
    _ => (
        label: 'Reguler',
        fg: dark ? _blueFgDark : _blueFg,
        bg: dark ? const Color(0x2E93C5FD) : _blueBg,
      ),
  };
}

({String label, Color fg, Color bg}) appRoleStyle(
    BuildContext context, Object? role) {
  final dark = _isDark(context);
  return switch ('$role') {
    'owner' => (
        label: 'Owner',
        fg: dark ? _blueFgDark : const Color(0xFF1E3A5F),
        bg: dark ? const Color(0x2E93C5FD) : const Color(0xFFE8F0FA),
      ),
    'manager' => (
        label: 'Manager',
        fg: dark ? _purpleFgDark : _purpleFg,
        bg: dark ? const Color(0x2EC4B5FD) : _purpleBg,
      ),
    'admin' => (
        label: 'Admin',
        fg: dark ? _greenFgDark : _greenFg,
        bg: dark ? const Color(0x2E86EFAC) : _greenBg,
      ),
    'gudang' => (
        label: 'Gudang',
        fg: dark ? _amberFgDark : _amberFg,
        bg: dark ? const Color(0x2EFCD34D) : _amberBg,
      ),
    'host' => (
        label: 'Host',
        fg: dark ? _slateFgDark : _slateFg,
        bg: dark ? const Color(0x2ECBD5E1) : _slateBg,
      ),
    _ => (
        label: 'Kasir',
        fg: dark ? _blueFgDark : _blueFg,
        bg: dark ? const Color(0x2E93C5FD) : _blueBg,
      ),
  };
}

({String label, Color fg, Color bg}) appStockStyle(
    BuildContext context, num stock, num minStock) {
  final dark = _isDark(context);
  if (stock <= 0) {
    return (
      label: 'Habis',
      fg: dark ? _redFgDark : _redFg,
      bg: dark ? const Color(0x2EFDA4AF) : _redBg,
    );
  }
  if (stock <= minStock) {
    return (
      label: 'Menipis',
      fg: dark ? _amberFgDark : _amberFg,
      bg: dark ? const Color(0x2EFCD34D) : _amberBg,
    );
  }
  return (
    label: 'Tersedia',
    fg: dark ? _greenFgDark : _greenFg,
    bg: dark ? const Color(0x2E86EFAC) : _greenBg,
  );
}

({String label, Color fg, Color bg}) appActiveStyle(
    BuildContext context, bool active) {
  final dark = _isDark(context);
  return active
      ? (
          label: 'Aktif',
          fg: dark ? _greenFgDark : _greenFg,
          bg: dark ? const Color(0x2E86EFAC) : _greenBg,
        )
      : (
          label: 'Nonaktif',
          fg: dark ? _redFgDark : _redFg,
          bg: dark ? const Color(0x2EFDA4AF) : _redBg,
        );
}
