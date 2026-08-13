import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'activity_log_page.dart';
import 'api_client.dart';
import 'auth_store.dart';
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

  Widget _scaffold(String title, Widget child) => Scaffold(
        backgroundColor: const Color(0xfff7f4ed),
        appBar: AppBar(
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          title: Text(title),
        ),
        body: child,
      );

  Widget _group(String title, List<Widget> rows) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(6, 16, 0, 6),
          child: Text(title,
              style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                  color: Color(0xff8A857C))),
        ),
        GlassCard(
          padding: EdgeInsets.zero,
          radius: 20,
          child: Column(children: rows),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthStore>();
    final name = auth.userName ?? 'Pengguna';
    final email = auth.email ?? '';

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
                        style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: _kInk)),
                    if (email.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(email,
                          style: const TextStyle(
                              fontSize: 12, color: _kMuted)),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _OfflineTile(api: api),
        const SizedBox(height: 12),
        _group('UTAMA', [
          _row(Icons.dashboard, 'Dashboard', const Color(0xffE3EAF2), _kInk,
              () => _open(context, 'Dashboard', DashboardPage(api: api))),
        ]),
        _group('AKUN & TOKO', [
          _row(Icons.person_outline, 'Akun Saya', const Color(0xffE3EAF2),
              const Color(0xff1E3A5F),
              () => _open(context, 'Akun Saya', ProfilePage(api: api))),
          _divider(),
          _row(Icons.settings, 'Pengaturan', const Color(0xffE3EAF2), _kInk,
              () => _open(context, 'Pengaturan', SettingsPage(api: api))),
        ]),
        _group('PRODUK & INVENTORI', [
          _row(Icons.inventory_2_outlined, 'Daftar Produk',
              const Color(0xffE3EAF2), const Color(0xff1E3A5F),
              () => _open(context, 'Daftar Produk',
                  ProductsPage(api: api, branchId: branchId))),
          _divider(),
          _row(Icons.history, 'Riwayat Stok', const Color(0xffE3EAF2),
              const Color(0xff1E3A5F), () => _open(context, 'Riwayat Stok',
                  StockMovementsPage(api: api, branchId: branchId))),
          _divider(),
          _row(Icons.swap_vert, 'Laporan Masuk/Keluar',
              const Color(0xffE3EAF2), const Color(0xff1E3A5F),
              () => _open(context, 'Laporan Masuk/Keluar',
                  MutationReportPage(api: api))),
        ]),
        _group('TRANSAKSI & KEUANGAN', [
          _row(Icons.people, 'Jenis Pelanggan', const Color(0xffE3EAF2),
              const Color(0xff1E3A5F), () => _open(context, 'Jenis Pelanggan',
                  CustomersPage(api: api))),
          _divider(),
          _row(Icons.payments, 'Laci Kas', const Color(0xffE3EAF2),
              const Color(0xff1E3A5F), () => _open(context, 'Laci Kas',
                  CashDrawerPage(api: api))),
          _divider(),
          _row(Icons.account_balance_wallet, 'Keuangan',
              const Color(0xffE3EAF2), const Color(0xff1E3A5F),
              () => _open(context, 'Keuangan', FinancePage(api: api))),
          _divider(),
          _row(Icons.payments_outlined, 'Komisi', const Color(0xffE3EAF2),
              const Color(0xff1E3A5F), () => _open(context, 'Komisi',
                  CommissionsPage(api: api, branchId: branchId, role: role))),
        ]),
        _group('MANAJEMEN', [
          _row(Icons.badge, 'Pegawai', const Color(0xffE3EAF2),
              const Color(0xff1E3A5F), () => _open(context, 'Pegawai',
                  UsersPage(api: api, branchId: branchId, role: role))),
          _divider(),
          _row(Icons.local_offer, 'Promo', const Color(0xffE3EAF2), _kInk,
              () => _open(context, 'Promo', PromotionsPage(api: api))),
          _divider(),
          _row(Icons.receipt_long_outlined, 'Riwayat Aktivitas',
              const Color(0xffE3EAF2), const Color(0xff1E3A5F),
              () => _open(context, 'Riwayat Aktivitas',
                  ActivityLogPage(api: api))),
        ]),
        const SizedBox(height: 14),
        // Keluar di paling bawah.
        GlassCard(
          padding: EdgeInsets.zero,
          radius: 20,
          child: InkWell(
            onTap: () => auth.logout(),
            child: Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: const Color(0xFFFCE8E6),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.logout,
                        size: 17, color: Color(0xFFC2410C)),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text('Keluar',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFFC2410C))),
                  ),
                  const Icon(Icons.chevron_right,
                      size: 18, color: Color(0xff94a3b8)),
                ],
              ),
            ),
          ),
        ),
        const Padding(
          padding: EdgeInsets.only(top: 20, bottom: 8),
          child: Text('Anyostore App v0.1.0',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 10, color: _kMuted)),
        ),
      ],
    );
  }

  Widget _divider() => const Divider(
        height: 1,
        thickness: 1,
        color: _kBorder,
        indent: 16,
        endIndent: 16,
      );

  Widget _row(IconData icon, String title, Color chipBg, Color chipFg,
      VoidCallback onTap) {
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
                color: chipBg,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 17, color: chipFg),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(title,
                  style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: _kInk)),
            ),
            const Icon(Icons.chevron_right, size: 18, color: Color(0xff94a3b8)),
          ],
        ),
      ),
    );
  }

  void _open(BuildContext context, String title, Widget child) {
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => _scaffold(title, child)));
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
      final c = await OfflineStore.count();
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
            child: const Icon(Icons.cloud_off, size: 17, color: Color(0xffD47E4D)),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Text('Antrean Offline',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Color(0xff1E3A5F))),
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
            const Icon(Icons.chevron_right,
                size: 18, color: Color(0xff94a3b8)),
        ],
      ),
    );
  }
}
