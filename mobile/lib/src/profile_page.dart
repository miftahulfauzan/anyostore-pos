// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api_client.dart';
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
  bool _savingProfile = false;
  bool _savingPass = false;
  String? _message;

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
    super.dispose();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg)));
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
      await widget.api.changePassword(
          current: _current.text, next: _next.text);
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

  InputDecoration _dec(String label) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: const BorderSide(color: kTaskBorder),
    );
    return InputDecoration(
      labelText: label,
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      enabledBorder: border,
      focusedBorder: border.copyWith(
          borderSide: const BorderSide(color: kTaskDark, width: 1.4)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: pageBg(context),
      child: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          ListView(
            padding: const EdgeInsets.all(12),
            children: [
              GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Profil Saya',
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                    const SizedBox(height: 12),
                    TextField(
                        controller: _name,
                        decoration: _dec('Nama *')),
                    const SizedBox(height: 10),
                    TextField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        decoration: _dec('Email *')),
                    const SizedBox(height: 10),
                    TextField(
                        controller: _username,
                        decoration: _dec('Username (untuk login)')),
                    const SizedBox(height: 6),
                    const Text(
                        '3-30 karakter: huruf, angka, titik, garis bawah, strip. Dipakai untuk login.',
                        style: TextStyle(fontSize: 10, color: kTaskGray)),
                    const SizedBox(height: 14),
                    FilledButton(
                      onPressed: _savingProfile ? null : _saveProfile,
                      style: FilledButton.styleFrom(
                        backgroundColor: kTaskDark,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(28)),
                      ),
                      child: Text(
                          _savingProfile ? 'Menyimpan...' : 'Simpan Profil'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Ganti Password',
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                    const SizedBox(height: 12),
                    TextField(
                        controller: _current,
                        obscureText: true,
                        decoration: _dec('Password lama *')),
                    const SizedBox(height: 10),
                    TextField(
                        controller: _next,
                        obscureText: true,
                        decoration: _dec('Password baru (min 8) *')),
                    const SizedBox(height: 10),
                    TextField(
                        controller: _confirm,
                        obscureText: true,
                        decoration: _dec('Ulangi password baru *')),
                    const SizedBox(height: 14),
                    FilledButton(
                      onPressed: _savingPass ? null : _savePassword,
                      style: FilledButton.styleFrom(
                        backgroundColor: kTaskOrange,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(28)),
                      ),
                      child: Text(_savingPass ? 'Menyimpan...' : 'Ganti Password'),
                    ),
                  ],
                ),
              ),
              if (_message != null) ...[
                const SizedBox(height: 10),
                Text(_message!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: kTaskGray)),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
