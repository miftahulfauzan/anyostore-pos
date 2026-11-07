import 'package:flutter/material.dart';

import 'api_client.dart';
import 'category_visuals.dart';
import 'task_ui.dart';

class CategorySettingsCard extends StatefulWidget {
  const CategorySettingsCard({
    super.key,
    required this.api,
    required this.canDelete,
  });

  final ApiClient api;
  final bool canDelete;

  @override
  State<CategorySettingsCard> createState() => _CategorySettingsCardState();
}

class _CategorySettingsCardState extends State<CategorySettingsCard> {
  List<Map<String, dynamic>> _categories = [];
  List<Map<String, dynamic>> _savedCategories = [];
  bool _loading = true;
  bool _saving = false;
  bool _dirty = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _message = null;
    });
    try {
      final rows = await widget.api.productCategories();
      if (!mounted) return;
      final loaded = rows
          .whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList();
      setState(() {
        _categories = loaded;
        _savedCategories = _copyCategories(loaded);
        _dirty = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _message = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<String?> _categoryNameDialog({String initial = ''}) async {
    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        content: _CategoryNameDialog(initial: initial),
      ),
    );
  }

  Future<void> _addCategory() async {
    final name = await _categoryNameDialog();
    if (name == null || name.isEmpty || !mounted) return;
    setState(() => _saving = true);
    try {
      await widget.api.createCategory(name, color: kCategoryColorPresets.first);
      await _load();
      if (!mounted) return;
      notifyCategoryCatalogChanged();
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Kategori berhasil ditambahkan')));
    } on ApiException catch (e) {
      if (mounted) setState(() => _message = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _editCategory(Map<String, dynamic> category) async {
    final id = int.tryParse('${category['id']}');
    if (id == null) return;
    final name =
        await _categoryNameDialog(initial: category['name']?.toString() ?? '');
    if (name == null || name.isEmpty || !mounted) return;
    setState(() {
      category['name'] = name;
      _dirty = true;
      _message = null;
    });
  }

  Future<void> _reorderCategories(int oldIndex, int newIndex) async {
    if (_saving) return;
    final next = List<Map<String, dynamic>>.from(_categories);
    final item = next.removeAt(oldIndex);
    next.insert(newIndex, item);
    setState(() {
      _categories = next;
      _dirty = true;
      _message = null;
    });
  }

  Future<String?> _categoryColorDialog(Map<String, dynamic> category) {
    final current = parseCategoryColor(category['color']?.toString());
    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Warna kategori'),
        content: Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final hex in kCategoryColorPresets)
              Semantics(
                button: true,
                label: 'Pilih warna $hex',
                child: InkWell(
                  key: ValueKey('settings-category-swatch-$hex'),
                  borderRadius: BorderRadius.circular(24),
                  onTap: () => Navigator.pop(dialogContext, hex),
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: parseCategoryColor(hex),
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: current == parseCategoryColor(hex)
                            ? Theme.of(context).colorScheme.onSurface
                            : Colors.transparent,
                        width: 3,
                      ),
                    ),
                    child: current == parseCategoryColor(hex)
                        ? Icon(Icons.check,
                            color: _categoryColorOnSurface(
                                parseCategoryColor(hex)!))
                        : null,
                  ),
                ),
              ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Batal'),
          ),
        ],
      ),
    );
  }

  Future<void> _changeCategoryColor(Map<String, dynamic> category) async {
    final id = int.tryParse('${category['id']}');
    if (id == null || _saving) return;
    final selected = await _categoryColorDialog(category);
    if (selected == null || !mounted) return;
    setState(() {
      category['color'] = selected;
      _dirty = true;
      _message = null;
    });
  }

  List<Map<String, dynamic>> _copyCategories(
          List<Map<String, dynamic>> source) =>
      source.map((category) => Map<String, dynamic>.from(category)).toList();

  List<Map<String, dynamic>> _categoryRowsFrom(dynamic raw) =>
      (raw as List?)
          ?.whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList() ??
      <Map<String, dynamic>>[];

  Map<String, dynamic>? _savedCategory(int id) {
    for (final category in _savedCategories) {
      if (int.tryParse('${category['id']}') == id) return category;
    }
    return null;
  }

  bool _categoryChanged(Map<String, dynamic> category) {
    final id = int.tryParse('${category['id']}');
    if (id == null) return false;
    final saved = _savedCategory(id);
    if (saved == null) return true;
    return saved['name']?.toString() != category['name']?.toString() ||
        saved['color']?.toString() != category['color']?.toString();
  }

  bool _orderChanged() {
    final currentIds = _categories.map((category) => '${category['id']}');
    final savedIds = _savedCategories.map((category) => '${category['id']}');
    return currentIds.join(',') != savedIds.join(',');
  }

  bool _serverMatchesSnapshot(
      List<Map<String, dynamic>> expected, dynamic serverRows) {
    final actual = _copyCategories(_categoryRowsFrom(serverRows));
    final expectedIds = expected.map((category) => '${category['id']}').join(',');
    final actualIds = actual.map((category) => '${category['id']}').join(',');
    if (expectedIds != actualIds) return false;
    final actualById = <String, Map<String, dynamic>>{
      for (final category in actual) '${category['id']}': category,
    };
    for (final category in expected) {
      final actualCategory = actualById['${category['id']}'];
      if (actualCategory == null ||
          actualCategory['name']?.toString() != category['name']?.toString()) {
        return false;
      }
      final expectedColor = category['color']?.toString().trim();
      if (expectedColor != null && expectedColor.isNotEmpty) {
        final actualColor = actualCategory['color']?.toString().trim();
        if (actualColor == null ||
            actualColor.toLowerCase() != expectedColor.toLowerCase()) {
          return false;
        }
      }
    }
    return true;
  }

  Future<void> _saveCategories() async {
    if (!_dirty || _saving) return;
    final snapshot = _copyCategories(_categories);
    final changed = snapshot.where(_categoryChanged).toList();
    final order = snapshot
        .map((category) => int.tryParse('${category['id']}'))
        .whereType<int>()
        .toList();
    setState(() {
      _saving = true;
      _message = null;
    });
    try {
      for (final category in changed) {
        final id = int.tryParse('${category['id']}');
        if (id == null) continue;
        await widget.api.updateCategory(id, category['name']?.toString() ?? '',
            color: category['color']?.toString());
      }
      if (_orderChanged()) await widget.api.reorderCategories(order);
      final persisted = await widget.api.productCategories();
      if (!_serverMatchesSnapshot(snapshot, persisted)) {
        throw ApiException(
            'Server belum menerapkan pengaturan kategori. Backend perlu diperbarui.');
      }
      if (!mounted) return;
      setState(() {
        _savedCategories = _copyCategories(snapshot);
        _dirty = false;
      });
      notifyCategoryCatalogChanged();
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Pengaturan kategori disimpan')));
    } on ApiException catch (e) {
      await _load();
      if (mounted) setState(() => _message = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Color _categoryColor(Map<String, dynamic> category) => categoryColorFor(
        name: category['name']?.toString(),
        storedHex: category['color']?.toString(),
      );

  Color _categoryColorOnSurface(Color color) =>
      ThemeData.estimateBrightnessForColor(color) == Brightness.dark
          ? Colors.white
          : Colors.black87;

  Future<void> _deleteCategory(Map<String, dynamic> category) async {
    final id = int.tryParse('${category['id']}');
    if (id == null) return;
    final name = category['name']?.toString() ?? 'kategori ini';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Hapus kategori?'),
        content: Text('Kategori "$name" akan dihapus.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _saving = true);
    try {
      await widget.api.deleteCategory(id);
      await _load();
      if (!mounted) return;
      notifyCategoryCatalogChanged();
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Kategori berhasil dihapus')));
    } on ApiException catch (e) {
      if (mounted) setState(() => _message = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text('Kategori Produk',
                      style:
                          TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                ),
                FilledButton.icon(
                  key: const ValueKey('settings-add-category'),
                  onPressed: _saving ? null : _addCategory,
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Tambah'),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Kelola kategori yang dipakai saat menambah dan mengedit produk.',
              style: TextStyle(fontSize: 12, color: taskMuted(context)),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              key: const ValueKey('settings-save-categories'),
              onPressed: _dirty && !_saving ? _saveCategories : null,
              icon: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.save_outlined, size: 18),
              label: Text(_saving ? 'Menyimpan...' : 'Simpan perubahan'),
            ),
            if (_loading) ...[
              const SizedBox(height: 12),
              const LinearProgressIndicator(),
            ] else if (_categories.isEmpty) ...[
              const SizedBox(height: 12),
              Text('Belum ada kategori.',
                  style: TextStyle(fontSize: 12, color: taskMuted(context))),
            ] else ...[
              const SizedBox(height: 8),
              ReorderableListView.builder(
                key: const ValueKey('settings-category-reorder'),
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                buildDefaultDragHandles: false,
                itemCount: _categories.length,
                onReorderItem: _reorderCategories,
                itemBuilder: (context, index) {
                  final category = _categories[index];
                  final id = category['id'];
                  final color = _categoryColor(category);
                  final initial = category['name']?.toString().trim();
                  return ReorderableDragStartListener(
                    key: ValueKey('settings-category-$id'),
                    index: index,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: Container(
                          key: ValueKey('settings-category-color-dot-$id'),
                          width: 34,
                          height: 34,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: color,
                            shape: BoxShape.circle,
                          ),
                          child: Text(
                            initial != null && initial.isNotEmpty
                                ? initial[0].toUpperCase()
                                : '?',
                            style: TextStyle(
                              color: _categoryColorOnSurface(color),
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        title: Text(category['name']?.toString() ?? ''),
                        trailing: Wrap(
                          spacing: 0,
                          children: [
                            IconButton(
                              key: ValueKey('settings-category-color-$id'),
                              tooltip: 'Ganti warna kategori',
                              onPressed: _saving
                                  ? null
                                  : () => _changeCategoryColor(category),
                              icon:
                                  const Icon(Icons.palette_outlined, size: 19),
                            ),
                            IconButton(
                              tooltip: 'Edit kategori',
                              onPressed: _saving
                                  ? null
                                  : () => _editCategory(category),
                              icon: const Icon(Icons.edit_outlined, size: 19),
                            ),
                            if (widget.canDelete)
                              IconButton(
                                tooltip: 'Hapus kategori',
                                onPressed: _saving
                                    ? null
                                    : () => _deleteCategory(category),
                                icon:
                                    const Icon(Icons.delete_outline, size: 19),
                              ),
                            const Padding(
                              padding: EdgeInsets.symmetric(horizontal: 6),
                              child: Icon(Icons.drag_indicator, size: 20),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ],
            if (_message != null) ...[
              const SizedBox(height: 6),
              Text(_message!,
                  key: const ValueKey('settings-category-message'),
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
          ],
        ),
      ),
    );
  }
}

class _CategoryNameDialog extends StatefulWidget {
  const _CategoryNameDialog({required this.initial});

  final String initial;

  @override
  State<_CategoryNameDialog> createState() => _CategoryNameDialogState();
}

class _CategoryNameDialogState extends State<_CategoryNameDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initial);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final value = _controller.text.trim();
    if (value.isNotEmpty) Navigator.pop(context, value);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(widget.initial.isEmpty ? 'Tambah Kategori' : 'Edit Kategori',
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 16),
        TextField(
          controller: _controller,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            labelText: 'Nama kategori',
            hintText: 'Contoh: Kemeja',
            border: OutlineInputBorder(),
          ),
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Batal'),
            ),
            const SizedBox(width: 8),
            FilledButton(
              key: const ValueKey('settings-category-dialog-save'),
              onPressed: _submit,
              child: const Text('Simpan'),
            ),
          ],
        ),
      ],
    );
  }
}
