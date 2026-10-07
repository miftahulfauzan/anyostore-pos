import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';

import 'media_helpers.dart';
import 'task_ui.dart';

/// Satu sumber nama yang ditampilkan di UI. SKU tetap tersedia sebagai
/// informasi sekunder, tetapi tidak pernah menggantikan nama produk.
String productDisplayName(Map<String, dynamic> product) {
  final name = product['name']?.toString().trim();
  return name == null || name.isEmpty ? 'Produk tanpa nama' : name;
}

String productSecondaryLabel(Map<String, dynamic> product) {
  final variant = product['variant_label']?.toString().trim();
  if (variant != null && variant.isNotEmpty) return variant;
  final color = product['color']?.toString().trim();
  if (color != null && color.isNotEmpty) return color;
  return '';
}

/// Menjaga layout sempit tetap muat secara horizontal, tetapi tidak ikut
/// mengecil hanya karena tinggi layar pendek. Konten yang panjang tetap dapat
/// di-scroll sehingga ukuran teks lebih mudah dibaca.
double responsiveLayoutScale(Size viewport) {
  final widthScale = viewport.width / 390;
  final heightScale = math.max(.9, viewport.height / 844);
  return math.min(widthScale, heightScale).clamp(.82, 1.15).toDouble();
}

/// Kompensasi tipografi untuk layar ponsel. Layout sudah diskalakan agar
/// muat, tetapi teks tetap dibuat sedikit lebih ringkas supaya form dan kartu
/// tidak cepat memenuhi layar. Faktor aksesibilitas sistem tetap diterapkan
/// oleh MediaQuery di root aplikasi.
double mobileTextScale(Size viewport) => viewport.width < 600 ? .92 : 1;

/// Renderer foto produk bersama untuk grid, list, kartu mutasi, dan opname.
/// Placeholder memiliki ukuran tetap agar daftar tidak bergeser saat foto
/// belum selesai dimuat atau gagal diambil.
class UiProductPhoto extends StatelessWidget {
  const UiProductPhoto({
    required this.path,
    required this.baseUrl,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.label = 'Foto produk',
    super.key,
  });

  final String? path;
  final String baseUrl;
  final double? width;
  final double? height;
  final BoxFit fit;
  final String label;

  Widget _placeholder(BuildContext context) => ColoredBox(
        color: Theme.of(context).brightness == Brightness.dark
            ? const Color(0xff263241)
            : kTaskSand,
        child: Center(
          child: Icon(Icons.image_not_supported_outlined,
              size: 22, color: taskMuted(context)),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final imageUrl = stockProductMediaUrl(path, baseUrl: baseUrl);
    final cacheWidth = ((width ?? 180) * 2).round().clamp(90, 840).toInt();
    return Semantics(
      image: true,
      label: label,
      child: SizedBox(
        width: width,
        height: height,
        child: imageUrl.isEmpty
            ? _placeholder(context)
            : CachedNetworkImage(
                imageUrl: imageUrl,
                fit: fit,
                memCacheWidth: cacheWidth,
                fadeInDuration: Duration.zero,
                fadeOutDuration: Duration.zero,
                placeholder: (_, __) => _placeholder(context),
                errorWidget: (_, __, ___) => _placeholder(context),
              ),
      ),
    );
  }
}

class UiLoadingState extends StatelessWidget {
  const UiLoadingState({this.label = 'Memuat data…', super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Semantics(
        liveRegion: true,
        label: label,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
            const SizedBox(height: 12),
            Text(label,
                style: TextStyle(
                    color: taskMuted(context),
                    fontSize: 13,
                    fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class UiErrorState extends StatelessWidget {
  const UiErrorState({required this.message, this.onRetry, super.key});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: GlassCard(
          padding: const EdgeInsets.all(18),
          radius: 18,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off_outlined,
                  size: 28, color: Theme.of(context).colorScheme.error),
              const SizedBox(height: 10),
              Text(message,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: ink(context),
                      fontSize: 14,
                      fontWeight: FontWeight.w700)),
              if (onRetry != null) ...[
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Coba lagi'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class UiEmptyState extends StatelessWidget {
  const UiEmptyState({required this.title, this.message, this.icon, super.key});

  final String title;
  final String? message;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon ?? Icons.inventory_2_outlined,
                size: 34, color: taskMuted(context)),
            const SizedBox(height: 10),
            Text(title,
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: ink(context),
                    fontSize: 15,
                    fontWeight: FontWeight.w800)),
            if (message != null && message!.trim().isNotEmpty) ...[
              const SizedBox(height: 5),
              Text(message!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: taskMuted(context), fontSize: 13, height: 1.35)),
            ],
          ],
        ),
      ),
    );
  }
}
