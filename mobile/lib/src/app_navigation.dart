import 'package:flutter/material.dart';

typedef AppNavItem = ({IconData icon, IconData activeIcon, String label});

abstract final class AppNavigation {
  static List<AppNavItem> forRole(String? role) => role == 'gudang'
      ? const [
          (
            icon: Icons.dashboard_outlined,
            activeIcon: Icons.dashboard,
            label: 'Dashboard'
          ),
          (
            icon: Icons.inventory_2_outlined,
            activeIcon: Icons.inventory_2,
            label: 'Stok'
          ),
          (icon: Icons.swap_vert, activeIcon: Icons.swap_vert, label: 'Mutasi'),
          (
            icon: Icons.more_horiz,
            activeIcon: Icons.more_horiz,
            label: 'Lainnya'
          ),
        ]
      : const [
          (
            icon: Icons.shopping_bag_outlined,
            activeIcon: Icons.shopping_bag,
            label: 'POS'
          ),
          (
            icon: Icons.receipt_long_outlined,
            activeIcon: Icons.receipt_long,
            label: 'Riwayat'
          ),
          (
            icon: Icons.inventory_2_outlined,
            activeIcon: Icons.inventory_2,
            label: 'Stok'
          ),
          (
            icon: Icons.bar_chart_outlined,
            activeIcon: Icons.bar_chart,
            label: 'Laporan'
          ),
          (
            icon: Icons.more_horiz,
            activeIcon: Icons.more_horiz,
            label: 'Lainnya'
          ),
        ];
}

/// The API remains authoritative, including per-warehouse catalogue grants.
class AppPermissions {
  const AppPermissions(this.role);
  final String? role;
  bool get manageUsers => role == 'owner';
  bool get managePromotions => ['owner', 'manager', 'admin'].contains(role);
  bool get viewActivity => ['owner', 'manager', 'admin'].contains(role);
  bool get finance => ['owner', 'manager', 'admin', 'kasir'].contains(role);
  bool get sales => role != 'gudang';
  bool get ownCommission => role != null;
  bool get inventory => role != null;
}
