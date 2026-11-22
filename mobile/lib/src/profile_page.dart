// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'api_client.dart';
import 'app_ui.dart';
import 'auth_store.dart';
import 'task_ui.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key, required this.api});
  final ApiClient api;

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  late final TextEditingController _name;
  late final TextEditingController _email;
  late final TextEditingController _username;
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  final _pinCurrent = TextEditingController();
  final _pinNext = TextEditingController();
  final _pinConfirm = TextEditingController();
  bool _savingProfile = false;
  bool _savingPass = false;
  bool _savingPin = false;
  String? _message;

  static const _denim = Color(0xFF1E3A5F);

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthStore>();
    _name = TextEditingController(text: auth.userName ?? '');
    _email = TextEditingController(text: auth.email ?? '');
    _username = TextEditingController(text: auth.username ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _username.dispose();
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    _pinCurrent.dispose();
    _pinNext.dispose();
    _pinConfirm.dispose();
    super.dispose();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

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
        final text = (role ?? '').trim();
        if (text.isEmpty) return 'Pengguna';
        return text[0].toUpperCase() + text.substring(1);
    }
  }

  Future<void> _saveProfile() async {
    if (_name.text.trim().isEmpty || _email.text.trim().isEmpty) {
      _snack('Nama dan email wajib diisi');
      return;
    }
    setState(() {
      _savingProfile = true;
      _message = null;
    });
    try {
      await widget.api.updateProfile(
          name: _name.text.trim(),
          email: _email.text.trim(),
          username: _username.text.trim());
      if (!mounted) return;
      final auth = context.read<AuthStore>();
      auth.updateSelf(
          _name.text.trim(), _email.text.trim(), _username.text.trim());
      _snack('Profil diperbarui');
    } on ApiException catch (e) {
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _savingProfile = false);
    }
  }

  Future<void> _savePin() async {
    if (_pinNext.text.length != 6 ||
        !RegExp(r'^\d{6}$').hasMatch(_pinNext.text)) {
      _snack('PIN baru harus 6 digit angka');
      return;
    }
    if (_pinNext.text != _pinConfirm.text) {
      _snack('Konfirmasi PIN tidak sama');
      return;
    }
    final auth = context.read<AuthStore>();
    final myId = auth.userId;
    if (myId == null) {
      _snack('Data akun tidak ditemukan. Keluar lalu login ulang.');
      return;
    }
    setState(() => _savingPin = true);
    try {
      await widget.api
          .setPin(myId, _pinNext.text, currentPin: _pinCurrent.text);
      _pinCurrent.clear();
      _pinNext.clear();
      _pinConfirm.clear();
      _snack('PIN berhasil diganti');
    } on ApiException catch (e) {
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _savingPin = false);
    }
  }

  Future<void> _savePassword() async {
    if (_next.text.length < 8) {
      _snack('Password baru minimal 8 karakter');
      return;
    }
    if (_next.text != _confirm.text) {
      _snack('Konfirmasi password tidak sama');
      return;
    }
    setState(() => _savingPass = true);
    try {
      await widget.api.changePassword(current: _current.text, next: _next.text);
      _current.clear();
      _next.clear();
      _confirm.clear();
      _snack('Password berhasil diganti');
    } on ApiException catch (e) {
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _savingPass = false);
    }
  }

  Widget _hero(AuthStore auth) {
    final email = _email.text.trim().isEmpty ? '-' : _email.text.trim();
    final username = _username.text.trim();
    return Container(
      padding: const EdgeInsets.fromLTRB(15, 14, 15, 15),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1E3A5F), Color(0xFF2B5688)],
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
              color: Color(0x261E3A5F), blurRadius: 16, offset: Offset(0, 6)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: const Color(0x24FFFFFF),
              borderRadius: BorderRadius.circular(13),
              border: Border.all(color: const Color(0x33FFFFFF)),
            ),
            child: Text(appInitial(_name.text),
                style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                    color: Colors.white)),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                    _name.text.trim().isEmpty ? 'Akun Saya' : _name.text.trim(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -.2,
                        color: Colors.white)),
                const SizedBox(height: 2),
                Text(email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: TaskTypography.micro,
                        color: Color(0xC7FFFFFF))),
                if (username.isNotEmpty) ...[
                  const SizedBox(height: 1),
                  Text('@$username',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: TaskTypography.micro,
                          color: Color(0x99FFFFFF))),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: const Color(0x24FFFFFF),
              borderRadius: BorderRadius.circular(99),
            ),
            child: Text(_roleLabel(auth.role).toUpperCase(),
                style: const TextStyle(
                    fontSize: TaskTypography.micro,
                    fontWeight: FontWeight.w800,
                    letterSpacing: .3,
                    color: Color(0xE6FFFFFF))),
          ),
        ],
      ),
    );
  }

  Widget _submitButton({
    required bool saving,
    required String label,
    required VoidCallback onPressed,
    Color? color,
  }) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: saving ? null : onPressed,
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 44),
          backgroundColor: color,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
        ),
        child: Text(saving ? 'Menyimpan...' : label),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthStore>();
    return ColoredBox(
      color: pageBg(context),
      child: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          ListView(
            padding: const EdgeInsets.all(12),
            children: [
              _hero(auth),
              const SizedBox(height: 10),
              AppSectionCard(
                icon: Icons.person_outline,
                color: _denim,
                title: 'Profil Saya',
                hint: 'Data akun',
                children: [
                  AppField(
                    controller: _name,
                    label: 'Nama *',
                    icon: Icons.badge_outlined,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 8),
                  AppField(
                    controller: _email,
                    label: 'Email *',
                    icon: Icons.mail_outline,
                    keyboard: TextInputType.emailAddress,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 8),
                  AppField(
                    controller: _username,
                    label: 'Username (untuk login)',
                    icon: Icons.alternate_email,
                    helper:
                        '3-30 karakter: huruf, angka, titik, garis bawah, strip.',
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 12),
                  _submitButton(
                    saving: _savingProfile,
                    label: 'Simpan Profil',
                    onPressed: _saveProfile,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              AppSectionCard(
                icon: Icons.lock_outline,
                color: const Color(0xFFB45309),
                title: 'Ganti Password',
                hint: 'Minimal 8 karakter',
                children: [
                  _SecretField(controller: _current, label: 'Password lama *'),
                  const SizedBox(height: 8),
                  _SecretField(
                      controller: _next, label: 'Password baru (min 8) *'),
                  const SizedBox(height: 8),
                  _SecretField(
                      controller: _confirm, label: 'Ulangi password baru *'),
                  const SizedBox(height: 12),
                  _submitButton(
                    saving: _savingPass,
                    label: 'Ganti Password',
                    onPressed: _savePassword,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              AppSectionCard(
                icon: Icons.pin_outlined,
                color: const Color(0xFF6D28D9),
                title: 'Ganti PIN',
                hint: 'Login cepat 6 digit',
                children: [
                  _SecretField(
                      controller: _pinCurrent,
                      label: 'PIN lama (kosongkan jika belum punya)',
                      keyboard: TextInputType.number,
                      maxLength: 6),
                  const SizedBox(height: 8),
                  _SecretField(
                      controller: _pinNext,
                      label: 'PIN baru (6 digit) *',
                      keyboard: TextInputType.number,
                      maxLength: 6),
                  const SizedBox(height: 8),
                  _SecretField(
                      controller: _pinConfirm,
                      label: 'Ulangi PIN baru *',
                      keyboard: TextInputType.number,
                      maxLength: 6),
                  const SizedBox(height: 12),
                  _submitButton(
                    saving: _savingPin,
                    label: 'Ganti PIN',
                    onPressed: _savePin,
                  ),
                ],
              ),
              if (_message != null) ...[
                const SizedBox(height: 10),
                Text(_message!,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: taskMuted(context))),
              ],
              const SizedBox(height: 10),
            ],
          ),
        ],
      ),
    );
  }
}

class _SecretField extends StatefulWidget {
  const _SecretField({
    required this.controller,
    required this.label,
    this.keyboard,
    this.maxLength,
  });

  final TextEditingController controller;
  final String label;
  final TextInputType? keyboard;
  final int? maxLength;

  @override
  State<_SecretField> createState() => _SecretFieldState();
}

class _SecretFieldState extends State<_SecretField> {
  bool _hidden = true;

  @override
  Widget build(BuildContext context) {
    return AppField(
      controller: widget.controller,
      label: widget.label,
      icon: Icons.lock_outline,
      keyboard: widget.keyboard,
      obscure: _hidden,
      formatters: widget.maxLength == null
          ? null
          : [LengthLimitingTextInputFormatter(widget.maxLength)],
      suffix: IconButton(
        onPressed: () => setState(() => _hidden = !_hidden),
        icon: Icon(
            _hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
            size: 18,
            color: taskMuted(context)),
        tooltip: _hidden ? 'Tampilkan' : 'Sembunyikan',
      ),
    );
  }
}
