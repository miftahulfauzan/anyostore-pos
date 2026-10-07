String stockProductPhotoPath(Map<String, dynamic> product) {
  for (final key in ['photo_path', 'photo_url', 'photo', 'image']) {
    final value = _mediaPathValue(product[key]);
    if (value.isNotEmpty) return value;
  }
  for (final key in ['photos', 'media']) {
    final photos = product[key];
    if (photos is Iterable) {
      for (final photo in photos) {
        final value = _mediaPathValue(photo);
        if (value.isNotEmpty) return value;
      }
    }
  }
  return '';
}

String _mediaPathValue(Object? value) {
  if (value is Map) {
    for (final key in ['path', 'url', 'photo_path', 'photo_url']) {
      final nested = value[key]?.toString().trim() ?? '';
      if (nested.isNotEmpty) return nested;
    }
    return '';
  }
  return value?.toString().trim() ?? '';
}

String stockProductMediaUrl(String? path, {required String baseUrl}) {
  final raw = path?.trim() ?? '';
  if (raw.isEmpty) return '';
  if (RegExp(r'^https?://', caseSensitive: false).hasMatch(raw)) return raw;
  final base = baseUrl
      .trim()
      .replaceFirst(RegExp(r'/api/?$'), '')
      .replaceFirst(RegExp(r'/$'), '');
  var relative = raw.replaceFirst(RegExp(r'^/api(?=/uploads(?:/|$))'), '');
  relative = relative.replaceFirst(RegExp(r'^/+'), '');
  if (!relative.startsWith('uploads/')) relative = 'uploads/$relative';
  return '$base/$relative';
}
