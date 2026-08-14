import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

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

    return Scaffold(
      backgroundColor: pageBg(context),
      appBar: AppBar(
        surfaceTintColor: Colors.transparent,
        title: const Text('Ganti Akun'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 32),
        children: [
          if (accounts.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(
                  child: Text(
                      'Belum ada akun tersimpan. Centang "Ingat akun ini" saat login.')),
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
                  isCurrent: (acc['user'] as Map<String, dynamic>?)?['id'] ==
                      currentUid,
                  onTap: () => _switchTo(context, auth, acc),
                  onDelete: () => _deleteAccount(context, auth, acc),
                ),
              ),
          const SizedBox(height: 10),
          FilledButton.icon(
            style:
                FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            onPressed: () => _addAccount(context, auth),
            icon: const Icon(Icons.person_add_alt),
            label: const Text('Tambah Akun'),
          ),
          const SizedBox(height: 16),
          Text(
            'Akun tersimpan hanya di HP ini. Kalau HP hilang, hapus akses lewat pengaturan akun di web.',
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 11,
                color: Theme.of(context).brightness == Brightness.dark
                    ? const Color(0xff9AA5B1)
                    : const Color(0xff8A857C)),
          ),
        ],
      ),
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
    return GlassCard(
      padding: EdgeInsets.zero,
      radius: 20,
      onTap: isCurrent ? null : onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: dark ? const Color(0xff26303F) : const Color(0xffE3EAF2),
              ),
              alignment: Alignment.center,
              child: Text(name.isEmpty ? '?' : name[0].toUpperCase(),
                  style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: Color(0xff1E3A5F))),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: ink(context))),
                      ),
                      if (isCurrent) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xff1E3A5F),
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: const Text('AKTIF',
                              style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white)),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    email.isEmpty ? roleLabel : '$roleLabel · $email',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 11,
                        color: dark
                            ? const Color(0xff9AA5B1)
                            : const Color(0xff8A857C)),
                  ),
                ],
              ),
            ),
            if (!isCurrent)
              IconButton(
                onPressed: onDelete,
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.delete_outline,
                    size: 18, color: Color(0xffB0563A)),
                tooltip: 'Hapus akun',
              ),
          ],
        ),
      ),
    );
  }
}
