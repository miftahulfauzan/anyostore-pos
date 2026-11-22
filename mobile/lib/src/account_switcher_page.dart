import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_ui.dart';
import 'auth_store.dart';
import 'task_ui.dart';

/// Fitur Ganti Akun (Level 2): daftar akun tersimpan, pindah sekali tap,
/// tambah akun, dan hapus akun dari HP.
class AccountSwitcherPage extends StatefulWidget {
  const AccountSwitcherPage({super.key});

  @override
  State<AccountSwitcherPage> createState() => _AccountSwitcherPageState();
}

class _AccountSwitcherPageState extends State<AccountSwitcherPage> {
  String _roleLabel(String? role) {
    switch (role) {
      case 'owner':
        return 'Owner';
      case 'manager':
        return 'Manager';
      case 'admin':
        return 'Admin';
      case 'kasir':
        return 'Kasir';
      case 'gudang':
        return 'Gudang';
      default:
        return role ?? 'Pengguna';
    }
  }

  Future<void> _switchTo(BuildContext context, AuthStore auth,
      Map<String, dynamic> account) async {
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    final name =
        ((account['user'] as Map<String, dynamic>?)?['name'] ?? '').toString();
    await auth.switchToAccount(account);
    if (!mounted) return;
    navigator.popUntil((r) => r.isFirst);
    messenger.showSnackBar(SnackBar(content: Text('Berpindah ke akun $name')));
  }

  Future<void> _deleteAccount(BuildContext context, AuthStore auth,
      Map<String, dynamic> account) async {
    final user = (account['user'] as Map<String, dynamic>?) ?? {};
    final uid = user['id'] as int?;
    if (uid == null) return;
    final name = (user['name'] ?? '').toString();
    final isCurrent = uid == auth.userId;
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isCurrent ? 'Keluar & hapus akun?' : 'Hapus akun?'),
        content: Text(isCurrent
            ? 'Akun "$name" akan dihapus dari HP dan kamu logout.'
            : 'Akun "$name" akan dihapus dari daftar akun di HP ini.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Batal')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Hapus')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    if (isCurrent) {
      await auth.logout(removeFromList: true);
      if (!mounted) return;
      navigator.popUntil((r) => r.isFirst);
      messenger.showSnackBar(const SnackBar(content: Text('Akun dihapus')));
    } else {
      await auth.removeAccount(uid);
      if (mounted) {
        messenger.showSnackBar(SnackBar(content: Text('Akun "$name" dihapus')));
      }
    }
  }

  Future<void> _addAccount(BuildContext context, AuthStore auth) async {
    final messenger = ScaffoldMessenger.of(context);
    Navigator.of(context).popUntil((r) => r.isFirst);
    await auth.logout();
    messenger
        .showSnackBar(const SnackBar(content: Text('Masuk dengan akun lain')));
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthStore>();
    final accounts = List<Map<String, dynamic>>.from(auth.savedAccounts);
    final currentUid = auth.userId;
    final hasCurrent = accounts
        .any((a) => (a['user'] as Map<String, dynamic>?)?['id'] == currentUid);
    // Akun aktif selalu ditampilkan walau belum tersimpan di daftar.
    if (!hasCurrent && currentUid != null && auth.token != null) {
      accounts.insert(0, {
        'user': {
          'id': currentUid,
          'name': auth.userName,
          'username': auth.username,
          'email': auth.email,
          'role': auth.role,
          'branch_id': auth.branchId,
        },
        'token': auth.token,
        'refreshToken': auth.refreshToken,
        'savedAt': '',
      });
    }

    // Body saja (tanpa Scaffold/AppBar): MorePage sudah membungkus dengan
    // AppBar 'Ganti Akun', supaya header tidak dobel.
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 32),
      children: [
        if (accounts.isEmpty)
          AppEmptyState(
            icon: Icons.switch_account_outlined,
            title: 'Belum ada akun tersimpan',
            message:
                'Centang "Ingat akun ini" saat login untuk menyimpan akun di perangkat.',
            actionLabel: 'Tambah akun',
            onAction: () => _addAccount(context, auth),
          )
        else
          for (final acc in accounts)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _AccountTile(
                account: acc,
                roleLabel: _roleLabel(
                    (acc['user'] as Map<String, dynamic>?)?['role']
                        ?.toString()),
                isCurrent:
                    (acc['user'] as Map<String, dynamic>?)?['id'] == currentUid,
                onTap: () => _switchTo(context, auth, acc),
                onDelete: () => _deleteAccount(context, auth, acc),
              ),
            ),
        const SizedBox(height: 10),
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          onPressed: () => _addAccount(context, auth),
          icon: const Icon(Icons.person_add_alt),
          label: const Text('Tambah Akun'),
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}

class _AccountTile extends StatelessWidget {
  const _AccountTile({
    required this.account,
    required this.roleLabel,
    required this.isCurrent,
    required this.onTap,
    required this.onDelete,
  });

  final Map<String, dynamic> account;
  final String roleLabel;
  final bool isCurrent;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final user = (account['user'] as Map<String, dynamic>?) ?? {};
    final name = (user['name'] ?? '').toString();
    final email = (user['email'] ?? '').toString();
    final dark = Theme.of(context).brightness == Brightness.dark;
    final accent = isCurrent
        ? Theme.of(context).colorScheme.primary
        : (dark ? const Color(0xFF93C5FD) : const Color(0xFF1D4ED8));
    return AppListCard(
      onTap: isCurrent ? null : onTap,
      child: Row(
        children: [
          AppAvatar(
            text: appInitial(name),
            fg: isCurrent ? Theme.of(context).colorScheme.onPrimary : accent,
            bg: isCurrent
                ? Theme.of(context).colorScheme.primary
                : accent.withValues(alpha: dark ? .2 : .12),
            size: 40,
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 5,
                  runSpacing: 3,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      name.isEmpty ? 'Tanpa nama' : name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: ink(context)),
                    ),
                    if (isCurrent)
                      AppStatusPill(
                        label: 'AKTIF',
                        fg: dark
                            ? const Color(0xFF86EFAC)
                            : const Color(0xFF137A43),
                        bg: dark
                            ? const Color(0x2E86EFAC)
                            : const Color(0xFFDCFCE7),
                      ),
                  ],
                ),
                const SizedBox(height: 1),
                Text(
                  email.isEmpty ? roleLabel : '$roleLabel · $email',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: TaskTypography.micro, color: taskMuted(context)),
                ),
              ],
            ),
          ),
          if (!isCurrent)
            IconButton(
              onPressed: onDelete,
              visualDensity: VisualDensity.compact,
              icon: const Icon(Icons.delete_outline,
                  size: 19, color: kTaskTerracotta),
              tooltip: 'Hapus akun',
            ),
        ],
      ),
    );
  }
}
