import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'api_client.dart';
import 'task_ui.dart';
import 'ui_kit.dart';

class LinkPageSettings extends StatefulWidget {
  const LinkPageSettings(
      {super.key, required this.api, required this.branchId});
  final ApiClient api;
  final int branchId;

  @override
  State<LinkPageSettings> createState() => _LinkPageSettingsState();
}

class _LinkPageSettingsState extends State<LinkPageSettings> {
  final _fields = <String, TextEditingController>{};
  Map<String, dynamic> _config = {};
  Map<String, dynamic> _stats = {};
  bool _loading = true;
  bool _saving = false;
  bool _uploading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final field in _fields.values) {
      field.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await widget.api.linkPageConfig(widget.branchId);
      final data =
          Map<String, dynamic>.from(result['data'] as Map? ?? const {});
      final stats =
          Map<String, dynamic>.from(data.remove('stats') as Map? ?? const {});
      for (final key in const [
        'title',
        'subtitle',
        'address',
        'hours',
        'min_order',
        'background'
      ]) {
        _fields.putIfAbsent(key, TextEditingController.new).text =
            data[key]?.toString() ?? '';
      }
      if (!mounted) return;
      setState(() {
        _config = data;
        _stats = stats;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final config = {
        ..._config,
        for (final entry in _fields.entries) entry.key: entry.value.text.trim(),
      };
      await widget.api.saveLinkPage(widget.branchId, config);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Halaman link disimpan')));
      await _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _uploadImage({String? itemId, bool avatar = false}) async {
    final image = await ImagePicker().pickImage(
        source: ImageSource.gallery, imageQuality: 82, maxWidth: 1600);
    if (image == null || !mounted) return;
    final extension = image.name.split('.').last.toLowerCase();
    final mime = switch (extension) {
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'webp' => 'image/webp',
      _ => '',
    };
    final bytes = await image.readAsBytes();
    if (!mounted) return;
    if (mime.isEmpty || bytes.length > 3 * 1024 * 1024) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Pilih JPG, PNG, atau WebP maksimal 3 MB')));
      return;
    }
    setState(() => _uploading = true);
    try {
      final base64 = base64Encode(bytes);
      if (avatar) {
        final result = await widget.api
            .uploadLinkPageAvatar(widget.branchId, mime, image.name, base64);
        _config['avatar'] = result['data']?['avatar'] ?? '';
      } else {
        final result =
            await widget.api.uploadLinkPageMedia(mime, image.name, base64);
        final path = result['data']?['path'] ?? '';
        if (itemId == 'background') {
          _config['background'] = path;
          _config['background_type'] = 'image';
          _fields['background']?.text = path;
        } else {
          final links = _links;
          final index = links.indexWhere((link) => link['id'] == itemId);
          if (index >= 0) {
            links[index]['logo'] = path;
            _config['links'] = links;
          }
        }
      }
      if (mounted) setState(() {});
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _editEntry({
    int? index,
    bool social = false,
    String initialType = 'link',
  }) async {
    final entries = social ? _social : _links;
    final entry = index == null
        ? <String, dynamic>{
            'id': 'item-${DateTime.now().microsecondsSinceEpoch}',
            'type': initialType,
            'label': '',
            'url': '',
            'icon': 'link',
            'layout': '',
            'logo': '',
            'active': true,
          }
        : Map<String, dynamic>.from(entries[index]);
    final label = TextEditingController(text: '${entry['label'] ?? ''}');
    final url = TextEditingController(text: '${entry['url'] ?? ''}');
    var type = '${entry['type'] ?? initialType}';
    var icon = '${entry['icon'] ?? 'link'}';
    var layout = '${entry['layout'] ?? ''}';
    var active = entry['active'] != false;
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: Text(index == null
              ? (social ? 'Tambah ikon sosial' : 'Tambah item')
              : 'Ubah item'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!social)
                  DropdownButtonFormField<String>(
                    initialValue: type,
                    decoration: const InputDecoration(labelText: 'Jenis'),
                    items: const [
                      DropdownMenuItem(value: 'link', child: Text('Tautan')),
                      DropdownMenuItem(value: 'text', child: Text('Teks')),
                      DropdownMenuItem(
                          value: 'divider', child: Text('Pembatas')),
                    ],
                    onChanged: (value) =>
                        setDialogState(() => type = value ?? 'link'),
                  ),
                if (type != 'divider') ...[
                  TextField(
                    controller: label,
                    maxLength: 120,
                    decoration: const InputDecoration(labelText: 'Label'),
                  ),
                  if (type == 'link') ...[
                    TextField(
                      controller: url,
                      maxLength: 1000,
                      keyboardType: TextInputType.url,
                      decoration: const InputDecoration(labelText: 'URL'),
                    ),
                    DropdownButtonFormField<String>(
                      initialValue: icon,
                      decoration: const InputDecoration(labelText: 'Ikon'),
                      items: const [
                        'whatsapp',
                        'channel',
                        'instagram',
                        'tiktok',
                        'shopee',
                        'toco',
                        'pdf',
                        'catalog',
                        'phone',
                        'map',
                        'email',
                        'link'
                      ]
                          .map((value) => DropdownMenuItem(
                              value: value, child: Text(value)))
                          .toList(),
                      onChanged: (value) =>
                          setDialogState(() => icon = value ?? 'link'),
                    ),
                    if (!social)
                      DropdownButtonFormField<String>(
                        initialValue: layout,
                        decoration:
                            const InputDecoration(labelText: 'Layout kartu'),
                        items: const [
                          DropdownMenuItem(
                              value: '', child: Text('Ikuti halaman')),
                          DropdownMenuItem(value: 'list', child: Text('List')),
                          DropdownMenuItem(value: 'grid', child: Text('Grid')),
                          DropdownMenuItem(
                              value: 'carousel', child: Text('Carousel')),
                          DropdownMenuItem(
                              value: 'showcase', child: Text('Showcase')),
                        ],
                        onChanged: (value) =>
                            setDialogState(() => layout = value ?? ''),
                      ),
                  ],
                ],
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Aktif'),
                  value: active,
                  onChanged: (value) => setDialogState(() => active = value),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Batal')),
            FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Simpan')),
          ],
        ),
      ),
    );
    if (saved == true && mounted) {
      entry.addAll({
        'type': social ? 'link' : type,
        'label': label.text.trim(),
        'url': url.text.trim(),
        'icon': icon,
        'layout': layout,
        'active': active,
      });
      final next = [...entries];
      if (index == null) {
        next.add(entry);
      } else {
        next[index] = entry;
      }
      setState(() => _config[social ? 'social' : 'links'] = next);
    }
    label.dispose();
    url.dispose();
  }

  Future<void> _resetStats() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset statistik?'),
        content: const Text('Data view dan klik untuk toko ini akan dihapus.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Batal')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Reset')),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await widget.api.resetLinkPageStats(widget.branchId);
      await _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _exportStats() async {
    final views = _stats['views_by_day'] as List? ?? const [];
    final clicks = _stats['clicks'] as List? ?? const [];
    String cell(Object? value) => '"${'${value ?? ''}'.replaceAll('"', '""')}"';
    final rows = <List<Object?>>[
      ['LAPORAN STATISTIK HALAMAN LINK'],
      ['Total View', _stats['total_views'] ?? 0],
      [],
      ['Tanggal', 'View'],
      ...views.map((row) => [row['date'], row['views']]),
      [],
      ['Item', 'Klik', 'Terakhir diklik'],
      ...clicks.map((row) => [
            row['label'] ?? row['item_id'],
            row['clicks'],
            row['last_clicked_at']
          ]),
    ];
    final csv =
        '\ufeff${rows.map((row) => row.map(cell).join(',')).join('\n')}';
    final file = File(
        '${(await getTemporaryDirectory()).path}/statistik-halaman-link.csv');
    await file.writeAsString(csv);
    await Share.shareXFiles([XFile(file.path)], text: 'Statistik Halaman Link');
  }

  List<Map<String, dynamic>> get _links =>
      (_config['links'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();
  List<Map<String, dynamic>> get _social =>
      (_config['social'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();

  @override
  Widget build(BuildContext context) {
    if (_loading) return const UiLoadingState(label: 'Memuat halaman link…');
    if (_error != null) return UiErrorState(message: _error!, onRetry: _load);
    final url = 'https://anyostore.my.id/link?branch_id=${widget.branchId}';
    final clicks = _stats['clicks'] as List? ?? const [];
    return ColoredBox(
      color: pageBg(context),
      child: Stack(children: [
        const Positioned.fill(child: SoftBlobs()),
        ListView(
          padding: const EdgeInsets.all(12),
          children: [
            GlassCard(
              radius: 18,
              padding: const EdgeInsets.all(14),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Halaman link toko',
                        style: TextStyle(
                            color: ink(context),
                            fontSize: 17,
                            fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    SelectableText(url,
                        style:
                            TextStyle(color: taskMuted(context), fontSize: 12)),
                    Wrap(spacing: 8, children: [
                      OutlinedButton.icon(
                          onPressed: () async {
                            final messenger = ScaffoldMessenger.of(context);
                            await Clipboard.setData(ClipboardData(text: url));
                            if (!mounted) return;
                            messenger.showSnackBar(
                                const SnackBar(content: Text('URL disalin')));
                          },
                          icon: const Icon(Icons.copy),
                          label: const Text('Salin URL')),
                      OutlinedButton.icon(
                          onPressed: () => Share.share(url),
                          icon: const Icon(Icons.share_outlined),
                          label: const Text('Bagikan')),
                    ]),
                  ]),
            ),
            const SizedBox(height: 10),
            _panel('Informasi toko', [
              for (final entry in const [
                ('title', 'Judul', 120),
                ('subtitle', 'Deskripsi', 300),
                ('address', 'Alamat', 300),
                ('hours', 'Jam operasional', 120),
                ('min_order', 'Minimal order', 160),
              ])
                TextField(
                  controller: _fields[entry.$1],
                  maxLength: entry.$3,
                  decoration: InputDecoration(labelText: entry.$2),
                ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Tampilkan alamat, jam, dan minimal order'),
                value: _config['show_info'] != false,
                onChanged: (value) =>
                    setState(() => _config['show_info'] = value),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Avatar toko'),
                subtitle: Text(_config['avatar']?.toString().isNotEmpty == true
                    ? 'Foto sudah dipilih'
                    : 'Belum ada foto'),
                trailing: IconButton(
                    onPressed:
                        _uploading ? null : () => _uploadImage(avatar: true),
                    icon: const Icon(Icons.photo_library_outlined)),
              ),
            ]),
            const SizedBox(height: 10),
            _panel('Tampilan', [
              _select('Tema', 'theme', const {
                'denim': 'Denim',
                'dark': 'Hitam elegan',
                'light': 'Terang minimalis',
                'sage': 'Sage hijau'
              }),
              _select('Layout halaman', 'layout', const {
                'list': 'List',
                'grid': 'Grid',
                'carousel': 'Carousel',
                'showcase': 'Showcase'
              }),
              _select('Latar belakang', 'background_type', const {
                'theme': 'Ikuti tema',
                'image': 'Foto',
                'gradient': 'Gradient'
              }),
              if (_config['background_type'] == 'gradient')
                TextField(
                    controller: _fields['background'],
                    decoration:
                        const InputDecoration(labelText: 'CSS gradient')),
              if (_config['background_type'] == 'image')
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Foto latar'),
                  subtitle: Text(_fields['background']?.text.isNotEmpty == true
                      ? 'Foto sudah dipilih'
                      : 'Belum ada foto'),
                  trailing: IconButton(
                      onPressed: _uploading
                          ? null
                          : () => _uploadImage(itemId: 'background'),
                      icon: const Icon(Icons.photo_library_outlined)),
                ),
            ]),
            const SizedBox(height: 10),
            _panel('Ikon sosial (${_social.length}/8)', [
              for (var i = 0; i < _social.length; i++)
                _entryTile(_social[i],
                    onEdit: () => _editEntry(index: i, social: true),
                    onDelete: () => setState(
                        () => _config['social'] = [..._social]..removeAt(i))),
              Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton.icon(
                      onPressed: _social.length >= 8
                          ? null
                          : () => _editEntry(social: true),
                      icon: const Icon(Icons.add),
                      label: const Text('Tambah ikon'))),
            ]),
            const SizedBox(height: 10),
            _panel('Daftar item (${_links.length}/40)', [
              ReorderableListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _links.length,
                onReorderItem: (oldIndex, newIndex) => setState(() {
                  final items = _links;
                  final item = items.removeAt(oldIndex);
                  items.insert(newIndex, item);
                  _config['links'] = items;
                }),
                itemBuilder: (context, index) {
                  final item = _links[index];
                  return _entryTile(item,
                      key: ValueKey(item['id']),
                      onEdit: () => _editEntry(index: index),
                      onDelete: () => setState(() =>
                          _config['links'] = [..._links]..removeAt(index)),
                      onLogo: item['type'] == 'link'
                          ? () => _uploadImage(itemId: '${item['id']}')
                          : null);
                },
              ),
              Wrap(spacing: 8, children: [
                OutlinedButton.icon(
                    onPressed: _links.length >= 40 ? null : () => _editEntry(),
                    icon: const Icon(Icons.add),
                    label: const Text('Tautan')),
                OutlinedButton.icon(
                    onPressed: _links.length >= 40
                        ? null
                        : () => _editEntry(initialType: 'text'),
                    icon: const Icon(Icons.title),
                    label: const Text('Teks')),
                OutlinedButton.icon(
                    onPressed: _links.length >= 40
                        ? null
                        : () => _editEntry(initialType: 'divider'),
                    icon: const Icon(Icons.horizontal_rule),
                    label: const Text('Pembatas')),
                OutlinedButton.icon(
                    onPressed: _links.length >= 40
                        ? null
                        : () => setState(() => _config['links'] = [
                              ..._links,
                              {
                                'id':
                                    'catalog-${DateTime.now().microsecondsSinceEpoch}',
                                'type': 'link',
                                'label': 'Lihat Katalog',
                                'url': '/#produk',
                                'icon': 'catalog',
                                'logo': '',
                                'layout': '',
                                'active': true,
                              }
                            ]),
                    icon: const Icon(Icons.menu_book_outlined),
                    label: const Text('Lihat katalog')),
              ]),
            ]),
            const SizedBox(height: 10),
            _panel('Statistik 14 hari terakhir', [
              Text('Total view: ${_stats['total_views'] ?? 0}',
                  style: TextStyle(
                      color: ink(context), fontWeight: FontWeight.w700)),
              for (final row in (_stats['views_by_day'] as List? ?? const []))
                ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text('${row['date'] ?? ''}'),
                    trailing: Text('${row['views'] ?? 0} view')),
              const Divider(),
              for (final row in clicks.take(12))
                ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text('${row['label'] ?? row['item_id'] ?? ''}'),
                    trailing: Text('${row['clicks'] ?? 0} klik')),
              Wrap(spacing: 8, children: [
                OutlinedButton.icon(
                    onPressed: _exportStats,
                    icon: const Icon(Icons.download_outlined),
                    label: const Text('Unduh CSV')),
                TextButton.icon(
                    onPressed: _resetStats,
                    icon: const Icon(Icons.restart_alt),
                    label: const Text('Reset statistik')),
              ]),
            ]),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52)),
              icon: const Icon(Icons.save_outlined),
              label: Text(_saving ? 'Menyimpan…' : 'Simpan Halaman Link'),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ]),
    );
  }

  Widget _panel(String title, List<Widget> children) => GlassCard(
        radius: 18,
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title,
              style:
                  TextStyle(color: ink(context), fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          ...children,
        ]),
      );

  Widget _select(String label, String key, Map<String, String> options) {
    final current = '${_config[key] ?? options.keys.first}';
    return DropdownButtonFormField<String>(
      initialValue: options.containsKey(current) ? current : options.keys.first,
      decoration: InputDecoration(labelText: label),
      items: options.entries
          .map((entry) =>
              DropdownMenuItem(value: entry.key, child: Text(entry.value)))
          .toList(),
      onChanged: (value) =>
          setState(() => _config[key] = value ?? options.keys.first),
    );
  }

  Widget _entryTile(Map<String, dynamic> item,
          {Key? key,
          required VoidCallback onEdit,
          required VoidCallback onDelete,
          VoidCallback? onLogo}) =>
      ListTile(
        key: key,
        contentPadding: EdgeInsets.zero,
        leading: Icon(
            item['type'] == 'divider' ? Icons.horizontal_rule : Icons.link),
        title: Text(
            item['label']?.toString().isNotEmpty == true
                ? '${item['label']}'
                : 'Item tanpa label',
            maxLines: 1,
            overflow: TextOverflow.ellipsis),
        subtitle: Text(
            item['type'] == 'divider'
                ? 'Pembatas'
                : '${item['url'] ?? item['type'] ?? ''}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis),
        trailing: PopupMenuButton<String>(
          onSelected: (value) {
            if (value == 'edit') onEdit();
            if (value == 'delete') onDelete();
            if (value == 'logo') onLogo?.call();
          },
          itemBuilder: (_) => [
            const PopupMenuItem(value: 'edit', child: Text('Ubah')),
            if (onLogo != null)
              const PopupMenuItem(value: 'logo', child: Text('Upload logo')),
            const PopupMenuItem(value: 'delete', child: Text('Hapus')),
          ],
        ),
        onTap: onEdit,
      );
}
