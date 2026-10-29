import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'auth_store.dart';
import 'task_ui.dart';

const _kInk = kTaskInk;
const _kMuted = kTaskSecondary;
const _kError = Color(0xffB42318);

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
  bool _remember = true;
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
    if (error == null) {
      // Simpan ke daftar akun untuk fitur Ganti Akun (kalau dicentang).
      await auth.saveCurrentAccount(remember: _remember);
      if (!mounted) return;
    }
    setState(() {
      _loading = false;
      _error = error;
    });
  }

  InputDecoration _dec(String label, {String? hint, Widget? suffix}) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0xff64748B)),
    );
    return InputDecoration(
      hintText: hint,
      counterText: '',
      filled: true,
      fillColor: taskSurface(context),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      enabledBorder: border,
      focusedBorder: border.copyWith(
        borderSide:
            BorderSide(color: Theme.of(context).colorScheme.primary, width: 2),
      ),
      suffixIcon: suffix,
      hintStyle: TextStyle(color: taskMuted(context), fontSize: 14),
    );
  }

  Widget _fieldLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: RichText(
          text: TextSpan(
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w600, color: ink(context)),
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
                Expanded(
                  child: Center(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(24),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 420),
                        child: GlassCard(
                          padding: const EdgeInsets.all(24),
                          radius: 20,
                          frosted: true,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text('Anyostore',
                                  style: TextStyle(
                                      fontSize: 24,
                                      fontWeight: FontWeight.w700,
                                      color: ink(context))),
                              const SizedBox(height: 18),
                              Container(
                                padding: const EdgeInsets.all(4),
                                decoration: BoxDecoration(
                                  color: pageBg(context),
                                  borderRadius: BorderRadius.circular(12),
                                  border:
                                      Border.all(color: taskBorder(context)),
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
                              _fieldLabel(
                                  _pinMode ? 'PIN (6 digit)' : 'Password'),
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
                              const SizedBox(height: 14),
                              Row(
                                children: [
                                  Checkbox(
                                    value: _remember,
                                    onChanged: (v) =>
                                        setState(() => _remember = v ?? true),
                                    activeColor:
                                        Theme.of(context).colorScheme.primary,
                                    checkColor:
                                        Theme.of(context).colorScheme.onPrimary,
                                    visualDensity: VisualDensity.compact,
                                    materialTapTargetSize:
                                        MaterialTapTargetSize.shrinkWrap,
                                  ),
                                  const SizedBox(width: 4),
                                  Expanded(
                                    child: Text(
                                        'Ingat akun ini (muncul di menu Ganti Akun)',
                                        style: TextStyle(
                                            fontSize: 12,
                                            color: taskMuted(context))),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              FilledButton(
                                onPressed: _loading ? null : _submit,
                                style: FilledButton.styleFrom(
                                  backgroundColor:
                                      Theme.of(context).colorScheme.primary,
                                  foregroundColor:
                                      Theme.of(context).colorScheme.onPrimary,
                                  disabledBackgroundColor:
                                      _kInk.withValues(alpha: .7),
                                  minimumSize: const Size.fromHeight(48),
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12)),
                                  textStyle: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600),
                                ),
                                child: _loading
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Color(0xfffcfbf8)),
                                      )
                                    : const Text('Masuk ke Anyostore'),
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
      child: InkWell(
        onTap: () => setState(() {
          _pinMode = pin;
          _showSecret = false;
        }),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          alignment: Alignment.center,
          height: 48,
          decoration: BoxDecoration(
            color: active
                ? Theme.of(context).colorScheme.primary
                : Colors.transparent,
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
              color: active
                  ? Theme.of(context).colorScheme.onPrimary
                  : taskMuted(context),
            ),
          ),
        ),
      ),
    );
  }
}
