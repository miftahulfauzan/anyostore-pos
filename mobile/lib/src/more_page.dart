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
import 'mutation_report_page.dart';
import 'profile_page.dart';
import 'products_page.dart';
import 'stock_movements_page.dart';
import 'offline_queue_page.dart';
import 'offline_store.dart';
import 'promotions_page.dart';
import 'reports_page.dart';
import 'settings_hub_page.dart';
import 'users_page.dart';
import 'task_ui.dart';
import 'transfer_history_page.dart';

const _kInk = kTaskInk;

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
      title: _groupTitle(title),
      icon: _groupIcon(title),
      rows: rows,
      initiallyExpanded: true,
    );
  }

  String _groupTitle(String title) => switch (title) {
        'UTAMA' => 'Operasional',
        'TRANSAKSI' => 'Transaksi & Stok',
        'GUDANG' => 'Gudang',
        'LAINNYA' => 'Laporan',
        'AKUN' => 'Pengaturan',
        'PRODUK & INVENTORI' => 'Produk & Inventori',
        'BISNIS' => 'Laporan',
        'ADMINISTRASI' => 'Pengaturan',
        _ => title,
      };

  IconData _groupIcon(String title) => switch (title) {
        'UTAMA' => Icons.assignment_outlined,
        'TRANSAKSI' => Icons.inventory_2_outlined,
        'GUDANG' => Icons.warehouse_outlined,
        'LAINNYA' || 'BISNIS' => Icons.bar_chart_outlined,
        'AKUN' || 'ADMINISTRASI' => Icons.settings_outlined,
        'PRODUK & INVENTORI' => Icons.inventory_2_outlined,
        _ => Icons.folder_outlined,
      };

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
      key: const ValueKey('mobile-more-menu-list'),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      children: [
        // Profil header
        Container(
          key: const ValueKey('sidebar-profile'),
          padding: const EdgeInsets.fromLTRB(4, 12, 4, 16),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: kDrawerBorder)),
          ),
          child: Row(
            children: [
              BrandLogo(api: api, size: 52, radius: 16),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: Colors.white)),
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
                            const TextStyle(color: kDrawerLabel, fontSize: 11)),
                    if (email.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(email,
                          style: const TextStyle(
                              fontSize: 11, color: kDrawerIcon)),
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
        const SizedBox(height: 10),
        _OfflineTile(api: api),
        const SizedBox(height: 4),
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
            if (canManageStockMutations(auth.role)) ...[
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
            ],
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
                    TransferHistoryPage(api: api, role: auth.role))),
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
                    SettingsHubPage(api: api, role: auth.role))),
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
            if (canManageStockMutations(auth.role)) ...[
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
            ],
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
                      TransferHistoryPage(api: api, role: auth.role))),
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
              _divider(context),
              _row(
                  context,
                  Icons.settings_outlined,
                  auth.role == 'gudang' ? 'Printer & tampilan' : 'Pengaturan',
                  kTaskSand,
                  _kInk,
                  () => _open(context, 'Pengaturan',
                      SettingsHubPage(api: api, role: auth.role))),
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
        const SizedBox(height: 10),
        // Keluar di paling bawah.
        Container(
          key: const ValueKey('sidebar-logout'),
          margin: const EdgeInsets.only(top: 12),
          decoration: BoxDecoration(
            border: Border.all(color: kDrawerBorder),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(8),
              onTap: () => _confirmLogout(context, auth),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.logout, size: 18, color: Colors.white),
                    SizedBox(width: 8),
                    Text('Keluar',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.white)),
                  ],
                ),
              ),
            ),
          ),
        ),
        Padding(
          padding: EdgeInsets.only(top: 12, bottom: 8),
          child: Text('Anyostore App v0.2.0',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 10, color: kDrawerLabel)),
        ),
      ],
    );
  }

  // Web tidak memakai garis pemisah antar item; cukup jarak antar grup.
  Widget _divider(BuildContext context) => const SizedBox.shrink();

  // Gaya sama dengan sidebar web: ikon polos, item aktif = tint putih 14%
  // dengan garis kiri 3px biru muda; tanpa kotak ikon.
  Widget _row(BuildContext context, IconData icon, String title, Color chipBg,
      Color chipFg, VoidCallback onTap,
      {bool selected = false}) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 40),
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
          decoration: selected
              ? const BoxDecoration(
                  color: kDrawerActiveBg,
                  borderRadius: BorderRadius.only(
                    topRight: Radius.circular(8),
                    bottomRight: Radius.circular(8),
                  ),
                  border: Border(
                    left: BorderSide(color: kDrawerActiveBar, width: 3),
                  ),
                )
              : null,
          child: Row(
            children: [
              Icon(icon,
                  size: 19, color: selected ? kDrawerActiveIcon : kDrawerIcon),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                    color: selected ? Colors.white : kDrawerText,
                  ),
                ),
              ),
            ],
          ),
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
    required this.icon,
    required this.rows,
    required this.initiallyExpanded,
  });

  final String title;
  final IconData icon;
  final List<Widget> rows;
  final bool initiallyExpanded;

  @override
  State<_MoreMenuGroup> createState() => _MoreMenuGroupState();
}

class _MoreMenuGroupState extends State<_MoreMenuGroup> {
  late bool _expanded = widget.initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Container(
        key: ValueKey('more-menu-card-${widget.title}'),
        padding: const EdgeInsets.only(top: 8),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: kDrawerDivider)),
        ),
        child: Column(
          children: [
            InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () => setState(() => _expanded = !_expanded),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 44),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          widget.title,
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.2,
                            color: kDrawerLabel,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(
                        _expanded ? Icons.expand_less : Icons.expand_more,
                        size: 20,
                        color: kDrawerIcon,
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
                  ? Column(children: widget.rows)
                  : const SizedBox(width: double.infinity),
            ),
          ],
        ),
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
    return Container(
      key: const ValueKey('sidebar-offline'),
      decoration: BoxDecoration(
        color: const Color(0x12FFFFFF),
        border: Border.all(color: kDrawerBorder),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () async {
            final navigator = Navigator.of(context);
            Scaffold.maybeOf(context)?.closeDrawer();
            await navigator.push(MaterialPageRoute(
                builder: (_) => OfflineQueuePage(api: widget.api)));
            await _load();
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: kDrawerActiveBg,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child:
                      const Icon(Icons.cloud_off, size: 17, color: kDrawerIcon),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text('Antrean Offline',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: kDrawerText)),
                ),
                if (_count > 0)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: kDrawerActiveBar,
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text('$_count',
                        style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF0F2540))),
                  )
                else
                  const Icon(Icons.chevron_right, size: 18, color: kDrawerIcon),
              ],
            ),
          ),
        ),
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
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      key: const ValueKey('sidebar-branch-scope'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0x12FFFFFF),
        border: Border.all(color: kDrawerBorder),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(Icons.storefront,
              size: 18, color: dark ? kTaskAccentDark : kTaskDark),
          const SizedBox(width: 10),
          Expanded(
            child: Text('Toko/Gudang aktif',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: taskMuted(context))),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 120,
            child: DropdownButton<int?>(
              isExpanded: true,
              value: BranchScope.active.value,
              underline: const SizedBox.shrink(),
              items: [
                const DropdownMenuItem<int?>(
                    value: null, child: Text('Semua toko/gudang')),
                for (final b in _branches)
                  DropdownMenuItem<int?>(
                      value: int.tryParse('${b['id']}'),
                      child: Text(b['name']?.toString() ?? '',
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12))),
              ],
              onChanged: (v) {
                BranchScope.set(v);
              },
            ),
          ),
        ],
      ),
    );
  }
}
