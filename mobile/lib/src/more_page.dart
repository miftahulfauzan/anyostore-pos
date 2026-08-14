// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'account_switcher_page.dart';
import 'activity_log_page.dart';
import 'api_client.dart';
import 'auth_store.dart';
import 'branch_scope.dart';
import 'cash_drawer_page.dart';
import 'commissions_page.dart';
import 'customers_page.dart';
import 'dashboard_page.dart';
import 'finance_page.dart';
import 'mutation_report_page.dart';
import 'profile_page.dart';
import 'products_page.dart';
import 'stock_movements_page.dart';
import 'offline_queue_page.dart';
import 'offline_store.dart';
import 'promotions_page.dart';
import 'settings_page.dart';
import 'users_page.dart';
import 'task_ui.dart';

const _kInk = Color(0xff1E3A5F);
const _kMuted = Color(0xff5f5f5d);
const _kBorder = Color(0xffeceae4);

class MorePage extends StatelessWidget {
  const MorePage(
      {super.key, required this.api, required this.branchId, this.role});
  final ApiClient api;
  final int branchId;
  final String? role;

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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(6, 16, 0, 6),
          child: Text(title,
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                  color: Theme.of(context).brightness == Brightness.dark
                      ? const Color(0xff9AA5B1)
                      : const Color(0xff8A857C))),
        ),
        GlassCard(
          padding: EdgeInsets.zero,
          radius: 20,
          child: Column(children: rows),
        ),
      ],
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
    final activeBranch = BranchScope.active.value ?? branchId;
    if (isOwner) api.activeBranchId = activeBranch;

    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 104),
      children: [
        // Profil header
        GlassCard(
          padding: const EdgeInsets.all(16),
          radius: 20,
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
                    if (email.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(email,
                          style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(context).brightness ==
                                      Brightness.dark
                                  ? const Color(0xff9AA5B1)
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
        _group(context, 'UTAMA', [
          _row(
              context,
              Icons.dashboard,
              'Dashboard',
              const Color(0xffE3EAF2),
              _kInk,
              () => _open(context, 'Dashboard', DashboardPage(api: api))),
          _divider(context),
          _row(
              context,
              Icons.swap_horiz,
              'Ganti Akun',
              const Color(0xffE3EAF2),
              const Color(0xff1E3A5F),
              () => _open(context, 'Ganti Akun', const AccountSwitcherPage())),
        ]),
        _group(context, 'AKUN & TOKO', [
          _row(
              context,
              Icons.person_outline,
              'Akun Saya',
              const Color(0xffE3EAF2),
              const Color(0xff1E3A5F),
              () => _open(context, 'Akun Saya', ProfilePage(api: api))),
          _divider(context),
          _row(
              context,
              Icons.settings,
              'Pengaturan',
              const Color(0xffE3EAF2),
              _kInk,
              () => _open(context, 'Pengaturan', SettingsPage(api: api))),
        ]),
        _group(context, 'PRODUK & INVENTORI', [
          _row(
              context,
              Icons.inventory_2_outlined,
              'Daftar Produk',
              const Color(0xffE3EAF2),
              const Color(0xff1E3A5F),
              () => _open(context, 'Daftar Produk',
                  ProductsPage(api: api, branchId: activeBranch))),
          _divider(context),
          _row(
              context,
              Icons.history,
              'Riwayat Stok',
              const Color(0xffE3EAF2),
              const Color(0xff1E3A5F),
              () => _open(context, 'Riwayat Stok',
                  StockMovementsPage(api: api, branchId: activeBranch))),
          _divider(context),
          _row(
              context,
              Icons.swap_vert,
              'Laporan Masuk/Keluar',
              const Color(0xffE3EAF2),
              const Color(0xff1E3A5F),
              () => _open(context, 'Laporan Masuk/Keluar',
                  MutationReportPage(api: api))),
        ]),
        _group(context, 'TRANSAKSI & KEUANGAN', [
          _row(
              context,
              Icons.people,
              'Jenis Pelanggan',
              const Color(0xffE3EAF2),
              const Color(0xff1E3A5F),
              () => _open(context, 'Jenis Pelanggan', CustomersPage(api: api))),
          _divider(context),
          _row(
              context,
              Icons.payments,
              'Laci Kas',
              const Color(0xffE3EAF2),
              const Color(0xff1E3A5F),
              () => _open(context, 'Laci Kas', CashDrawerPage(api: api))),
          _divider(context),
          _row(
              context,
              Icons.account_balance_wallet,
              'Keuangan',
              const Color(0xffE3EAF2),
              const Color(0xff1E3A5F),
              () => _open(context, 'Keuangan', FinancePage(api: api))),
          _divider(context),
          _row(
              context,
              Icons.payments_outlined,
              'Komisi',
              const Color(0xffE3EAF2),
              const Color(0xff1E3A5F),
              () => _open(
                  context,
                  'Komisi',
                  CommissionsPage(
                      api: api, branchId: activeBranch, role: role))),
        ]),
        _group(context, 'MANAJEMEN', [
          _row(
              context,
              Icons.badge,
              'Pegawai',
              const Color(0xffE3EAF2),
              const Color(0xff1E3A5F),
              () => _open(context, 'Pegawai',
                  UsersPage(api: api, branchId: activeBranch, role: role))),
          _divider(context),
          _row(context, Icons.local_offer, 'Promo', const Color(0xffE3EAF2),
              _kInk, () => _open(context, 'Promo', PromotionsPage(api: api))),
          _divider(context),
          _row(
              context,
              Icons.receipt_long_outlined,
              'Riwayat Aktivitas',
              const Color(0xffE3EAF2),
              const Color(0xff1E3A5F),
              () => _open(
                  context, 'Riwayat Aktivitas', ActivityLogPage(api: api))),
        ]),
        const SizedBox(height: 14),
        // Keluar di paling bawah.
        GlassCard(
          padding: EdgeInsets.zero,
          radius: 20,
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
                          ? const Color(0xFF3A2422)
                          : const Color(0xFFFCE8E6),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.logout,
                        size: 17,
                        color: Theme.of(context).brightness == Brightness.dark
                            ? const Color(0xFFF2B8A5)
                            : const Color(0xFFC2410C)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text('Keluar',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color:
                                Theme.of(context).brightness == Brightness.dark
                                    ? const Color(0xFFF2B8A5)
                                    : const Color(0xFFC2410C))),
                  ),
                  const Icon(Icons.chevron_right,
                      size: 18, color: Color(0xff94a3b8)),
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: EdgeInsets.only(top: 20, bottom: 8),
          child: Text('Anyostore App v0.1.0',
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
            ? const Color(0xff2A3140)
            : _kBorder,
        indent: 16,
        endIndent: 16,
      );

  Widget _row(BuildContext context, IconData icon, String title, Color chipBg,
      Color chipFg, VoidCallback onTap) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final bg = dark ? const Color(0xff26303F) : chipBg;
    final fg = dark ? const Color(0xffDDE6F2) : chipFg;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 17, color: fg),
            ),
            SizedBox(width: 12),
            Expanded(
              child: Text(title,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: ink(context))),
            ),
            const Icon(Icons.chevron_right, size: 18, color: Color(0xff94a3b8)),
          ],
        ),
      ),
    );
  }

  void _open(BuildContext context, String title, Widget child) {
    Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => _scaffold(context, title, child)));
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
      radius: 20,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      onTap: () async {
        await Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => OfflineQueuePage(api: widget.api)));
        await _load();
      },
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: const Color(0xffF7E8DD),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(Icons.cloud_off, size: 17, color: Color(0xffD47E4D)),
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
                color: const Color(0xff1E3A5F),
                borderRadius: BorderRadius.circular(99),
              ),
              child: Text('$_count',
                  style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Colors.white)),
            )
          else
            const Icon(Icons.chevron_right, size: 18, color: Color(0xff94a3b8)),
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
    _load();
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
  Widget build(BuildContext context) {
    if (_loading) return const SizedBox.shrink();
    return GlassCard(
      padding: const EdgeInsets.all(12),
      radius: 18,
      child: Row(
        children: [
          const Icon(Icons.storefront, size: 18, color: Color(0xff1E3A5F)),
          const SizedBox(width: 10),
          const Expanded(
            child: Text('Toko/Gudang aktif',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Color(0xff8A857C))),
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
              widget.api.activeBranchId = v;
              setState(() {});
            },
          ),
        ],
      ),
    );
  }
}
