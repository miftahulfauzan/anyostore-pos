// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'account_switcher_page.dart';
import 'activity_log_page.dart';
import 'api_client.dart';
import 'app_navigation.dart';
import 'auth_store.dart';
import 'branch_scope.dart';
import 'cash_drawer_page.dart';
import 'commissions_page.dart';
import 'customers_page.dart';
import 'dashboard_page.dart';
import 'inventory_page.dart';
import 'link_page_settings.dart';
import 'mutation_report_page.dart';
import 'profile_page.dart';
import 'products_page.dart';
import 'stock_movements_page.dart';
import 'offline_queue_page.dart';
import 'offline_store.dart';
import 'promotions_page.dart';
import 'reports_page.dart';
import 'settings_page.dart';
import 'users_page.dart';
import 'task_ui.dart';
import 'transfer_history_page.dart';

const _kInk = kTaskInk;
const _kMuted = kTaskSecondary;
const _kBorder = kTaskBorder;

class MorePage extends StatelessWidget {
  const MorePage({
    super.key,
    required this.api,
    required this.branchId,
    this.role,
    this.currentTab = 0,
    this.onNavigateTab,
  });
  final ApiClient api;
  final int branchId;
  final String? role;
  final int currentTab;
  final ValueChanged<int>? onNavigateTab;

  Widget _scaffold(BuildContext context, String title, Widget child) =>
      Scaffold(
        backgroundColor: pageBg(context),
        appBar: AppBar(
          surfaceTintColor: Colors.transparent,
          title: Text(title),
        ),
        body: child,
      );

  Widget _group(BuildContext context, String title, List<Widget> rows) {
    return _MoreMenuGroup(
      key: ValueKey('more-menu-$title'),
      title: title,
      rows: rows,
      initiallyExpanded: title == 'UTAMA',
    );
  }

  Future<void> _confirmLogout(BuildContext context, AuthStore auth) async {
    final choice = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Keluar'),
        children: [
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx, 'keep'),
            child: const Text('Keluar saja (akun tetap tersimpan)'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx, 'remove'),
            child: const Text('Keluar & hapus akun ini dari HP'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Batal'),
          ),
        ],
      ),
    );
    if (choice == 'remove') {
      await auth.logout(removeFromList: true);
    } else if (choice == 'keep') {
      await auth.logout();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthStore>();
    final name = auth.userName ?? 'Pengguna';
    final email = auth.email ?? '';
    final isOwner = auth.role == 'owner';
    final permissions = AppPermissions(auth.role);
    int activeBranch() => BranchScope.active.value ?? branchId;
    if (isOwner) api.activeBranchId = BranchScope.active.value;

    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
      children: [
        // Profil header
        GlassCard(
          padding: const EdgeInsets.all(16),
          radius: 12,
          child: Row(
            children: [
              BrandLogo(api: api, size: 56, radius: 28),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: ink(context))),
                    const SizedBox(height: 3),
                    Text(
                        switch (auth.role) {
                          'gudang' => 'Akun gudang',
                          'owner' => 'Owner',
                          'manager' => 'Manager',
                          'admin' => 'Admin',
                          _ => 'Kasir',
                        },
                        style:
                            TextStyle(color: taskMuted(context), fontSize: 12)),
                    if (email.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(email,
                          style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(context).brightness ==
                                      Brightness.dark
                                  ? const Color(0xffCBD5E1)
                                  : _kMuted)),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
        if (isOwner) ...[
          const SizedBox(height: 12),
          _BranchScopeCard(api: api),
        ],
        const SizedBox(height: 12),
        _OfflineTile(api: api),
        const SizedBox(height: 12),
        if (auth.role == 'gudang') ...[
          _group(context, 'UTAMA', [
            _row(context, Icons.dashboard_outlined, 'Dashboard', kTaskSand,
                kTaskDark, () => _navigateTab(context, 0),
                selected: currentTab == 0),
          ]),
          _group(context, 'TRANSAKSI', [
            _row(
                context,
                Icons.inventory_2_outlined,
                'Master Produk',
                kTaskSand,
                kTaskDark,
                () => _open(context, 'Master Produk',
                    ProductsPage(api: api, branchId: activeBranch()))),
            _divider(context),
            _row(
                context,
                Icons.move_to_inbox_outlined,
                'Stok Masuk',
                kTaskSand,
                kTaskDark,
                () => _open(
                    context,
                    'Stok Masuk',
                    InventoryPage(
                        api: api,
                        branchId: activeBranch(),
                        role: auth.role,
                        initialSection: 'incoming'),
                    showPageHeader: false)),
            _divider(context),
            _row(
                context,
                Icons.outbox_outlined,
                'Stok Keluar',
                kTaskSand,
                kTaskDark,
                () => _open(
                    context,
                    'Stok Keluar',
                    InventoryPage(
                        api: api,
                        branchId: activeBranch(),
                        role: auth.role,
                        initialSection: 'outgoing'),
                    showPageHeader: false)),
            _divider(context),
            _row(
                context,
                Icons.fact_check_outlined,
                'Stok Opname',
                kTaskSand,
                kTaskDark,
                () => _open(
                    context,
                    'Stok Opname',
                    InventoryPage(
                        api: api,
                        branchId: activeBranch(),
                        role: auth.role,
                        initialSection: 'opname'))),
          ]),
          _group(context, 'GUDANG', [
            _row(
                context,
                Icons.warehouse_outlined,
                'Manajemen Gudang',
                kTaskSand,
                kTaskDark,
                () => _open(
                    context,
                    'Manajemen Gudang',
                    InventoryPage(
                        api: api,
                        branchId: activeBranch(),
                        role: auth.role,
                        initialSection: 'stok'))),
            _divider(context),
            _row(
                context,
                Icons.swap_horiz,
                'Transfer Gudang',
                kTaskSand,
                kTaskDark,
                () => _open(
                    context,
                    'Transfer Gudang',
                    InventoryPage(
                        api: api,
                        branchId: activeBranch(),
                        role: auth.role,
                        initialSection: 'transfer'))),
            _divider(context),
            _row(
                context,
                Icons.history,
                'Riwayat Transfer',
                kTaskSand,
                kTaskDark,
                () => _open(context, 'Riwayat Transfer',
                    TransferHistoryPage(api: api))),
          ]),
          _group(context, 'LAINNYA', [
            _row(
                context,
                Icons.swap_vert,
                'Riwayat Mutasi',
                kTaskSand,
                kTaskDark,
                () => _open(context, 'Riwayat Mutasi',
                    MutationReportPage(api: api, showPageTitle: false))),
            _divider(context),
            _row(
                context,
                Icons.bar_chart_outlined,
                'Laporan Lainnya',
                kTaskSand,
                kTaskDark,
                () => _open(context, 'Laporan Lainnya',
                    StockMovementsPage(api: api, branchId: activeBranch()))),
            _divider(context),
            _row(
                context,
                Icons.settings_outlined,
                'Pengaturan',
                kTaskSand,
                kTaskDark,
                () => _open(context, 'Pengaturan',
                    SettingsPage(api: api, role: auth.role))),
          ]),
          _group(context, 'AKUN', [
            _row(
                context,
                Icons.person_outline,
                'Akun Saya',
                kTaskSand,
                kTaskDark,
                () => _open(context, 'Akun Saya', ProfilePage(api: api))),
            _divider(context),
            _row(
                context,
                Icons.swap_horiz,
                'Ganti Akun',
                kTaskSand,
                kTaskDark,
                () =>
                    _open(context, 'Ganti Akun', const AccountSwitcherPage())),
          ]),
        ] else ...[
          _group(context, 'UTAMA', [
            if (permissions.sales)
              _row(context, Icons.point_of_sale, 'POS', kTaskSand, kTaskDark,
                  () => _navigateTab(context, 0),
                  selected: currentTab == 0),
            _divider(context),
            _row(
                context,
                Icons.dashboard_outlined,
                'Dashboard',
                kTaskSand,
                kTaskDark,
                () => _navigateTab(context, permissions.sales ? 1 : 0),
                selected: currentTab == (permissions.sales ? 1 : 0)),
            if (permissions.sales) ...[
              _divider(context),
              _row(context, Icons.receipt_long_outlined, 'Transaksi', kTaskSand,
                  kTaskDark, () => _navigateTab(context, 2),
                  selected: currentTab == 2),
            ],
            if (permissions.finance) ...[
              _divider(context),
              _row(
                  context,
                  Icons.account_balance_wallet_outlined,
                  'Keuangan',
                  kTaskSand,
                  kTaskDark,
                  () => _navigateTab(context, permissions.sales ? 3 : 0),
                  selected: currentTab == (permissions.sales ? 3 : 0)),
            ],
          ]),
          _group(context, 'PRODUK & INVENTORI', [
            if (auth.role != 'gudang' && permissions.viewActivity) ...[
              _row(
                  context,
                  Icons.dashboard_customize_outlined,
                  'Dashboard Stok',
                  kTaskSand,
                  _kInk,
                  () => _open(
                      context, 'Dashboard Stok', DashboardPage(api: api))),
              _divider(context),
            ],
            _row(
                context,
                Icons.inventory_2_outlined,
                'Daftar Produk',
                kTaskSand,
                kTaskDark,
                () => _open(context, 'Daftar Produk',
                    ProductsPage(api: api, branchId: activeBranch()))),
            _divider(context),
            _row(
                context,
                Icons.qr_code_scanner,
                'Cetak Barcode',
                kTaskSand,
                kTaskDark,
                () => _open(
                    context,
                    'Cetak Barcode',
                    InventoryPage(
                        api: api,
                        branchId: activeBranch(),
                        role: auth.role,
                        initialSection: 'barcode'))),
            _divider(context),
            _row(context, Icons.warehouse_outlined, 'Stok Produk', kTaskSand,
                kTaskDark, () {
              if (auth.role == 'gudang') {
                _navigateTab(context, 1);
                return;
              }
              _open(
                  context,
                  'Stok Produk',
                  InventoryPage(
                      api: api,
                      branchId: activeBranch(),
                      role: auth.role,
                      initialSection: 'stok'));
            }, selected: auth.role == 'gudang' && currentTab == 1),
            _divider(context),
            _row(
                context,
                Icons.move_to_inbox_outlined,
                'Stok Masuk',
                kTaskSand,
                kTaskDark,
                () => _open(
                    context,
                    'Stok Masuk',
                    InventoryPage(
                        api: api,
                        branchId: activeBranch(),
                        role: auth.role,
                        initialSection: 'incoming'),
                    showPageHeader: false)),
            _divider(context),
            _row(
                context,
                Icons.outbox_outlined,
                'Stok Keluar',
                kTaskSand,
                kTaskDark,
                () => _open(
                    context,
                    'Stok Keluar',
                    InventoryPage(
                        api: api,
                        branchId: activeBranch(),
                        role: auth.role,
                        initialSection: 'outgoing'),
                    showPageHeader: false)),
            _divider(context),
            _row(
                context,
                Icons.swap_horiz,
                'Transfer Stok',
                kTaskSand,
                kTaskDark,
                () => _open(
                    context,
                    'Transfer Stok',
                    InventoryPage(
                        api: api,
                        branchId: activeBranch(),
                        role: auth.role,
                        initialSection: 'transfer'))),
            _divider(context),
            if (auth.role != 'kasir') ...[
              _row(
                  context,
                  Icons.history,
                  'Riwayat Transfer',
                  kTaskSand,
                  kTaskDark,
                  () => _open(context, 'Riwayat Transfer',
                      TransferHistoryPage(api: api))),
              _divider(context),
            ],
            _row(
                context,
                Icons.fact_check_outlined,
                'Stok Opname',
                kTaskSand,
                kTaskDark,
                () => _open(
                    context,
                    'Stok Opname',
                    InventoryPage(
                        api: api,
                        branchId: activeBranch(),
                        role: auth.role,
                        initialSection: 'opname'))),
            _divider(context),
            _row(
                context,
                Icons.history,
                'Riwayat Stok',
                kTaskSand,
                kTaskDark,
                () => _open(context, 'Riwayat Stok',
                    StockMovementsPage(api: api, branchId: activeBranch()))),
            _divider(context),
            _row(
                context,
                Icons.swap_vert,
                'Riwayat Mutasi',
                kTaskSand,
                kTaskDark,
                () => _open(context, 'Riwayat Mutasi',
                    MutationReportPage(api: api, showPageTitle: false))),
          ]),
          if (permissions.viewActivity ||
              permissions.finance ||
              permissions.sales ||
              permissions.managePromotions)
            _group(context, 'BISNIS', [
              if (permissions.viewActivity) ...[
                _row(
                    context,
                    Icons.bar_chart_outlined,
                    'Laporan',
                    kTaskSand,
                    kTaskDark,
                    () => _open(context, 'Laporan',
                        ReportsPage(api: api, role: auth.role))),
              ],
              if (permissions.managePromotions) ...[
                _divider(context),
                _row(
                    context,
                    Icons.local_offer_outlined,
                    'Promo & Diskon',
                    kTaskSand,
                    kTaskDark,
                    () => _open(
                        context, 'Promo & Diskon', PromotionsPage(api: api))),
              ],
              if (auth.role == 'owner') ...[
                _divider(context),
                _row(
                    context,
                    Icons.receipt_long_outlined,
                    'Laporan Pajak',
                    kTaskSand,
                    kTaskDark,
                    () => _open(
                        context,
                        'Laporan Pajak',
                        ReportsPage(
                            api: api, role: auth.role, initialSection: 'ppn'))),
              ],
              if (permissions.sales) ...[
                _divider(context),
                _row(
                    context,
                    Icons.people_outline,
                    'Pelanggan',
                    kTaskSand,
                    kTaskDark,
                    () => _open(context, 'Pelanggan', CustomersPage(api: api))),
              ],
              if (permissions.finance) ...[
                _divider(context),
                _row(context, Icons.payments, 'Laci Kas', kTaskSand, kTaskDark,
                    () => _open(context, 'Laci Kas', CashDrawerPage(api: api))),
              ],
            ]),
          if (permissions.manageUsers ||
              permissions.viewActivity ||
              permissions.ownCommission)
            _group(context, 'ADMINISTRASI', [
              _row(
                  context,
                  Icons.payments_outlined,
                  role == 'owner' ? 'Komisi Staf' : 'Komisi Saya',
                  kTaskSand,
                  kTaskDark,
                  () => _open(
                      context,
                      'Komisi',
                      CommissionsPage(
                          api: api, branchId: activeBranch(), role: role))),
              if (permissions.manageUsers) ...[
                _divider(context),
                _row(
                    context,
                    Icons.badge_outlined,
                    'Pegawai & Akses',
                    kTaskSand,
                    kTaskDark,
                    () => _open(
                        context,
                        'Pegawai',
                        UsersPage(
                            api: api, branchId: activeBranch(), role: role))),
              ],
              if (auth.role == 'owner') ...[
                _divider(context),
                _row(
                    context,
                    Icons.link,
                    'Halaman Link',
                    kTaskSand,
                    kTaskDark,
                    () => _open(context, 'Halaman Link',
                        LinkPageSettings(api: api, branchId: activeBranch()))),
              ],
              _divider(context),
              _row(
                  context,
                  Icons.settings_outlined,
                  auth.role == 'gudang' ? 'Printer & tampilan' : 'Pengaturan',
                  kTaskSand,
                  _kInk,
                  () => _open(context, 'Pengaturan',
                      SettingsPage(api: api, role: auth.role))),
              _divider(context),
              _row(
                  context,
                  Icons.person_outline,
                  'Akun Saya',
                  kTaskSand,
                  kTaskDark,
                  () => _open(context, 'Akun Saya', ProfilePage(api: api))),
              _divider(context),
              _row(
                  context,
                  Icons.swap_horiz,
                  'Ganti Akun',
                  kTaskSand,
                  kTaskDark,
                  () => _open(
                      context, 'Ganti Akun', const AccountSwitcherPage())),
              if (permissions.viewActivity) ...[
                _divider(context),
                _row(
                    context,
                    Icons.receipt_long_outlined,
                    'Riwayat Aktivitas',
                    kTaskSand,
                    kTaskDark,
                    () => _open(context, 'Riwayat Aktivitas',
                        ActivityLogPage(api: api))),
              ],
            ]),
        ],
        const SizedBox(height: 14),
        // Keluar di paling bawah.
        GlassCard(
          padding: EdgeInsets.zero,
          radius: 12,
          child: InkWell(
            onTap: () => _confirmLogout(context, auth),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: Theme.of(context).brightness == Brightness.dark
                          ? const Color(0xff4A2F2A)
                          : const Color(0xffF8E9E4),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.logout,
                        size: 17,
                        color: Theme.of(context).brightness == Brightness.dark
                            ? const Color(0xffF2B8A5)
                            : kTaskTerracotta),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text('Keluar',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color:
                                Theme.of(context).brightness == Brightness.dark
                                    ? const Color(0xffF2B8A5)
                                    : kTaskTerracotta)),
                  ),
                  Icon(Icons.chevron_right,
                      size: 18, color: taskMuted(context)),
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: EdgeInsets.only(top: 20, bottom: 8),
          child: Text('Anyostore App v0.2.0',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 10,
                  color: Theme.of(context).brightness == Brightness.dark
                      ? const Color(0xff8A8F98)
                      : _kMuted)),
        ),
      ],
    );
  }

  Widget _divider(BuildContext context) => Divider(
        height: 1,
        thickness: 1,
        color: Theme.of(context).brightness == Brightness.dark
            ? const Color(0xff334155)
            : _kBorder,
        indent: 16,
        endIndent: 16,
      );

  Widget _row(BuildContext context, IconData icon, String title, Color chipBg,
      Color chipFg, VoidCallback onTap,
      {bool selected = false}) {
    final active = Theme.of(context).colorScheme.primary;
    final fg = selected
        ? Theme.of(context).colorScheme.onPrimary
        : taskMuted(context);
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 44),
        margin: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: selected
            ? BoxDecoration(
                color: active,
                borderRadius: BorderRadius.circular(10),
              )
            : null,
        child: Row(
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                color: Colors.transparent,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 18, color: fg),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(title,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                      color: selected
                          ? Theme.of(context).colorScheme.onPrimary
                          : ink(context))),
            ),
            Icon(Icons.chevron_right,
                size: 18,
                color: selected
                    ? Theme.of(context).colorScheme.onPrimary
                    : taskMuted(context)),
          ],
        ),
      ),
    );
  }

  void _navigateTab(BuildContext context, int index) {
    Scaffold.maybeOf(context)?.closeDrawer();
    onNavigateTab?.call(index);
  }

  void _open(BuildContext context, String title, Widget child,
      {bool showPageHeader = true}) {
    final navigator = Navigator.of(context);
    Scaffold.maybeOf(context)?.closeDrawer();
    navigator.push(MaterialPageRoute(
        builder: (_) =>
            showPageHeader ? _scaffold(context, title, child) : child));
  }
}

class _MoreMenuGroup extends StatefulWidget {
  const _MoreMenuGroup({
    super.key,
    required this.title,
    required this.rows,
    required this.initiallyExpanded,
  });

  final String title;
  final List<Widget> rows;
  final bool initiallyExpanded;

  @override
  State<_MoreMenuGroup> createState() => _MoreMenuGroupState();
}

class _MoreMenuGroupState extends State<_MoreMenuGroup> {
  late bool _expanded = widget.initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final active = Theme.of(context).colorScheme.primary;

    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: SizedBox(
                height: 44,
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.title,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.2,
                          color: _expanded
                              ? active
                              : dark
                                  ? const Color(0xffCBD5E1)
                                  : kTaskSecondary,
                        ),
                      ),
                    ),
                    Icon(
                      _expanded ? Icons.expand_less : Icons.expand_more,
                      size: 20,
                      color: _expanded ? active : taskMuted(context),
                    ),
                  ],
                ),
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: _expanded
                ? Padding(
                    padding: const EdgeInsets.only(left: 4),
                    child: Column(children: widget.rows),
                  )
                : const SizedBox(width: double.infinity),
          ),
          Divider(
            height: 8,
            indent: 12,
            endIndent: 12,
            color: dark ? const Color(0xff334155) : kTaskBorder,
          ),
        ],
      ),
    );
  }
}

class _OfflineTile extends StatefulWidget {
  const _OfflineTile({required this.api});
  final ApiClient api;

  @override
  State<_OfflineTile> createState() => _OfflineTileState();
}

class _OfflineTileState extends State<_OfflineTile> {
  int _count = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final c = await OfflineStore.countAll();
      if (mounted) setState(() => _count = c);
    } catch (_) {
      if (mounted) setState(() => _count = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      radius: 12,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      onTap: () async {
        final navigator = Navigator.of(context);
        Scaffold.maybeOf(context)?.closeDrawer();
        await navigator.push(MaterialPageRoute(
            builder: (_) => OfflineQueuePage(api: widget.api)));
        await _load();
      },
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.tertiary,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.cloud_off,
                size: 17, color: taskMuted(context)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text('Antrean Offline',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: ink(context))),
          ),
          if (_count > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary,
                borderRadius: BorderRadius.circular(99),
              ),
              child: Text('$_count',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Theme.of(context).colorScheme.onPrimary)),
            )
          else
            Icon(Icons.chevron_right, size: 18, color: taskMuted(context)),
        ],
      ),
    );
  }
}

/// Pemilih Toko/Gudang aktif (khusus owner): semua pengaturan di Lainnya
/// otomatis memakai cabang yang dipilih ini.
class _BranchScopeCard extends StatefulWidget {
  const _BranchScopeCard({required this.api});
  final ApiClient api;

  @override
  State<_BranchScopeCard> createState() => _BranchScopeCardState();
}

class _BranchScopeCardState extends State<_BranchScopeCard> {
  List<Map<String, dynamic>> _branches = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    widget.api.activeBranchId = BranchScope.active.value;
    BranchScope.active.addListener(_onBranchScopeChanged);
    _load();
  }

  void _onBranchScopeChanged() {
    widget.api.activeBranchId = BranchScope.active.value;
    if (mounted) setState(() {});
  }

  Future<void> _load() async {
    try {
      final rows = await widget.api.branches();
      if (!mounted) return;
      setState(() => _branches = rows.cast<Map<String, dynamic>>());
      if (BranchScope.active.value == null && _branches.isNotEmpty) {
        BranchScope.set(int.tryParse('${_branches.first['id']}'));
        widget.api.activeBranchId = BranchScope.active.value;
      }
    } on ApiException catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    BranchScope.active.removeListener(_onBranchScopeChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const SizedBox.shrink();
    return GlassCard(
      padding: const EdgeInsets.all(12),
      radius: 12,
      child: Row(
        children: [
          Icon(Icons.storefront,
              size: 18, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Text('Toko/Gudang aktif',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: taskMuted(context))),
          ),
          const SizedBox(width: 8),
          DropdownButton<int?>(
            value: BranchScope.active.value,
            underline: const SizedBox.shrink(),
            items: [
              for (final b in _branches)
                DropdownMenuItem<int?>(
                    value: int.tryParse('${b['id']}'),
                    child: Text(b['name']?.toString() ?? '',
                        style: const TextStyle(fontSize: 12))),
            ],
            onChanged: (v) {
              BranchScope.set(v);
            },
          ),
        ],
      ),
    );
  }
}
