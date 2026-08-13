import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'auth_store.dart';
import 'task_ui.dart';

const _kInk = Color(0xff1E3A5F);
const _kMuted = Color(0xff5f5f5d);
const _kBorder = Color(0xffeceae4);
const _kField = Color(0xfff8fafc);
const _kFieldBorder = Color(0xffe2e8f0);
const _kError = Color(0xffe11d48);

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _email = TextEditingController();
  final _secret = TextEditingController();
  bool _pinMode = false;
  bool _showSecret = false;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _secret.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final auth = context.read<AuthStore>();
    setState(() {
      _loading = true;
      _error = null;
    });
    final error = _pinMode
        ? await auth.loginPin(_email.text, _secret.text)
        : await auth.loginPassword(_email.text, _secret.text);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = error;
    });
  }

  InputDecoration _dec(String label, {String? hint, Widget? suffix}) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: _kFieldBorder),
    );
    return InputDecoration(
      hintText: hint,
      counterText: '',
      filled: true,
      fillColor: _kField,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      enabledBorder: border,
      focusedBorder: border.copyWith(
        borderSide: const BorderSide(color: _kInk, width: 1.4),
      ),
      suffixIcon: suffix,
      hintStyle: const TextStyle(color: Color(0xff94a3b8), fontSize: 14),
    );
  }

  Widget _fieldLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: RichText(
          text: TextSpan(
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xff334155)),
            children: [
              TextSpan(text: text),
              const TextSpan(text: ' *', style: TextStyle(color: _kError)),
            ],
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: pageBg(context),
      body: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          SafeArea(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 22),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(bottom: BorderSide(color: _kBorder)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    decoration: BoxDecoration(
                      color: const Color(0x141E3A5F),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: _kBorder),
                    ),
                    padding: const EdgeInsets.all(4),
                    child: const BrandLogo(size: 40, radius: 9),
                  ),
                  const SizedBox(width: 12),
                  const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Anyostore App',
                          style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              color: _kInk,
                              letterSpacing: -0.2)),
                      SizedBox(height: 2),

                    ],
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: GlassCard(
                      padding: const EdgeInsets.all(24),
                      radius: 20,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text('Login',
                              style: TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w700,
                                  color: _kInk)),
                          const SizedBox(height: 4),
                          const Text(
                              'Masuk untuk mengakses kasir, stok, dan laporan toko.',
                              style: TextStyle(fontSize: 12, color: _kMuted)),
                          const SizedBox(height: 18),
                          Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: const Color(0xfff4f2ec),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: _kBorder),
                            ),
                            child: Row(
                              children: [
                                _modeButton(false, 'Password'),
                                _modeButton(true, 'PIN'),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          _fieldLabel('Email / Username'),
                          TextField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            textInputAction: TextInputAction.next,
                            decoration: _dec('Email / Username',
                                hint: 'email atau username'),
                          ),
                          const SizedBox(height: 14),
                          _fieldLabel(_pinMode ? 'PIN (6 digit)' : 'Password'),
                          TextField(
                            controller: _secret,
                            obscureText: !_showSecret,
                            keyboardType: _pinMode
                                ? TextInputType.number
                                : TextInputType.text,
                            maxLength: _pinMode ? 6 : null,
                            textInputAction: TextInputAction.done,
                            onSubmitted: (_) => _submit(),
                            decoration: _dec(
                              _pinMode ? 'PIN (6 digit)' : 'Password',
                              hint: _pinMode ? '••••••' : '••••••••',
                              suffix: _pinMode
                                  ? null
                                  : IconButton(
                                      icon: Icon(
                                        _showSecret
                                            ? Icons.visibility_off_outlined
                                            : Icons.visibility_outlined,
                                        size: 20,
                                        color: _kMuted,
                                      ),
                                      onPressed: () => setState(
                                          () => _showSecret = !_showSecret),
                                    ),
                            ),
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 12),
                            Text(_error!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                    color: _kError, fontSize: 13)),
                          ],
                          const SizedBox(height: 20),
                          FilledButton(
                            onPressed: _loading ? null : _submit,
                            style: FilledButton.styleFrom(
                              backgroundColor: _kInk,
                              foregroundColor: const Color(0xfffcfbf8),
                              disabledBackgroundColor: _kInk.withValues(alpha: .7),
                              minimumSize: const Size.fromHeight(48),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12)),
                              textStyle: const TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.w600),
                            ),
                            child: _loading
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Color(0xfffcfbf8)),
                                  )
                                : const Text('Login'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            ],
          ),
        ),
        ],
      ),
    );
  }

  Widget _modeButton(bool pin, String label) {
    final active = _pinMode == pin;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() {
          _pinMode = pin;
          _showSecret = false;
        }),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          alignment: Alignment.center,
          height: 38,
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
            boxShadow: active
                ? const [
                    BoxShadow(
                        color: Color(0x0f000000),
                        blurRadius: 3,
                        offset: Offset(0, 1))
                  ]
                : null,
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: active ? _kInk : _kMuted,
            ),
          ),
        ),
      ),
    );
  }
}
