import 'package:flutter/material.dart';

import 'api_client.dart';
import 'cash_drawer_page.dart';
import 'commissions_page.dart';
import 'customers_page.dart';
import 'dashboard_page.dart';
import 'finance_page.dart';
import 'promotions_page.dart';
import 'settings_page.dart';
import 'users_page.dart';

class MorePage extends StatelessWidget {
  const MorePage({super.key, required this.api, required this.branchId});
  final ApiClient api;
  final int branchId;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        _Tile(
          icon: Icons.dashboard,
          title: 'Dashboard',
          onTap: () => Navigator.of(context)
              .push(MaterialPageRoute(builder: (_) => DashboardPage(api: api))),
        ),
        _Tile(
          icon: Icons.people,
          title: 'Pelanggan',
          onTap: () => Navigator.of(context)
              .push(MaterialPageRoute(builder: (_) => CustomersPage(api: api))),
        ),
        _Tile(
          icon: Icons.payments,
          title: 'Laci Kas',
          onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => CashDrawerPage(api: api))),
        ),
        _Tile(
          icon: Icons.settings,
          title: 'Pengaturan',
          onTap: () => Navigator.of(context)
              .push(MaterialPageRoute(builder: (_) => SettingsPage(api: api))),
        ),
        _Tile(
          icon: Icons.badge,
          title: 'Pegawai',
          onTap: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => UsersPage(api: api, branchId: branchId))),
        ),
        _Tile(
          icon: Icons.payments_outlined,
          title: 'Komisi',
          onTap: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => CommissionsPage(api: api, branchId: branchId))),
        ),
        _Tile(
          icon: Icons.local_offer,
          title: 'Promo',
          onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => PromotionsPage(api: api))),
        ),
        _Tile(
          icon: Icons.account_balance_wallet,
          title: 'Keuangan',
          onTap: () => Navigator.of(context)
              .push(MaterialPageRoute(builder: (_) => FinancePage(api: api))),
        ),
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.title, required this.onTap});
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          leading: Icon(icon),
          title:
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        ),
      );
}
