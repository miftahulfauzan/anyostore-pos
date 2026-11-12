import 'package:flutter/material.dart';

import 'api_client.dart';
import 'settings_page.dart';
import 'task_ui.dart';

class SettingsHubPage extends StatelessWidget {
  const SettingsHubPage({super.key, required this.api, this.role});

  final ApiClient api;
  final String? role;

  bool get _canManageStore => ['owner', 'manager', 'admin'].contains(role);

  List<_SettingsHubGroup> _groups() {
    return [
      if (_canManageStore)
        const _SettingsHubGroup(
          title: 'TOKO & INVOICE',
          entries: [
            _SettingsHubEntry(
              section: 'store',
              title: 'Toko & Invoice',
              subtitle: 'Identitas toko, struk, dan logo invoice',
              icon: Icons.storefront_outlined,
            ),
          ],
        ),
      if (_canManageStore)
        const _SettingsHubGroup(
          title: 'PRODUK & INVENTORI',
          entries: [
            _SettingsHubEntry(
              section: 'category',
              title: 'Kategori Produk',
              subtitle: 'Kelola kategori katalog pakaian',
              icon: Icons.sell_outlined,
            ),
          ],
        ),
      const _SettingsHubGroup(
        title: 'OPERASIONAL',
        entries: [
          _SettingsHubEntry(
            section: 'printer',
            title: 'POS & Printer',
            subtitle: 'Printer thermal dan cetak otomatis',
            icon: Icons.print_outlined,
          ),
          _SettingsHubEntry(
            section: 'display',
            title: 'Tampilan',
            subtitle: 'Tema dan ukuran teks aplikasi',
            icon: Icons.display_settings_outlined,
          ),
        ],
      ),
      _SettingsHubGroup(
        title: 'DATA & NOTIFIKASI',
        entries: [
          _SettingsHubEntry(
            section: role == 'owner' ? 'data' : 'notifications',
            title: role == 'owner' ? 'Backup & Data' : 'Notifikasi',
            subtitle: role == 'owner'
                ? 'Backup database dan pengingat stok'
                : 'Pengingat stok menipis',
            icon: role == 'owner'
                ? Icons.storage_outlined
                : Icons.notifications_none_outlined,
          ),
        ],
      ),
      if (role == 'owner')
        const _SettingsHubGroup(
          title: 'ADMINISTRASI',
          entries: [
            _SettingsHubEntry(
              section: 'branches',
              title: 'Cabang & Gudang',
              subtitle: 'Kelola toko, gudang, dan katalog cabang',
              icon: Icons.account_tree_outlined,
            ),
          ],
        ),
    ];
  }

  void _openDetail(BuildContext context, _SettingsHubEntry entry) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => Scaffold(
        backgroundColor: pageBg(context),
        appBar: AppBar(
          title: Text(entry.title),
          backgroundColor: kTaskDark,
          foregroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
        ),
        body: SettingsPage(
          api: api,
          role: role,
          section: entry.section,
        ),
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final groups = _groups();
    return ListView(
      key: const ValueKey('settings-hub-list'),
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Pengaturan',
                  style: TextStyle(
                      color: ink(context),
                      fontSize: 27,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -.5)),
              const SizedBox(height: 4),
              Text('Kelola toko, POS, dan aplikasi Anda.',
                  style: TextStyle(color: taskMuted(context), fontSize: 13)),
            ],
          ),
        ),
        for (final group in groups) _buildGroup(context, group),
      ],
    );
  }

  Widget _buildGroup(BuildContext context, _SettingsHubGroup group) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 5),
            child: Text(group.title,
                style: TextStyle(
                    color: taskMuted(context),
                    fontSize: TaskTypography.micro,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.1)),
          ),
          Container(
            decoration: BoxDecoration(
              color: taskSurface(context),
              border: Border.symmetric(
                horizontal: BorderSide(color: taskBorder(context)),
              ),
            ),
            child: Column(
              children: [
                for (var i = 0; i < group.entries.length; i++) ...[
                  _SettingsHubRow(
                    key: ValueKey(
                        'settings-hub-row-${group.entries[i].section}'),
                    entry: group.entries[i],
                    onTap: () => _openDetail(context, group.entries[i]),
                  ),
                  if (i < group.entries.length - 1)
                    Divider(
                      height: 1,
                      thickness: 1,
                      indent: 68,
                      endIndent: 16,
                      color: taskBorder(context),
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsHubRow extends StatelessWidget {
  const _SettingsHubRow({super.key, required this.entry, required this.onTap});

  final _SettingsHubEntry entry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 68),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: Theme.of(context).brightness == Brightness.dark
                        ? const Color(0xff243B53)
                        : const Color(0xffE8F0FA),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Icon(entry.icon,
                      size: 20, color: Theme.of(context).colorScheme.primary),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(entry.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: ink(context),
                              fontSize: 15,
                              fontWeight: FontWeight.w700)),
                      const SizedBox(height: 3),
                      Text(entry.subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: taskMuted(context),
                              fontSize: TaskTypography.secondary)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(Icons.chevron_right, size: 22, color: taskMuted(context)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SettingsHubGroup {
  const _SettingsHubGroup({required this.title, required this.entries});

  final String title;
  final List<_SettingsHubEntry> entries;
}

class _SettingsHubEntry {
  const _SettingsHubEntry({
    required this.section,
    required this.title,
    required this.subtitle,
    required this.icon,
  });

  final String section;
  final String title;
  final String subtitle;
  final IconData icon;
}
